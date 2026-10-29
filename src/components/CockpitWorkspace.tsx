// The Path workspace, the right page of the Journey: the step's heading, its readiness plaque and the current action
// ("NOW"), then the step's views on ribbons (Steps, Preparation, Route & game, Details, Wiki; P, T and D switch to them).
// The hotbar under the book carries the step's actions.
// Presentation only: the step bodies, the preparation engine and the navigation actions are the existing ones.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Step } from '../types';
import { useStore } from '../store';
import { useQuestPoints } from '../lib/useQuestPoints';
import { useBridge } from '../bridge';
import { useReadinessEngine } from '../readinessContext';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { toInGameTarget } from '../services/runeliteBridge';
import { TYPE_LABEL, IconLock } from './Icons';
import { CurrentAction } from './StepWorkspace';
import { StepBody, type StepTab } from './StepCard';
import { StepStatus } from './StepStatus';
import { QuestReward, QuestSupplies } from './QuestPreparation';
import { StepMap } from './StepMap';
import { TravelTip } from './TravelTip';
import { ShowInGame } from './ShowInGame';
import { StepDone } from './StepDone';
import { usePrepFix } from './PrepRoute';
import { useSubStep } from './SubStepHero';
import { WikiDock, useWiki } from './WikiDrawer';
import { Eyebrow, Hotbar, Page } from '../ledger';
import { roman } from '../ledger/adapters';

type View = StepTab | 'wiki';

const VIEWS: { id: View; title: string; key?: string }[] = [
  { id: 'steps', title: 'Steps' },
  { id: 'prep', title: 'Preparation', key: 'P' },
  { id: 'travel', title: 'Route & game', key: 'T' },
  { id: 'details', title: 'Details', key: 'D' },
  { id: 'wiki', title: 'Wiki' },
];

