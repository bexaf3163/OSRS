// Training methods that earn coins at the player's levels, beside the money guides: the same training engine as the Skills page.

import { useMemo } from 'react';
import { levelById } from '../../data';
import { usePlayerState } from '../../state/playerStateContext';
import { usePriceView } from '../../state/hooks/usePriceView';
import { useTradeRestriction } from '../../state/hooks/useTradeRestriction';
import { trainingEarners } from '../../domain/training/trackedTraining';
import { hrefTo } from '../../domain/pages/pages';

const title = (skill: string) => skill[0].toUpperCase() + skill.slice(1);

export function TrainingEarners() {
  const { state } = usePlayerState();
  const prices = usePriceView(true);
  const trade = useTradeRestriction();
  const rows = useMemo(() => trainingEarners(state, { prices, restriction: trade.state }), [state, prices, trade.state]);
  if (!rows.length) return null;
  return (
    <section className="card money-reco" aria-label="Earn while you train">
      <h3 className="small subhead">Earn while you train</h3>
      <p className="small muted">Training methods that bring in coins at your levels and today's prices, with the XP they give. Some earn more than the money guides.</p>
      <ul className="money-list">
        {rows.map((r) => (
          <li key={r.method.id}>
            <a href={hrefTo.skills(levelById.get(r.skill)?.skill ?? '', r.skill)}><strong>{r.method.name}</strong></a>{' '}
            <span className="small muted">{title(r.skill)} · about {Math.round(r.net).toLocaleString('en-US')} coins an hour
              {r.method.xph ? ` · ${Math.round(r.method.xph[0]).toLocaleString('en-US')} XP an hour` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
