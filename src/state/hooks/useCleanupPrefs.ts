// The cleanup preferences of the current profile and character, kept in window storage.
import { useCallback, useSyncExternalStore } from 'react';
import { emptyCleanupPrefs, type CleanupPrefs } from '../../domain/persistence/cleanupPrefs';
import { activeOf } from '../../domain/persistence/profiles';
import { useProfiles } from '../profiles';
import { cleanupKey, parseCleanupPrefs } from '../../domain/persistence/cleanupPrefs';

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
