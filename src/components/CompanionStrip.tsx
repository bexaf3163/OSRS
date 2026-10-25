// The compact view: a narrow panel kept beside the game. Four views of the step the player is on - Now, Bag, Route, More - and nothing else.
// It mirrors the in-game guide (the current action, what you need, the route) on the same state as the big window; it is not a second copy of the data.

import { useState } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useReadinessEngine } from '../readinessContext';
import { useQuestPoints } from '../lib/useQuestPoints';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { overviewCurrent, overviewOf } from '../lib/subStep';
import { IconLock } from './Icons';
import { CurrentAction } from './StepWorkspace';
import { StepBody } from './StepCard';
import { StepStatus } from './StepStatus';
import { QuestReward, QuestSupplies } from './QuestPreparation';
import { ShowInGame } from './ShowInGame';
import { StepDone } from './StepDone';
import { useSubStep } from './SubStepHero';

type Tab = 'now' | 'bag' | 'route' | 'more';
const TABS: { id: Tab; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'bag', label: 'Bag' },
  { id: 'route', label: 'Route' },
  { id: 'more', label: 'More' },
];

/**
 * The next lines: from the line the game confirms, otherwise from the first. The line the headline above already shows (CurrentAction: the
 * confirmed line, "Talk to <NPC>", or the first line as the starting point) is not repeated as the list's first entry.
 */
function Next({ step }: { step: Step }) {
  const sub = useSubStep(step);
  const lines = overviewOf(step);
  const cur = overviewCurrent(lines, sub);
  const all = lines.length ? lines.map((l) => l.title) : step.quickSteps ?? [];
  const headline = sub ? sub.title : step.npc ? `Talk to ${step.npc.nameEn}` : all[0];
  const from = cur ?? 0;
  const next = all.map((t, i) => ({ t, n: i + 1 })).slice(from).filter((x) => x.t !== headline).slice(0, 3);
  if (!next.length) return null;
  const shown = all.slice(from).some((t) => t === headline);
  return (
    <section className="strip-next" aria-label="Next">
      <h3 className="strip-h">{cur !== null || shown ? 'Next' : 'The first lines'}</h3>
      <ol>{next.map((x) => <li key={x.n}><span className="strip-n">{x.n}</span><span>{x.t}</span></li>)}</ol>
    </section>
  );
}

export function CompanionStrip({ step, suggested, onDone, nextId, onSelect }: {
  step: Step; suggested: boolean; onDone: (id: string) => void; nextId?: string; onSelect: (id: string) => void;
}) {
  const { progress, steps } = useStore();
  const qp = useQuestPoints();
  const dependencies = useReadinessEngine().dependencies;
  const [tab, setTab] = useState<Tab>('now');
  const closed = isClosed(progress, step.id);
  const blockers = closed ? null : blockersOf(step, progress, qp, dependencies);
  const stage = steps.filter((s) => s.stage === step.stage);

  return (
    <section className="strip" aria-label="Companion strip">
      <header className="strip-head">
        <h2 className="step-view-title" id="step-view-title" tabIndex={-1}>{step.title}</h2>
        <code className="code step-id">{step.id}</code>
      </header>
      {blockers && <p className="step-blocked"><IconLock />First: {blockerParts(blockers).join(', ')}</p>}
      {suggested && !closed && <span className="visually-hidden">Current step by the plan</span>}
      <div className="strip-tabs" role="tablist" aria-label="Companion views">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`strip-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="strip-panel"
            className={`strip-tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="strip-body" id="strip-panel" role="tabpanel" aria-labelledby={`strip-tab-${tab}`}>
        {tab === 'now' && (
          <>
            <CurrentAction step={step}><ShowInGame step={step} /></CurrentAction>
            <StepBody step={step} onDone={onDone} nextId={nextId} tab="safety" />
            <Next step={step} />
            <QuestSupplies step={step} onReview={() => setTab('bag')} />
            <div className="strip-done"><StepDone step={step} onDone={onDone} nextId={nextId} /></div>
          </>
        )}

        {tab === 'bag' && (
          <>
            <StepStatus step={step} headline noStart onPrep={() => setTab('bag')} />
            <QuestSupplies step={step} />
            {/* QuestSupplies above carries the verdict card: the preparation view below does not repeat it. */}
            <StepBody step={step} onDone={onDone} nextId={nextId} tab="prep" onPrep={() => setTab('bag')} safetyShown statusAbove verdictShown />
          </>
        )}

        {tab === 'route' && (
          <>
            <h3 className="strip-h">Stage {step.stage}</h3>
            <ol className="strip-route">
              {stage.map((s) => {
                const done = isClosed(progress, s.id);
                return (
                  <li key={s.id}>
                    <button type="button" className={`strip-step ${s.id === step.id ? 'is-current' : ''} ${done ? 'is-done' : ''}`}
                      aria-current={s.id === step.id ? 'step' : undefined} onClick={() => { onSelect(s.id); setTab('now'); }}>
                      <span className="strip-n">{done ? '✓' : s.id.slice(-2)}</span>
                      <span>{s.title}{s.optional && <span className="pill"> optional</span>}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <QuestReward step={step} />
          </>
        )}

        {tab === 'more' && (
          <>
            <StepBody step={step} onDone={onDone} nextId={nextId} tab="steps" safetyShown noAside noManual />
            <details className="strip-fold"><summary>Travel</summary><StepBody step={step} onDone={onDone} nextId={nextId} tab="travel" safetyShown /></details>
            <details className="strip-fold"><summary>Details</summary><StepBody step={step} onDone={onDone} nextId={nextId} tab="details" safetyShown /></details>
          </>
        )}
      </div>
    </section>
  );
}
