// The skill the player tracks (Skills → "Track Skill Path"): remembered in this browser, shared by the roadmap, the card on the Path screen and the game sync.
// While one is tracked, the plugin leads the arrow, the highlight and the HUD chip of that skill instead of the quest route; stopping gives the route back.

import { useSyncExternalStore } from 'react';
import { SKILL_NAMES, type GuideMode, type SkillName } from './skillGuide';

export interface TrackedSkill { skill: SkillName; mode: GuideMode }

const KEY = 'osrs-put:skill-track';
const MODES: readonly GuideMode[] = ['fast', 'afk', 'f2p'];
const listeners = new Set<() => void>();
let cache: TrackedSkill | null | undefined;

/** A stored value that is not exactly a known skill and filter is dropped: nothing a stale or edited save could break. */
export function parseTracked(raw: unknown): TrackedSkill | null {
  if (!raw || typeof raw !== 'object') return null;
  const { skill, mode } = raw as Record<string, unknown>;
  return SKILL_NAMES.includes(skill as SkillName) && MODES.includes(mode as GuideMode) ? { skill: skill as SkillName, mode: mode as GuideMode } : null;
}

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
