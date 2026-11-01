// The followed skill plan, kept in window storage.
import { useSyncExternalStore } from 'react';
import { type TrackedSkill, parseTracked } from '../../domain/training/skillTrack';
import { STORAGE_KEYS } from '../../domain/persistence/storageKeys';

const KEY = STORAGE_KEYS.skillTrack;
const listeners = new Set<() => void>();
let cache: TrackedSkill | null | undefined;
function load(): TrackedSkill | null {
  try {
    const text = localStorage.getItem(KEY);
    return text ? parseTracked(JSON.parse(text)) : null;
  } catch { return null; }
}

export function getTracked(): TrackedSkill | null {
  if (cache === undefined) cache = load();
  return cache;
}

export function setTracked(next: TrackedSkill | null): void {
  cache = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch { /* it is remembered until a reload */ }
  listeners.forEach((l) => l());
}

export function useTracked(): TrackedSkill | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    getTracked,
    () => null,
  );
}
