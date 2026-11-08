// Adapters: the store, the route and the RuneLite link mapped onto the Ledger's view-models. No state of their own.
import { useStore } from '../state/store';
import { useBridge } from '../state/bridge';
import { useProfiles } from '../state/profiles';
import { useQuestPoints } from '../state/hooks/useQuestPoints';
import { levelOf } from '../domain/persistence/progress';
import { combatLevel } from '../domain/player/xp';
import { SKILL_NAMES } from '../domain/training/skillTrack';
import { isClosed } from '../domain/quests/next-step';
import type { Player } from './model';

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

