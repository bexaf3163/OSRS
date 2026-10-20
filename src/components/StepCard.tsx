// The step details by section (StepBody), used by the workspace tabs and by the all-in-one view.
// The order: status → title → context (NPC, place) → items → actions → tips → completion.

import { useState, type ReactNode } from 'react';
import type { Field, Step, StepItemRequirement } from '../types';
import { levelById } from '../data';
import { useStore } from '../store';
import { useQuestPoints } from '../lib/useQuestPoints';
import { blockerParts, blockersOf, isClosed, suggestedBefore } from '../lib/next-step';
import { levelOf } from '../lib/progress';
import { needsReview } from '../lib/review';
import { IconCheck, IconExternal, TYPE_LABEL } from './Icons';
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
import { ReadinessVerdictCard } from './ReadinessVerdict';
import { OneTripCard } from './OneTripCard';
import { useReadinessEngine } from '../readinessContext';
import { MoneyGoal } from './MoneyGoal';
import { TradeRestrictionNote } from './TradeRestrictionNote';
import { StepTasks } from './StepTasks';
import { StepTraining } from './TrainingCard';
import { StepStatus } from './StepStatus';
import { useFeatures } from '../lib/features';
import { MagicPlan } from './MagicPlan';
import { MoneyPlan } from './MoneyPlan';
import { ItemIcon, useWiki } from './WikiDrawer';
import { plural } from '../lib/shopping';
import { LiveXp } from './LiveXp';
import { SubStepHero, SubStepItems, useSubStep } from './SubStepHero';
import { QuestOverview } from './QuestOverview';
import { overviewOf } from '../lib/subStep';
import { CarryNote, LoadoutsCard, RewardChoice } from './RouteNotes';
import { QuestPreparation } from './QuestPreparation';
import { TravelTip } from './TravelTip';

const WARN_LABELS = new Set(['Dangerous', 'Attention', 'Combat']);

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
function Fold({ title, hint, children, open }: { title: string; hint?: string; children: ReactNode; open?: boolean }) {
  const [opened, setOpened] = useState(!!open);
  return (
    <details className="step-fold" open={open || undefined} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setOpened(true); }}>
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

/** The four views of the Path workspace; without one, StepBody renders the whole card (the narrow list). */
export type StepTab = 'steps' | 'prep' | 'travel' | 'details';

