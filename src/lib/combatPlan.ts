// "Food and time" of a combat training step, in words: the next trip, the whole remaining goal, what you have and what to buy;
// the details (phases, the other version of the opponent, the potions, what was assumed) are for the "Details" fold. The numbers are
// combatEstimate's; here only the choice of the opponent version, counting the food you own by its healing, and rounding.

import type { Step } from '../types';
import { nameKey, type OwnedState } from './checklist';
import {
  CALIBRATED_KILLS, foeLabel, healsOf, observedFor, stepGoals, type Basis, type CombatEstimate, type Fights, type Range, type StepEstimateContext,
} from './combatEstimate';
import { durationText } from './splits';
import { heldUnits } from './doses';
import { heldExact } from './playerState';
import { currentXp, itemGoal, objectiveEstimates } from './combatObjectives';

export const BASIS_LABEL: Record<Basis, string> = {
  formula: 'estimate from the combat formulas',
  calibrated: 'estimate adjusted by your measured kills',
  basic: 'rough estimate: some of your gear is unknown to the app',
};

export interface OwnedFood {
  /** Usable food in the bag; banknotes are separate. */
  carried: number;
  bank: number;
  /** All of it in pieces of the step's food, by healing: 3 Lobsters (12) are 4 Salmon (9). */
  equivalent: number;
  /** Usable carried food in pieces of the step's food, by healing. */
  carriedEq: number;
  /** Owned as banknotes, in equivalent healing units; cannot be eaten before unnoting. */
  notedEq?: number;
  /** Confirmed bank stock by healing; a lower bound while bankComplete is false. */
  bankEq: number;
  /** Every accepted food's bank quantity was reported in this session. */
  bankComplete: boolean;
  /** Edible items a later quest needs, kept out of the count: "2 Cooked meat for S1-05". */
  reserved: string[];
  /** "13 Salmon, 2 Lobster". */
  text: string;
}

/** Edible items open quest steps still need (an ingredient that happens to be food): the count and the first step, by name key. */
export type FoodReservations = ReadonlyMap<string, { count: number; stepId: string }>;

/** What open steps other than this one need of each food the step accepts: those pieces are for the quest, never to be eaten. */
export function foodReservations(step: Pick<Step, 'id' | 'itemsRequired'>, open: readonly Pick<Step, 'id' | 'itemsRequired'>[]): FoodReservations {
  const item = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  const out = new Map<string, { count: number; stepId: string }>();
  if (!item) return out;
  const foods = new Set([item.nameEn, ...(item.anyOf ?? [])].map(nameKey));
  for (const s of open) {
    if (s.id === step.id) continue;
    for (const r of s.itemsRequired ?? []) {
      const k = nameKey(r.nameEn);
      if (!foods.has(k) || typeof r.heals === 'number') continue;
      const n = typeof r.amount === 'number' ? r.amount : Number.parseInt(String(r.amount), 10);
      if (!Number.isFinite(n) || n <= 0) continue;
      const prev = out.get(k);
      out.set(k, { count: (prev?.count ?? 0) + n, stepId: prev?.stepId ?? s.id });
    }
  }
  return out;
}

export interface CombatPlanView {
  primary: CombatEstimate;
  /** Every free version of the opponent, the primary among them. */
  variants: CombatEstimate[];
  food: string;
  heals: number;
  nextTrip: number;
  /** The whole remaining goal, rounded for reading. */
  total: Range;
  /** What to have for the whole goal: the high end (the expected plus the reserve). */
  plan: number;
  owned: OwnedFood | null;
  /** Pieces to buy; null means unreported food quantities could cover the deficit. */
  buy: number | null;
  time: string;
  trips: string;
  basis: string;
  phases: string[];
  /** The other versions of the opponent, in a line each. */
  compare: string[];
  /** What the step's Strength potions change; null — nothing to say. */
  potion: string | null;
  /** What the game measured on the planned version: "34 kills measured: 8.5 s and 1.2 damage a kill"; null — nothing yet. */
  measured: string | null;
  assumed: string[];
}

