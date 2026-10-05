// "What to train with": by level, goal, game mode, items and play style (calm / efficient) it picks a training method
// for the skill and shows the path to the goal. The methods are in src/data/trainingMethods.json (OSRS Wiki and the skills' training plans).
//
// The rules everything rests on:
//  — only what is open is chosen: the level fits, the mode (F2P/Members) fits, the quest is done. What is missing
//    in items is named ("a pickaxe is needed", "feathers are needed"), but the method stays — it is preparation, not a ban;
//  — "unknown" is not "no": an item that cannot be checked does not remove a method from the choice;
//  — the wiki speed is a guide, not a promise: the time to the goal is counted from the player's measurements, and when there are none —
//    only as a "per the wiki" range and marked so. The XP per action is the game's exact number; "how many more actions" is counted from it.

import type { GameMode } from '../types';
import methodsJson from '../data/trainingMethods.json';
import toolProgressionJson from '../data/toolProgression.json';
import { evaluate, type ReqState, type Requirement } from './requirements';
import { levelOf, type PlayerState } from './playerState';
import { xpForLevel } from './xp';
import type { PlayStyle } from './playStyle';

export type Effort = 'afk' | 'low' | 'medium' | 'high';
export type MethodCost = 'free' | 'profit' | 'cost';
export type Risk = 'none' | 'low' | 'high';
export type { PlayStyle };

export type MethodNeed =
  | { type: 'item'; name: string; count?: number }
  /** Any axe / pickaxe of at least the suitable tier — taken from toolProgression.json. */
  | { type: 'tool'; skill: 'woodcutting' | 'mining' }
  | { type: 'quest'; quest: string }
  | { type: 'skill'; skill: string; min: number };

export interface TrainingMethod {
  id: string;
  /** The skills the method trains (combat — all three). */
  skills: string[];
  from: number;
  /** Up to which level (exclusive) the method is the best; null — to the end. */
  to: number | null;
  name: string;
  members: boolean;
  needs: MethodNeed[];
  /** XP per hour per the wiki: [from, to] — a guide. */
  xph: [number, number] | null;
  /** XP per single action — the game's exact value. */
  xpa: number | null;
  /** The word forms "log|logs" for "how many more". */
  act: string | null;
  effort: Effort;
  cost: MethodCost;
  risk: Risk;
  where: string;
  /** The key of the place in the place dictionary (majorLocations.json) — for the in-game arrow; none — words only. */
  place?: string;
  note?: string;
  url: string;
  /** A quest with a one-time XP reward: it does not become the "best method", it is shown separately. */
  kind: 'method' | 'quest';
  xpTotal: number | null;
}

interface Raw {
  id: string; skill: string | string[]; from: number; to: number | null; name: string; members: boolean;
  needs?: MethodNeed[]; xph?: [number, number]; xpa?: number; act?: string; effort: Effort; cost: MethodCost; risk: Risk;
  where: string; place?: string; note?: string; url: string; kind?: 'method' | 'quest'; xpTotal?: number;
}

export const trainingMethods: TrainingMethod[] = (methodsJson as unknown as { methods: Raw[] }).methods.map((m) => ({
  id: m.id,
  skills: Array.isArray(m.skill) ? m.skill : [m.skill],
  from: m.from, to: m.to ?? null, name: m.name, members: m.members,
  needs: m.needs ?? [], xph: m.xph ?? null, xpa: m.xpa ?? null, act: m.act ?? null,
  effort: m.effort, cost: m.cost, risk: m.risk, where: m.where, ...(m.place ? { place: m.place } : {}), ...(m.note ? { note: m.note } : {}), url: m.url,
  kind: m.kind ?? 'method', xpTotal: m.xpTotal ?? null,
}));

interface Tier { tier: string; levelReq: number }
const tools = toolProgressionJson as unknown as Record<'woodcutting' | 'mining', Tier[]>;

// ---------------------------------------------------------------------------
// The method's requirements

export interface NeedStatus {
  kind: MethodNeed['type'];
  label: string;
  state: ReqState;
  detail: string;
}

function needStatus(n: MethodNeed, state: PlayerState): NeedStatus {
  if (n.type === 'skill') {
    const r = evaluate({ type: 'skill', skill: n.skill, min: n.min }, state);
    return { kind: 'skill', label: `${n.skill.charAt(0).toUpperCase()}${n.skill.slice(1)} ${n.min}`, state: r.state, detail: r.detail };
  }
  if (n.type === 'quest') {
    const r = evaluate({ type: 'quest', quest: n.quest }, state);
    return { kind: 'quest', label: n.quest, state: r.state, detail: r.detail };
  }
  if (n.type === 'tool') {
    // Any tool of the tier the level allows fits (the best open one is not needed — any one is enough).
    const lv = levelOf(state, n.skill);
    const usable = tools[n.skill].filter((t) => lv === undefined || t.levelReq <= lv);
    const req: Requirement = { type: 'alternative', requiredCount: 1, alternatives: usable.map((t) => ({ name: t.tier })) };
    const r = evaluate(req, state);
    return { kind: 'tool', label: n.skill === 'woodcutting' ? 'Axe' : 'Pickaxe', state: r.state, detail: r.detail };
  }
  const count = n.count ?? 1;
  const r = evaluate({ type: 'item', name: n.name, count }, state);
  return { kind: 'item', label: `${n.name}${count > 1 ? ` ×${count}` : ''}`, state: r.state, detail: r.detail };
}

