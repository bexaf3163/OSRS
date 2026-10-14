// The one way to finish a step by hand: "Done" with the name of what comes next, and "Skip" for an optional step.
// The game closes a step by itself when it can confirm it; this is for everything it cannot see.

import type { Step } from '../types';
import { stepById } from '../data';
import { useStore } from '../store';
import { IconCheck } from './Icons';

export function StepDone({ step, onDone, nextId }: { step: Step; onDone: (id: string) => void; nextId?: string }) {
  const { progress, setStep } = useStore();
  const status = progress.steps[step.id];
  const next = nextId ? stepById.get(nextId)?.title : undefined;
  return (
    <div className="manual-complete">
      {status === 'done'
        ? <button type="button" className="btn btn-ghost" onClick={() => setStep(step.id, null)}>Remove the mark</button>
        : (
          <button type="button" className="btn btn-done" onClick={() => onDone(step.id)}>
            <IconCheck /> Done{next && <span className="btn-next"> — next: {next}</span>}
          </button>
        )}
      {step.optional && (status === 'skipped'
        ? <button type="button" className="btn btn-ghost" onClick={() => setStep(step.id, null)}>Return to the plan</button>
        : status !== 'done' && <button type="button" className="btn btn-ghost" onClick={() => setStep(step.id, 'skipped')}>Skip</button>)}
    </div>
  );
}
