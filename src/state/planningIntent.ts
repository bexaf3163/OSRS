import { useSyncExternalStore } from 'react';
import { parseTracked } from '../domain/training/skillTrack';
import { parsePlanningIntent, readPlanningIntent } from '../domain/planning/intent';
import type { PlanningIntent } from '../domain/planning/intent';
import { STORAGE_KEYS } from '../domain/persistence/storageKeys';
import { profileStorageKey } from '../domain/persistence/profiles';
import { guardedProfileGate, readProfiles, useProfiles } from './profiles';

export interface PlanningIntentState { intent: PlanningIntent; readOnly: boolean; warning: string | null }
const AUTOMATIC: PlanningIntent = { kind: 'auto' };
const EMPTY: PlanningIntentState = { intent: AUTOMATIC, readOnly: false, warning: null };
const entries = new Map<string, PlanningIntentState>();
const originals = new Map<string, string | null>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

function activeKey() {
  const profiles = readProfiles();
  return { profile: profiles.active, key: profileStorageKey(STORAGE_KEYS.planningIntent, profiles.active),
    protected: guardedProfileGate(profiles, null).kind === 'protected' };
}
function load(key: string, profile: string): PlanningIntentState {
  try {
    const text = localStorage.getItem(key);
    originals.set(key, text);
    const parsed = readPlanningIntent(text);
    if (parsed.protected) return { intent: AUTOMATIC, readOnly: true, warning: parsed.warning };
    if (parsed.value) return { intent: parsed.value.intent, readOnly: false, warning: null };
    // Same profile-key convention as progress: Main retains the old key; other profiles cannot inherit its old global goal.
    const legacy = localStorage.getItem(profileStorageKey(STORAGE_KEYS.skillTrack, profile));
    const training = legacy && legacy.length <= 16_384 ? parseTracked(JSON.parse(legacy)) : null;
    return training ? { intent: { kind: 'training', training }, readOnly: false, warning: null } : EMPTY;
  } catch {
    return { intent: AUTOMATIC, readOnly: true, warning: 'Saved goals could not be read. Their original data is protected.' };
  }
}
export function getPlanningIntent(): PlanningIntentState {
  const { key, profile } = activeKey();
  if (!entries.has(key)) entries.set(key, load(key, profile));
  return entries.get(key)!;
}
export function setPlanningIntent(intent: PlanningIntent): boolean {
  const { key, protected: sourceProtected } = activeKey();
  if (sourceProtected || getPlanningIntent().readOnly) return false;
  const checked = parsePlanningIntent({ version: 1, intent });
  if (!checked) return false;
  try {
    if (localStorage.getItem(key) !== originals.get(key)) {
      entries.set(key, { ...getPlanningIntent(), readOnly: true, warning: 'The saved goal changed outside this window. Reload before editing it; both intentions remain untouched.' });
      notify();
      return false;
    }
  } catch { return false; }
  let warning: string | null = null;
  try {
    const text = JSON.stringify(checked);
    localStorage.setItem(key, text);
    originals.set(key, text);
  }
  catch { warning = 'The goal is active in this window but could not be saved. Retry before restarting.'; }
  entries.set(key, { intent: checked.intent, readOnly: false, warning });
  notify();
  return true;
}
export function usePlanningIntent(): PlanningIntentState {
  useProfiles(); // Also invalidate before a profile-switch reload finishes.
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getPlanningIntent, () => EMPTY);
}
