// The Path workspace for one step: what the player is doing right now, whether the companion is connected, whether the step is ready,
// then four views of the same step — Steps, Preparation, Travel, Details. The data and engines are the existing ones;
// this component only decides where each of them is shown.

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { needsReview } from '../lib/review';
import { LINK_LABEL, linkStatus, TARGET_LABEL, targetStatus } from '../lib/linkState';
import { IconCheck, IconLock, IconTalk, TypeIcon, TYPE_LABEL } from './Icons';
import { Inline } from './Inline';
import { StepBody, type StepTab } from './StepCard';
import { StepStatus } from './StepStatus';
import { useSubStep } from './SubStepHero';
import { setFeatures } from '../lib/features';
import { overviewOf } from '../lib/subStep';

const TABS: { id: StepTab; label: string }[] = [
  { id: 'steps', label: 'Steps' },
  { id: 'prep', label: 'Preparation' },
  { id: 'travel', label: 'Travel' },
  { id: 'details', label: 'Details' },
];

/** The place line of a step: where it starts and on which floor. */
export function placeOf(step: Step): string {
  const floor = step.npc?.floor ?? step.floor;
  const where = step.npc?.location ?? step.where ?? '';
  return [where, floor].filter(Boolean).join(' · ');
}

export function CurrentAction({ step, children }: { step: Step; children?: ReactNode }) {
  const { progress } = useStore();
  const { enabled, state, inGame, activeStepId, navTarget } = useBridge();
  const sub = useSubStep(step);
  const closed = isClosed(progress, step.id);
  const link = linkStatus(state, inGame);
  const target = targetStatus(activeStepId === step.id || navTarget?.stepId === step.id, state);
  // The quest's starting NPC is not the location of every later instruction.
  const place = sub ? null : placeOf(step);

  // Live evidence (the arrow follows a line of this step) names the instruction. Without it the card names where the step starts and says so.
  const start = step.npc ? `Talk to ${step.npc.nameEn}` : overviewOf(step)[0]?.title ?? step.quickSteps?.[0] ?? step.title;
  const title = closed ? 'This step is done' : sub ? sub.title : start;
  const kicker = closed ? 'Completed' : sub ? `Instruction ${sub.index} of ${sub.size}` : 'Starting point';

  return (
    <section className={`current-action ${closed ? 'is-done' : ''}`} aria-label="Current action">
      <span className="current-action-icon" aria-hidden="true">{step.npc ? <IconTalk /> : <TypeIcon type={step.type} />}</span>
      <div className="current-action-body">
        <p className="eyebrow">{kicker}</p>
        <h3 className="current-action-title"><Inline text={title} /></h3>
        {place && <p className="current-action-place muted"><Inline text={place} /></p>}
      </div>
      <div className="current-action-side">
      {enabled && !closed && (
        <div className="current-action-link">
          {state === 'online' ? (
            <p className={`link-chip-status is-${link}`} role="status">
              <span aria-hidden="true">{link === 'connected' ? '●' : '○'}</span> {LINK_LABEL[link]}
              {target === 'live' && <> · {TARGET_LABEL.live}</>}
            </p>
          ) : (
            <p className="link-chip-status is-offline" role="status">
              <span aria-hidden="true">⚠</span>{' '}
              {state === 'connecting'
                ? LINK_LABEL.connecting
                : target === 'saved'
                  ? 'RuneLite is offline. Target saved; live guidance is inactive.'
                  : 'RuneLite is offline. Live guidance is inactive.'}
            </p>
          )}
        </div>
      )}
      {children}
      </div>
    </section>
  );
}

export function StepWorkspace({ step, suggested, onDone, nextId, compact = false }: { step: Step; suggested: boolean; onDone: (id: string) => void; nextId?: string; compact?: boolean }) {
  const { progress, qp } = useStore();
  const [tab, setTab] = useState<StepTab>('steps');
  const tabs = compact ? TABS.filter((t) => t.id === 'steps' || t.id === 'prep') : TABS;
  const base = useId();
  const refs = useRef<Partial<Record<StepTab, HTMLButtonElement | null>>>({});
  const status = progress.steps[step.id];
  const blockers = isClosed(progress, step.id) ? null : blockersOf(step, progress, qp);
  const review = needsReview(step, progress);

  const onKey = (e: KeyboardEvent) => {
    const at = tabs.findIndex((t) => t.id === tab);
    let to = at;
    if (e.key === 'ArrowRight') to = (at + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') to = (at + tabs.length - 1) % tabs.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[to].id);
    refs.current[tabs[to].id]?.focus();
  };

  return (
    <div className={compact ? 'workspace is-compact' : 'workspace'}>
      <header className="step-view-head">
        <p className="step-view-kicker">
          <span>Stage {step.stage}</span>
          <span aria-hidden="true">·</span>
          <span>{TYPE_LABEL[step.type]}</span>
          {step.qp ? <span className="badge badge-qp">+{step.qp} QP</span> : null}
          {step.membersOnly && <span className="badge badge-members">Members</span>}
          {step.optional && <span className="tag">optional</span>}
          {status === 'done' && <span className="badge badge-f2p"><IconCheck /> done</span>}
          {status === 'skipped' && <span className="tag">skipped</span>}
          {suggested && status !== 'done' && <span className="badge badge-now">now by the plan</span>}
          {review && <span className="badge badge-review">V2: check</span>}
        </p>
        <h2 className="step-view-title" id="step-view-title" tabIndex={-1}>
          {step.title} <code className="code step-id">{step.id}</code>
        </h2>
        {blockers && <p className="step-blocked"><IconLock />First: {blockerParts(blockers).join(', ')}</p>}
      </header>

      <div className="workspace-top">
        <CurrentAction step={step}><StepStatus step={step} headline onPrep={() => setTab('prep')} /></CurrentAction>
      </div>

      <div className="workspace-tabs" role="tablist" aria-label="Step views" onKeyDown={onKey}>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`${base}-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`${base}-panel`}
            tabIndex={tab === t.id ? 0 : -1} className={`workspace-tab ${tab === t.id ? 'is-active' : ''}`}
            ref={(el) => { refs.current[t.id] = el; }} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="workspace-panel" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${tab}`}>
        <StepBody step={step} onDone={onDone} nextId={nextId} tab={tab} onPrep={() => setTab('prep')} compact={compact} />
      </div>
      {compact && (
        <p className="muted small compact-more">
          Travel, details and the rest are in the <a href={`#/step/${step.id}`} onClick={() => setFeatures({ compact: false })}>full workspace</a>.
        </p>
      )}
    </div>
  );
}
