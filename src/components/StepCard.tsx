// The step card: the header in the list and the details by section.
// The order: status → title → context (NPC, place) → items → actions → tips → completion.

import { useId, useState, type ReactNode } from 'react';
import type { Field, Step, StepItemRequirement } from '../types';
import { levelById } from '../data';
import { useStore } from '../store';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { levelOf } from '../lib/progress';
import { needsReview } from '../lib/review';
import { IconCheck, IconChevron, IconExternal, IconLock, TypeIcon, TYPE_LABEL } from './Icons';
import { Inline } from './Inline';
import { LevelInput } from './LevelInput';
import { RangeHints } from './RangeHints';
import { StepImage } from './StepImage';
import { StepMap } from './StepMap';
import { InGamePanel } from './InGamePanel';
import { TravelPlan } from './TravelPlan';
import { FoodAdvice } from './FoodAdvice';
import { StyleGear } from './StyleGear';
import { BranchSuggestions } from './BranchSuggestions';
import { UpgradePrompt } from './UpgradePrompt';
import { GearPrompt } from './GearPrompt';
import { ReadinessPanel } from './ReadinessPanel';
import { OneTripCard } from './OneTripCard';
import { useReadinessEngine } from '../readinessContext';
import { MoneyGoal } from './MoneyGoal';
import { StepTraining } from './TrainingCard';
import { StepStatus } from './StepStatus';
import { useFeatures } from '../lib/features';
import { MagicPlan } from './MagicPlan';
import { MoneyPlan } from './MoneyPlan';
import { ItemIcon, useWiki } from './WikiDrawer';
import { plural } from '../lib/shopping';
import { LiveXp } from './LiveXp';
import { SubStepHero, SubStepItems, useSubStep } from './SubStepHero';

const WARN_LABELS = new Set(['Dangerous', 'Attention', 'Combat']);

interface Props {
  step: Step;
  open: boolean;
  onToggle: () => void;
  onDone: (id: string) => void;
}

export function StepCard({ step, open, onToggle, onDone }: Props) {
  const { progress, qp, setStep } = useStore();
  const status = progress.steps[step.id];
  const blockers = isClosed(progress, step.id) ? null : blockersOf(step, progress, qp);
  const review = needsReview(step, progress);
  const detailsId = useId();
  // The details mount on the first expansion and after that only collapse — an animation without jumps.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  const cls = ['step', status ? `is-${status}` : '', blockers ? 'is-blocked' : '', open ? 'is-open' : '',
    review ? 'is-review' : '', step.membersOnly ? 'is-members' : '', step.optional ? 'is-optional' : ''].filter(Boolean).join(' ');

  return (
    <li id={`step-${step.id}`} className={cls}>
      <div className="step-row">
        <label className="check">
          <input type="checkbox" checked={status === 'done'}
            onChange={(e) => (e.target.checked ? onDone(step.id) : setStep(step.id, null))}
            aria-label={`${step.id} ${step.title}`} />
          <span className="check-box" aria-hidden="true"><IconCheck /></span>
        </label>
        <button type="button" className="step-toggle" aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>
          <code className="code step-code">{step.id}</code>
          <TypeIcon type={step.type} />
          <span className="step-text">
            <span className="step-title">{step.title}</span>
            <span className="step-badges">
              {step.qp ? <span className="badge badge-qp">+{step.qp} QP</span> : null}
              {status === 'skipped' && <span className="tag">skipped</span>}
              {step.optional && status !== 'skipped' && <span className="tag">optional</span>}
              {review && <span className="badge badge-review">V2: check</span>}
            </span>
            {blockers && (
              <span className="step-blocked"><IconLock />First: {blockerParts(blockers).join(', ')}</span>
            )}
          </span>
          <IconChevron className="chevron" />
        </button>
      </div>
      <div className={`collapse ${open ? 'is-open' : ''}`} id={detailsId} inert={!open}>
        <div className="collapse-inner">
          {mounted && <StepBody step={step} onDone={onDone} />}
        </div>
      </div>
    </li>
  );
}

function amountText(a: string | number): string {
  return typeof a === 'number' ? `×${a.toLocaleString('ru-RU')}` : /^\d/.test(a) ? `×${a}` : a;
}

