// Adopted combat plans per profile and character, kept in window storage.
import { useSyncExternalStore } from 'react';
import { type ChosenBy, type AdoptedMap, loadAdopted, saveAdopted, withAdopted } from '../../domain/combat/route/adopt';

const EMPTY: AdoptedMap = {};
const cache = new Map<string, AdoptedMap>();
const listeners = new Set<() => void>();

function ls(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

function read(key: string): AdoptedMap {
  let m = cache.get(key);
  if (!m) {
    m = loadAdopted(ls(), key);
    cache.set(key, m);
  }
  return m;
}

/** Set (or with null clear) the plan of a step. The player's buttons pass "player"; the guide's own selection passes "auto". */
export function adoptPlan(key: string, stepId: string, planKey: string | null, by: ChosenBy = 'player'): void {
  const next = withAdopted(read(key), stepId, planKey, Date.now(), by);
  if (next === read(key)) return;
  cache.set(key, next);
  saveAdopted(ls(), key, next);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAdopted(key: string): AdoptedMap {
  return useSyncExternalStore(subscribe, () => read(key), () => EMPTY);
}
