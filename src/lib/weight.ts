// Weight and running. The weight of the bag and equipment decides how fast the run energy bar drains. The formula is from the OSRS Wiki "Run energy":
//   loss per tick = floor(60 + 67 · clamp(weight, 0..64) / 64) × (1 − Agility / 300).
// A weight below zero (light clothing) counts as zero, above 64 kg as 64. So the heaviest character runs out
// not "many times" but about twice as fast as a light one (127 against 60), and twenty kilograms give a gain of about a third.
// Agility is cancelled in the ratio, so "how many times longer" does not depend on it.
// The weight of items comes from the wiki (weights.json, npm run build-weights). No weight — the item is not in the file, its weight is unknown,
// and the app does not name a number it does not know. It does nothing for the player: it advises and leads to the bank.

import weightsJson from '../data/weights.json';
import type { Step } from '../types';
import { nameKey } from './checklist';
import type { PlayerState } from './playerState';
import { FOODS } from './foodAdvice';

const FOOD_KEYS = new Set(FOODS.map((f) => nameKey(f.name)));

const WEIGHTS = new Map(Object.entries((weightsJson as { items: Record<string, number> }).items).map(([n, kg]) => [nameKey(n), kg]));

/** The weight of one item, kg; undefined — the wiki does not state it or the item is not in the database. */
export const weightOf = (name: string): number | undefined => WEIGHTS.get(nameKey(name));

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The energy units lost per run tick at weight kg (without Agility). */
export const energyUnits = (kg: number): number => Math.floor(60 + (67 * clamp(kg, 0, 64)) / 64);

/** How many times longer running lasts at weight "to" than at weight "from". */
export const runLengthRatio = (from: number, to: number): number => energyUnits(from) / energyUnits(to);

/** A light item is not worth mentioning. */
const MIN_ITEM_KG = 1;
/** How many kilograms count as "noticeable" and "a lot". */
export const LIGHT_SAVING = 3;
export const HEAVY_SAVING = 10;

export interface WeightItem {
  name: string;
  /** The weight of all pieces, kg. */
  kg: number;
  count: number;
  from: 'EQUIPPED' | 'INVENTORY';
}

export interface WeightAdvice {
  /** The weight now, kg (from the game); null — unknown. */
  current: number | null;
  /** The weight without the extra; null — the current weight is unknown. */
  after: number | null;
  /** How much would come off, kg. */
  saving: number;
  /** How many times longer running lasts; null — the current weight is unknown. */
  ratio: number | null;
  /** What to leave in the bank. */
  items: WeightItem[];
  /** A lot: noticeably lengthens running; a little: a trifle; none: nothing to advise. */
  level: 'HEAVY' | 'LIGHT' | 'NONE';
}

export const NO_WEIGHT_ADVICE: WeightAdvice = { current: null, after: null, saving: 0, ratio: null, items: [], level: 'NONE' };

const COMBAT_SKILLS = new Set(['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer', 'hitpoints']);

/**
 * A step without combat: no opponents, no threats, not a combat skill training and not a gear step (armor is put on there).
 * In doubt — "not without combat": better not to advise taking it off than to leave the player without armor where it is needed.
 */
export const isCalm = (step: Pick<Step, 'type' | 'foes' | 'threats' | 'targets'>): boolean =>
  step.type !== 'gear' && !step.foes?.length && !step.threats?.length && !(step.targets ?? []).some((t) => COMBAT_SKILLS.has(t.skill));

/**
 * What can be left in the bank on a step without combat. needed — the English names of what this step and the nearest ones need
 * (the preparation plan): they are not touched. A combat step — we advise nothing: armor is needed there.
 */
export function weightAdvice(step: Pick<Step, 'type' | 'foes' | 'threats' | 'targets'>, state: PlayerState, needed: ReadonlySet<string>): WeightAdvice {
  const current = state.weight.known ? state.weight.value : null;
  if (!isCalm(step)) return { ...NO_WEIGHT_ADVICE, current };
  const keep = new Set([...needed].map((n) => nameKey(n)));
  const items: WeightItem[] = [];
  for (const name of Object.values(state.equipment)) {
    const w = weightOf(name);
    if (w !== undefined && w >= MIN_ITEM_KG && !keep.has(nameKey(name))) items.push({ name, kg: w, count: 1, from: 'EQUIPPED' });
  }
  if (state.bagItems.known) {
    for (const b of state.bagItems.value) {
      const w = weightOf(b.name);
      // Money and food are needed on the way; the other heavy things the steps do not ask for are superfluous.
      if (w === undefined || keep.has(nameKey(b.name)) || nameKey(b.name) === 'coins' || FOOD_KEYS.has(nameKey(b.name))) continue;
      if (w * b.count >= MIN_ITEM_KG * 2) items.push({ name: b.name, kg: Math.round(w * b.count * 1000) / 1000, count: b.count, from: 'INVENTORY' });
    }
  }
  items.sort((a, b) => b.kg - a.kg);
  const saving = Math.round(items.reduce((s, i) => s + i.kg, 0) * 1000) / 1000;
  const after = current === null ? null : Math.round((current - saving) * 1000) / 1000;
  const ratio = current === null || after === null ? null : runLengthRatio(current, after);
  const level = saving >= HEAVY_SAVING ? 'HEAVY' : saving >= LIGHT_SAVING ? 'LIGHT' : 'NONE';
  return { current, after, saving, ratio, items: level === 'NONE' ? [] : items, level };
}

/** Kilograms: "9.98 kg" → "10 kg", "12.3 kg". */
export const kgText = (kg: number): string => `${(Math.round(kg * 10) / 10).toLocaleString('en-US')} kg`;
