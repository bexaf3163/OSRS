// The compact Path view: the companion strip, a narrow window kept next to the game (Now, Bag, Route, More).
// It is the same state as the big window; the route rail and the long reference views are one click away through "Full workspace".

import { useEffect, useRef, useState } from 'react';
import { stepById } from '../data';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { firstOpen, nextStep, openAfter } from '../lib/next-step';
import { IconChevron } from '../components/Icons';
import { CompanionStrip } from '../components/CompanionStrip';
import { AccountSync } from '../components/AccountSync';
import { TrackedSkillCard } from '../components/TrackedSkillCard';

export function PathCompact({ focusStep }: { focusStep?: string }) {
  const { progress, qp, steps, setStep } = useStore();
  const { advance } = useBridge();
  const suggested = nextStep(steps, progress, qp) ?? firstOpen(steps, progress) ?? steps[steps.length - 1];
  const [selectedId, setSelectedId] = useState(() => focusStep ?? suggested.id);
  const selected = steps.find((s) => s.id === selectedId) ?? suggested;
  const at = steps.findIndex((s) => s.id === selected.id);
  const upcoming = openAfter(steps, progress, selected.id);

  // A link to a step (#/step/S3-05) picks it; the step done in the game moves on, as the "Mark as done" button does.
  useEffect(() => {
    if (focusStep && stepById.has(focusStep)) setSelectedId(focusStep);
  }, [focusStep]);
  const seen = useRef(advance?.nonce);
  useEffect(() => {
    if (!advance || advance.nonce === seen.current) return;
    seen.current = advance.nonce;
    if (advance.to && stepById.has(advance.to)) setSelectedId(advance.to);
  }, [advance]);

  const complete = (id: string) => {
    const next = openAfter(steps, progress, id);
    setStep(id, 'done');
    if (next) setSelectedId(next.id);
  };

  return (
    <div className="page compact-page">
      <h1 className="visually-hidden">Path</h1>
      <AccountSync compact />
      <TrackedSkillCard />
      <article className="step-view" key={selected.id}>
        <CompanionStrip step={selected} suggested={selected.id === suggested.id} onDone={complete} nextId={upcoming?.id} onSelect={setSelectedId} />
        <footer className="step-view-nav">
          {steps[at - 1]
            ? <button type="button" className="btn btn-ghost" onClick={() => setSelectedId(steps[at - 1].id)}><IconChevron className="flip" /> {steps[at - 1].id}</button>
            : <span />}
          {selected.id !== suggested.id
            ? <button type="button" className="btn btn-ghost" onClick={() => setSelectedId(suggested.id)}>To the current step</button>
            : <span />}
          {steps[at + 1]
            ? <button type="button" className="btn btn-ghost" onClick={() => setSelectedId(steps[at + 1].id)}>{steps[at + 1].id} <IconChevron /></button>
            : <span />}
        </footer>
      </article>
    </div>
  );
}
