// "Path": the Journey spread of the Ledger. The left page is the road of the route (stages and steps), the right page
// the chosen step with its ribbons, and the hotbar under the book holds the step's actions. The whole route and the step are in view at once.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Step } from '../types';
import { stepById } from '../data';
import { useStore } from '../store';
import { useQuestPoints } from '../lib/useQuestPoints';
import { firstOpen, isClosed, nextStep, openAfter } from '../lib/next-step';
import { useBridge } from '../bridge';
import { useReadinessEngine } from '../readinessContext';
import { flashDone } from '../lib/flash';
import { pendingReview } from '../lib/review';
import { CockpitWorkspace } from '../components/CockpitWorkspace';
import { useWiki } from '../components/WikiDrawer';
import { findSubStep, instructionSubStep, subStepNpcInfo } from '../lib/subStep';
import { GearBanner } from '../components/GearPrompt';
import { TrackedSkillCard } from '../components/TrackedSkillCard';
import { AccountSync } from '../components/AccountSync';
import { Welcome } from '../components/Welcome';
import { Eyebrow, Icon, Page, Road } from '../ledger';
import { roadStages } from '../ledger/adapters';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function PathWide({ focusStep, focusKey }: { focusStep?: string; focusKey: number }) {
  const { progress, maxQp, steps, stages, setStep, review, reactivate } = useStore();
  const qp = useQuestPoints();
  const { advance, navTarget, questInstruction, state, inGame, activeStepId } = useBridge();
  const { setSuggested } = useWiki();
  const dependencies = useReadinessEngine().dependencies;
  const suggested = nextStep(steps, progress, qp, dependencies) ?? firstOpen(steps, progress) ?? steps[steps.length - 1];
  const [selectedId, setSelectedId] = useState(() => focusStep ?? suggested.id);
  // The rail highlights the clicked step at once; the heavy step card follows as a transition with a loading state.
  const [railId, setRailId] = useState(selectedId);
  const [switching, startSwitch] = useTransition();
  const selected = steps.find((s) => s.id === selectedId) ?? suggested;
  const [openStages, setOpenStages] = useState<Set<number>>(() => new Set([selected.stage]));
  const center = useRef<HTMLDivElement>(null);
  const pending = pendingReview(steps, progress);

  const select = useCallback((id: string, focus = true) => {
    const step = stepById.get(id);
    if (!step) return;
    setRailId(id);
    startSwitch(() => setSelectedId(id));
    setOpenStages((o) => (o.has(step.stage) ? o : new Set(o).add(step.stage)));
    // A new step — from the start: the central column scrolls by itself, the page stays still.
    center.current?.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    if (focus) window.setTimeout(() => center.current?.querySelector<HTMLElement>('.step-view-title')?.focus({ preventScroll: true }), 0);
    // The chosen step in the ribbon — within the visible area.
    window.setTimeout(() => document.getElementById(`rail-${id}`)?.scrollIntoView({ block: 'nearest' }), 0);
  }, []);

  // Navigation by the link #/step/S3-05.
  useEffect(() => {
    if (focusStep && steps.some((s) => s.id === focusStep)) select(focusStep);
  }, [focusStep, focusKey, steps, select]);

  const toggleStage = (id: number) => setOpenStages((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const nextAfter = (id: string): Step | undefined => openAfter(steps, progress, id, qp, dependencies);

  // The step is done in the game (RuneLite): as after the "Mark as done" button — the next one is in the centre.
  const seenAdvance = useRef(advance?.nonce);
  useEffect(() => {
    if (!advance || advance.nonce === seenAdvance.current) return;
    seenAdvance.current = advance.nonce;
    flashDone(`rail-${advance.from}`);
    if (advance.to && steps.some((s) => s.id === advance.to)) select(advance.to);
  }, [advance, steps, select]);

  /** "Mark as done": the step closes, the next unclosed one is at once in the centre. */
  const complete = (id: string) => {
    const next = nextAfter(id);
    setStep(id, 'done');
    if (next) select(next.id);
  };

  const showChanges = () => {
    setOpenStages((o) => new Set([...o, ...pending.map((s) => s.stage)]));
    select(pending[0].id);
  };

  // The dossier column is never an empty hint: with nothing chosen by hand it shows the NPC of the current sub-step (or the step's own NPC);
  // with neither, the column folds away and the step takes its width.
  const dossierNpc = useMemo(() => {
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

  const upcoming = nextAfter(selected.id);

  // The road opens at the chosen step, in the middle of its page.
  useEffect(() => {
    const row = document.getElementById(`rail-${selectedId}`);
    const road = row?.closest<HTMLElement>('.la-scroll');
    if (row && road) road.scrollTop += row.getBoundingClientRect().top - road.getBoundingClientRect().top - road.clientHeight / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const at = steps.findIndex((s) => s.id === selected.id);
  const road = useMemo(() => roadStages(stages, steps, progress, qp, dependencies, suggested.id, railId), [stages, steps, progress, qp, dependencies, suggested.id, railId]);
  const chapters = road.length;
  const unrolled = useMemo(() => new Set([...openStages].map(String)), [openStages]);

  return (
    <div className="path-wide la-spread">
      <h1 className="visually-hidden">Path</h1>
      <Page side="l" className="path-road" label="Route">
        <Eyebrow>THE ROAD AHEAD</Eyebrow>
        <h2 className="la-t" style={{ marginTop: 4 }}>Route · {steps.length} steps</h2>
        <div className="la-chips" style={{ marginTop: 8 }}>
          <span className="la-chip">{chapters} CHAPTERS</span>
          <span className="la-chip">{qp} → {maxQp} QP</span>
          <button type="button" className="la-btn la-d rail-now" style={{ padding: '3px 10px', marginLeft: 'auto' }} disabled={selected.id === suggested.id} onClick={() => select(suggested.id)}>
            <Icon name="target" size={12} /> TO THE CURRENT STEP
          </button>
        </div>
        <div className="la-scroll">
          <Road stages={road} unrolled={unrolled} onToggle={(key) => toggleStage(Number(key))} onSelectStep={(s) => select(s.id, false)} />
        </div>
      </Page>
      <CockpitWorkspace
        key={selected.id}
        step={selected}
        suggested={selected.id === suggested.id}
        onDone={complete}
        nextId={upcoming?.id}
        prev={steps[at - 1]}
        next={steps[at + 1]}
        onSelect={select}
        position={{ at, total: steps.length }}
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
          <AccountSync compact />
          <TrackedSkillCard />
          {/* A combat step has its own advice in the card — the banner does not repeat it. */}
          {!selected.foes?.length && <GearBanner step={selected} />}
        </>}
      />
    </div>
  );
}