interface Props {
  step: Step;
  suggested: boolean;
  onDone: (id: string) => void;
  nextId?: string;
  /** The neighbours in the route, for the hotbar's Previous and Next. */
  prev?: Step;
  next?: Step;
  onSelect: (id: string) => void;
  position: { at: number; total: number };
  /** Cards above the step: the review banner, the welcome, the tracked skill. */
  notices?: ReactNode;
  /** The step card is still loading after a pick on the road. */
  busy?: boolean;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function CockpitWorkspace({ step, suggested, onDone, nextId, prev, next, onSelect, position, notices, busy, scrollRef }: Props) {
  const { progress, setStep } = useStore();
  const qp = useQuestPoints();
  const { questInstruction, state, inGame, activeStepId, enabled, pointInGame, navigate } = useBridge();
  const engine = useReadinessEngine();
  const { pinned, chosen } = useWiki();
  const sub = useSubStep(step);
  const recovery = engine.plan(step, { ahead: 0 }).recovery;
  const [view, setView] = useState<View>('steps');
  const [mapRequest, setMapRequest] = useState(0);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const openPrep = () => setView('prep');
  const { available: canFix, fix } = usePrepFix(step, openPrep);
  const closed = isClosed(progress, step.id);
  const status = progress.steps[step.id];
  const blockers = closed ? null : blockersOf(step, progress, qp, engine.dependencies);
  const confirmed = state === 'online' && inGame && activeStepId === step.id && questInstruction?.stepId === step.id;
  const stages = step.questStages?.stages.slice().sort((a, b) => a.at - b.at) ?? [];
  const stageIndex = confirmed ? stages.findIndex((s) => s.at === questInstruction.stageAt) : -1;
  // A step with no place on the map (set up the client, read a guide) has no "Where" card at all.
  const target = toInGameTarget(step);

  useEffect(() => setSlot(document.getElementById('la-hotbar-slot')), []);

  // P, T and D switch to the reference views; never while typing or while a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      const hit = VIEWS.find((v) => v.key?.toLowerCase() === e.key.toLowerCase());
      if (!hit) return;
      e.preventDefault();
      setView(hit.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setView('steps'), [step.id]);
  // A picked ribbon brings its view to the top of the page (the step's heading stays one scroll away).
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    const panel = document.getElementById(view === 'wiki' ? 'step-view-wiki' : 'step-view-panel');
    panel?.parentElement?.scrollTo({ top: panel.offsetTop - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [view]);
  // A dossier pinned to the book opens on its ribbon when something is picked in a step.
  useEffect(() => {
    if (pinned && chosen) setView('wiki');
  }, [pinned, chosen]);

  const live = enabled && !closed;
  const game = live
    ? confirmed && sub?.target
      ? () => void navigate({ ...sub.target!, stepId: step.id })
      : target
        ? () => void pointInGame(step)
        : undefined
    : undefined;
  const hotbar = (
    <Hotbar
      handlers={{
        prev: prev && (() => onSelect(prev.id)),
        next: next && (() => onSelect(next.id)),
        fix: closed ? undefined : canFix ? () => void fix() : openPrep,
        start: live && target ? () => void pointInGame(step) : undefined,
        game,
        done: closed ? undefined : () => onDone(step.id),
        map: target ? () => { setView('travel'); setMapRequest((n) => n + 1); } : undefined,
        skip: step.optional && !closed ? () => setStep(step.id, 'skipped') : undefined,
        remove: status === 'done' || status === 'skipped' ? () => setStep(step.id, null) : undefined,
      }}
      titles={{
        prev: prev && `Previous step: ${prev.title}`,
        next: next && `Next step: ${next.title}`,
        fix: canFix ? 'Fix: go and get what is missing' : 'Open the preparation',
        start: 'Start the step: the arrow and the route lead to it in RuneLite',
        game: 'Show the current line of the step in the game',
        done: nextId ? 'Mark as done and open the next step' : 'Mark as done',
        map: 'Open the world map of the step',
        skip: 'Skip this optional step',
        remove: 'Remove the done or skipped mark',
      }}
    />
  );

  return (
    <Page side="r" className={`workspace cockpit ${step.membersOnly ? 'is-members' : ''} ${busy ? 'is-switching' : ''}`} label="Current step">
      <div className="la-ribbons" role="tablist" aria-label="Step views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            id={`step-view-${v.id}`}
            aria-selected={view === v.id}
            aria-controls="step-view-panel"
            aria-keyshortcuts={v.key}
            title={v.key ? `${v.title} (${v.key})` : v.title}
            className={`la-rbn ${view === v.id ? 'la-on' : ''}`}
            onClick={() => setView(v.id)}
          >
            {v.title}
          </button>
        ))}
      </div>
      <div className="la-scroll" ref={scrollRef} aria-busy={busy}>
        {notices}
        <Eyebrow>
          CHAPTER {roman(step.stage)} · STEP {position.at + 1} OF {position.total} · {TYPE_LABEL[step.type].toUpperCase()}
        </Eyebrow>
        <h1 className="la-t step-view-title" id="step-view-title" tabIndex={-1}>{step.title}</h1>
        <div className="la-chips">
          <code className="la-chip step-id">{step.id}</code>
          {!!step.qp && <span className="la-chip">{step.qp} QP</span>}
          {step.membersOnly && <span className="la-chip">MEMBERS</span>}
          {step.bondBranch ? <span className="la-chip">OPTIONAL · BOND BRANCH</span> : step.optional ? <span className="la-chip">OPTIONAL</span> : null}
          {suggested && !closed && <span className="la-chip la-e">CURRENT STEP</span>}
          {closed && <span className="la-chip">{status === 'skipped' ? 'SKIPPED' : 'DONE'}</span>}
        </div>
        {blockers && <p className="step-blocked"><IconLock /> First: {blockerParts(blockers).join(', ')}</p>}
        {stageIndex >= 0 && (
          <section className="quest-cursor-progress" aria-label="Quest stage progress">
            <div><span>{questInstruction?.peeking ? 'Instruction preview' : 'Quest progress'}</span><span>{questInstruction?.peeking ? 'Viewing' : 'Stage'} {stageIndex + 1} of {stages.length}</span></div>
            <div className="quest-cursor-segments" aria-hidden="true">{stages.map((stage, i) => <span key={stage.at} className={i < stageIndex && !questInstruction?.peeking ? 'is-past' : i === stageIndex ? 'is-now' : ''} />)}</div>
          </section>
        )}
        {recovery && <div className="cockpit-recovery"><StepStatus step={step} headline onPrep={openPrep} /></div>}
        {!recovery && (
          <div className="la-plaque">
            <div className="la-shield" aria-hidden="true">
              <svg width="30" height="34" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2l9 3.500v7c0 6-4 10-9 13-5-3-9-7-9-13v-7z" />
                <path d="M8 13l3 3 5-6" />
              </svg>
            </div>
            <div>
              <b>READINESS</b>
              <StepStatus step={step} headline noStart quiet onPrep={openPrep} />
            </div>
          </div>
        )}
        <div className="la-now">
          <CurrentAction step={step}>
            <div className="la-acts action-row">
              <ShowInGame step={step} />
              <StepDone step={step} onDone={onDone} nextId={nextId} />
            </div>
          </CurrentAction>
        </div>
        <StepBody step={step} onDone={onDone} nextId={nextId} tab="safety" />
        <div className="la-view" id="step-view-panel" role="tabpanel" aria-labelledby={`step-view-${view}`}>
          {view === 'steps' && <StepBody step={step} onDone={onDone} nextId={nextId} tab="steps" onPrep={openPrep} safetyShown noAside noManual />}
          {view === 'prep' && (
            <>
              <QuestSupplies step={step} />
              <StepBody step={step} onDone={onDone} nextId={nextId} tab="prep" onPrep={openPrep} safetyShown />
            </>
          )}
          {view === 'travel' && (
            <>
              {target && (
                <section className="quest-panel cockpit-where-card" aria-label="Where">
                  <header className="quest-panel-heading"><h3>Where</h3></header>
                  <TravelTip step={step} />
                  <StepMap step={step} shownTarget={live ? target.worldPoint : null} mapRequest={mapRequest} />
                </section>
              )}
              <StepBody step={step} onDone={onDone} nextId={nextId} tab="travel" onPrep={openPrep} safetyShown />
            </>
          )}
          {view === 'details' && (
            <>
              <QuestReward step={step} />
              <StepBody step={step} onDone={onDone} nextId={nextId} tab="details" onPrep={openPrep} safetyShown />
            </>
          )}
        </div>
        {/* The dossier's place stays mounted, so a step's item or NPC can be pinned from the drawer at any time. */}
        <div id="step-view-wiki" hidden={view !== 'wiki'}>
          {!pinned && (
            <div className="dock-empty">
              <p className="dock-empty-title">OSRS Wiki dossier</p>
              <p className="muted small">Click an item or NPC in a step: its dossier opens over the page, and "Pin to the side" keeps it on this ribbon.</p>
            </div>
          )}
          <WikiDock className="la-dock" />
        </div>
      </div>
      {slot && createPortal(hotbar, slot)}
    </Page>
  );
}
