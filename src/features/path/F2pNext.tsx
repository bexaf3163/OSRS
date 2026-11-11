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
import { SkillGlyph } from '../../ui/SectionShell';

const title = (skill: string) => skill[0].toUpperCase() + skill.slice(1);

export function F2pNext({ waiting = null }: { waiting?: string | null }) {
  const { state } = usePlayerState();
  const features = useFeatures();
  const prices = usePriceView(true);
  const trade = useTradeRestriction();
  const rows = useMemo(() => f2pCheckpoints(state, styleOf(features).style, priorityOf(features), { prices, restriction: trade.state }),
    [state, features, prices, trade.state]);
  return <>
    <Eyebrow>{waiting ? `F2P QUESTS COMPLETE · ${waiting.toUpperCase()} OPTIONAL` : 'F2P QUESTS COMPLETE'}</Eyebrow>
    <h1 className="la-t">Next in F2P</h1>
    {rows.length ? <>
      <p className="muted f2p-next-lead">Skill checkpoints for your account: the worth-it ones first, then the quickest for your levels and gear. Follow one and the plan, the kit and the game lead you there. Members content is not planned.</p>
      <ol className="f2p-next" aria-label="F2P checkpoints">
        {rows.map((row) => <li key={row.skill} className={`f2p-next-row ${row.priority === 'good' ? 'is-good' : ''}`}>
          <SkillGlyph skill={row.skill} size={30} />
          <div className="f2p-next-text">
            <b>{title(row.skill)} <span className="f2p-next-levels">{row.level} → {row.target}</span></b>
            <span className="muted">{row.method ?? 'No supported method yet'}{row.time ? ` · ${formatHours(row.time)}` : ''}</span>
          </div>
          <span className={`la-chip ${row.priority === 'good' ? 'la-e' : ''}`}>{row.priority === 'good' ? 'Worth it' : 'Optional'}</span>
          <button type="button" className="la-btn la-d" aria-label={`Follow ${title(row.skill)} to ${row.target}`}
            onClick={() => setTracked({ skill: row.skill, mode: 'fast', freeOnly: true, target: row.target })}>Follow</button>
        </li>)}
      </ol>
    </> : <p className="muted">Every F2P quest and skill checkpoint is done. Members content is not planned yet.</p>}
  </>;
}
