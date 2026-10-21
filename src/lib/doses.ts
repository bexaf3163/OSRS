// Potion doses. A "Strength potion(4)" holds four doses and a (3) three, so a step that asks for 4 Strength potion(4) needs 16 doses, and a (3) and a
// (1) cover 4 of them. Every place that counts a potion counts it here: the step's readiness, the trip, Shopping, the coin plan, and (the same rules in
// Java, ItemCounts.doses) the game's card. That way all of them show the same number.
//
// Doses are not bag slots. A (3) and a (1) are 4 doses in 2 potions until the player uses one on the other; the app never pretends they were poured
// together, it says when pouring them together frees a slot.

import { nameKey } from './checklist';
import { heldOf, type Held, type PlayerState } from './playerState';
import { doseKind, doseName } from './doseKind';

export { doseKind, doseName, doseNames, type DoseKind } from './doseKind';

/** Every size of a potion is 1 to 4 doses (the free-world and route potions). */
export const DOSE_SIZES = [4, 3, 2, 1] as const;
const MAX_DOSES = 4;


/** What a requirement is counted in: doses for a potion ("4 × Strength potion(4)" is 16), pieces for anything else. */
export function needUnits(name: string, count: number): number {
  const k = doseKind(name);
  return k ? count * k.per : count;
}

/** "16 doses" for a potion, "×16" for anything else; nothing for a single piece. */
export function amountText(name: string, units: number, exact = true): string {
  if (doseKind(name)) return `${units} ${units === 1 ? 'dose' : 'doses'}`;
  return units > 1 ? `×${units}${exact ? '' : '+'}` : '';
}

/** A potion line's name without its size: "Strength potion" for "Strength potion(4)". */
export function displayName(name: string): string {
  return doseKind(name)?.base ?? name;
}

/** Potions of one size the player has: in the bag, as banknotes, in the bank (null when the bank is not known). */
export interface DoseSize { size: number; bag: number; noted: number; bank: number | null }

export interface HeldUnits extends Held {
  /** Doses for a potion, pieces for anything else. */
  unit: 'dose' | 'piece';
  /** For a potion: how many potions of each size, largest first: what fills bag slots. */
  sizes?: DoseSize[];
}

/**
 * How much of an item the player has, in the units its requirement is counted in. Anything but a potion is heldOf as it is. A potion is counted in
 * doses across its four sizes, with the same rules heldOf keeps for one item: a known bank and a full report from the game make it complete; a manual
 * mark (in doses) is the player's word; a bag that shows doses without the bank is a lower bound; nothing reported is UNKNOWN, never "none".
 * `legacy` names manual marks made before doses were counted, in potions of the named size.
 */
export function heldUnits(
  s: Pick<PlayerState, 'owned' | 'equipment' | 'manual' | 'bankSeen'> & { levels?: PlayerState['levels'] }, name: string, manualKey?: string, legacy?: readonly string[],
): HeldUnits {
  const kind = doseKind(name);
  if (!kind) return { ...heldOf(s, name, manualKey), unit: 'piece' };
  const records = DOSE_SIZES.map((size) => ({ size, o: s.owned?.items.get(nameKey(doseName(kind.base, size))) }));
  // The game reports every size together (ItemCounts.report); a size it did not report is not "none" but "not counted".
  const reported = records.every((r) => r.o !== undefined);
  const bankReported = s.bankSeen && records.every((r) => r.o?.bank !== undefined);
  const sizes: DoseSize[] = records.map(({ size, o }) => ({
    size, bag: o?.carried ?? 0, noted: o?.noted ?? 0, bank: bankReported ? o!.bank! : null,
  }));
  const bag = sizes.reduce((a, x) => a + x.size * x.bag, 0);
  const noted = sizes.reduce((a, x) => a + x.size * x.noted, 0);
  const anyRecord = records.some((r) => r.o !== undefined);
  const base = { equipped: 0, unit: 'dose' as const, sizes };
  if (reported && bankReported) {
    const bank = sizes.reduce((a, x) => a + x.size * (x.bank ?? 0), 0);
    const total = bag + noted + bank;
    return { ...base, presence: total > 0 ? 'PRESENT' : 'MISSING', bag, noted, bank, total, source: 'game' };
  }
  const legacyMark = (legacy ?? []).map((k) => s.manual[k]).find((v) => v !== undefined);
  const manual = manualKey && s.manual[manualKey] !== undefined ? s.manual[manualKey] : legacyMark !== undefined ? legacyMark * kind.per : undefined;
  if (manual !== undefined) {
    const total = Math.max(manual, bag + noted);
    return { ...base, presence: total > 0 ? 'PRESENT' : 'MISSING', bag: anyRecord ? bag : null, noted, bank: null, total, source: 'manual' };
  }
  if (bag + noted > 0) return { ...base, presence: 'PRESENT', bag, noted, bank: null, total: bag + noted, source: 'game' };
  return { ...base, presence: 'UNKNOWN', bag: anyRecord ? bag : null, noted, bank: null, total: null, source: 'none' };
}

export interface Carry {
  /** Potions to take for the doses, largest first from what is owned (the bag, then the bank). */
  potions: number;
  /** The doses they hold (at most the need when there is enough). */
  doses: number;
  /** The fewest potions those doses fit in once poured together. */
  fewest: number;
  /** What to do to free the slots, when pouring saves any: null otherwise. */
  combine: string | null;
}

/**
 * The potions to carry for `need` doses and the bag slots they fill. The largest potions go first, so slots are not wasted on (1)s while (4)s wait in the
 * bank; when the doses still sit in more potions than they need, the line says so: use one potion on another to pour them together.
 */
