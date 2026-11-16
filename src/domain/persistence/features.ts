import { STORAGE_KEYS } from './storageKeys';
// The player's preference that the engines cannot know: how training methods are chosen.
// The helpers that used to be switches (places on the map, bank highlighting, training pace, levels from the game, upgrades, auto
// preparation) are always on since 2.93 (owner, 2026-11-11): one planner decides, and a saved old switch is ignored.

export interface Features {
  /** The XP training preference (methodPriority.ts). The saved name is the old "efficient" play style's; since 2.94.3 it changes the method only. */
  efficient: boolean;
  /** Prefer known net earnings among usable training methods (the Money preference). With neither, the guide picks Balanced. */
  profitTraining?: boolean;
}

export const FEATURES_KEY = STORAGE_KEYS.features;
export const DEFAULT_FEATURES: Features = { efficient: false, profitTraining: false };

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
