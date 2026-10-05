// "Readiness for a step": a traffic light and what to do before setting off — each problem has its own action.
// The calculation is lib/readiness.ts; here only the display. A step without requirements and items gets no panel.

import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed } from '../lib/next-step';
import { STATUS_TEXT, type ReadinessAction, type RequirementStatus, type StepReadiness } from '../lib/readiness';
import { useReadiness, useReadinessEngine } from '../readinessContext';
import { NavigateButton } from './NavigateButton';
import { PrepRouteBlock } from './PrepRoute';

export { useReadiness };

const MARK: Record<RequirementStatus['state'], string> = { OK: '✓', BANK: '🏦', PARTIAL: '◐', MISSING: '✗', UNKNOWN: '?' };

function Action({ a }: { a: ReadinessAction }) {
  if (a.kind === 'nav') return <NavigateButton target={a.target} label={a.label} />;
  return <a className="btn btn-ghost btn-sm" href={a.href}>{a.label}</a>;
}

function Row({ r }: { r: RequirementStatus }) {
  return (
    <li className={`ready-row is-${r.state.toLowerCase()}`}>
      <span className="ready-mark" aria-hidden="true">{MARK[r.state]}</span>
      <span className="ready-text">
        <strong>{r.label}</strong>
        {!r.hard && <span className="muted"> · during the quest</span>}
        {r.detail && <span className="muted"> — {r.detail}</span>}
      </span>
      {r.action && <span className="ready-action"><Action a={r.action} /></span>}
    </li>
  );
}

/** "✓ The step goal is already met": the levels are not below the goal — no need to train again, the step can be closed. */
function GoalMet({ step, r }: { step: Step; r: StepReadiness }) {
  const { setStep } = useStore();
  if (!r.goalMet) return null;
  const fromGame = r.goalMet.every((g) => g.source === 'game');
  return (
    <section className="readiness is-ready" aria-label="Step goal">
      <p className="readiness-head" role="status">
        🟢 <strong>The step goal is already met</strong>: {r.goalMet.map((g) => `${g.skill} ${g.have} (need ${g.level})`).join(', ')}
        <span className="muted"> — {fromGame ? 'by the game data' : 'by the levels from the profile'}. No need to train again.</span>
      </p>
      <div className="actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep(step.id, 'done', `${step.id} closed: the goal is already met`)}>
          ✓ Mark as done
        </button>
      </div>
    </section>
  );
}

/** "🧩 The chain to readiness": what to complete in order for the step to open (up to three links deep). */
function Chain({ step }: { step: Step }) {
  const chain = useReadinessEngine().chain(step);
  if (!chain.length) return null;
  return (
    <details className="ready-chain" open>
      <summary className="small">🧩 The chain to readiness: {chain.length + 1} {chain.length === 1 ? 'step' : 'steps'}</summary>
      <ol className="small">
        {chain.map((l) => (
          <li key={l.step.id}>
            <a href={`#/step/${l.step.id}`}><strong>{l.step.id}</strong> {l.step.title}</a>
            {l.why.length > 0 && <span className="muted"> — still needed: {l.why.map((w) => w.label).join(', ')}</span>}
          </li>
        ))}
        <li><strong>{step.id}</strong> {step.title} — this step</li>
      </ol>
    </details>
  );
}

export function ReadinessPanel({ step }: { step: Step }) {
  const { progress } = useStore();
  const { navTarget, clearNav } = useBridge();
  const r = useReadiness(step);
  if (!r || isClosed(progress, step.id)) return null;
  if (r.goalMet && !r.problems.length) return <GoalMet step={step} r={r} />;
  if (!r.requirements.length) return null;
  const s = STATUS_TEXT[r.status];
  const detour = navTarget?.stepId === step.id ? navTarget : null;
  const ok = r.requirements.filter((x) => x.state === 'OK');
  return (
    <section className={`readiness is-${r.status.toLowerCase()}`} aria-label="Step readiness">
      <p className="readiness-head" role="status"><span aria-hidden="true">{s.icon}</span> <strong>{s.text}</strong></p>
      {detour && (
        // A detour: the in-game arrow leads for the preparation; when the item is in the bag (or you reach the place),
        // the plugin clears the target by itself, and the arrow returns to this step.
        <p className="small readiness-detour">
          ⚡ Preparation: {detour.label}. We return to {step.id} when {detour.itemName ? `${detour.itemName} is in the bag` : 'you reach the place'}.{' '}
          <button type="button" className="link-btn" onClick={() => void clearNav()}>Return to the step now</button>
        </p>
      )}
      <PrepRouteBlock step={step} />
      {r.problems.length > 0 && <ul className="ready-list">{r.problems.map((x) => <Row key={`${x.kind}-${x.label}`} r={x} />)}</ul>}
      <Chain step={step} />
      {r.unknown.length > 0 && (
        <details className="ready-unknown">
          <summary className="small">⚪ Not checked: {r.unknown.length}</summary>
          <ul className="ready-list">{r.unknown.map((x) => <Row key={`${x.kind}-${x.label}`} r={x} />)}</ul>
        </details>
      )}
      {ok.length > 0 && (
        <p className="small ready-ok">✓ {ok.map((x) => x.label).join(' · ')}</p>
      )}
    </section>
  );
}

/** One line for "What to do now": the traffic light and the main thing that gets in the way. */
export function ReadinessLine({ step }: { step: Step }) {
  const r = useReadiness(step);
  if (r?.goalMet && !r.problems.length) {
    return (
      <p className="readiness-line is-ready">
        🟢 The step goal is already met: {r.goalMet.map((g) => `${g.skill} ${g.have}`).join(', ')} — no need to train again.{' '}
        <a href={`#/step/${step.id}`}>More</a>
      </p>
    );
  }
  if (!r || !r.requirements.length) return null;
  const s = STATUS_TEXT[r.status];
  const first = r.problems[0];
  return (
    <p className={`readiness-line is-${r.status.toLowerCase()}`}>
      <span aria-hidden="true">{s.icon}</span> {s.text}
      {first && <>: <strong>{first.label}</strong>{first.detail ? <span className="muted"> — {first.detail}</span> : null}</>}
      {r.problems.length > 1 && <span className="muted"> (and {r.problems.length - 1} more)</span>}
      {' '}<a href={`#/step/${step.id}`}>More</a>
    </p>
  );
}
