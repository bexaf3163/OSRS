// Compatibility projection of the one profile-scoped owner intent; no independent training-goal store.
import type { TrackedSkill } from '../../domain/training/skillTrack';
import { setPlanningIntent, usePlanningIntent } from '../planningIntent';

export function setTracked(next: TrackedSkill | null): boolean {
  return setPlanningIntent(next ? { kind: 'training', training: next } : { kind: 'auto' });
}

export function useTracked(): TrackedSkill | null {
  const { intent } = usePlanningIntent();
  return intent.kind === 'training' ? intent.training : null;
}
