// After every F2P quest: what to do next in F2P, by the same training engine as Skills (f2pCheckpoints). One click follows a
// checkpoint through the ordinary training lifecycle (Path card, preparation, HUD); nothing is forced and members content is not planned.

import { useMemo } from 'react';
import { usePlayerState } from '../../state/playerStateContext';
import { usePriceView } from '../../state/hooks/usePriceView';
import { useTradeRestriction } from '../../state/hooks/useTradeRestriction';
import { useExactXp } from '../../state/hooks/useExactXp';
import { f2pCheckpoints } from '../../domain/training/trackedTraining';
import { Eyebrow } from '../../ledger';
import { CheckpointList } from '../skills/CheckpointList';

export function F2pNext({ waiting = null }: { waiting?: string | null }) {
  const { state } = usePlayerState();
  const prices = usePriceView(true);
  const trade = useTradeRestriction();
  const xp = useExactXp();
  const rows = useMemo(() => f2pCheckpoints(state, { prices, restriction: trade.state }, xp),
    [state, prices, trade.state, xp]);
  return <>
    <Eyebrow>{waiting ? `F2P QUESTS COMPLETE · ${waiting.toUpperCase()} OPTIONAL` : 'F2P QUESTS COMPLETE'}</Eyebrow>
    <h1 className="la-t">Next in F2P</h1>
    {rows.length ? <>
      <p className="muted f2p-next-lead">Skill checkpoints for your account: one at a time in four phases. Skills that earn coins come first, so the skills that spend coins are paid from that profit. Follow one and the plan, the kit and the game lead you there. Members content is not planned.</p>
      <CheckpointList rows={rows} label="F2P checkpoints" />
    </> : <p className="muted">Every F2P quest and skill checkpoint is done. Combat past 40 is optional: the Skills page compares each target's XP and coins for your levels, Ogress Warriors for Ranged among them. Members content is not planned yet.</p>}
  </>;
}
