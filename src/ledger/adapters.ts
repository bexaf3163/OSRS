// Adapters: the store, the route and the RuneLite link mapped onto the Ledger's view-models. No state of their own.
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { useProfiles } from '../lib/profiles';
import { useQuestPoints } from '../lib/useQuestPoints';
import { levelOf } from '../lib/progress';
import { combatLevel } from '../lib/moneyAdvisor';
import { SKILL_NAMES } from '../lib/skillGuide';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import type { Progress, Stage, Step } from '../types';
import type { Player, RouteStage, StepKind } from './model';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const roman = (n: number) => ROMAN[n] ?? String(n);

export function usePlayerSummary(): Player {
  const { progress, steps, maxQp } = useStore();
  const qp = useQuestPoints();
  const { stats } = useBridge();
  const profiles = useProfiles();
  const profile = profiles.list.find((p) => p.id === profiles.active);
  // The same test as Gear: without levels from the game or entered by hand, the default 1s are not the player's.
  const known = Boolean(stats?.attack || progress.levels.attack);
  const levels = Object.fromEntries(SKILL_NAMES.map((id) => [id, levelOf(progress, id)]));
  const closed = steps.filter((s) => isClosed(progress, s.id)).length;
  return {
    name: profile?.player || profile?.name || 'Adventurer',
    combat: known ? combatLevel(levels) : null,
    total: known ? Object.values(levels).reduce((a, b) => a + b, 0) : null,
    qp,
    maxQp,
    progress: steps.length ? Math.round((closed / steps.length) * 100) : 0,
  };
}

const kindOf = (s: Step): StepKind => (s.type === 'quest' ? 'quest' : s.type === 'skill' ? 'skill' : 'task');

/** The route as chapters of the road: closed, the suggested step, locked by its blockers, or open. */
export function roadStages(
  stages: Stage[],
  steps: Step[],
  progress: Progress,
  qp: number,
  dependencies: Parameters<typeof blockersOf>[3],
  suggestedId: string | undefined,
  selectedId: string,
): RouteStage[] {
  return stages
    .map((st) => ({
      id: roman(st.id),
      key: st.id,
      name: st.title,
      members: st.membersOnly,
      steps: steps
        .filter((s) => s.stage === st.id)
        .map((s) => {
          const closed = isClosed(progress, s.id);
          const blockers = closed ? null : blockersOf(s, progress, qp, dependencies);
          return {
            id: s.id,
            name: s.title,
            kind: kindOf(s),
            qp: s.qp ?? 0,
            state: closed ? 'done' : s.id === suggestedId ? 'current' : blockers ? 'locked' : 'todo',
            selected: s.id === selectedId,
            lock: blockers ? blockerParts(blockers).join(', ') : undefined,
          } as const;
        }),
    }))
    .filter((st) => st.steps.length);
}