export function carryOf(sizes: readonly DoseSize[], need: number, base = 'potion'): Carry {
  let left = need;
  let potions = 0;
  let doses = 0;
  const taken: number[] = [];
  for (const x of [...sizes].sort((a, b) => b.size - a.size)) {
    const have = x.bag + (x.bank ?? 0);
    for (let i = 0; i < have && left > 0; i++) {
      potions++;
      doses += x.size;
      left -= x.size;
      taken.push(x.size);
    }
  }
  const fewest = Math.ceil(Math.min(doses, need) / MAX_DOSES);
  const saved = potions - fewest;
  const parts = taken.filter((t) => t < MAX_DOSES);
  const combine = saved > 0 && parts.length >= 2
    ? `${parts.map((t) => `(${t})`).join(' + ')}: use one ${base} on another to pour them together, ${fewest} ${fewest === 1 ? 'slot' : 'slots'} instead of ${potions}`
    : null;
  return { potions, doses, fewest, combine };
}

export interface DosePackageLine { name: string; size: number; count: number; unit: number | null }

export interface DosePackage {
  lines: DosePackageLine[];
  /** The doses bought. */
  doses: number;
  /** Bought beyond the shortfall. */
  spare: number;
  /** null when a size in the package has no price. */
  cost: number | null;
  /** "3 × Strength potion(4) and 1 × Strength potion(1)". */
  text: string;
  /** The other way to cover the last doses, when there is one worth naming. */
  alternative: string | null;
}

const gp = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * What to buy for a dose shortfall. Whole potions of the named size cover all but the last few doses; the last few are one potion of whichever size
 * covers them for the fewest coins (a (1) for one dose, or a (4) that leaves spares when it is the cheaper of the two). No price: the named size.
 * It never asks for a whole extra potion's worth of doses beyond the shortfall unless that is the cheapest way to cover it.
 */
export function dosePackage(name: string, deficit: number, price: (name: string) => number | null): DosePackage | null {
  const kind = doseKind(name);
  if (!kind || deficit <= 0) return null;
  const whole = Math.floor(deficit / kind.per);
  const rest = deficit - whole * kind.per;
  const priced = (size: number) => price(doseName(kind.base, size));
  const options = rest > 0
    ? [1, 2, 3, 4].filter((s) => s >= rest).map((size) => ({ size, unit: priced(size) })).filter((o) => o.unit !== null) as { size: number; unit: number }[]
    : [];
  options.sort((a, b) => a.unit - b.unit || a.size - b.size);
  const last = rest > 0 ? options[0]?.size ?? kind.per : null;
  const counts = new Map<number, number>();
  if (whole > 0) counts.set(kind.per, whole);
  if (last !== null) counts.set(last, (counts.get(last) ?? 0) + 1);
  const lines: DosePackageLine[] = [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([size, count]) => ({ name: doseName(kind.base, size), size, count, unit: priced(size) }));
  const doses = lines.reduce((a, l) => a + l.size * l.count, 0);
  const cost = lines.every((l) => l.unit !== null) ? lines.reduce((a, l) => a + (l.unit as number) * l.count, 0) : null;
  const text = lines.map((l) => `${l.count} × ${l.name}`).join(' and ');
  let alternative: string | null = null;
  if (last !== null) {
    // The other way worth naming is a full potion of the named size (spares for later), else the next cheapest size.
    const other = options.find((o) => o.size === kind.per && o.size !== last) ?? options.find((o) => o.size !== last);
    if (other) {
      const spare = other.size - rest;
      alternative = `For the last ${rest} ${rest === 1 ? 'dose' : 'doses'}: ${doseName(kind.base, last)}${priced(last) !== null ? ` ≈ ${gp(priced(last)!)} gp` : ''}`
        + `, or ${doseName(kind.base, other.size)} ≈ ${gp(other.unit)} gp${spare > 0 ? ` (${spare} spare)` : ''}`;
    }
  }
  return { lines, doses, spare: doses - deficit, cost, text, alternative };
}

/**
 * The potions to take out of the bank for `doses` doses: the largest first, so the doses fill the fewest slots ("2 × Strength potion(4)" before any
 * (1)). Names the exact potions, so the game can frame them in the open bank.
 */
export function takeFromBank(base: string, sizes: readonly DoseSize[], doses: number): { name: string; count: number }[] {
  const out: { name: string; count: number }[] = [];
  let left = doses;
  for (const x of [...sizes].sort((a, b) => b.size - a.size)) {
    if (left <= 0) break;
    const n = Math.min(x.bank ?? 0, Math.ceil(left / x.size));
    if (n <= 0) continue;
    out.push({ name: doseName(base, x.size), count: n });
    left -= n * x.size;
  }
  return out;
}

/**
 * What a dose shortfall asks the player to buy, without prices (the preparation lines; Shopping prices every size and picks the package):
 * "1 dose short: a Strength potion(1), or another (4) with 3 spare". Never a whole extra potion's worth stated as the need.
 */
export function shortText(name: string, missing: number): string {
  const kind = doseKind(name);
  if (!kind || missing <= 0) return '';
  const whole = Math.floor(missing / kind.per);
  const rest = missing - whole * kind.per;
  const head = `${missing} ${missing === 1 ? 'dose' : 'doses'} short`;
  if (rest === 0) return `${head}: ${whole} × ${name}`;
  const wholeText = whole > 0 ? `${whole} × ${name} and ` : '';
  return `${head}: ${wholeText}a ${doseName(kind.base, rest)}, or another (${kind.per}) with ${kind.per - rest} spare`;
}
