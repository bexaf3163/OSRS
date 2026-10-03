// «Чем качать»: по уровню, цели, режиму игры, предметам и стилю игры (спокойно / эффективно) выбирает способ прокачки
// навыка и показывает путь до цели. Способы — src/data/trainingMethods.json (OSRS Wiki и план прокачки гайда).
//
// Правила, на которых всё держится:
//  — выбирается только то, что открыто: уровень подходит, режим (F2P/Members) подходит, квест пройден. Чего не хватает
//    из предметов, называется («нужна кирка», «нужны перья»), но способ остаётся — это подготовка, а не запрет;
//  — «неизвестно» не равно «нет»: предмет, который проверить нечем, не снимает способ с выбора;
//  — скорость из вики — ориентир, а не обещание: время до цели считается по замерам игрока, а когда замеров нет —
//    только как диапазон «по вики» и помечено. Опыт за действие — точное число игры, по нему считается «сколько ещё действий».

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
  /** Любой топор / кирка не ниже подходящей ступени — берётся из toolProgression.json. */
  | { type: 'tool'; skill: 'woodcutting' | 'mining' }
  | { type: 'quest'; quest: string }
  | { type: 'skill'; skill: string; min: number };

export interface TrainingMethod {
  id: string;
  /** Навыки, которые способ качает (бой — все три). */
  skills: string[];
  from: number;
  /** До какого уровня (не включая) способ лучший; null — до конца. */
  to: number | null;
  name: string;
  members: boolean;
  needs: MethodNeed[];
  /** Опыт в час по вики: [от, до] — ориентир. */
  xph: [number, number] | null;
  /** Опыт за одно действие — точное значение игры. */
  xpa: number | null;
  /** Форма слова «бревно|бревна|брёвен» для «сколько ещё». */
  act: string | null;
  effort: Effort;
  cost: MethodCost;
  risk: Risk;
  where: string;
  /** Ключ места в словаре мест (majorLocations.json) — для стрелки в игре; нет — только словами. */
  place?: string;
  note?: string;
  url: string;
  /** Квест с одноразовой наградой опытом: в «лучший способ» не попадает, показывается отдельно. */
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
// Требования способа

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
    // Годится любой инструмент ступени, которую позволяет уровень (лучший открытый не нужен — достаточно любого).
    const lv = levelOf(state, n.skill);
    const usable = tools[n.skill].filter((t) => lv === undefined || t.levelReq <= lv);
    const req: Requirement = { type: 'alternative', requiredCount: 1, alternatives: usable.map((t) => ({ name: t.tier })) };
    const r = evaluate(req, state);
    return { kind: 'tool', label: n.skill === 'woodcutting' ? 'Топор' : 'Кирка', state: r.state, detail: r.detail };
  }
  const count = n.count ?? 1;
  const r = evaluate({ type: 'item', name: n.name, count }, state);
  return { kind: 'item', label: `${n.name}${count > 1 ? ` ×${count}` : ''}`, state: r.state, detail: r.detail };
}

export type MethodStatus = 'READY' | 'PREP' | 'LOCKED';

export interface MethodView {
  method: TrainingMethod;
  status: MethodStatus;
  /** Чего не хватает (предметы, инструмент) или что закрывает способ (квест, уровень навыка). */
  missing: NeedStatus[];
  /** Что проверить нечем: не «нет», а «не знаю». */
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
// Выбор

const EFFORT_RANK: Record<Effort, number> = { afk: 0, low: 1, medium: 2, high: 3 };
const RISK_RANK: Record<Risk, number> = { none: 0, low: 1, high: 2 };
const COST_RANK: Record<MethodCost, number> = { profit: 0, free: 0, cost: 1 };
const STATUS_RANK: Record<MethodStatus, number> = { READY: 0, PREP: 1, LOCKED: 2 };

/** Для порядка берём нижнюю границу скорости: верхняя у вики часто требует особых приёмов (тики, инвентарь). */
const rateLow = (m: TrainingMethod): number | null => (m.xph ? m.xph[0] : null);

/**
 * Порядок способов. Спокойный стиль: сначала готовое, без риска, с меньшим числом кликов, не в убыток — скорость лишь
 * при равенстве. Эффективный: сначала готовое, потом по скорости (у способов без скорости — по уровню входа).
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
  /** measured — по замерам игрока, wiki — по скорости из вики (диапазон, ориентир). */
  source: 'measured' | 'wiki';
  minHours: number;
  maxHours: number;
}