function ItemChip({ item }: { item: StepItemRequirement }) {
  const { openItem } = useWiki();
  return (
    <li>
      <button type="button" className="item-chip" onClick={() => openItem(item.wikiItemId ?? item.nameEn, item.nameEn)}
        title="Open in the OSRS Wiki inspector">
        <span className="item-chip-head">
          <ItemIcon src={item.iconUrl} alt="" />
          <span className="item-chip-name">
            <strong>{item.nameEn}</strong> <strong className="item-amount">{amountText(item.amount)}</strong>
            {item.heals ? <span className="badge badge-heal" title={`Restores ${item.heals} ${plural(item.heals, 'hitpoint', 'hitpoints')}`}>+{item.heals} HP</span> : null}
          </span>
          <span className="item-chip-lens" aria-hidden="true">🔍</span>
        </span>
        {item.howToGet && <span className="item-chip-how"><Inline text={item.howToGet} /></span>}
      </button>
    </li>
  );
}

/** A collapsed section ("[+] Future Preparation"): its content mounts on the first opening, so a closed one costs nothing. */
function Fold({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  return (
    <details className="step-fold" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setOpened(true); }}>
      <summary><span className="step-fold-title">{title}</span>{hint && <span className="muted small"> · {hint}</span>}</summary>
      {opened && <div className="step-fold-body">{children}</div>}
    </details>
  );
}

function FieldRow({ field }: { field: Field }) {
  return (
    <div className={`field ${WARN_LABELS.has(field.label) ? 'is-warn' : ''}`}>
      <dt>{field.label}</dt>
      <dd><Inline text={field.text} /></dd>
    </div>
  );
}

