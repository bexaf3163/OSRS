// The plan in effect for each combat training step, kept per profile and character: the step and the key of the plan ("split", "defence-first:20"), and
// who chose it. Only the choice is saved, never a phase or a number: the phase in hand and the figures are worked out again from what the game shows, so
// they follow the player's levels and the items in hand and a save from an older version stays valid.
//
// Who chose it matters (2.69): the guide selects the recommended plan by itself ("auto") and may move on to a better one at a sensible moment; a plan
// the player picked ("player") stays until the player changes it, and a better one is only offered. A step with no entry has had no plan in effect yet:
// before 2.69 that meant the route's own plan by default, which the guide now replaces with its recommendation. Entries written before 2.69 have no
// "by": they were all made with a button, so they are the player's.

import { useSyncExternalStore } from 'react';

export const ADOPT_KEY = 'osrs-put:combat-plans';

export type ChosenBy = 'auto' | 'player';
export interface Adopted { key: string; at: number; by: ChosenBy }
export type AdoptedMap = Record<string, Adopted>;

export function adoptStorageKey(profileId: string, character: string | null | undefined): string {
  const who = (character ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${ADOPT_KEY}:${profileId}:${who || '-'}`;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** What is saved for this key; damaged data and entries of another shape are ignored. An entry without "by" is an older save: the player's. */
export function loadAdopted(store: Store | undefined, key: string): AdoptedMap {
  try {
    const text = store?.getItem(key);
    if (!text) return {};
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out: AdoptedMap = {};
    for (const [stepId, v] of Object.entries(data as Record<string, unknown>)) {
      const e = v as Partial<Adopted> | null;
      if (e && typeof e.key === 'string' && e.key.length > 0 && e.key.length < 40 && typeof e.at === 'number' && Number.isFinite(e.at)) {
        out[stepId] = { key: e.key, at: e.at, by: e.by === 'auto' ? 'auto' : 'player' };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveAdopted(store: Store | undefined, key: string, map: AdoptedMap): void {
  try {
    if (Object.keys(map).length === 0) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(map));
  } catch {
    // Storage full or closed: the choice lasts until the app closes.
  }
}

/**
 * The map with one step's plan set. `key` null removes the entry: the guide's recommendation then applies again. The route's own plan chosen by the
 * player ("route", by "player") is kept like any other choice, so the guide does not replace it.
 */
export function withAdopted(map: AdoptedMap, stepId: string, key: string | null, now: number, by: ChosenBy = 'player'): AdoptedMap {
  if (key === null) {
    if (!(stepId in map)) return map;
    const rest = { ...map };
    delete rest[stepId];
    return rest;
  }
  const cur = map[stepId];
  if (cur && cur.key === key && cur.by === by) return map;
  return { ...map, [stepId]: { key, at: now, by } };
}

// ---------------------------------------------------------------------------
// One shared copy for every screen, so the card and the step the store hands out agree at once.

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
