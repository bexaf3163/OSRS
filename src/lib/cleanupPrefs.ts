// The player's own say in the inventory cleanup: "Always keep" and dismissed suggestions. Saved per profile AND per character, so another
// character on the same profile starts clean and never inherits the first one's choices.

import { useCallback, useSyncExternalStore } from 'react';
import { emptyCleanupPrefs, type AccountKind, type CleanupPrefs } from './cleanup';
import { activeOf, useProfiles } from './profiles';

export const CLEANUP_KEY = 'osrs-put:cleanup';
const LIMIT = 300;

export function cleanupKey(profileId: string, player: string | null | undefined): string {
  const who = (player ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${CLEANUP_KEY}:${profileId}:${who || '-'}`;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120))].slice(0, LIMIT) : [];

/** Anything unreadable is "no preferences", never a crash. */
export function parseCleanupPrefs(raw: string | null): CleanupPrefs {
  if (!raw) return emptyCleanupPrefs();
  try {
    const o = JSON.parse(raw) as { keep?: unknown; dismissed?: unknown; account?: unknown } | null;
    if (!o || typeof o !== 'object') return emptyCleanupPrefs();
    const account: AccountKind | undefined = o.account === 'ironman' || o.account === 'normal' ? o.account : undefined;
    return { keep: strings(o.keep), dismissed: strings(o.dismissed), ...(account ? { account } : {}) };
  } catch {
    return emptyCleanupPrefs();
  }
}

export const withKeep = (p: CleanupPrefs, key: string, on: boolean): CleanupPrefs => ({
  ...p, keep: on ? [...new Set([...p.keep, key])].slice(-LIMIT) : p.keep.filter((k) => k !== key),
});
export const withDismissed = (p: CleanupPrefs, key: string, action: string, on: boolean): CleanupPrefs => {
  const id = `${key}|${action}`;
  return { ...p, dismissed: on ? [...new Set([...p.dismissed, id])].slice(-LIMIT) : p.dismissed.filter((k) => k !== id) };
};
export const withAccount = (p: CleanupPrefs, account: AccountKind | null): CleanupPrefs => {
  const { account: _drop, ...rest } = p;
  void _drop;
  return account ? { ...rest, account } : rest;
};

const cache = new Map<string, CleanupPrefs>();
const listeners = new Set<() => void>();
const EMPTY = emptyCleanupPrefs();

function read(key: string): CleanupPrefs {
  const hit = cache.get(key);
  if (hit) return hit;
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { /* no storage */ }
  const p = parseCleanupPrefs(raw);
  cache.set(key, p);
  return p;
}

function write(key: string, p: CleanupPrefs): void {
  cache.set(key, p);
  try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* remembered until a restart */ }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The preferences of the current profile and character; they switch when either changes. */
export function useCleanupPrefs(player: string | null): { prefs: CleanupPrefs; update: (f: (p: CleanupPrefs) => CleanupPrefs) => void } {
  const profiles = useProfiles();
  const key = cleanupKey(activeOf(profiles).id, player);
  const prefs = useSyncExternalStore(subscribe, () => read(key), () => EMPTY);
  const update = useCallback((f: (p: CleanupPrefs) => CleanupPrefs) => write(key, f(read(key))), [key]);
  return { prefs, update };
}

/** For tests: forget what is held in memory. */
export function resetCleanupCache(): void { cache.clear(); }
