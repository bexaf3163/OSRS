// "Path": the Journey spread of the Ledger. The left page is the planner's order of open quests, the right page
// the chosen step with its ribbons, and the hotbar under the book holds the step's actions. The order and the step are in view at once.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { stepById } from '../../data';
import { useStore } from '../../state/store';
import { useQuestPoints } from '../../state/hooks/useQuestPoints';
import { isClosed } from '../../domain/quests/next-step';
import { useBridge } from '../../state/bridge';
import { useActiveActivity, useTrackedTraining } from '../../state/readinessContext';
import { pendingReview } from '../../domain/readiness/review';
import { CockpitWorkspace } from './CockpitWorkspace';
import { useWiki } from '../reference/WikiDrawer';
import { findSubStep, instructionSubStep, subStepNpcInfo } from '../../domain/quests/subStep';
import { GearBanner } from '../gear/GearPrompt';
import { TrackedSkillCard } from './step/TrackedSkillCard';
import { AccountSync } from '../../ui/AccountSync';
import { Welcome } from './Welcome';
import { ManualConfirm } from './ManualConfirm';
import { Eyebrow, Icon, Page } from '../../ledger';
import { objectiveSteps, plannerOrder, useDecision } from '../../state/decision';
import { PlannerOrder } from './PlannerOrder';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function PathWide({ focusStep, focusKey }: { focusStep?: string; focusKey: number }) {
  const { progress, maxQp, steps, setStep, review, reactivate } = useStore();
  const qp = useQuestPoints();
  const { advance, navTarget, questInstruction, state, inGame, activeStepId } = useBridge();
  const { setSuggested } = useWiki();
  const training = useTrackedTraining();
  const activity = useActiveActivity();
  const decision = useDecision();
  // The committed Decision's step; with none (offline, waiting for data) nothing is current.
  // A Decision whose current action has no step of its own (VERIFY a level) still has an objective: its quest's first open step.
  const objectiveStart = useMemo(() => { const own = objectiveSteps(decision); return steps.find((s) => own.has(s.id) && !isClosed(progress, s.id)) ?? null; }, [decision, steps, progress]);
  const suggested = activity.source === 'training' ? null : activity.step ?? objectiveStart;
  // Without a Decision nothing is "current", and no step is guessed from the old guide's order (2.82.4): the page waits
  // for the planner, or shows a step a link opened.
  const [selectedId, setSelectedId] = useState(() => focusStep ?? suggested?.id ?? null);
  const [switching, startSwitch] = useTransition();
  const selected = steps.find((s) => s.id === selectedId) ?? suggested;
  const center = useRef<HTMLDivElement>(null);
  const pending = pendingReview(steps, progress);

  const select = useCallback((id: string, focus = true) => {
    const step = stepById.get(id);
    if (!step) return;
    startSwitch(() => setSelectedId(id));
    // A new step — from the start: the central column scrolls by itself, the page stays still.
    center.current?.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    if (focus) window.setTimeout(() => center.current?.querySelector<HTMLElement>('.step-view-title')?.focus({ preventScroll: true }), 0);
  }, []);

  // Navigation by the link #/step/S3-05.
  useEffect(() => {
    if (focusStep && steps.some((s) => s.id === focusStep)) select(focusStep);
  }, [focusStep, focusKey, steps, select]);


  // The step is done in the game (RuneLite): as after the "Mark as done" button — the next one is in the centre.
  // "Mark as done" here or in the game: the planner decides again from the new marks, and the centre follows its step.
  const [follow, setFollow] = useState(false);
  const seenAdvance = useRef(advance?.nonce);
  useEffect(() => {
    if (!advance || advance.nonce === seenAdvance.current) return;
    seenAdvance.current = advance.nonce;
    setFollow(true);
  }, [advance]);

  /** "Mark as done": the step closes, the next unclosed one is at once in the centre. */
  const complete = (id: string) => {
    setStep(id, 'done');
    setFollow(true);
  };
  useEffect(() => {
    if (!follow || !suggested || isClosed(progress, suggested.id)) return;
    setFollow(false);
    select(suggested.id);
  }, [follow, progress, suggested, select]);

  const showChanges = () => {
    select(pending[0].id);
  };

  // The dossier column is never an empty hint: with nothing chosen by hand it shows the NPC of the current sub-step (or the step's own NPC);
  // with neither, the column folds away and the step takes its width.
  const dossierNpc = useMemo(() => {
    if (!selected) return null;
    const confirmed = state === 'online' && inGame && activeStepId === selected.id && questInstruction?.stepId === selected.id;
    const sub = isClosed(progress, selected.id) ? null : confirmed ? instructionSubStep(selected, questInstruction) : findSubStep(selected, navTarget);
    return (sub ? subStepNpcInfo(selected, sub) : null) ?? (confirmed ? null : selected.npc ?? null);
  }, [selected, progress, navTarget, questInstruction, state, inGame, activeStepId]);
  const dossierKey = dossierNpc?.nameEn ?? null;
  useEffect(() => {
    setSuggested(dossierNpc);
    return () => setSuggested(null);
    // Only the NPC's name matters: a new status poll gives a new object for the same NPC.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierKey, setSuggested]);

  // Marking the Decision's own step done hands the choice back to the planner; another step's mark opens the Decision's step.
  const upcoming = suggested && selected?.id !== suggested.id ? suggested : undefined;

  // Previous/Next follow the planner's live order of quests, never the guide's written order between quests.
  const order = useMemo(() => plannerOrder(decision, progress), [decision, progress]);
  const ranked = order.findIndex((row) => row.stepId === selected?.id);
  const near = (index: number) => steps.find((s) => s.id === order[index]?.stepId);

  return (
    <div className="path-wide la-spread">
      <h1 className="visually-hidden">Path</h1>
      <Page side="l" className="path-road" label="Route">
        <Eyebrow>YOUR PATH</Eyebrow>
        <h2 className="la-t" style={{ marginTop: 4 }}>The planner's order</h2>
        <div className="la-chips" style={{ marginTop: 8, marginBottom: 10 }}>
          <span className="la-chip">{qp} → {maxQp} QP</span>
          <button type="button" className="la-btn la-d rail-now" style={{ padding: '3px 10px', marginLeft: 'auto' }} disabled={!suggested || selected?.id === suggested.id} onClick={() => { if (suggested) select(suggested.id); }}>
            <Icon name="target" size={12} /> TO THE CURRENT STEP
          </button>
        </div>
        <div className="la-scroll">
          <PlannerOrder rows={order} confidence={decision?.confidence ?? null} selectedId={selected?.id ?? ''} onSelect={(id) => select(id, false)}
            updatesWhen={decision?.expectedNext.evidenceRequired.map((e) => e.predicate) ?? []} />
        </div>
      </Page>
      {training ? <Page side="r" label="Training plan"><div className="la-scroll"><TrackedSkillCard /></div></Page> : !selected ? (
        <Page side="r" label="Next action"><div className="la-scroll">
          <Eyebrow>THE PLANNER'S NEXT ACTION</Eyebrow>
          <h1 className="la-t">{decision ? decision.activeAction.title : 'Waiting for the planner'}</h1>
          {decision ? <ul className="small">{decision.why.map((w) => <li key={w}>{w}</li>)}</ul>
            : <p className="muted">Connect RuneLite and log in, or open a quest from the Journal.</p>}
        </div></Page>
      ) : <CockpitWorkspace
        key={selected.id}
        step={selected}
        suggested={selected.id === suggested?.id}
        onDone={complete}
        nextId={upcoming?.id}
        prev={ranked > 0 ? near(ranked - 1) : undefined}
        next={ranked >= 0 ? near(ranked + 1) : undefined}
        onSelect={select}
        position={ranked >= 0 ? { at: ranked, total: order.length } : null}
        busy={switching}
        scrollRef={center}
        notices={<>
          {pending.length > 0 && (
            <div className="review-banner card">
              <h2 className="review-title">🔔 The guide updated to V2!</h2>
              <p>
                In the {pending.length === 1 ? 'step' : 'steps'} {pending.map((s) => s.id).join(', ')}, which you already marked, important requirements appeared.
                Quest points are not taken away on a reset.
              </p>
              <div className="actions">
                <button type="button" className="btn btn-primary" onClick={showChanges}>Show what changed</button>
                <button type="button" className="btn" onClick={() => reactivate(pending.map((s) => s.id))}>Reset the updated steps to active</button>
                <button type="button" className="btn btn-ghost" onClick={() => review(pending.map((s) => s.id))}>I checked everything, hide</button>
              </div>
            </div>
          )}
          <Welcome />
          <ManualConfirm />
          <AccountSync compact />
          <TrackedSkillCard />
          {/* A combat step has its own advice in the card — the banner does not repeat it. */}
          {!selected.foes?.length && <GearBanner step={selected} />}
        </>}
      />}
    </div>
  );
}
