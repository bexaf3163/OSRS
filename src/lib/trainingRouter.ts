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
import type { MethodPriority, PlayStyle } from './playStyle';
import { rangedNeeds, RANGED_WATCH } from './rangedLoadout';
import { strikeRecipe, superheatNeeds } from './magicPlan';
import { methodRate } from './combatRates';
import type { PriceView } from './funding/quotes';
import { coinsPerMinute } from './lootValue';
import type { TradeRestriction } from './tradeRestriction';

export type Effort = 'afk' | 'low' | 'medium' | 'high';
export type MethodCost = 'free' | 'profit' | 'cost';
export type Risk = 'none' | 'low' | 'high';
export type { PlayStyle };

export type MethodNeed =
  | { type: 'item'; name: string; count?: number; anyOf?: string[]; equip?: boolean }
  /** Any axe / pickaxe of at least the suitable tier — taken from toolProgression.json. */
  | { type: 'tool'; skill: 'woodcutting' | 'mining' }
  | { type: 'quest'; quest: string }
  | { type: 'skill'; skill: string; min: number };

export interface TrainingMethod {
  id: string;
  /** The skills the method trains (combat — all three). */
  skills: string[];
  from: number;
  /** Suggested training bracket; unlike from, this does not invent a game unlock requirement. */
  suggestedFrom?: number;
  /** Up to which level (exclusive) the method is the best; null — to the end. */
  to: number | null;
  name: string;
  members: boolean;
  needs: MethodNeed[];
  kit?: 'f2p-bow' | 'superheat-iron' | 'strike-spell';
  /** Visible manual alternative; never an automatic default until this setup is modelled/verified. */
  manualSetup?: string;
  /** XP per hour per the wiki: [from, to] — a guide; for a combat method the model's figure for this player when it has one (rateSource). */
  xph: [number, number] | null;
  /** model - xph is the combat model's for this player's levels and gear (combatRates.ts), not the wiki's guide. */
  rateSource?: 'model';
  /** Coins an hour the model's method uses up (arrows, runes) at exchange prices; null - not known. */
  costPerHour?: number | null;
  /** Coins an hour the model's method banks from its drop when that pays for its time, and the drop. */
  lootPerHour?: number;
  lootName?: string;
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
  /** Verified in-game scenery names for this method only; no future-resource highlights. */
  objectNames?: string[];
  npcNames?: string[];
  note?: string;
  url: string;
  /** A quest with a one-time XP reward: it does not become the "best method", it is shown separately. */
  kind: 'method' | 'quest';
  xpTotal: number | null;
}

interface Raw {
  id: string; skill: string | string[]; from: number; suggestedFrom?: number; to: number | null; name: string; members: boolean;
  needs?: MethodNeed[]; kit?: TrainingMethod['kit']; manualSetup?: string; xph?: [number, number]; xpa?: number; act?: string; effort: Effort; cost: MethodCost; risk: Risk;
  where: string; place?: string; objectNames?: string[]; npcNames?: string[]; note?: string; url: string; kind?: 'method' | 'quest'; xpTotal?: number;
}

