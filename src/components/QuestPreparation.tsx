// A concise current-step view of the existing preparation plan; full actions remain in Preparation.
import type { Step } from '../types';
import { useReadinessEngine } from '../readinessContext';
import { Inline } from './Inline';
import { ItemIcon } from './WikiDrawer';
import { findLocalItem } from '../services/wikiService';
import { formatGp } from '../lib/shopping';

const LABEL = { EQUIPPED: 'Equipped', INVENTORY: 'In your bag', BANK: 'Take from bank', MISSING: 'Missing', UNKNOWN: 'Not checked' };

export function QuestPreparation({ step, onReview }: { step: Step; onReview?: () => void }) {
  const plan = useReadinessEngine().plan(step, { ahead: 0 });
  const lines = plan.lines.filter(l => l.timing === 'NOW');
  const unknown = lines.filter(l => l.where === 'UNKNOWN').length;
  return (
    <aside className="quest-sidebar" aria-label="Quest preparation and rewards">
      <section className="quest-panel quest-preparation">
        <header className="quest-panel-heading">
          <h3>Prepare for this {step.type === 'quest' ? 'quest' : 'step'}</h3>
          {unknown > 0 && <span className="badge">{unknown} unverified</span>}
        </header>
        {lines.length > 0 || plan.coins.need > 0 ? <ul className="quest-supply-list">
          {lines.map(l => {
            const item = step.itemsRequired?.find(i => i.nameEn.toLowerCase() === l.name.toLowerCase());
            return <li key={l.key} className={`quest-supply is-${l.where.toLowerCase()}`}>
              <span className="quest-supply-icon"><ItemIcon src={item?.iconUrl ?? findLocalItem(l.name)?.iconUrl} alt="" size={32} /></span>
              <span className="quest-supply-name">{l.name}{l.count > 1 && <> ×{l.count}{!l.exact && '+'}</>}</span>
              <span className="quest-supply-state"><span aria-hidden="true">{l.where === 'UNKNOWN' ? '○' : l.where === 'MISSING' ? '!' : l.where === 'BANK' ? '↗' : '✓'}</span> {LABEL[l.where]}</span>
            </li>;
          })}
          {plan.coins.need > 0 && <li className="quest-supply">
            <span className="quest-supply-icon"><ItemIcon src={findLocalItem('Coins')?.iconUrl} alt="" size={32} /></span>
            <span className="quest-supply-name">Preparation budget<br /><span className="muted small">{formatGp(plan.coins.need)}</span></span>
            <span className="quest-supply-state">{plan.coins.have === null ? 'Balance unknown' : plan.coins.missing !== null && plan.coins.missing > 0 ? `${formatGp(plan.coins.missing)} short` : 'Funds available'}</span>
          </li>}
        </ul> : <p className="muted quest-empty">No preparation items listed for this step.</p>}
        {plan.blockers.length > 0 && <ul className="quest-blockers">{plan.blockers.map(b => <li key={b.label}>{b.label}</li>)}</ul>}
        <button type="button" className="btn quest-review" onClick={onReview}>☷ Review preparation</button>
      </section>
      {(step.reward || (step.qp ?? 0) > 0) && <section className="quest-panel quest-reward">
        <h3>{step.type === 'quest' ? 'Quest reward' : 'Step reward'}</h3>
        {(step.qp ?? 0) > 0 && <p className="quest-qp"><span aria-hidden="true">✦</span> {step.qp} quest {step.qp === 1 ? 'point' : 'points'}</p>}
        {step.reward && <p className="muted"><Inline text={step.reward} /></p>}
      </section>}
    </aside>
  );
}