export type MethodStatus = 'READY' | 'PREP' | 'LOCKED';

export interface MethodView {
  method: TrainingMethod;
  status: MethodStatus;
  /** What is missing (items, a tool) or what closes the method (a quest, a skill level). */
  missing: NeedStatus[];
  /** What cannot be checked: not "no" but "I don't know". */
  unchecked: NeedStatus[];
}

export function viewMethod(m: TrainingMethod, state: PlayerState): MethodView {
  const needs = m.needs.map((n) => needStatus(n, state));
  const locked = needs.filter((n) => (n.kind === 'quest' || n.kind === 'skill') && n.state === 'MISSING');
  const prep = needs.filter((n) => (n.kind === 'item' || n.kind === 'tool') && (n.state === 'MISSING' || n.state === 'PARTIAL' || n.state === 'BANK'));
  const unchecked = needs.filter((n) => n.state === 'UNKNOWN');
  return { method: m, status: locked.length ? 'LOCKED' : prep.length ? 'PREP' : 'READY', missing: [...locked, ...prep], unchecked };
}

// ---------------------------------------------------------------------------
// The choice

const EFFORT_RANK: Record<Effort, number> = { afk: 0, low: 1, medium: 2, high: 3 };
const RISK_RANK: Record<Risk, number> = { none: 0, low: 1, high: 2 };
const COST_RANK: Record<MethodCost, number> = { profit: 0, free: 0, cost: 1 };
const STATUS_RANK: Record<MethodStatus, number> = { READY: 0, PREP: 1, LOCKED: 2 };

/** For ordering we take the lower speed bound: the wiki's upper one often needs special tricks (ticks, inventory). */
const rateLow = (m: TrainingMethod): number | null => (m.xph ? m.xph[0] : null);

/**
 * The order of methods. Calm style: first the ready ones, without risk, with fewer clicks, not at a loss — speed only
 * on a tie. Efficient: first the ready ones, then by speed (for methods without a speed — by entry level).
 */
function compare(style: PlayStyle) {
  return (a: MethodView, b: MethodView): number => {
    const s = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (s) return s;
    const ra = rateLow(a.method);
    const rb = rateLow(b.method);
    const byRate = (rb ?? -1) - (ra ?? -1);
    const byEntry = b.method.from - a.method.from;
    if (style === 'chill') {
      return RISK_RANK[a.method.risk] - RISK_RANK[b.method.risk]
        || EFFORT_RANK[a.method.effort] - EFFORT_RANK[b.method.effort]
        || COST_RANK[a.method.cost] - COST_RANK[b.method.cost]
        || byRate || byEntry;
    }
    return byRate || byEntry || EFFORT_RANK[a.method.effort] - EFFORT_RANK[b.method.effort] || COST_RANK[a.method.cost] - COST_RANK[b.method.cost];
  };
}

export const methodsFor = (skill: string, methods: readonly TrainingMethod[] = trainingMethods): TrainingMethod[] =>
  methods.filter((m) => m.skills.includes(skill));

const availableAt = (m: TrainingMethod, level: number, mode: GameMode): boolean =>
  m.kind === 'method' && m.from <= level && (m.to === null || level < m.to) && (mode === 'members' || !m.members);

export interface PathLeg {
  method: TrainingMethod;
  fromLevel: number;
  toLevel: number;
}

export interface TimeEstimate {
  /** measured — from the player's measurements, wiki — from the wiki speed (a range, a guide). */
  source: 'measured' | 'wiki';
  minHours: number;
  maxHours: number;
}

export interface TrainingAdvice {
  skill: string;
  /** null — the level is unknown: there is nothing to advise. */
  level: number | null;
  target: number;
  best: MethodView | null;
  /** Up to three other methods of this level. */
  others: MethodView[];
  /** Quests with an XP reward in this range — separately from the methods. */
  quests: TrainingMethod[];
  /** The path from the level to the goal: which method on which leg. */
  path: PathLeg[];
  xpLeft: number | null;
  /** How many more actions with the best method to the end of its leg; null — the XP per action is unknown. */
  actionsLeft: number | null;
  time: TimeEstimate | null;
  /** One phrase "why this method". */
  reason: string;
  style: PlayStyle;
}

