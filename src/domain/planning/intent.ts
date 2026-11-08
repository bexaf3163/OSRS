import { parseTracked } from '../training/skillTrack';
import type { TrackedSkill } from '../training/skillTrack';

/** Explicit owner intent only. Observations and recommendations never rewrite a manual goal. */
export type PlanningIntent =
  | { kind: 'auto' }
  | { kind: 'quest'; questId: string }
  | { kind: 'training'; training: TrackedSkill };
export interface SavedPlanningIntent { version: 1; intent: PlanningIntent }
export type IntentRead = { value: SavedPlanningIntent | null; protected: boolean; warning: string | null };

export function parsePlanningIntent(raw: unknown): SavedPlanningIntent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !value.intent || typeof value.intent !== 'object' || Array.isArray(value.intent)) return null;
  const goal = value.intent as Record<string, unknown>;
  if (goal.kind === 'auto') return { version: 1, intent: { kind: 'auto' } };
  if (goal.kind === 'quest' && typeof goal.questId === 'string' && goal.questId.trim() === goal.questId && goal.questId.length > 0
    && goal.questId.length <= 100 && !/[\u0000-\u001f\u007f<>]/.test(goal.questId)) return { version: 1, intent: { kind: 'quest', questId: goal.questId } };
  const training = goal.kind === 'training' ? parseTracked(goal.training) : null;
  return training ? { version: 1, intent: { kind: 'training', training } } : null;
}

/** A newer/corrupt goal remains recoverable. A missing goal is a normal automatic start. */
export function readPlanningIntent(text: string | null): IntentRead {
  if (text === null) return { value: null, protected: false, warning: null };
  try {
    if (text.length > 16_384) throw Error('Oversized goal');
    const raw: unknown = JSON.parse(text);
    const value = parsePlanningIntent(raw);
    if (value) return { value, protected: false, warning: null };
    if (raw && typeof raw === 'object' && 'version' in raw && typeof raw.version === 'number' && raw.version > 1) {
      return { value: null, protected: true, warning: 'This saved goal needs a newer app version. Its original data is protected.' };
    }
  } catch { /* Keep the original source. */ }
  return { value: null, protected: true, warning: 'The saved goal could not be read. Its original data is protected; restore a compatible backup.' };
}