/** Round a count of pieces for reading: exact up to 30, to 5 above (down for the low end, up for the high). */
function roundPieces(r: Range): Range {
  if (r.high <= 30) return { low: Math.round(r.low), mid: Math.round(r.mid), high: Math.round(r.high) };
  return { low: Math.floor(r.low / 5) * 5, mid: Math.round(r.mid / 5) * 5, high: Math.ceil(r.high / 5) * 5 };
}

const span = (low: number, high: number, unit = '') => (low === high ? `${low}${unit}` : `${low}–${high}${unit}`);
export const minutesText = (r: Range) => {
  const a = durationText(r.low * 60);
  const b = durationText(r.high * 60);
  return a === b ? a : `${a} – ${b}`;
};

/** The food of the step and its alternatives you own, counted in pieces of the step's food by healing. Unknown — null. */
export function ownedFood(step: Pick<Step, 'itemsRequired'>, owned: OwnedState | null, reserved: FoodReservations = new Map()): OwnedFood | null {
  const item = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  if (!item || !owned) return null;
  let carried = 0;
  let bank = 0;
  let healing = 0;
  let carriedHealing = 0;
  let bankHealing = 0;
  let notedHealing = 0;
  let bankComplete = true;
  const parts: string[] = [];
  const kept: string[] = [];
  for (const name of [...new Map([item.nameEn, ...(item.anyOf ?? [])].map((n) => [nameKey(n), n])).values()]) {
    const o = owned.items.get(nameKey(name));
    const heals = name === item.nameEn ? item.heals! : healsOf(name);
    if (heals === null) continue;
    const held = heldExact({ owned, bankSeen: owned.bankSeen, equipment: {}, manual: {} }, name);
    if (held.bank === null) bankComplete = false;
    if (!o) continue;
    // A quest's pieces come out of the bag first: they must not be counted as food for the trip.
    let hold = reserved.get(nameKey(name))?.count ?? 0;
    let inBag = o.carried;
    let inNotes = o.noted;
    let inBank = held.bank ?? 0;
    const fromBag = Math.min(hold, inBag);
    inBag -= fromBag;
    hold -= fromBag;
    const fromNotes = Math.min(hold, inNotes);
    inNotes -= fromNotes;
    hold -= fromNotes;
    inBank -= Math.min(hold, inBank);
    const keptCount = o.carried + o.noted + (held.bank ?? 0) - inBag - inNotes - inBank;
    if (keptCount > 0) kept.push(`${keptCount} ${name} for ${reserved.get(nameKey(name))!.stepId}`);
    const n = inBag + inNotes + inBank;
    if (!n) continue;
    carried += inBag;
    bank += inBank;
    healing += n * heals;
    carriedHealing += inBag * heals;
    bankHealing += inBank * heals;
    notedHealing += inNotes * heals;
    parts.push(`${n} ${name}`);
  }
  return {
    carried, bank, equivalent: Math.floor(healing / item.heals!), carriedEq: Math.floor(carriedHealing / item.heals!),
    bankEq: Math.floor(bankHealing / item.heals!), bankComplete, notedEq: Math.floor(notedHealing / item.heals!), reserved: kept, text: parts.join(', '),
  };
}

function measuredText(o: ReturnType<typeof observedFor>): string | null {
  if (!o || !o.kills) return null;
  const per = (x: number) => (x / o.kills).toFixed(1);
  const counted = o.kills >= CALIBRATED_KILLS ? 'counted in' : `counted in from ${CALIBRATED_KILLS}`;
  return `${o.kills} kills measured in the game: ${per(o.seconds)} s and ${per(o.damage ?? 0)} damage taken a kill (${counted}).`;
}

/** Strength potion doses you own (bag, banknotes, bank), counted by the shared dose rules (doses.ts) so the plan and Shopping agree. */
export function strengthDoses(owned: OwnedState | null): number {
  const h = heldUnits({ owned, equipment: {}, manual: {}, bankSeen: owned?.bankSeen === true }, 'Strength potion(4)');
  return h.total ?? (h.bag ?? 0) + h.noted;
}

/** Doses the step recommends taking (Strength potion(4) × amount). */
function recommendedDoses(step: Pick<Step, 'itemsRecommended'>): number {
  const it = (step.itemsRecommended ?? []).find((i) => /^Strength potion\((\d)\)$/.test(i.nameEn));
  return it ? Number(/\((\d)\)/.exec(it.nameEn)![1]) * (Number(it.amount) || 0) : 0;
}

