// The skill the player tracks (Skills → "Track Skill Path"): remembered in this browser, shared by the roadmap, the card on the Path screen and the game sync.
// While one is tracked, the plugin leads the arrow, the highlight and the HUD chip of that skill instead of the quest route; stopping gives the route back.

import { SKILL_NAMES, type GuideMode, type SkillName } from './skillGuide';
import type { MethodPriority } from '../persistence/playStyle';
import type { GameMode } from '../../types';
import type { PlayerState } from '../player/playerState';

/** The followed skill plan: the skill, its priority and (2.70) whether members steps are left out. An older save's 'f2p' mode is the fast lane, free only. */
export interface TrackedSkill { skill: SkillName; mode: GuideMode; freeOnly?: boolean; target?: number }

/** Whether a followed plan leaves members steps out. */
export const freeOnlyOf = (t: TrackedSkill): boolean => t.freeOnly ?? t.mode === 'f2p';
export const trackedPriority = (t: TrackedSkill | null, skill: string, fallback: MethodPriority): MethodPriority =>
  t?.skill === skill && t.mode === 'afk' ? 'relaxed' : fallback;

/** Apply a followed plan's account restriction consistently without changing observed facts. */
export function trackedTrainingContext(t: TrackedSkill | null, skill: string, state: PlayerState, mode: GameMode): { state: PlayerState; mode: GameMode } {
  const restricted = mode === 'f2p' || state.mode === 'f2p' || (t?.skill === skill && freeOnlyOf(t));
  const available: GameMode = restricted ? 'f2p' : 'members';
  return { mode: available, state: state.mode === available ? state : { ...state, mode: available } };
}

const MODES: readonly GuideMode[] = ['fast', 'afk', 'f2p'];

/** A stored value that is not exactly a known skill and filter is dropped: nothing a stale or edited save could break. */
export function parseTracked(raw: unknown): TrackedSkill | null {
  if (!raw || typeof raw !== 'object') return null;
  const { skill, mode, freeOnly, target } = raw as Record<string, unknown>;
  if (!SKILL_NAMES.includes(skill as SkillName) || !MODES.includes(mode as GuideMode)) return null;
  if (target !== undefined && (!Number.isInteger(target) || (target as number) < 2 || (target as number) > 99)) return null;
  return { skill: skill as SkillName, mode: mode as GuideMode, ...(typeof freeOnly === 'boolean' ? { freeOnly } : {}), ...(typeof target === 'number' ? { target } : {}) };
}