/** The step details. nextId — which step opens after the mark (the caption on the button in the wide layout). */
export function StepBody({ step, onDone, nextId }: { step: Step; onDone: (id: string) => void; nextId?: string }) {
  const { progress, qp, mode, setStep, review, reactivate } = useStore();
  const { openNpc } = useWiki();
  const zen = !useFeatures().inspector;
  const recovering = useReadinessEngine().ctx.recovery?.stepId === step.id;
  const sub = useSubStep(step);
  const status = progress.steps[step.id];
  const blockers = isClosed(progress, step.id) ? null : blockersOf(step, progress, qp);
  const reviewing = needsReview(step, progress);
  const links = [
    step.wikiUrl && { href: step.wikiUrl, label: 'Wiki' },
    step.quickGuideUrl && { href: step.quickGuideUrl, label: 'Quick Guide' },
    step.mapUrl && { href: step.mapUrl, label: 'Wiki map' },
  ].filter(Boolean) as { href: string; label: string }[];

  // The blocks by meaning; "Zen" and "Inspector" assemble them differently — the calculations are the same in both modes.
  const metaRow = (
    <div className="step-meta-row">
      <span className="muted small">{TYPE_LABEL[step.type]} · stage {step.stage}</span>
      {links.length > 0 && (
        <span className="link-chips">
          {links.map((l) => (
            <a key={l.label} className="link-chip" href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label} <IconExternal />
            </a>
          ))}
        </span>
      )}
    </div>
  );

  const reviewPlaque = reviewing && (
    <div className="plaque plaque-review" role="note">
      <p><strong>⚠️ New in version V2:</strong> {step.v2ChangesSummary}</p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => reactivate([step.id])}>Reset to active</button>
        <button type="button" className="btn btn-primary" onClick={() => review([step.id])}>Confirm and close</button>
      </div>
    </div>
  );

  const where = (
    <>
      {step.npc ? (
        <section className="plaque plaque-npc" aria-label="NPC and start point">
          <button type="button" className="npc-name" onClick={() => openNpc(step.npc!)} title="Open in the OSRS Wiki inspector">
            {step.npc.nameEn} <span aria-hidden="true">🔍</span>
          </button>
          <p><Inline text={step.npc.location} /></p>
          <p className="npc-badges">
            <span className="badge badge-floor">Floor: {step.npc.floor}</span>
            {step.npc.dialogue && <span className="badge badge-dialogue">Dialogue: {step.npc.dialogue}</span>}
          </p>
        </section>
      ) : step.where ? (
        <section className="plaque plaque-npc" aria-label="Place">
          <p><Inline text={step.where} /></p>
          {step.floor && <p className="npc-badges"><span className="badge badge-floor">Floor: {step.floor}</span></p>}
        </section>
      ) : null}
      {step.npc && step.where && <p><Inline text={step.where} /></p>}
    </>
  );

  const warning = step.warning && <div className="plaque plaque-warning" role="note"><Inline text={step.warning} /></div>;

  const helpers = (
    <>
      <ReadinessPanel step={step} />
      <MoneyGoal step={step} />
      <StepTraining step={step} />
      <MagicPlan step={step} />
      <MoneyPlan step={step} />
      <UpgradePrompt step={step} />
      <GearPrompt step={step} />
      <StepMap step={step} />
      <InGamePanel step={step} />
      <TravelPlan step={step} />
      <FoodAdvice step={step} />
      <StyleGear step={step} />
      <BranchSuggestions step={step} />
    </>
  );

  const how = step.how && <p className="step-how"><Inline text={step.how} /></p>;
  const bring = step.bring && <p className="small"><span className="muted">Bring: </span><Inline text={step.bring} /></p>;

  const items = (
    <>
      {step.itemsRequired && step.itemsRequired.length > 0 && (
        <section className="step-section">
          <h4 className="subhead">Required items and food</h4>
          <ul className="item-grid">{step.itemsRequired.map((it, i) => <ItemChip key={`${it.nameEn}-${i}`} item={it} />)}</ul>
        </section>
      )}
      {step.itemsRecommended && step.itemsRecommended.length > 0 && (
        <section className="step-section">
          <h4 className="subhead">Recommended to bring</h4>
          <ul className="item-grid">{step.itemsRecommended.map((it, i) => <ItemChip key={`${it.nameEn}-${i}`} item={it} />)}</ul>
        </section>
      )}
      {step.type === 'gear' && step.itemsRequired?.length ? (
        <p className="muted small"><a href="#/shopping">🛒 Grand Exchange shopping list</a> — buying for several stages ahead at once.</p>
      ) : null}
    </>
  );

  const image = step.imageUrl && <StepImage src={step.imageUrl} caption={step.imageCaption} />;

  const quick = step.quickSteps && step.quickSteps.length > 0 && (
    <ol className="quick-steps">{step.quickSteps.map((q, i) => <li key={i}><Inline text={q} /></li>)}</ol>
  );

  // The cockpit: what to do now (the current sub-step and its items), with everything else folded away.
  const hero = sub && (
    <>
      <SubStepHero step={step} sub={sub} />
      <SubStepItems step={step} sub={sub} />
    </>
  );
  const future = <Fold title="Future Preparation" hint="what to bring on the next steps"><OneTripCard step={step} /></Fold>;
  const nQuick = step.quickSteps?.length ?? 0;
  const reference = (quick || (sub && how)) && (
    <Fold title="Full Walkthrough Reference" hint={nQuick ? `${nQuick} ${nQuick === 1 ? 'step' : 'steps'}, for reference` : 'for reference'}>
      {sub && where}
      {sub && how}
      {quick}
    </Fold>
  );

  // The critical field warnings ("Dangerous", "Attention", "Combat") are always visible, the other fields — in the details.
  const fieldsAll = step.fields ?? [];
  const fieldsWarn = fieldsAll.filter((f) => WARN_LABELS.has(f.label));
  const fieldsRest = fieldsAll.filter((f) => !WARN_LABELS.has(f.label));
  const fieldList = (list: Field[]) => list.length > 0 && <dl className="fields">{list.map((f, i) => <FieldRow key={i} field={f} />)}</dl>;

  const notes = (
    <>
      {step.proTip && <div className="plaque plaque-tip"><strong>Tip:</strong> <Inline text={step.proTip} /></div>}
      {step.safespot && <div className="plaque plaque-safespot"><strong>🛡️ Safespot:</strong> <Inline text={step.safespot} /></div>}
      {mode === 'members' && step.membersAlternative && (
        <div className="plaque plaque-members"><Inline text={step.membersAlternative} /></div>
      )}
      {step.reward && <p className="step-reward"><span className="muted">Reward: </span><Inline text={step.reward} /></p>}
    </>
  );

  const requires = (
    <>
      {(step.requires.length > 0 || step.minQp !== undefined) && (
        <p className="requires small">
          <span className="muted">Depends on: </span>
          {step.requires.map((r, i) => (
            <span key={r}>
              {i > 0 && ', '}
              <a href={`#/step/${r}`} className={`step-ref ${isClosed(progress, r) ? 'is-met' : ''}`}>{r}</a>
              {isClosed(progress, r) && <span className="visually-hidden"> (done)</span>}
            </span>
          ))}
          {step.minQp !== undefined && (
            <span className={qp >= step.minQp ? 'is-met' : ''}>{step.requires.length ? ', ' : ''}quest points ≥ {step.minQp} (now {qp})</span>
          )}
        </p>
      )}
      {blockers && <p className="notice small">The step can be marked now too, but by the plan first: {blockerParts(blockers).join(', ')}.</p>}
    </>
  );

  const targets = step.targets && step.targets.length > 0 && (
    <div className="targets">
      <h4 className="subhead">Levels</h4>
      <div className="targets-grid">
        {step.targets.map((t) => {
          const name = levelById.get(t.skill)?.name ?? t.skill;
          const reached = levelOf(progress, t.skill) >= t.level;
          return (
            <div key={t.skill} className={`target ${reached ? 'is-reached' : ''}`}>
              <LevelInput id={t.skill} label={name} compact />
              <span className="target-goal">goal {t.level}{reached && <IconCheck />}</span>
            </div>
          );
        })}
      </div>
      <LiveXp targets={step.targets} />
      <RangeHints step={step} />
    </div>
  );

  const doneWhen = <div className="plaque plaque-done"><strong>Done when:</strong> <Inline text={step.doneWhen} /></div>;

  const actions = (
    <div className="actions">
      {status === 'done'
        ? <button type="button" className="btn" onClick={() => setStep(step.id, null)}>Remove the mark</button>
        : <button type="button" className="btn btn-primary btn-lg" onClick={() => onDone(step.id)}><IconCheck /> {zen ? 'Done' : 'Mark as done'}{nextId && <span className="btn-next"> → {nextId}</span>}</button>}
      {step.optional && (status === 'skipped'
        ? <button type="button" className="btn" onClick={() => setStep(step.id, null)}>Return to the plan</button>
        : status !== 'done' && <button type="button" className="btn" onClick={() => setStep(step.id, 'skipped')}>Skip</button>)}
    </div>
  );

  if (zen) {
    // "Zen": the current sub-step as a hero card, its items, the status in one line, the "Done" button and critical warnings.
    // Everything else is folded: the future preparation, the full walkthrough, and "More".
    return (
      <div className="step-details is-zen">
        {reviewPlaque}
        {!sub && where}
        {warning}
        {fieldList(fieldsWarn)}
        {hero}
        <StepStatus step={step} />
        {!sub && (recovering ? (
          // After a derailment "what to do on the step" comes later: first return. The text stays at hand but does not shout.
          <details className="zen-more"><summary className="small">What to do on the step — after returning</summary>{how}</details>
        ) : how)}
        {doneWhen}
        {actions}
        {future}
        {reference}
        <details className="zen-more">
          <summary className="small">More about the step</summary>
          {metaRow}
          {bring}
          {items}
          {image}
          {fieldList(fieldsRest)}
          {notes}
          {requires}
          {targets}
        </details>
      </div>
    );
  }

  // "Inspector": everything is expanded, as before.
  return (
    <div className="step-details">
      {metaRow}
      {reviewPlaque}
      {!sub && where}
      {warning}
      {fieldList(fieldsWarn)}
      {hero}
      {helpers}
      {!sub && how}
      {bring}
      {notes}
      {requires}
      {targets}
      {doneWhen}
      {actions}
      {future}
      {reference}
      {(step.itemsRequired?.length || step.itemsRecommended?.length || image || fieldsRest.length > 0) && (
        <Fold title="Items, details and fields" hint="the raw step data">
          {items}
          {image}
          {fieldList(fieldsRest)}
        </Fold>
      )}
    </div>
  );
}
