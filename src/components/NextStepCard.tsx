// "What to do now" — the main element of the "Path" screen.

import { useStore } from '../store';
import { blockerParts, blockersOf, firstOpen, nextStep } from '../lib/next-step';
import { TypeIcon, TYPE_LABEL } from './Icons';
import { Inline } from './Inline';
import { RangeHints } from './RangeHints';
import { ReadinessLine } from './ReadinessPanel';
import { plural } from '../lib/shopping';

export function NextStepCard({ onDone }: { onDone: (id: string) => void }) {
  const { progress, qp, steps, mode, setStep } = useStore();
  const step = nextStep(steps, progress, qp);

  if (!step) {
    const open = firstOpen(steps, progress);
    if (!open) {
      return (
        <section className="next card is-finished" aria-label="What to do now">
          <p className="eyebrow">The path is complete</p>
          <h2 className="next-title">All {steps.length} {plural(steps.length, 'step is closed', 'steps are closed')}</h2>
          <p className="muted">
            {mode === 'f2p'
              ? 'The F2P route is finished. If you bought a Bond — switch to Members in the header: stages 7–9 will open.'
              : 'Next is free play. The goals and skills stay at hand.'}
          </p>
        </section>
      );
    }
    const b = blockersOf(open, progress, qp);
    return (
      <section className="next card" aria-label="What to do now">
        <p className="eyebrow">What to do now</p>
        <h2 className="next-title">No steps available</h2>
        <p className="muted">
          Next by the plan — <a href={`#/step/${open.id}`}>{open.id} {open.title}</a>
          {b && <>, but first: {blockerParts(b).join(', ')}</>}.
        </p>
      </section>
    );
  }

  const where = step.npc ? `${step.npc.nameEn} — ${step.npc.location}` : step.where;

  return (
    <section className={`next card ${step.membersOnly ? 'is-members' : ''}`} aria-labelledby="next-title">
      <p className="eyebrow">What to do now</p>
      <div className="next-meta">
        <code className="code">{step.id}</code>
        <TypeIcon type={step.type} />
        <span className="muted">{TYPE_LABEL[step.type]} · stage {step.stage}{step.qp ? ` · +${step.qp} QP` : ''}</span>
      </div>
      <h2 className="next-title" id="next-title">{step.title}</h2>
      <dl className="fields">
        {where && <div className="field"><dt>Where</dt><dd><Inline text={where} /></dd></div>}
        {step.npc && <div className="field"><dt>Floor</dt><dd>{step.npc.floor}</dd></div>}
        {step.itemsRequired && step.itemsRequired.length > 0 && (
          <div className="field"><dt>Bring</dt><dd>{step.itemsRequired.map((i) => i.nameEn).join(', ')}</dd></div>
        )}
        <div className="field is-done-when"><dt>Done when</dt><dd><Inline text={step.doneWhen} /></dd></div>
      </dl>
      <RangeHints step={step} />
      <ReadinessLine step={step} />
      <div className="actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => onDone(step.id)}>Mark as done</button>
        {step.optional && (
          <button type="button" className="btn btn-lg" onClick={() => setStep(step.id, 'skipped')}>Skip</button>
        )}
        <a className="btn btn-ghost btn-lg" href={`#/step/${step.id}`}>More</a>
      </div>
      <p className="next-shop muted small"><a href="#/shopping">🛒 Grand Exchange shopping list</a> — buying for several stages at once.</p>
      {step.foes?.length ? (
        <p className="next-shop muted small"><a href="#/gear">⚔️ Gear</a> — what to wear and buy to hit faster on this step.</p>
      ) : null}
    </section>
  );
}
