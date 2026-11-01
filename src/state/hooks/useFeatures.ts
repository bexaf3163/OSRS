// The optional features, kept in window storage.
import { useSyncExternalStore } from 'react';
import { type Features, FEATURES_KEY, parseFeatures } from '../../domain/persistence/features';

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
