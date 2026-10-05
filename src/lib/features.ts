// The stage 3 helpers in the app: they can be turned off in the settings, and then they not only hide
// but also do nothing: they look up no coordinates, send no stage items to RuneLite, offer no upgrades.
// What happens in the game itself is also turned off in the OSRS Path Bridge plugin's settings.

import { useSyncExternalStore } from 'react';

export interface Features {
  /** 📍 at places in the wiki dossier: the map and an arrow in the game. */
  autoLocation: boolean;
  /** Highlighting the stage's items in the bank (the OSRS Path Bridge plugin). The key is unchanged, so a saved choice is not lost. */
  bankTags: boolean;
  /** The training pace from the game in the step card. */
  pacing: boolean;
  /** A hint for a quick upgrade of a tool or weapon. */
  upgradeRouter: boolean;
  /** Skill levels from the game go into the level fields by themselves (plugin protocol 2+; 2.12). */
  levelsFromGame: boolean;
  /** Auto-prepare: the app itself leads the arrow to what is missing (a bank, a shop) and returns to the step. */
  autoPrep: boolean;
  /** The "efficient" style (the default is "calm"): lib/playStyle.ts. */
  efficient: boolean;
  /** The "Inspector" mode: all the step card's blocks are expanded (the default is "Zen": one status line and a "Done" button). */
  inspector: boolean;
}

export const FEATURES_KEY = 'osrs-put:features';
export const DEFAULT_FEATURES: Features = { autoLocation: true, bankTags: true, pacing: true, upgradeRouter: true, levelsFromGame: true, autoPrep: true, efficient: false, inspector: false };

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

let current: Features | null = null;
const listeners = new Set<() => void>();

function read(): Features {
  if (!current) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(FEATURES_KEY); } catch { /* no storage */ }
    current = parseFeatures(raw);
  }
  return current;
}

export function setFeatures(patch: Partial<Features>): void {
  current = { ...read(), ...patch };
  try { localStorage.setItem(FEATURES_KEY, JSON.stringify(current)); } catch { /* it is remembered until restart */ }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useFeatures(): Features {
  return useSyncExternalStore(subscribe, read, read);
}