export const trainingMethods: TrainingMethod[] = (methodsJson as unknown as { methods: Raw[] }).methods.map((m) => ({
  id: m.id,
  skills: Array.isArray(m.skill) ? m.skill : [m.skill],
  from: m.from, to: m.to ?? null, name: m.name, members: m.members,
  needs: m.needs ?? [], xph: m.xph ?? null, xpa: m.xpa ?? null, act: m.act ?? null,
  effort: m.effort, cost: m.cost, risk: m.risk, where: m.where, ...(m.place ? { place: m.place } : {}), ...(m.note ? { note: m.note } : {}), url: m.url,
  kind: m.kind ?? 'method', xpTotal: m.xpTotal ?? null,
  ...(m.objectNames ? { objectNames: m.objectNames } : {}),
  ...(m.npcNames ? { npcNames: m.npcNames } : {}),
  ...(m.suggestedFrom !== undefined ? { suggestedFrom: m.suggestedFrom } : {}),
  ...(m.kit ? { kit: m.kit } : {}),
  ...(m.manualSetup ? { manualSetup: m.manualSetup } : {}),
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
  const r = evaluate(n.equip ? { type: 'equipment', name: n.name, count, anyOf: n.anyOf } : n.anyOf?.length ? { type: 'alternative', requiredCount: count, alternatives: [n.name, ...n.anyOf].map(name => ({ name })) }
    : { type: 'item', name: n.name, count }, state);
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
  if (m.kit === 'strike-spell') m = { ...m, name: `${strikeRecipe(state).spell.name} on cows and chickens` };
  const needs = methodNeeds(m, state).map((n) => needStatus(n, state));
  if (m.manualSetup) needs.push({ kind: 'item', label: m.manualSetup, state: 'UNKNOWN', detail: 'Manual setup has not been verified.' });
  if (m.kit === 'f2p-bow' && state.mode !== 'f2p') needs.push({ kind: 'item', label: 'Members ranged loadout', state: 'UNKNOWN', detail: 'This starter kit models ordinary F2P bows only; check your Members weapon and ammunition separately.' });
  const locked = needs.filter((n) => (n.kind === 'quest' || n.kind === 'skill') && n.state === 'MISSING');
  const prep = needs.filter((n) => (n.kind === 'item' || n.kind === 'tool') && (n.state === 'MISSING' || n.state === 'PARTIAL' || n.state === 'BANK'));
  const unchecked = needs.filter((n) => n.state === 'UNKNOWN');
  return { method: m, status: locked.length ? 'LOCKED' : prep.length || m.manualSetup ? 'PREP' : 'READY', missing: [...locked, ...prep], unchecked };
}

export function methodNeeds(m: TrainingMethod, state: PlayerState): MethodNeed[] {
  if (m.kit === 'strike-spell') return strikeRecipe(state).needs;
  if (m.kit === 'superheat-iron') return superheatNeeds(state);
  // Stage 6 is F2P-only. Do not demand a weaker F2P bow from Members using an unmodelled weapon.
  if (m.kit === 'f2p-bow' && state.mode !== 'f2p') return m.needs.filter(n => n.type !== 'item' || !RANGED_WATCH.includes(n.name));
  return m.kit === 'f2p-bow' && m.kind === 'method'
    ? [...m.needs.filter(n => n.type !== 'item' || !RANGED_WATCH.includes(n.name)), ...rangedNeeds(state)] : m.needs;
}

// ---------------------------------------------------------------------------
// The choice

const EFFORT_RANK: Record<Effort, number> = { afk: 0, low: 1, medium: 2, high: 3 };
const RISK_RANK: Record<Risk, number> = { none: 0, low: 1, high: 2 };
const COST_RANK: Record<MethodCost, number> = { profit: 0, free: 0, cost: 1 };
const STATUS_RANK: Record<MethodStatus, number> = { READY: 0, PREP: 1, LOCKED: 2 };

/** For ordering we take the lower speed bound: the wiki's upper one often needs special tricks (ticks, inventory). */
const rateLow = (m: TrainingMethod): number | null => (m.xph ? m.xph[0] : null);

/** How much of its listed speed a method keeps in practice: attention it needs, materials it costs and risk it carries (2.69, "balanced"). */
const EFFORT_FACTOR: Record<Effort, number> = { afk: 1, low: 1, medium: 0.9, high: 0.6 };
const COST_FACTOR: Record<MethodCost, number> = { profit: 1, free: 1, cost: 0.85 };
const RISK_FACTOR: Record<Risk, number> = { none: 1, low: 0.95, high: 0.5 };
/** Hours a method whose items are missing loses to getting them (a bank or exchange stop). */
export const SETUP_HOURS = 0.25;
/** A later method replaces the one in hand on the path only when it is this much better in practice. */
export const SWITCH_GAIN = 1.1;

/** The practical XP per hour of a method: the wiki's lower bound, less what attention, materials and risk take from it. null - no speed listed. */
export function practicalRate(m: TrainingMethod): number | null {
  const r = rateLow(m);
  return r === null ? null : r * EFFORT_FACTOR[m.effort] * COST_FACTOR[m.cost] * RISK_FACTOR[m.risk];
}

/**
 * The order of methods. Balanced (the default since 2.69): the practical hours to the goal, a method whose items are missing paying its setup; locked
 * ones last. Relaxed (the old "Calm"): first the ready ones, without risk, with fewer clicks, not at a loss — speed only on a tie. Fastest (the old
 * "Efficient"): first the ready ones, then by speed (for methods without a speed — by entry level).
 */
function compare(priority: MethodPriority, xpLeft?: number, level?: number, coinRate: number | null = null) {
  return (a: MethodView, b: MethodView): number => {
    if (Boolean(a.method.manualSetup) !== Boolean(b.method.manualSetup)) return Number(Boolean(a.method.manualSetup)) - Number(Boolean(b.method.manualSetup));
    const uncheckedEntry = (v: MethodView) => v.unchecked.some(n => n.kind === 'skill' || n.kind === 'quest');
    if (uncheckedEntry(a) !== uncheckedEntry(b)) return Number(uncheckedEntry(a)) - Number(uncheckedEntry(b));
    // A method the level has outgrown (cows at Attack 45, seagulls at Ranged 60) does not beat a ready method made for this level just because the
    // newer one's supplies are unread or it is riskier. Where speed ranks (balanced, fastest), known speeds still decide; an outgrown method with
    // its supplies at hand still beats a new one that needs buying first.
    const outgrown = (v: MethodView) => level !== undefined && v.method.to !== null && level >= v.method.to;
    const bySpeed = priority !== 'relaxed' && rateLow(a.method) !== null && rateLow(b.method) !== null;
    if (outgrown(a) !== outgrown(b) && (outgrown(a) ? b : a).status === 'READY' && !bySpeed) {
      return Number(outgrown(a)) - Number(outgrown(b));
    }
    // Unchecked supplies must not beat a confirmed preparation step merely by being labelled READY.
    // Keep them available and disclose their uncertainty; do not invent missing quantities.
    // The same ranged kit should not drop back to an earlier trainer after equipping its arrows merely because owned food needs withdrawal.
    // Missing/unread supplies still lose to a supplied safer method; this only covers confirmed bank/wear preparation.
    const bankedRanged = (v: MethodView) => v.method.kit === 'f2p-bow' && v.status === 'PREP' && v.missing.every(n => n.state === 'BANK');
    const rank = (v: MethodView) => (bankedRanged(v) ? 0 : STATUS_RANK[v.status]) + (v.status === 'READY' && v.unchecked.length ? 1 : 0)
      + (v.unchecked.some(n => n.kind === 'skill' || n.kind === 'quest') ? 2 : 0);
    const s = rank(a) - rank(b);
    const ra = rateLow(a.method);
    const rb = rateLow(b.method);
    // Without comparable rates, retain the authored bracket as a preference, never as an availability ban.
    const suggested = (m: TrainingMethod) => level === undefined || ((m.suggestedFrom ?? m.from) <= level && (m.to === null || level < m.to));
    const byBracket = Number(suggested(b.method)) - Number(suggested(a.method));
    const byRate = ((ra === null || rb === null) ? byBracket : 0) || (rb ?? -1) - (ra ?? -1);
    const preferredEntry = (m: TrainingMethod) => m.suggestedFrom !== undefined && level !== undefined && m.suggestedFrom <= level ? m.suggestedFrom : m.from;
    const byEntry = preferredEntry(b.method) - preferredEntry(a.method);
    if (priority === 'balanced') {
      if (a.status === 'LOCKED' || b.status === 'LOCKED') { if (s) return s; }
      const pa = practicalRate(a.method);
      const pb = practicalRate(b.method);
      if (pa && pb && xpLeft && xpLeft > 0) {
        // The hours to the goal, less what the banked drops are worth in hours (lootValue.ts: the same rule as the fight plans).
        const hours = (v: MethodView, p: number) => xpLeft / p + (v.status === 'PREP' ? SETUP_HOURS : 0);
        const worth = (v: MethodView, h: number) => (coinRate && v.method.lootPerHour ? (h * v.method.lootPerHour) / (coinRate * 60) : 0);
        const ra0 = hours(a, pa);
        const rb0 = hours(b, pb);
        const ha = ra0 - worth(a, ra0);
        const hb = rb0 - worth(b, rb0);
        if (Math.abs(ha - hb) > Math.min(ra0, rb0) * 0.05) return ha - hb;
      } else {
        if (s) return s;
        // Without comparable pace evidence, do not buy a new recipe merely because its suggested bracket is newer.
        const supplied = (v: MethodView) => ![...v.missing, ...v.unchecked].some(n =>
          (n.kind === 'item' || n.kind === 'tool') && n.state !== 'BANK' && n.state !== 'OK');
        if ((pa === null || pb === null) && supplied(a) !== supplied(b)) return Number(supplied(b)) - Number(supplied(a));
        if ((pa === null || pb === null) && byBracket) return byBracket;
        if (pa === null && pb === null && a.method.kit === 'f2p-bow' && b.method.kit === 'f2p-bow' && byEntry) return byEntry;
        if ((pa ?? -1) !== (pb ?? -1)) return (pb ?? -1) - (pa ?? -1);
      }
      // Within a few percent the method made for this level wins (the wiki's bracket), then the easier and cheaper one.
      return s || byBracket || EFFORT_RANK[a.method.effort] - EFFORT_RANK[b.method.effort] || COST_RANK[a.method.cost] - COST_RANK[b.method.cost] || byRate || byEntry;
    }
    if (s) return s;
    if (priority === 'relaxed') {
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
  m.kind === 'method' && m.from <= level && (mode === 'members' || !m.members);

export interface PathLeg {
  method: TrainingMethod;
  fromLevel: number;
  toLevel: number;
}

export interface TimeEstimate {
  /** measured — from the player's measurements, model — the combat model for this player, wiki — from the wiki speed (a range, a guide). */
  source: 'measured' | 'model' | 'wiki';
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
  /** The end of the actual selected first leg, not the authored method's suggested upper bracket. */
  actionTarget: number | null;
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
  /** How methods are chosen; absent - from the style (calm: relaxed, efficient: fastest), as before 2.69. */
  priority?: MethodPriority;
  /** The skill's current XP (if known): otherwise counted from the start of the level. */
  xp?: number | null;
  /** XP per hour from the player's measurements. */
  measuredXph?: number | null;
  methods?: readonly TrainingMethod[];
  /** The exchange, for what arrows and runes cost and the drops bring an hour; without it neither is said nor counted. */
  prices?: PriceView | null;
  /** Whether the account may sell yet: a drop it cannot sell is not counted. */
  restriction?: TradeRestriction['state'];
}

const rateCache = new Map<string, TrainingMethod>();
/**
 * The methods of a skill with the combat model's own rate for this player where it has one (combatRates.ts): melee, Ranged and Magic training is then
 * ranked by what it gives this character, not by the wiki's guide for everyone. Other methods stay as they are.
 */
export function personalize(methods: readonly TrainingMethod[], skill: string, state: PlayerState, prices?: PriceView | null, restriction?: TradeRestriction['state']): TrainingMethod[] {
  return methods.map((m) => {
    if (!m.skills.includes(skill) || !m.npcNames?.length) return m;
    const key = `${m.id}|${skill}|${state.fingerprint}|${prices?.at ?? '-'}|${restriction ?? '-'}`;
    const hit = rateCache.get(key);
    if (hit) return hit;
    const r = methodRate(m, skill, state, { prices, restriction });
    const out: TrainingMethod = r ? {
      ...m, xph: [Math.round(r.xph[0]), Math.round(r.xph[1])], rateSource: 'model', costPerHour: r.costPerHour,
      ...(r.lootPerHour ? { lootPerHour: r.lootPerHour, lootName: r.loot } : {}),
    } : m;
    if (rateCache.size > 500) rateCache.clear();
    rateCache.set(key, out);
    return out;
  });
}

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** "≈ 8k–11k XP per hour", "for you" when it is the model's figure for this player. */
const rateText = (m: TrainingMethod) => {
  const r = m.xph!;
  return `${r[0] === r[1] ? `≈ ${fmtK(r[0])}` : `≈ ${fmtK(r[0])}–${fmtK(r[1])}`} XP per hour${m.rateSource === 'model' ? ' for you' : ''}`;
};

function reasonFor(v: MethodView, priority: MethodPriority, level: number): string {
  const m = v.method;
  const parts: string[] = [];
  if (priority === 'balanced') {
    if (m.xph) parts.push(rateText(m));
    parts.push(m.effort === 'afk' ? 'almost no clicks' : m.effort === 'low' ? 'few clicks' : m.effort === 'medium' ? 'steady clicking' : 'needs full attention');
    if (m.risk !== 'none') parts.push(m.risk === 'high' ? 'risky' : 'small risk');
  } else if (priority === 'relaxed') {
    const quiet = m.effort === 'afk' ? 'almost no clicks' : m.effort === 'low' ? 'few clicks' : m.effort === 'medium' ? 'relaxed pace' : 'needs attention';
    parts.push(m.risk === 'none' ? `no risk, ${quiet}` : `${quiet}, small risk`);
  } else if (m.xph) {
    parts.push(rateText(m));
  } else {
    parts.push('the best method for this level');
  }
  if (m.lootPerHour && m.lootName) parts.push(`${m.lootName} ≈ +${fmtK(Math.round(m.lootPerHour / 100) * 100)} gp per hour`);
  if (m.costPerHour) parts.push(`${m.skills.includes('magic') ? 'runes' : 'arrows'} ≈ ${fmtK(Math.round(m.costPerHour / 100) * 100)} gp per hour`);
  else if (m.cost === 'cost') parts.push('material costs');
  else if (m.cost === 'profit') parts.push('can end in profit');
  if (v.status === 'PREP') parts.push(`first: ${v.missing.map((x) => x.label).join(', ')}`);
  if (v.status === 'LOCKED') parts.push(`locked: ${v.missing.map((x) => x.label).join(', ')}`);
  if (level < m.from) parts.push(`from level ${m.from}`);
  return parts.join('; ');
}

/**
 * The best method on each leg of the path to the goal: identical consecutive ones merge. Except for "fastest", a new unlock replaces the method in hand
 * only when it is clearly better in practice (SWITCH_GAIN): changing method for a sliver costs a trip and a new setup.
 */
function buildPath(skill: string, level: number, target: number, input: AdviceInput, priority: MethodPriority, first: TrainingMethod | null): PathLeg[] {
  const methods = input.methods ?? trainingMethods;
  const legs: PathLeg[] = [];
  for (let lv = level; lv < target; lv++) {
    // For future levels the item requirements are not counted: "what will be needed", not "what there is now".
    const cands = methodsFor(skill, methods).filter((m) => !m.manualSetup && availableAt(m, lv, input.mode)).map((m) => viewMethod(m, input.state)).filter((v) => v.status !== 'LOCKED' || v.missing.every((x) => x.kind === 'skill'));
    // Each level is weighed as the first one is (adviseTraining): the hours from here to the goal, less what the banked drops are worth.
    cands.sort(compare(priority, Math.max(0, xpForLevel(target) - xpForLevel(lv)), lv, coinsPerMinute(input.prices)));
    let pick = (lv === level ? cands.find(c => c.method.id === first?.id)?.method : undefined) ?? cands[0]?.method;
    if (!pick) continue;
    const last = legs[legs.length - 1];
    if (priority !== 'fastest' && last && last.method.id !== pick.id && cands.some((c) => c.method.id === last.method.id)) {
      const now = practicalRate(last.method);
      const next = practicalRate(pick);
      if (now !== null && next !== null && next < now * SWITCH_GAIN) pick = last.method;
    }
    if (last && last.method.id === pick.id) last.toLevel = lv + 1;
    else legs.push({ method: pick, fromLevel: lv, toLevel: lv + 1 });
  }
  return legs.slice(0, 6);
}

export function adviseTraining(input0: AdviceInput): TrainingAdvice {
  const { skill, target, state, mode, style } = input0;
  const methods = personalize(input0.methods ?? trainingMethods, skill, state, input0.prices, input0.restriction);
  const input = { ...input0, methods };
  const level = levelOf(state, skill) ?? null;
  const empty: TrainingAdvice = { skill, level, target, best: null, others: [], quests: [], path: [], xpLeft: null, actionsLeft: null, actionTarget: null, time: null, reason: '', style };
  if (level === null) return { ...empty, reason: 'Level unknown: log in to the game with RuneLite or enter it on the skill page.' };
  if (level >= target) return { ...empty, reason: 'The goal is already reached.' };

  const priority: MethodPriority = input.priority ?? (style === 'efficient' ? 'fastest' : 'relaxed');
  const xpNow0 = input.xp ?? xpForLevel(level);
  const cmp = compare(priority, Math.max(0, xpForLevel(target) - xpNow0), level, coinsPerMinute(input.prices));
  const views = methodsFor(skill, methods).filter((m) => availableAt(m, level, mode)).map((m) => viewMethod(m, state)).sort(cmp);
  const best = views.find((v) => !v.method.manualSetup && v.status !== 'LOCKED') ?? null;
  const others = views.filter((v) => v !== best).slice(0, 3);
  const quests = methodsFor(skill, methods).filter((m) => m.kind === 'quest' && m.from <= level && (m.to === null || level < m.to) && (mode === 'members' || !m.members));
  const path = buildPath(skill, level, target, input, priority, best?.method ?? null);

  const xpNow = input.xp ?? xpForLevel(level);
  const xpLeft = Math.max(0, xpForLevel(target) - xpNow);
  let actionsLeft: number | null = null;
  const actionTarget = best ? path.find(l => l.fromLevel === level && l.method.id === best.method.id)?.toLevel ?? target : null;
  if (best?.method.xpa) {
    const legEnd = actionTarget ?? target;
    actionsLeft = Math.ceil(Math.max(0, xpForLevel(legEnd) - xpNow) / best.method.xpa);
  }
  let time: TimeEstimate | null = null;
  if (input.measuredXph && input.measuredXph > 0) {
    const h = xpLeft / input.measuredXph;
    time = { source: 'measured', minHours: h, maxHours: h };
  } else if (best?.method.xph) {
    time = { source: best.method.rateSource ?? 'wiki', minHours: xpLeft / best.method.xph[1], maxHours: xpLeft / best.method.xph[0] };
  }
  return {
    ...empty, best, others, quests, path, xpLeft, actionsLeft, actionTarget, time,
    reason: best ? reasonFor(best, priority, level) : 'There is no method in the list for this level and mode: see the skill training plan.',
  };
}

/** "about 3–4 h" / "≈ 2 h"; under an hour — in minutes. */
export function formatHours(t: TimeEstimate): string {
  const f = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`);
  if (t.minHours === t.maxHours || f(t.minHours) === f(t.maxHours)) return `${t.source === 'measured' ? '≈' : 'about'} ${f(t.maxHours)}`;
  return `about ${f(t.minHours)}–${f(t.maxHours)}`;
}
