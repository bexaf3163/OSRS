// After every F2P quest: what to do next in F2P, by the same training engine as Skills (f2pCheckpoints). One click follows a
// checkpoint through the ordinary training lifecycle (Path card, preparation, HUD); nothing is forced and members content is not planned.

import { useMemo } from 'react';
import { usePlayerState } from '../../state/playerStateContext';
import { useFeatures } from '../../state/hooks/useFeatures';
import { usePriceView } from '../../state/hooks/usePriceView';
import { useTradeRestriction } from '../../state/hooks/useTradeRestriction';
import { setTracked } from '../../state/hooks/useTracked';
import { priorityOf, styleOf } from '../../domain/persistence/playStyle';
import { f2pCheckpoints } from '../../domain/training/trackedTraining';
import { formatHours } from '../../domain/training/trainingRouter';
import { Eyebrow } from '../../ledger';

const title = (skill: string) => skill[0].toUpperCase() + skill.slice(1);

export function F2pNext() {
  const { state } = usePlayerState();
  const features = useFeatures();
  const prices = usePriceView(true);
  const trade = useTradeRestriction();
  const rows = useMemo(() => f2pCheckpoints(state, styleOf(features).style, priorityOf(features), { prices, restriction: trade.state }),
    [state, features, prices, trade.state]);
  return <>
    <Eyebrow>F2P QUESTS COMPLETE</Eyebrow>
    <h1 className="la-t">Next in F2P</h1>
    {rows.length ? <>
      <p className="small muted">★ Good-value checkpoints first, then the shortest for your levels and gear. Members content is not planned.</p>
      <ol className="small">
        {rows.map((row) => <li key={row.skill}>
          <strong>{row.priority === 'good' ? '★' : '◇'} {title(row.skill)} {row.level} → {row.target}</strong>
          <span className="muted"> · {row.method ?? 'no supported method yet'}{row.time ? ` · ${formatHours(row.time)}` : ''}</span>{' '}
          <button type="button" className="link-btn" onClick={() => setTracked({ skill: row.skill, mode: 'fast', freeOnly: true, target: row.target })}>Follow</button>
        </li>)}
      </ol>
    </> : <p className="muted">Every F2P quest and skill checkpoint is done. Members content is not planned yet.</p>}
  </>;
}
