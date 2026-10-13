// Presentation only: the existing step bodies, preparation engine and navigation actions remain authoritative.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Step } from '../types';
import { stepById } from '../data';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { useReadiness, useReadinessEngine } from '../readinessContext';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { TYPE_LABEL, TypeIcon, IconChevron, IconCheck, IconLock } from './Icons';
import { CurrentAction } from './StepWorkspace';
import { StepBody, type StepTab } from './StepCard';
import { StepStatus } from './StepStatus';
import { QuestPreparation } from './QuestPreparation';
import { useSubStep } from './SubStepHero';
import { NavigateButton } from './NavigateButton';
import { toInGameTarget } from '../services/runeliteBridge';

const VIEWS: { id: StepTab; title: string }[] = [
  { id: 'steps', title: 'Steps' },
  { id: 'prep', title: 'Preparation' },
  { id: 'travel', title: 'Travel' },
  { id: 'details', title: 'Details' },
];

/** Room for the action with the "what you need" list beside it, in rem so that large text counts. Narrower — the list sits inside Steps. */
const SPLIT_REM = 58;

/** Whether there is room for the side column; measured on the column the workspace stands in (a pinned dossier takes width too), not on the workspace, whose own width depends on the answer. */
function useSplit() {
  const ref = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const update = () => setSplit(el.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize) >= SPLIT_REM);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(update);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return [ref, split] as const;
}

export function ModernStepWorkspace({ step, suggested, onDone, nextId }: { step: Step; suggested: boolean; onDone: (id: string) => void; nextId?: string }) {
  const { progress, qp } = useStore();
  const { enabled, pointInGame, questInstruction, state, inGame, activeStepId } = useBridge();
  const sub = useSubStep(step);
  const readiness = useReadiness(step);
  const plan = useReadinessEngine().plan(step, { ahead: 0 });
  const recovery = plan.recovery;
  // The walkthrough is what the player came for: it is open from the start, the other views are one click away.
  const [open, setOpen] = useState<StepTab>('steps');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const [ref, wide] = useSplit();
  const id = useId();
  const closed = isClosed(progress, step.id);
  const blockers = closed ? null : blockersOf(step, progress, qp);
  const confirmed = state === 'online' && inGame && activeStepId === step.id && questInstruction?.stepId === step.id;
  const stages = step.questStages?.stages.slice().sort((a, b) => a.at - b.at) ?? [];
  const stageIndex = confirmed ? stages.findIndex(s => s.at === questInstruction.stageAt) : -1;
  const attention = closed ? 0 : readiness?.problems.length ?? 0;
  // The side column is drawn only when it has something to say: things to bring, a budget, a blocker or a reward.
  const split = wide && (!!step.reward || (step.qp ?? 0) > 0 || (!closed && (plan.lines.some(l => l.timing === 'NOW') || plan.coins.need > 0 || plan.blockers.length > 0)));
  const show = async () => {
    setSending(true);
    const result = await pointInGame(step);
    setProblem(result === 'ok' ? '' : result === 'offline' ? 'RuneLite is offline. Target saved.' : 'No game target is available for this step.');
    setSending(false);
  };
  const toPrep = () => {
    setOpen('prep');
    document.getElementById(`${id}-prep`)?.scrollIntoView({ block: 'nearest' });
  };

  return <div className={`workspace modern-workspace ${split ? 'is-split' : ''}`} ref={ref}>
    <header className="step-view-head">
      <span className="modern-quest-icon" aria-hidden="true"><TypeIcon type={step.type} /></span>
      <div>
        <p className="eyebrow">{TYPE_LABEL[step.type]} · Route stage {step.stage}{step.membersOnly ? ' · Members' : ''}{step.optional ? ' · Optional' : ''}</p>
        <h2 className="step-view-title" id="step-view-title" tabIndex={-1}>{step.title}</h2>
      </div>
      <code className="code step-id">{step.id}</code>
    </header>
    {blockers && <p className="step-blocked"><IconLock />First: {blockerParts(blockers).join(', ')}</p>}
    {suggested && !closed && <span className="visually-hidden">Current step by the plan</span>}
    {stageIndex >= 0 && <section className="quest-cursor-progress" aria-label="Quest stage progress">
      <div><span>{questInstruction?.peeking ? 'Instruction preview' : 'Quest progress'}</span><span>{questInstruction?.peeking ? 'Viewing' : 'Stage'} {stageIndex + 1} of {stages.length}</span></div>
      <div className="quest-cursor-segments" aria-hidden="true">{stages.map((stage, i) => <span key={stage.at} className={i < stageIndex && !questInstruction?.peeking ? 'is-past' : i === stageIndex ? 'is-now' : ''} />)}</div>
    </section>}
    <div className="modern-columns">
      <div className="modern-main">
        <CurrentAction step={step}>
          {!closed && enabled && (confirmed && sub?.target
            ? <NavigateButton target={{ ...sub.target, stepId: step.id }} label="Show in game" className="modern-primary-nav" />
            : toInGameTarget(step) && <button type="button" className="btn btn-primary modern-show" disabled={sending} onClick={() => void show()}>{sending ? 'Sending…' : 'Show in game'} <IconChevron /></button>)}
          {problem && <p className="small muted" role="status">{problem}</p>}
        </CurrentAction>
        <StepBody step={step} onDone={onDone} nextId={nextId} tab="safety" />
        {recovery && <StepStatus step={step} headline onPrep={toPrep} />}
        <div className="modern-tabs" role="tablist" aria-label="Step views" onKeyDown={e => {
          const current = VIEWS.findIndex(v => v.id === open);
          const next = e.key === 'ArrowRight' ? (current + 1) % VIEWS.length : e.key === 'ArrowLeft' ? (current + VIEWS.length - 1) % VIEWS.length : e.key === 'Home' ? 0 : e.key === 'End' ? VIEWS.length - 1 : -1;
          if (next < 0) return;
          e.preventDefault(); setOpen(VIEWS[next].id); document.getElementById(`${id}-${VIEWS[next].id}`)?.focus();
        }}>
          {VIEWS.map(v => <button key={v.id} type="button" role="tab" aria-label={v.title} aria-selected={open === v.id} aria-controls={`${id}-panel`}
            className={`modern-tab ${open === v.id ? 'is-active' : ''}`} id={`${id}-${v.id}`} onClick={() => setOpen(v.id)}>
            {v.title}
            {v.id === 'prep' && attention > 0 && <span className="modern-tab-badge" title="Requirements that need attention">{attention}</span>}
          </button>)}
        </div>
        <div className="workspace-panel" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${open}`}>
          {open === 'prep' && !recovery && <StepStatus step={step} headline onPrep={toPrep} />}
          <StepBody step={step} onDone={onDone} nextId={nextId} tab={open} onPrep={toPrep} safetyShown noAside={split} />
        </div>
      </div>
      {split && <div className="modern-rail"><QuestPreparation step={step} onReview={toPrep} /></div>}
    </div>
    {nextId && <a className="modern-next" href={`#/step/${nextId}`}><span className="eyebrow">Up next</span><span>{stepById.get(nextId)?.title ?? nextId}</span><IconChevron /></a>}
    {closed && <p className="modern-completed muted small"><IconCheck /> Completed. The mark can be removed at the end of Steps.</p>}
  </div>;
}