/**
 * The version to plan for: the one the player is fighting (enough measured kills, the most of them), else the one with the least food among
 * those no more than 15% slower than the fastest — the level 12 Minotaur over the level 27 one at the same pace, for example.
 */
export function chooseVariant(list: CombatEstimate[], fights?: Fights[] | null): CombatEstimate | null {
  if (!list.length) return null;
  const fought = list
    .map((e) => ({ e, kills: observedFor(e.foe, fights)?.kills ?? 0 }))
    .filter((x) => x.kills >= CALIBRATED_KILLS)
    .sort((a, b) => b.kills - a.kills)[0];
  if (fought) return fought.e;
  const fastest = Math.min(...list.map((e) => e.totalMinutes.mid));
  const near = list.filter((e) => e.totalMinutes.mid <= fastest * 1.15);
  return near.reduce((a, b) => (b.food.mid < a.food.mid ? b : a));
}

export function combatPlanView(
  step: Pick<Step, 'pacing' | 'foes' | 'itemsRequired' | 'itemsRecommended' | 'inGame' | 'combatPlan'>,
  ctx: StepEstimateContext & { owned: OwnedState | null; reserved?: FoodReservations },
): CombatPlanView | null {
  const doses = strengthDoses(ctx.owned);
  const skill = step.combatPlan?.trainingSkill;
  const explicit = stepGoals(step);
  const goals = explicit.length ? explicit : skill ? [{ skill, exp: currentXp(ctx, skill) }] : [];
  const foe = step.foes?.[0];
  const remaining = itemGoal(step, ctx.owned)?.missing ?? 0;
  const project = (strengthDoses: number) => goals.length && foe ? objectiveEstimates(step, foe, goals, remaining, { ...ctx, strengthDoses }) : [];
  const list = project(doses);
  const primary = chooseVariant(list, ctx.fights);
  const item = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  if (!primary || !item) return null;
  const food = item.nameEn;
  const total = roundPieces(primary.food);
  const owned = ownedFood(step, ctx.owned, ctx.reserved);
  const buy = owned && (owned.equivalent >= total.high || owned.bankComplete) ? Math.max(0, total.high - owned.equivalent) : null;

  const phases = primary.phases.map((p) =>
    `${p.skill[0].toUpperCase()}${p.skill.slice(1)} ${p.fromLevel} → ${p.toLevel} (${p.style[0].toUpperCase()}${p.style.slice(1)}): ${p.kills} kills, about ${durationText(p.seconds)} of fighting`);

  const compare = list.filter((e) => e !== primary).map((e) => {
    const t = roundPieces(e.food);
    return `${foeLabel(e.foe)} instead: ${e.kills} kills, ${span(t.low, t.high)} ${food}, ${minutesText(e.totalMinutes)}.`;
  });

  // The potions: what the doses you own do, or what the recommended ones would.
  let potion: string | null = null;
  const tryDoses = doses || recommendedDoses(step);
  if (tryDoses) {
    const same = (n: number) => project(n).find((e) => e.foe === primary.foe);
    const without = same(0);
    const withP = same(tryDoses);
    if (without && withP) {
      const saved = without.totalMinutes.mid - withP.totalMinutes.mid;
      const subject = doses ? `Your ${doses} Strength potion doses` : `${tryDoses} Strength potion doses`;
      potion = saved >= 1
        ? `${subject} save about ${durationText(saved * 60)}.`
        : `${subject} would not speed this up with your gear: the boost does not raise your max hit here.`;
    }
  }

  return {
    primary, variants: list, food, heals: item.heals!, nextTrip: primary.nextTrip, total, plan: total.high, owned, buy,
    time: minutesText(primary.totalMinutes),
    trips: Number.isFinite(primary.killsPerTrip) ? span(primary.trips.low, primary.trips.high, primary.trips.high === 1 ? ' trip' : ' trips') : 'no banking for food',
    basis: BASIS_LABEL[primary.basis], phases, compare, potion, measured: measuredText(observedFor(primary.foe, ctx.fights)), assumed: primary.assumed,
  };
}
