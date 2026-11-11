import { STORAGE_KEYS } from './storageKeys';
// The player's preferences that the engines cannot know: how training methods are chosen and whether the build keeps Defence at 1.
// The helpers that used to be switches (places on the map, bank highlighting, training pace, levels from the game, upgrades, auto
// preparation) are always on since 2.93 (owner, 2026-11-11): one planner decides, and a saved old switch is ignored.

export interface Features {
  /** The "efficient" style (the default is "calm"): lib/playStyle.ts. Since 2.69 it is also the "Fastest" training preference. */
  efficient: boolean;
  /** The "Relaxed" training preference (2.69): fewer clicks and no risk before speed. With neither this nor "efficient" the guide picks "Balanced". */
  relaxedTraining: boolean;
  /** Prefer known net earnings among usable training methods. Balanced remains the default. */
  profitTraining?: boolean;
  /** The build keeps Defence at 1: combat plans never offer Defence training (lib/combatRoute/plans.ts). Off by default: with no preference Defence is a candidate. */
  keepDefenceOne: boolean;
}

export const FEATURES_KEY = STORAGE_KEYS.features;
export const DEFAULT_FEATURES: Features = { efficient: false, relaxedTraining: false, profitTraining: false, keepDefenceOne: false };

/** What is saved; the unfamiliar and the broken fall back to the default (a new feature is on). */
export function parseFeatures(raw: string | null): Features {
  const out = { ...DEFAULT_FEATURES };
  try {
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    for (const key of Object.keys(out) as (keyof Features)[]) {
      if (typeof data?.[key] === 'boolean') out[key] = data[key];
    }
  } catch {
    // Junk in storage means the default.
  }
  return out;
}
