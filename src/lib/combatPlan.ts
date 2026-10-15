// "Food and time" of a combat training step, in words: the next trip, the whole remaining goal, what you have and what to buy;
// the details (phases, the other version of the opponent, the potions, what was assumed) are for the "Details" fold. The numbers are
// combatEstimate's; here only the choice of the opponent version, counting the food you own by its healing, and rounding.

import type { Step } from '../types';
import { nameKey, type OwnedState } from './checklist';
import {
  CALIBRATED_KILLS, estimateStep, foeLabel, healsOf, observedFor, type Basis, type CombatEstimate, type Fights, type Range, type StepEstimateContext,
} from './combatEstimate';
import { durationText } from './splits';

export const BASIS_LABEL: Record<Basis, string> = {
  formula: 'estimate from the combat formulas',
  calibrated: 'estimate adjusted by your measured kills',
  basic: 'rough estimate: some of your gear is unknown to the app',
};

export interface OwnedFood {
  /** In the bag (and worn, never for food) and as banknotes. */
  carried: number;
  bank: number;
  /** All of it in pieces of the step's food, by healing: 3 Lobsters (12) are 4 Salmon (9). */
  equivalent: number;
  /** "13 Salmon, 2 Lobster". */
  text: string;
}

export interface CombatPlanView {
  primary: CombatEstimate;
  food: string;
  heals: number;
  nextTrip: number;
  /** The whole remaining goal, rounded for reading. */
  total: Range;
  /** What to have for the whole goal: the high end (the expected plus the reserve). */
  plan: number;
  owned: OwnedFood | null;
  /** Pieces to buy for the whole goal; null — the bank has not been seen, the deficit is unknown. */
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
export function ownedFood(step: Pick<Step, 'itemsRequired'>, owned: OwnedState | null): OwnedFood | null {
  const item = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  if (!item || !owned) return null;
  let carried = 0;
  let bank = 0;
  let healing = 0;
  const parts: string[] = [];
  for (const name of [item.nameEn, ...(item.anyOf ?? [])]) {
    const o = owned.items.get(nameKey(name));
    const heals = name === item.nameEn ? item.heals! : healsOf(name);
    if (!o || heals === null) continue;
    const n = o.carried + o.noted + (o.bank ?? 0);
    if (!n) continue;
    carried += o.carried + o.noted;
    bank += o.bank ?? 0;
    healing += n * heals;
    parts.push(`${n} ${name}`);
  }
  return { carried, bank, equivalent: Math.floor(healing / item.heals!), text: parts.join(', ') };
}

function measuredText(o: ReturnType<typeof observedFor>): string | null {
  if (!o || !o.kills) return null;
  const per = (x: number) => (x / o.kills).toFixed(1);
  const counted = o.kills >= CALIBRATED_KILLS ? 'counted in' : `counted in from ${CALIBRATED_KILLS}`;
  return `${o.kills} kills measured in the game: ${per(o.seconds)} s and ${per(o.damage ?? 0)} damage taken a kill (${counted}).`;
}

/** Strength potion doses you own (bag, banknotes, bank). */
export function strengthDoses(owned: OwnedState | null): number {
  let n = 0;
  for (let d = 1; d <= 4; d++) {
    const o = owned?.items.get(nameKey(`Strength potion(${d})`));
    if (o) n += d * (o.carried + o.noted + (o.bank ?? 0));
  }
  return n;
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

export function combatPlanView(step: Pick<Step, 'pacing' | 'foes' | 'itemsRequired' | 'itemsRecommended'>, ctx: StepEstimateContext & { owned: OwnedState | null }): CombatPlanView | null {
  const doses = strengthDoses(ctx.owned);
  const list = estimateStep(step, { ...ctx, strengthDoses: doses });
  const primary = chooseVariant(list, ctx.fights);
  const item = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  if (!primary || !item) return null;
  const food = item.nameEn;
  const total = roundPieces(primary.food);
  const owned = ownedFood(step, ctx.owned);
  const buy = owned && ctx.owned?.bankSeen ? Math.max(0, total.high - owned.equivalent) : null;

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
    const same = (n: number) => estimateStep(step, { ...ctx, strengthDoses: n }).find((e) => e.foe === primary.foe);
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
    primary, food, heals: item.heals!, nextTrip: primary.nextTrip, total, plan: total.high, owned, buy,
    time: minutesText(primary.totalMinutes),
    trips: Number.isFinite(primary.killsPerTrip) ? span(primary.trips.low, primary.trips.high, primary.trips.high === 1 ? ' trip' : ' trips') : 'no banking for food',
    basis: BASIS_LABEL[primary.basis], phases, compare, potion, measured: measuredText(observedFor(primary.foe, ctx.fights)), assumed: primary.assumed,
  };
}
