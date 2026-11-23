// Skill checkpoints with their coin ledger, shared by Next in F2P (the Path page) and the Members quest skill levels (Skills).

import { Fragment, useMemo } from 'react';
import { F2P_PHASES } from '../../domain/training/f2pSkillAdvice';
import { usePlayerState } from '../../state/playerStateContext';
import { usePriceView } from '../../state/hooks/usePriceView';
import { setTracked } from '../../state/hooks/useTracked';
import { cashFlow, type SkillCheckpoint } from '../../domain/training/trackedTraining';
import { coinsOf } from '../../domain/player/playerState';
import { coinsPerMinute } from '../../domain/market/lootValue';
import { formatHours } from '../../domain/training/trainingRouter';
import { SkillGlyph } from '../../ui/SectionShell';

const title = (skill: string) => skill[0].toUpperCase() + skill.slice(1);
// The worst case, as the ledger counts it.
const coinWord = ([worst]: [number, number]) => (worst >= 0 ? `earns ${worst.toLocaleString('en-US')}+ coins` : `costs up to ${(-worst).toLocaleString('en-US')} coins`);

/** Skill checkpoints in order, each with its method, time and coins; the coins at hand are carried down the list (the ledger), so a row
 *  that spends more than the rows before it earned is flagged with the money-making it needs first. */
export function CheckpointList({ rows, label }: { rows: readonly SkillCheckpoint[]; label: string }) {
  const { state } = usePlayerState();
  const prices = usePriceView(true);
  const start = coinsOf(state).total;
  const balances = useMemo(() => (start === null ? null : cashFlow(rows, start)), [rows, start]);
  const perHour = (coinsPerMinute(prices, state.mode) ?? 0) * 60;
  return (
    <ol className="f2p-next" aria-label={label}>
      {rows.map((row, i) => <Fragment key={row.skill}>{row.phase !== rows[i - 1]?.phase && F2P_PHASES[row.phase - 1] && <li className="f2p-next-phase">{F2P_PHASES[row.phase - 1].label}</li>}<li className={`f2p-next-row ${row.priority === 'good' ? 'is-good' : ''}`}>
        <SkillGlyph skill={row.skill} size={30} />
        <div className="f2p-next-text">
          <b>{title(row.skill)} <span className="f2p-next-levels">{row.level} → {row.target}</span></b>
          <span className="muted">{row.method ?? 'No supported method yet'}{row.time ? ` · ${formatHours(row.time)}` : ''}{row.coins ? ` · ${coinWord(row.coins)}` : ''}</span>
          {balances && balances[i] < 0 && <span className="f2p-next-short">Short by {(-balances[i]).toLocaleString('en-US')} coins here{perHour > 0 ? `, about ${(-balances[i] / perHour).toFixed(1)} h of money-making first` : ''}</span>}
        </div>
        <span className={`la-chip ${row.priority === 'good' ? 'la-e' : ''}`}>{row.priority === 'good' ? 'Worth it' : 'Optional'}</span>
        <button type="button" className="la-btn la-d" aria-label={`Follow ${title(row.skill)} to ${row.target}`}
          onClick={() => setTracked({ skill: row.skill, mode: 'fast', freeOnly: state.mode === 'f2p', target: row.target })}>Follow</button>
      </li></Fragment>)}
    </ol>
  );
}
