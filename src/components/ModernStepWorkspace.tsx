// Presentation only: the existing step bodies, preparation engine and navigation actions remain authoritative.
import { useId, useState } from 'react';
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
import { useSubStep } from './SubStepHero';
import { NavigateButton } from './NavigateButton';
import { toInGameTarget } from '../services/runeliteBridge';

const VIEWS: { id: StepTab; title: string; hint: string }[] = [
  { id: 'prep', title: 'Preparation', hint: 'Items, gear and training' },
  { id: 'steps', title: 'Steps', hint: 'Walkthrough and dialogue' },
  { id: 'travel', title: 'Travel', hint: 'Navigation and transport' },
  { id: 'details', title: 'Details', hint: 'Requirements and rewards' },
];

export function ModernStepWorkspace({ step, suggested, onDone, nextId }: { step: Step; suggested: boolean; onDone: (id: string) => void; nextId?: string }) {
  const { progress, qp } = useStore();
  const { enabled, pointInGame, questInstruction, state, inGame, activeStepId } = useBridge();
  const sub = useSubStep(step);
  const readiness = useReadiness(step);
  const recovery = useReadinessEngine().plan(step, { ahead: 0 }).recovery;
  const [open, setOpen] = useState<StepTab | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const id = useId();
  const closed = isClosed(progress, step.id);
  const blockers = closed ? null : blockersOf(step, progress, qp);
  const confirmed = state === 'online' && inGame && activeStepId === step.id && questInstruction?.stepId === step.id;
  const stages = step.questStages?.stages.slice().sort((a, b) => a.at - b.at) ?? [];
  const stageIndex = confirmed ? stages.findIndex(s => s.at === questInstruction.stageAt) : -1;
  const preparation = closed ? 'Step completed' : readiness?.status === 'READY' ? 'Ready to set off'
    : readiness?.status === 'UNKNOWN' || !readiness ? 'Not everything is checked'
      : readiness.problems.length ? `${readiness.problems.length} requirements need attention` : 'Review requirements';
  const show = async () => {
    setSending(true);
    const result = await pointInGame(step);
    setProblem(result === 'ok' ? '' : result === 'offline' ? 'RuneLite is offline. Target saved.' : 'No game target is available for this step.');
    setSending(false);
  };

  return <div className="workspace modern-workspace">
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
    <CurrentAction step={step}>
      {!closed && enabled && (confirmed && sub?.target
        ? <NavigateButton target={{ ...sub.target, stepId: step.id }} label="Show in game" className="modern-primary-nav" />
        : toInGameTarget(step) && <button type="button" className="btn btn-primary modern-show" disabled={sending} onClick={() => void show()}>{sending ? 'Sending…' : 'Show in game'} <IconChevron /></button>)}
      {problem && <p className="small muted" role="status">{problem}</p>}
    </CurrentAction>
    <StepBody step={step} onDone={onDone} nextId={nextId} tab="safety" />
    {recovery && <StepStatus step={step} headline onPrep={() => setOpen('prep')} />}
    <div className="modern-disclosures" role="tablist" aria-label="Step views" onKeyDown={e => {
      const current = VIEWS.findIndex(v => v.id === open);
      const next = e.key === 'ArrowRight' ? (current + 1) % VIEWS.length : e.key === 'ArrowLeft' ? (current + VIEWS.length - 1) % VIEWS.length : e.key === 'Home' ? 0 : e.key === 'End' ? VIEWS.length - 1 : -1;
      if (next < 0) return;
      e.preventDefault(); setOpen(VIEWS[next].id); document.getElementById(`${id}-${VIEWS[next].id}`)?.focus();
    }}>
      {VIEWS.map(v => <section key={v.id} className={`modern-disclosure ${v.id === 'prep' ? 'modern-preparation' : ''} ${open === v.id ? 'is-open' : ''}`}>
        <button type="button" role="tab" aria-label={v.title} aria-selected={open === v.id} className="modern-disclosure-button" id={`${id}-${v.id}`} aria-expanded={open === v.id} aria-controls={`${id}-${v.id}-panel`} onClick={() => setOpen(open === v.id ? null : v.id)}>
          {v.id === 'prep' && <TypeIcon type="prep" />}
          <span><strong>{v.title}</strong><span className="muted small">{v.id === 'prep' ? preparation : v.hint}</span></span>
          <IconChevron className={open === v.id ? 'modern-fold-open' : ''} />
        </button>
        {open === v.id && <div className="workspace-panel" id={`${id}-${v.id}-panel`} role="tabpanel" aria-labelledby={`${id}-${v.id}`}>
          {v.id === 'prep' && !recovery && <StepStatus step={step} headline onPrep={() => setOpen('prep')} />}
          <StepBody step={step} onDone={onDone} nextId={nextId} tab={v.id} onPrep={() => setOpen('prep')} safetyShown />
        </div>}
      </section>)}
    </div>
    {nextId && <a className="modern-next" href={`#/step/${nextId}`}><span className="eyebrow">Up next</span><span>{stepById.get(nextId)?.title ?? nextId}</span><IconChevron /></a>}
    {closed && <p className="modern-completed muted small"><IconCheck /> Completed. Open Steps to review or remove the mark.</p>}
  </div>;
}