export interface AdviceInput {
  skill: string;
  target: number;
  state: PlayerState;
  mode: GameMode;
  style: PlayStyle;
  /** The skill's current XP (if known): otherwise counted from the start of the level. */
  xp?: number | null;
  /** XP per hour from the player's measurements. */
  measuredXph?: number | null;
  methods?: readonly TrainingMethod[];
}

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function reasonFor(v: MethodView, style: PlayStyle, level: number): string {
  const m = v.method;
  const parts: string[] = [];
  if (style === 'chill') {
    const quiet = m.effort === 'afk' ? 'almost no clicks' : m.effort === 'low' ? 'few clicks' : m.effort === 'medium' ? 'relaxed pace' : 'needs attention';
    parts.push(m.risk === 'none' ? `no risk, ${quiet}` : `${quiet}, small risk`);
  } else if (m.xph) {
    parts.push(m.xph[0] === m.xph[1] ? `≈ ${fmtK(m.xph[0])} XP per hour` : `≈ ${fmtK(m.xph[0])}–${fmtK(m.xph[1])} XP per hour`);
  } else {
    parts.push('the best method for this level');
  }
  if (m.cost === 'cost') parts.push('material costs');
  else if (m.cost === 'profit') parts.push('can end in profit');
  if (v.status === 'PREP') parts.push(`first: ${v.missing.map((x) => x.label).join(', ')}`);
  if (v.status === 'LOCKED') parts.push(`locked: ${v.missing.map((x) => x.label).join(', ')}`);
  if (level < m.from) parts.push(`from level ${m.from}`);
  return parts.join('; ');
}

/** The best method on each leg of the path to the goal: identical consecutive ones merge. */
function buildPath(skill: string, level: number, target: number, input: AdviceInput, cmp: ReturnType<typeof compare>): PathLeg[] {
  const methods = input.methods ?? trainingMethods;
  const legs: PathLeg[] = [];
  for (let lv = level; lv < target; lv++) {
    // For future levels the item requirements are not counted: "what will be needed", not "what there is now".
    const cands = methodsFor(skill, methods).filter((m) => availableAt(m, lv, input.mode)).map((m) => viewMethod(m, input.state)).filter((v) => v.status !== 'LOCKED' || v.missing.every((x) => x.kind === 'skill'));
    cands.sort(cmp);
    const pick = cands[0]?.method;
    if (!pick) continue;
    const last = legs[legs.length - 1];
    if (last && last.method.id === pick.id) last.toLevel = lv + 1;
    else legs.push({ method: pick, fromLevel: lv, toLevel: lv + 1 });
  }
  return legs.slice(0, 6);
}

export function adviseTraining(input: AdviceInput): TrainingAdvice {
  const { skill, target, state, mode, style } = input;
  const methods = input.methods ?? trainingMethods;
  const level = levelOf(state, skill) ?? null;
  const empty: TrainingAdvice = { skill, level, target, best: null, others: [], quests: [], path: [], xpLeft: null, actionsLeft: null, time: null, reason: '', style };
  if (level === null) return { ...empty, reason: 'Level unknown: log in to the game with RuneLite or enter it on the skill page.' };
  if (level >= target) return { ...empty, reason: 'The goal is already reached.' };

  const cmp = compare(style);
  const views = methodsFor(skill, methods).filter((m) => availableAt(m, level, mode)).map((m) => viewMethod(m, state)).sort(cmp);
  const best = views.find((v) => v.status !== 'LOCKED') ?? null;
  const others = views.filter((v) => v !== best).slice(0, 3);
  const quests = methodsFor(skill, methods).filter((m) => m.kind === 'quest' && m.from <= level && (m.to === null || level < m.to) && (mode === 'members' || !m.members));
  const path = buildPath(skill, level, target, input, cmp);

  const xpNow = input.xp ?? xpForLevel(level);
  const xpLeft = Math.max(0, xpForLevel(target) - xpNow);
  let actionsLeft: number | null = null;
  if (best?.method.xpa) {
    const legEnd = Math.min(target, best.method.to ?? target);
    actionsLeft = Math.ceil(Math.max(0, xpForLevel(legEnd) - xpNow) / best.method.xpa);
  }
  let time: TimeEstimate | null = null;
  if (input.measuredXph && input.measuredXph > 0) {
    const h = xpLeft / input.measuredXph;
    time = { source: 'measured', minHours: h, maxHours: h };
  } else if (best?.method.xph) {
    time = { source: 'wiki', minHours: xpLeft / best.method.xph[1], maxHours: xpLeft / best.method.xph[0] };
  }
  return {
    ...empty, best, others, quests, path, xpLeft, actionsLeft, time,
    reason: best ? reasonFor(best, style, level) : 'There is no method in the list for this level and mode: see the skill training plan.',
  };
}

/** "about 3–4 h" / "≈ 2 h"; under an hour — in minutes. */
export function formatHours(t: TimeEstimate): string {
  const f = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`);
  if (t.minHours === t.maxHours || f(t.minHours) === f(t.maxHours)) return `${t.source === 'wiki' ? 'about' : '≈'} ${f(t.maxHours)}`;
  return `about ${f(t.minHours)}–${f(t.maxHours)}`;
}
