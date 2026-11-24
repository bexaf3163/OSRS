import { useMemo } from 'react';
import { levelOf } from '../../domain/player/playerState';
import { exactXpOf } from '../../domain/player/xp';
import { useBridge } from '../bridge';
import { usePlayerState } from '../playerStateContext';

/** The game's exact XP per skill where it fits the level: training plans count from it, not from the level's first XP. */
export function useExactXp(): Record<string, number> {
  const { xp } = useBridge();
  const { state } = usePlayerState();
  return useMemo(() => exactXpOf(xp, (skill) => levelOf(state, skill)), [xp, state]);
}
