// "Food for combat": how hard the step's opponent hits and when to eat. The numbers come from the wiki (threats.json, build-threats): max hit,
// speed, food healing. The only thing of our own is the threshold rule: eat while HP has not dropped below two max hits.

import threatsJson from '../data/threats.json';
import type { Step } from '../types';

export interface Hit { n: number; label: string }
export interface Threat { page: string; version?: string; hits: Hit[]; speedTicks: number; hitpoints: number; combat: number }
export interface Food { name: string; heals: number }

export const THREATS = threatsJson.threats as unknown as Record<string, Threat>;
export const FOODS = threatsJson.foods as Food[];
export const THREATS_DATE = threatsJson.generatedAt;

/** The names of the step's opponents: foes and threats; those with no wiki data (a cow) are skipped. */
export function threatKeys(step: Pick<Step, 'foes' | 'threats'>): string[] {
  return [...new Set([...(step.foes ?? []), ...(step.threats ?? [])])].filter((k) => THREATS[k]);
}

/**
 * The usual max hit: "unprotected" hits (dragonfire without a shield) are not counted in the threshold, they are
 * warned about separately in text. It also returns the strongest hit and a flag that it was excluded.
 */
export function typicalHit(t: Threat): { typical: number; worst: number; excluded: Hit | null } {
  const isUnprotected = (h: Hit) => /dragonfire/i.test(h.label) && !/with/i.test(h.label);
  const kept = t.hits.filter((h) => !isUnprotected(h));
  const typical = Math.max(...(kept.length ? kept : t.hits).map((h) => h.n));
  const worst = Math.max(...t.hits.map((h) => h.n));
  return { typical, worst, excluded: t.hits.find(isUnprotected) ?? null };
}

/** The strongest usual hit of the step's opponents for the HUD; 0 means the step has no opponents with wiki data. */
export function stepMaxHit(step: Pick<Step, 'foes' | 'threats'>): number {
  return Math.max(0, ...threatKeys(step).map((k) => typicalHit(THREATS[k]).typical));
}

export interface FoodView {
  key: string;
  threat: Threat;
  typical: number;
  worst: number;
  excluded: Hit | null;
  /** Seconds between hits. */
  everySeconds: number;
  /** Eat when health is below this. */
  eatBelow: number;
  /** How many max hits in a row the current health will take; null means health is unknown. */
  survives: number | null;
}

export function viewThreat(key: string, hp: number | undefined): FoodView {
  const threat = THREATS[key];
  const { typical, worst, excluded } = typicalHit(threat);
  return {
    key, threat, typical, worst, excluded,
    everySeconds: Math.round(threat.speedTicks * 0.6 * 10) / 10,
    eatBelow: typical * 2,
    survives: hp ? Math.max(0, Math.ceil(hp / typical) - 1) : null,
  };
}

/** Food from the bag by name (counting the quantity), the best healing on top. */
export function foodInBag(items: readonly { name: string; count?: number }[] | null): { food: Food; count: number }[] {
  if (!items) return [];
  return FOODS.flatMap((f) => {
    const count = items.filter((i) => i.name === f.name).reduce((s, i) => s + (i.count ?? 1), 0);
    return count > 0 ? [{ food: f, count }] : [];
  }).sort((a, b) => b.food.heals - a.food.heals);
}

/** Which food covers the max hit in one bite, the weakest on top (more economical). */
export function foodsCovering(hit: number): Food[] {
  return FOODS.filter((f) => f.heals >= hit).sort((a, b) => a.heals - b.heals);
}