export interface TrainingAdvice {
  skill: string;
  /** null — уровень неизвестен: советовать нечего. */
  level: number | null;
  target: number;
  best: MethodView | null;
  /** До трёх других способов этого уровня. */
  others: MethodView[];
  /** Квесты с наградой опытом в этом диапазоне — отдельно от способов. */
  quests: TrainingMethod[];
  /** Путь от уровня до цели: какой способ на каком отрезке. */
  path: PathLeg[];
  xpLeft: number | null;
  /** Сколько ещё действий лучшим способом до конца его отрезка; null — опыт за действие неизвестен. */
  actionsLeft: number | null;
  time: TimeEstimate | null;
  /** Одна фраза «почему этот способ». */
  reason: string;
  style: PlayStyle;
}

export interface AdviceInput {
  skill: string;
  target: number;
  state: PlayerState;
  mode: GameMode;
  style: PlayStyle;
  /** Текущий опыт навыка (если известен): иначе считается от начала уровня. */
  xp?: number | null;
  /** Опыт в час по замерам игрока. */
  measuredXph?: number | null;
  methods?: readonly TrainingMethod[];
}

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} тыс.` : String(n));

function reasonFor(v: MethodView, style: PlayStyle, level: number): string {
  const m = v.method;
  const parts: string[] = [];
  if (style === 'chill') {
    const quiet = m.effort === 'afk' ? 'почти без кликов' : m.effort === 'low' ? 'мало кликов' : m.effort === 'medium' ? 'спокойный темп' : 'нужно внимание';
    parts.push(m.risk === 'none' ? `без риска, ${quiet}` : `${quiet}, риск небольшой`);
  } else if (m.xph) {
    parts.push(m.xph[0] === m.xph[1] ? `≈ ${fmtK(m.xph[0])} опыта в час` : `≈ ${fmtK(m.xph[0])}–${fmtK(m.xph[1])} опыта в час`);
  } else {
    parts.push('лучший способ для этого уровня');
  }
  if (m.cost === 'cost') parts.push('расходы на материалы');
  else if (m.cost === 'profit') parts.push('можно остаться в плюсе');
  if (v.status === 'PREP') parts.push(`сначала: ${v.missing.map((x) => x.label).join(', ')}`);
  if (v.status === 'LOCKED') parts.push(`закрыто: ${v.missing.map((x) => x.label).join(', ')}`);
  if (level < m.from) parts.push(`с ${m.from} уровня`);
  return parts.join('; ');
}

/** Лучший способ на каждом отрезке пути до цели: подряд идущие одинаковые склеиваются. */
function buildPath(skill: string, level: number, target: number, input: AdviceInput, cmp: ReturnType<typeof compare>): PathLeg[] {
  const methods = input.methods ?? trainingMethods;
  const legs: PathLeg[] = [];
  for (let lv = level; lv < target; lv++) {
    // Для будущих уровней требования к предметам не учитываем: «что понадобится», а не «что есть сейчас».
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
  if (level === null) return { ...empty, reason: 'Уровень неизвестен — войди в игру с RuneLite или введи его на странице навыка.' };
  if (level >= target) return { ...empty, reason: 'Цель уже достигнута.' };

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
    reason: best ? reasonFor(best, style, level) : 'Для этого уровня и режима способа в списке нет — смотри план прокачки навыка.',
  };
}

/** «примерно 3–4 ч» / «≈ 2 ч»; меньше часа — в минутах. */
export function formatHours(t: TimeEstimate): string {
  const f = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} мин` : `${String(h < 10 ? Math.round(h * 10) / 10 : Math.round(h)).replace('.', ',')} ч`);
  if (t.minHours === t.maxHours || f(t.minHours) === f(t.maxHours)) return `${t.source === 'wiki' ? 'примерно' : '≈'} ${f(t.maxHours)}`;
  return `примерно ${f(t.minHours)}–${f(t.maxHours)}`;
}
