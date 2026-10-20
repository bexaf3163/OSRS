// The combat plan of a training step (2.69). The guide selects the recommended plan by itself (playerStateContext, lib/combatRoute/selection.ts): the step's
// instructions, the arrow, preparation, shopping and the game already follow it, so nothing here needs a press to become useful. The status line names the
// plan with one short reason; "Why this plan?" holds the comparison, and any other plan can be chosen there. A choice of the player's stays; a clearly
// better plan is then offered, never forced. The step is never completed by a plan: its goal is the route's.

import type { Step } from '../types';
import { usePlayerState, type CombatPlanEntry } from '../playerStateContext';
import { formatGp } from '../lib/shopping';
import { planWhy, type EvaluatedPlan } from '../lib/combatRoute/plans';

export interface CombatRouteState {
  entry: CombatPlanEntry | null;
  /** The player's choice; null goes back to the recommendation. */
  choose: (key: string | null) => void;
}

/** The plan in effect for a step, from the one shared selection. */
export function useCombatRoute(step: Step): CombatRouteState {
  const { combatPlans, choosePlan } = usePlayerState();
  return { entry: combatPlans[step.id] ?? null, choose: (k) => choosePlan(step.id, k) };
}

const minutesText = (m: number) => {
  const r = m < 10 ? Math.round(m) : Math.round(m / 5) * 5;
  return r >= 120 ? `${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60} min` : ''}` : `${r} min`;
};
const gp = (n: number) => `${n < 0 ? '−' : ''}${formatGp(Math.abs(Math.round(n)))} gp`;
const titleOf = (p: EvaluatedPlan) => (p.id === 'route' ? 'The route as written' : p.title);

function PlanRow({ p, now, recommended, onUse }: { p: EvaluatedPlan; now: boolean; recommended: boolean; onUse: () => void }) {
  return (
    <li className={`combat-plan-row${now ? ' is-now' : ''}`}>
      <p className="small">
        <strong>{titleOf(p)}</strong>{now && <span className="muted"> · in use</span>}{recommended && !now && <span className="muted"> · recommended</span>}
        {!p.eligible && <span className="muted"> · not offered: {p.blockers[0]}</span>}
        {p.eligible && !now && <> <button type="button" className="btn btn-ghost btn-sm" onClick={onUse}>Use this instead</button></>}
      </p>
      <p className="small muted">
        {minutesText(p.minutes.mid)} ({minutesText(p.minutes.low)} to {minutesText(p.minutes.high)}) · food about {Math.round(p.food.mid / 5) * 5}{p.foodCost !== null ? ` (${gp(p.foodCost)})` : ''}
        {p.income.net > 0 ? ` · drops sold about ${gp(p.income.net)} (an estimate)` : ''}
      </p>
      <p className="small muted">{p.phases.map((x) => x.text).join(' → ')}</p>
      {p.income.lines.filter((l) => l.counted && l.note).map((l) => <p key={l.name} className="small muted">{l.name}: {l.note}.</p>)}
      {p.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
      {p.risks.map((r) => <p key={r} className="small muted">⚠ {r}</p>)}
    </li>
  );
}

/** "Why this plan?": the comparison the plan was chosen from, with a way to choose another one. */
export function CombatRoute({ step }: { step: Step }) {
  const { entry, choose } = useCombatRoute(step);
  if (!entry || entry.report.plans.length < 2) return null;
  const { report, selection, lastKnown } = entry;
  const recommended = report.plans.find((p) => p.key === selection.recommended);
  return (
    <section className="combat-route" aria-label="Combat plan">
      <details className="zen-more combat-route-details" data-step={step.id}>
        <summary className="small">Why this plan?</summary>
        <p className="small">
          For {report.objective}. Estimated for your {lastKnown ? 'last known ' : ''}levels, XP and worn gear, with the same combat model as the food plan; the walk between
          spots counts. {report.reason}
        </p>
        <ul className="combat-plan-rows">
          {report.plans.map((p) => <PlanRow key={p.key} p={p} now={p.key === selection.key} recommended={p.key === selection.recommended} onUse={() => choose(p.key)} />)}
        </ul>
        {selection.source === 'player' && recommended && (
          <p className="small"><button type="button" className="btn btn-ghost btn-sm" onClick={() => choose(null)}>Follow the recommendation</button> <span className="muted">({titleOf(recommended)})</span></p>
        )}
        <p className="small muted">
          Compared: {report.compared.join(', ')}. The Big bones the step asks for are kept. Optional drops are not counted as income from XP training.
          Defence training {report.plans.some((p) => p.id === 'defence-first' && p.blockers.some((b) => /keeps Defence at 1/.test(b))) ? 'is off: you keep Defence at 1 (Settings)' : 'is compared like any other plan (you can switch it off in Settings)'}.
        </p>
      </details>
    </section>
  );
}

/** Open the step's "Why this plan?" folds once the view holding them is on screen (it may be drawn a moment after the press). */
function openWhyFolds(stepId: string, tries = 10) {
  const folds = document.querySelectorAll<HTMLDetailsElement>(`.combat-route-details[data-step="${stepId}"]`);
  const shown = [...folds].filter((d) => d.offsetParent !== null);
  if (!shown.length) {
    if (tries > 0) window.setTimeout(() => openWhyFolds(stepId, tries - 1), 50);
    return;
  }
  for (const d of shown) d.open = true;
  shown[0].scrollIntoView({ block: 'nearest' });
}

/**
 * One line for the step's status: the plan in effect and why, in one sentence. Silent when the route as written is the plan and no other was even close.
 * A better plan waiting for the next bank trip, or offered against the player's own choice, is said here too.
 */
export function CombatRouteLine({ step, onOpen }: { step: Step; onOpen: () => void }) {
  const { entry, choose } = useCombatRoute(step);
  if (!entry) return null;
  const { report, selection } = entry;
  const plan = report.plans.find((p) => p.key === selection.key);
  const pending = selection.pending ? report.plans.find((p) => p.key === selection.pending) : undefined;
  const offer = selection.offer ? report.plans.find((p) => p.key === selection.offer) : undefined;
  if (!plan || (plan.id === 'route' && selection.source === 'auto' && !pending)) return null;
  const why = pending ? `From your next bank trip: ${titleOf(pending)}. ${planWhy(report, pending.key, 'auto').replace(/^Recommended for your levels and kit: /, '')}`
    : planWhy(report, plan.key, selection.source);
  return (
    <div className="status-combat-route" role="status">
      <p className="small">
        <span aria-hidden="true">⚔️</span> <strong>{selection.source === 'player' ? 'Your plan' : 'Plan'}: {titleOf(plan)}.</strong> <span className="muted">{why}</span>
        {' '}<button type="button" className="btn btn-link btn-sm" onClick={() => { onOpen(); openWhyFolds(step.id); }}>Why this plan?</button>
      </p>
      {offer && (
        <p className="small">
          <span className="muted">Looks better now: {titleOf(offer)}.</span>{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => choose(null)}>Use it</button>
        </p>
      )}
    </div>
  );
}
