// The Path workspace of one step as a cockpit: what to do now and the walkthrough, what the stage needs and whether you have it, where it is and
// what it pays - all on one screen, without tabs. The long reference views (Preparation, Travel, Details) slide in over it on P, T and D.
// Presentation only: the step bodies, the preparation engine and the navigation actions are the existing ones.

import { useEffect, useState } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { useReadinessEngine } from '../readinessContext';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { toInGameTarget } from '../services/runeliteBridge';
import { TYPE_LABEL, TypeIcon, IconLock } from './Icons';
import { CurrentAction } from './StepWorkspace';
import { StepBody, type StepTab } from './StepCard';
import { StepStatus } from './StepStatus';
import { QuestReward, QuestSupplies } from './QuestPreparation';
import { StepDrawer } from './StepDrawer';
import { StepMap } from './StepMap';
import { TravelTip } from './TravelTip';
import { ShowInGame } from './ShowInGame';
import { StepDone } from './StepDone';

type View = Exclude<StepTab, 'steps'>;

const VIEWS: { id: View; title: string; key: string }[] = [
  { id: 'prep', title: 'Preparation', key: 'P' },
  { id: 'travel', title: 'Travel', key: 'T' },
  { id: 'details', title: 'Details', key: 'D' },
];

export function CockpitWorkspace({ step, suggested, onDone, nextId }: { step: Step; suggested: boolean; onDone: (id: string) => void; nextId?: string }) {
  const { progress, qp } = useStore();
  const { questInstruction, state, inGame, activeStepId } = useBridge();
  const recovery = useReadinessEngine().plan(step, { ahead: 0 }).recovery;
  const [view, setView] = useState<View | null>(null);
  const closed = isClosed(progress, step.id);
  const blockers = closed ? null : blockersOf(step, progress, qp);
  const confirmed = state === 'online' && inGame && activeStepId === step.id && questInstruction?.stepId === step.id;
  const stages = step.questStages?.stages.slice().sort((a, b) => a.at - b.at) ?? [];
  const stageIndex = confirmed ? stages.findIndex((s) => s.at === questInstruction.stageAt) : -1;

  // P, T and D open the reference views, Esc (the dialog's own) closes them; never while typing or while another panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      const hit = VIEWS.find((v) => v.key.toLowerCase() === e.key.toLowerCase());
      if (!hit) return;
      e.preventDefault();
      setView(hit.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setView(null), [step.id]);

  const open = VIEWS.find((v) => v.id === view);
  // A step with no place on the map (set up the client, read a guide) has no "Where" card at all.
  const hasPlace = !!toInGameTarget(step);
  const where = <>
    {hasPlace && (
      <section className="quest-panel cockpit-where-card" aria-label="Where">
        <header className="quest-panel-heading"><h3>Where</h3></header>
        <TravelTip step={step} />
        <StepMap step={step} />
        <button type="button" className="btn btn-sm" onClick={() => setView('travel')}>Travel and directions</button>
      </section>
    )}
    <QuestReward step={step} />
  </>;

  return <div className="workspace cockpit">
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
    {recovery && <div className="cockpit-recovery"><StepStatus step={step} headline onPrep={() => setView('prep')} /></div>}

    <div className="cockpit-grid">
      <div className="cockpit-now">
        <CurrentAction step={step}><div className="action-row"><ShowInGame step={step} /><StepDone step={step} onDone={onDone} nextId={nextId} /></div></CurrentAction>
        <StepBody step={step} onDone={onDone} nextId={nextId} tab="safety" />
        <nav className="cockpit-views" aria-label="Step views">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className="btn btn-ghost btn-sm" aria-haspopup="dialog" aria-keyshortcuts={v.key} title={`${v.title} (${v.key})`} onClick={() => setView(v.id)}>
              {v.title}
            </button>
          ))}
        </nav>
      </div>

      <div className="cockpit-walk">
        <StepBody step={step} onDone={onDone} nextId={nextId} tab="steps" onPrep={() => setView('prep')} safetyShown noAside noManual />
      </div>

      <div className="cockpit-bag">
        {!recovery && <StepStatus step={step} headline noStart quiet onPrep={() => setView('prep')} />}
        <QuestSupplies step={step} onReview={() => setView('prep')} />
      </div>

      <div className="cockpit-where">{where}</div>
    </div>

    <StepDrawer open={!!open} title={open?.title ?? ''} onClose={() => setView(null)}>
      {view && <StepBody step={step} onDone={onDone} nextId={nextId} tab={view} onPrep={() => setView('prep')} safetyShown />}
    </StepDrawer>
  </div>;
}
