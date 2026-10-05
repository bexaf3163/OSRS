// "How to make up the money": earning methods from the wiki (moneyMaking.json) that are available at the player's levels.
// Levels come from the game or are entered manually; what we do not know we do not invent but mark with "?". Income per hour is the wiki's estimate
// at Grand Exchange prices on the snapshot date with good play: for a beginner it is lower, and the interface says so.

import moneyJson from '../data/moneyMaking.json';
import type { MoneyData, MoneyMethod, MoneyReq, Step } from '../types';
import { nameKey } from './checklist';

export const MONEY = moneyJson as MoneyData;

export type Levels = Readonly<Record<string, number | undefined>>;

/** The combat level by the game's formula; null means Attack, Strength or Defence is unknown. */
export function combatLevel(l: Levels): number | null {
  const { attack, strength, defence } = l;
  if (attack === undefined || strength === undefined || defence === undefined) return null;
  const hp = l.hitpoints ?? 10;
  const base = 0.25 * (defence + hp + Math.floor((l.prayer ?? 1) / 2));
  const melee = 0.325 * (attack + strength);
  const ranged = 0.325 * Math.floor(1.5 * (l.ranged ?? 1));
  const magic = 0.325 * Math.floor(1.5 * (l.magic ?? 1));
  return Math.floor(base + Math.max(melee, ranged, magic));
}

export interface ReqState {
  req: MoneyReq;
  /** How much the player has; undefined means unknown. */
  have?: number;
  ok: boolean;
}

export interface MethodView {
  method: MoneyMethod;
  /** The mandatory requirements that are lacking (a known level is below the needed one). */
  missing: ReqState[];
  /** The mandatory requirements whose level is unknown. */
  unknown: ReqState[];
  /** The advised levels that are lacking (only a hint). */
  advice: ReqState[];
  /** The quests from the method's conditions that the player has not completed and that are mandatory. */
  questsMissing: string[];
  /** How many levels are lacking to the furthest mandatory requirement. */
  gap: number;
  /** free means nothing needs buying; invest means the wiki names a starting capital or materials to buy. */
  cost: 'free' | 'invest';
}

function stateOf(req: MoneyReq, levels: Levels, combat: number | null): ReqState {
  const have = req.skill === 'combat' ? combat ?? undefined : levels[req.skill];
  return { req, ...(have !== undefined ? { have } : {}), ok: have !== undefined && have >= req.level };
}

/** The route quest names mentioned in the method's conditions that the player has not completed yet (if the condition is hard). */
function questGaps(m: MoneyMethod, steps: readonly Step[], done: ReadonlySet<string>): string[] {
  if (!m.quests) return [];
  const text = m.quests.toLowerCase();
  // "recommended" is advice, not a requirement: it remains a hint in the conditions text itself.
  if (/recommend|optional/.test(text)) return [];
  const found: string[] = [];
  for (const s of steps) {
    if (s.type === 'quest' && text.includes(s.title.toLowerCase()) && !done.has(nameKey(s.title))) found.push(s.title);
  }
  return found;
}

export function viewMethod(m: MoneyMethod, levels: Levels, steps: readonly Step[], questsDone: ReadonlySet<string>): MethodView {
  const combat = combatLevel(levels);
  const states = m.skills.map((r) => stateOf(r, levels, combat));
  const hard = states.filter((s) => s.req.required);
  const missing = hard.filter((s) => s.have !== undefined && !s.ok);
  const unknown = hard.filter((s) => s.have === undefined);
  const advice = states.filter((s) => !s.req.required && s.have !== undefined && !s.ok);
  const gap = missing.reduce((g, s) => Math.max(g, s.req.level - (s.have ?? 0)), 0);
  const cost = m.capital || m.inputs?.length ? 'invest' : 'free';
  return { method: m, missing, unknown, advice, questsMissing: questGaps(m, steps, questsDone), gap, cost };
}

export interface MoneyAdvice {
  /** Without investment, available at the known levels (unknown ones are marked), income in descending order. */
  free: MethodView[];
  /** Need investment that you can afford (or it is unknown how many coins you have). */
  invest: MethodView[];
  /** Will open soon: no more than SOON_GAP levels are lacking. */
  soon: MethodView[];
}

export const SOON_GAP = 10;

/**
 * cash is coins (bag + bank), null means unknown: then methods with capital are not cut off, but they are not passed off as available
 * without a caveat either (the method's line keeps "from N gp").
 */
export function adviseMoney(
  levels: Levels, steps: readonly Step[], questsDone: ReadonlySet<string>, methods: readonly MoneyMethod[] = MONEY.methods, cash: number | null = null,
): MoneyAdvice {
  const views = methods.map((m) => viewMethod(m, levels, steps, questsDone));
  const open = views.filter((v) => !v.missing.length && !v.questsMissing.length);
  const soon = views.filter((v) => v.missing.length > 0 && v.gap <= SOON_GAP && !v.questsMissing.length);
  const byProfit = (a: MethodView, b: MethodView) => b.method.profit - a.method.profit;
  // First what is surely available, then what has an unknown level.
  const order = (list: MethodView[]) => [...list.filter((v) => !v.unknown.length).sort(byProfit), ...list.filter((v) => v.unknown.length).sort(byProfit)];
  const affordable = (v: MethodView) => cash === null || !v.method.capital || v.method.capital <= cash;
  return {
    free: order(open.filter((v) => v.cost === 'free')),
    invest: order(open.filter((v) => v.cost === 'invest' && affordable(v))),
    soon: soon.filter((v) => v.cost === 'free' || affordable(v)).sort((a, b) => a.gap - b.gap || b.method.profit - a.method.profit),
  };
}

/** Hours to the goal at an income of profit per hour; null means nothing to count. */
export function hoursToCover(missingGp: number, profit: number): number | null {
  return missingGp > 0 && profit > 0 ? missingGp / profit : null;
}

export function reqText(r: MoneyReq): string {
  const name = r.skill === 'combat' ? 'combat' : r.skill.charAt(0).toUpperCase() + r.skill.slice(1);
  return `${name} ${r.level}${r.plus ? '+' : ''}`;
}
