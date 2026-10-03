// Состояние объездов подготовки: хранится в окне (отдельно у каждого профиля) и переживает обновление и перезапуск.

import { useCallback, useSyncExternalStore } from 'react';
import { activeOf, profileStorageKey, useProfiles } from './profiles';
import { emptyPrep, parsePrep, PREP_KEY, type PrepState } from './prepRoute';

const EMPTY = emptyPrep();
const listeners = new Set<() => void>();
const cache = new Map<string, PrepState>();

function read(key: string): PrepState {
  const hit = cache.get(key);
  if (hit) return hit;
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { /* нет хранилища */ }
  const s = parsePrep(raw);
  cache.set(key, s);
  return s;
}

function write(key: string, s: PrepState): void {
  cache.set(key, s);
  try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* запомнится до перезапуска */ }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePrep(): { prep: PrepState; set: (s: PrepState) => void; reset: () => void } {
  const profiles = useProfiles();
  const key = profileStorageKey(PREP_KEY, activeOf(profiles).id);
  const prep = useSyncExternalStore(subscribe, () => read(key), () => EMPTY);
  const set = useCallback((s: PrepState) => write(key, s), [key]);
  const reset = useCallback(() => write(key, emptyPrep()), [key]);
  return { prep, set, reset };
}