/** The step details. nextId — which step opens after the mark (the caption on the button in the wide layout). tab — one view of the workspace. noAside — the workspace shows the preparation list in its own column, Steps does not repeat it. statusAbove — the verdict is on a status line above, so Preparation does not say it again. */
export function StepBody({ step, onDone, nextId, tab, onPrep, safetyShown = false, noAside = false, statusAbove = false, noManual = false }: { step: Step; onDone: (id: string) => void; nextId?: string; tab?: StepTab | 'safety'; onPrep?: () => void; safetyShown?: boolean; noAside?: boolean; statusAbove?: boolean; noManual?: boolean }) {
  const { progress, mode, setStep, review, reactivate } = useStore();
  const qp = useQuestPoints();
  const { openNpc } = useWiki();
  const zen = !useFeatures().inspector;
  const engine = useReadinessEngine();
  const recovering = engine.ctx.recovery?.stepId === step.id;
  const sub = useSubStep(step);
  const status = progress.steps[step.id];
  const blockers = isClosed(progress, step.id) ? null : blockersOf(step, progress, qp, engine.dependencies);
  const suggested = isClosed(progress, step.id) ? [] : suggestedBefore(step, progress);
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
      <ReadinessVerdictCard step={step} />
      <ReadinessPanel step={step} />
      <TradeRestrictionNote step={step} />
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

  // A plan in effect (a combat plan, 2.69) replaced the route's own instructions: they stay readable here, folded, never beside the plan's.
  const asWritten = step.routeAsWritten;
  const routeWritten = asWritten && (
    <Fold title="The route as written" hint="replaced by the plan in effect">
      {asWritten.where && <p><Inline text={asWritten.where} /></p>}
      {asWritten.how && <p className="step-how"><Inline text={asWritten.how} /></p>}
      {asWritten.quickSteps?.length ? <ol className="quick-steps">{asWritten.quickSteps.map((q, i) => <li key={i}><Inline text={q} /></li>)}</ol> : null}
      {asWritten.fields?.length ? <dl className="fields">{asWritten.fields.map((fl, i) => <FieldRow key={i} field={fl} />)}</dl> : null}
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
      {suggested.length > 0 && (
        <p className="requires small">
          <span className="muted">Better after (optional): </span>
          {suggested.map((r, i) => <span key={r}>{i > 0 && ', '}<a href={`#/step/${r}`} className="step-ref">{r}</a></span>)}
          <span className="muted"> — you can skip {suggested.length > 1 ? 'them' : 'it'} and this step still opens.</span>
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

  if (tab) {
    if (tab === 'safety') return <div className="workspace-safety">{reviewPlaque}{warning}{fieldList(fieldsWarn)}</div>;
    const inspector = !zen;
    // Manual completion is a quiet, explicit action: the recommended action is the one at the top of the workspace.
    const manual = (
      <div className="manual-complete">
        {status === 'done'
          ? <button type="button" className="btn btn-ghost" onClick={() => setStep(step.id, null)}>Remove the mark</button>
          : <button type="button" className="btn btn-ghost" onClick={() => onDone(step.id)}><IconCheck /> Mark as manually completed{nextId && <span className="btn-next"> → {nextId}</span>}</button>}
        {step.optional && (status === 'skipped'
          ? <button type="button" className="btn btn-ghost" onClick={() => setStep(step.id, null)}>Return to the plan</button>
          : status !== 'done' && <button type="button" className="btn btn-ghost" onClick={() => setStep(step.id, 'skipped')}>Skip</button>)}
      </div>
    );
    if (tab === 'steps') {
      // A step without a walkthrough and without a current line has nothing for the walkthrough panel: it is not drawn as an empty box.
      const walkthrough = !!sub || overviewOf(step).length > 0;
      return (
        <div className="step-details is-tab">
          {!safetyShown && reviewPlaque}
          {!safetyShown && warning}
          {!safetyShown && fieldList(fieldsWarn)}
          {(walkthrough || !noAside) && <div className={walkthrough && !noAside ? "quest-workspace-grid" : "quest-workspace-grid is-single"}>
            {walkthrough && <div className="quest-panel quest-walkthrough">
              <QuestOverview step={step} sub={sub} />
              {sub && <SubStepHero step={step} sub={sub} bare />}
              {sub && <SubStepItems step={step} sub={sub} />}
            </div>}
            {!noAside && <QuestPreparation step={step} onReview={onPrep} showReward />}
          </div>}
          {!sub && !step.questStages && (recovering ? (
            <details className="zen-more"><summary className="small">What to do on the step — after returning</summary>{how}</details>
          ) : how)}
          {/* No stage data and no live line: the quick path is the walkthrough itself, so it is open, not folded away as a reference. */}
          {!walkthrough && quick && (
            <section className="quest-panel quest-quick" aria-label="Walkthrough">
              <h3 className="overview-title">Walkthrough</h3>
              {quick}
            </section>
          )}
          {doneWhen}
          <RewardChoice step={step} />
          <CarryNote step={step} />
          <StepTasks step={step} />
          {walkthrough && (quick || (sub && how)) && (
            <Fold title="Full walkthrough and dialogue" hint={nQuick ? `${nQuick} ${nQuick === 1 ? 'step' : 'steps'}, with detailed instructions` : 'for reference'}>
              {sub && how}
              {step.questStages && !sub && how}
              {quick}
            </Fold>
          )}
          {!step.questStages && !sub && !quick && !noAside && where}
          {!noManual && manual}
        </div>
      );
    }
    if (tab === 'prep') {
      return (
        <div className="step-details is-tab">
          {/* The status line above already says when nothing is checked, and the list below names every thing once. */}
          <ReadinessVerdictCard step={step} />
          <ReadinessPanel step={step} bare={statusAbove && !recovering} />
          <LoadoutsCard step={step} />
          <CarryNote step={step} />
          <StepTasks step={step} />
          <OneTripCard step={step} inStatus plain />
          <TradeRestrictionNote step={step} />
          <MoneyGoal step={step} />
          <StepTraining step={step} />
          <MagicPlan step={step} />
          <MoneyPlan step={step} />
          <UpgradePrompt step={step} />
          <GearPrompt step={step} />
          <StyleGear step={step} />
          <FoodAdvice step={step} />
          <BranchSuggestions step={step} />
          {bring}
          {/* "What you need" above names every item and its state once; the cards with where to get each one are a click away. */}
          {(step.itemsRequired?.length || step.itemsRecommended?.length) ? (
            <details className="zen-more item-sources">
              <summary className="small">Where to get each item</summary>
              {items}
            </details>
          ) : null}
        </div>
      );
    }
    if (tab === 'travel') {
      return (
        <div className="step-details is-tab">
          <TravelTip step={step} />
          <StepMap step={step} />
          <InGamePanel step={step} />
          <TravelPlan step={step} />
        </div>
      );
    }
    // details: rewards, requirements, sources, notes and the raw step data
    return (
      <div className="step-details is-tab">
        {where}
        <p className="small related-reference">
          <span className="muted">Reference: </span>
          <a href="#/reference/transport">Teleports, canoes and boats</a> · <a href="#/reference/plugins">RuneLite plugins</a> · <a href="#/reference/stuck">If you do not know what to do</a>
        </p>
        {metaRow}
        {notes}
        {routeWritten}
        {requires}
        {targets}
        {(step.itemsRequired?.length || step.itemsRecommended?.length || image || fieldsRest.length > 0) && (
          <Fold title="Items, details and fields" hint="the raw step data" open={inspector}>
            {items}
            {image}
            {fieldList(fieldsRest)}
          </Fold>
        )}
      </div>
    );
  }

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
        {routeWritten}
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
      {routeWritten}
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
