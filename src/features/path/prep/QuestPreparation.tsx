// A concise current-step view of the existing preparation plan; full actions remain in Preparation.
// The list is the stage's own once the game confirms the line the player is on: what the quest used up earlier is folded away, not listed as missing.
import type { ReactNode } from 'react';
import type { Step } from '../../../types';
import { useReadinessEngine } from '../../../state/readinessContext';
import { useBridge } from '../../../state/bridge';
import { useStageScope } from '../../../state/hooks/useStageScope';
import { isOutOfStage } from '../../../domain/quests/stageScope';
import { lineAmount, type PrepLine } from '../../../domain/prep/prepPlan';
import { Inline } from '../../../ui/Inline';
import { ItemIcon } from '../../reference/WikiDrawer';
import { findLocalItem } from '../../../domain/items/localItem';
import { formatGp } from '../../../domain/prep/shopping';
import { ReadinessVerdictCard } from './ReadinessVerdict';

const LABEL = { EQUIPPED: 'Equipped', INVENTORY: 'In your bag', BANK: 'Take from bank', MISSING: 'Missing', UNKNOWN: 'Not checked' };

function Row({ step, l, linked = true }: { step: Step; l: PrepLine; linked?: boolean }) {
  const item = step.itemsRequired?.find((i) => i.nameEn.toLowerCase() === l.name.toLowerCase());
  return (
    <li className={`quest-supply is-${l.where.toLowerCase()}`}>
      <span className="quest-supply-icon"><ItemIcon src={item?.iconUrl ?? findLocalItem(l.name)?.iconUrl} alt="" size={32} /></span>
      <span className="quest-supply-name">{l.name}{lineAmount(l)}{l.marketPrice && <><br /><span className="muted small" title={l.marketPrice.detail}>{l.marketPrice.text}</span></>}</span>
      <span className="quest-supply-state"><span aria-hidden="true">{l.where === 'UNKNOWN' ? '○' : l.where === 'MISSING' ? '!' : l.where === 'BANK' || l.equip && l.where === 'INVENTORY' ? '↗' : '✓'}</span> {l.equip && l.where === 'INVENTORY' ? 'Equip' : l.unnote ? 'Unnote at bank' : l.where === 'UNKNOWN' && !linked ? 'Bring' : LABEL[l.where]}</span>
    </li>
  );
}

/** The list of what the step (or the stage of the quest) asks for now, with the button that opens the whole preparation. */
/** status: the step's verdict line (ring, Fix), shown at the top of this one panel instead of a card of its own above it. */
/** statusAbove: a status line right above already names the readiness level, so the verdict card does not open with it again. */
export function QuestSupplies({ step, onReview, status, statusAbove = false }: { step: Step; onReview?: () => void; status?: ReactNode; statusAbove?: boolean }) {
  const plan = useReadinessEngine().plan(step, { ahead: 0 });
  const scope = useStageScope(step);
  // Without RuneLite nothing can be checked: "Not checked" on every line says nothing, so the list is simply what to bring.
  const linked = useBridge().state === 'online';
  const all = plan.lines.filter((l) => l.timing === 'NOW');
  const lines = all.filter((l) => !isOutOfStage(scope, l.name));
  // Retired requirements remain readable history; never recompute an obsolete preparation plan to display them.
  const handled = (step.itemsRequired ?? []).filter(item => isOutOfStage(scope, item.nameEn));
  const unknown = lines.filter((l) => l.where === 'UNKNOWN').length;
  // Nothing to bring, no budget and no blocker: no empty box; Preparation stays one click away.
  if (!all.length && !handled.length && plan.coins.need <= 0 && plan.blockers.length === 0) return status ? <>{status}</> : null;
  return (
    <section className="quest-panel quest-preparation">
      <header className="quest-panel-heading">
        <h3>{scope ? 'Needed for this stage' : `Prepare for this ${step.type === 'quest' ? 'quest' : 'step'}`}</h3>
        {linked && unknown > 0 && <span className="badge">{unknown} unverified</span>}
      </header>
      {status}
      <ReadinessVerdictCard step={step} noPill={!!status || statusAbove} />
      {lines.length > 0 || plan.coins.need > 0 ? (
        <ul className="quest-supply-list">
          {lines.map((l) => <Row key={l.key} step={step} l={l} linked={linked} />)}
          {plan.coins.need > 0 && <li className="quest-supply">
            <span className="quest-supply-icon"><ItemIcon src={findLocalItem('Coins')?.iconUrl} alt="" size={32} /></span>
            <span className="quest-supply-name">Preparation budget<br /><span className="muted small">{formatGp(plan.coins.need)}</span></span>
            <span className="quest-supply-state">{plan.coins.have === null ? 'Balance unknown' : plan.coins.missing !== null && plan.coins.missing > 0 ? `${formatGp(plan.coins.missing)} short` : 'Funds available'}</span>
          </li>}
        </ul>
      ) : <p className="muted quest-empty">{scope ? 'Nothing more to bring for this stage.' : 'No preparation items listed for this step.'}</p>}
      {/* On the step page the lock line above the action and the verdict already name what comes first. */}
      {!status && plan.blockers.length > 0 && <ul className="quest-blockers">{plan.blockers.map((b) => <li key={b.label}>{b.label}</li>)}</ul>}
      {handled.length > 0 && (
        <details className="quest-handled">
          <summary>Used earlier in this quest · {handled.length}</summary>
          <ul className="quest-supply-list">{handled.map((item, index) => <li key={`${item.nameEn}:${index}`} className="quest-supply is-quiet">
            <span className="quest-supply-icon"><ItemIcon src={item.iconUrl ?? findLocalItem(item.nameEn)?.iconUrl} alt="" size={32} /></span>
            <span className="quest-supply-name">{item.nameEn}{item.amount !== 1 && <> ×{item.amount}</>}</span>
            <span className="quest-supply-state">Handled</span>
          </li>)}</ul>
        </details>
      )}
      {onReview && <button type="button" className="btn quest-review" onClick={onReview}>☷ Review preparation</button>}
    </section>
  );
}

export function QuestReward({ step }: { step: Step }) {
  if (!step.reward && (step.qp ?? 0) <= 0) return null;
  return (
    <section className="quest-panel quest-reward">
      <h3>{step.type === 'quest' ? 'Quest reward' : 'Step reward'}</h3>
      {(step.qp ?? 0) > 0 && <p className="quest-qp"><span aria-hidden="true">✦</span> {step.qp} quest {step.qp === 1 ? 'point' : 'points'}</p>}
      {step.reward && <p className="muted"><Inline text={step.reward} /></p>}
    </section>
  );
}

export function QuestPreparation({ step, onReview, showReward = true }: { step: Step; onReview?: () => void; showReward?: boolean }) {
  return (
    <aside className="quest-sidebar" aria-label="Quest preparation and rewards">
      <QuestSupplies step={step} onReview={onReview ?? (() => {})} />
      {showReward && <QuestReward step={step} />}
    </aside>
  );
}
