// "Another way to do this step": the combat plans for a training step side by side (lib/combatRoute/plans.ts), one recommended in a sentence with one button,
// the rest under Details. Advice until the player adopts a plan; an adopted plan then leads the arrow, the shopping list, the food and the game, and
// "Back to the route's plan" puts the route's own back. The step is never completed by a plan: its goal is the route's.

import { useMemo } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { stepsFor } from '../data';
import { useProfiles } from '../lib/profiles';
import { useFeatures } from '../lib/features';
import { useTradeRestriction } from '../lib/useTradeRestriction';
import { isClosed } from '../lib/next-step';
import { stepGoals } from '../lib/combatEstimate';
import { formatGp } from '../lib/shopping';
import { adoptPlan, adoptStorageKey, useAdopted } from '../lib/combatRoute/adopt';
import { estimateContext } from '../lib/combatRoute/context';
import { evaluatePlans, type EvaluatedPlan, type PlanReport } from '../lib/combatRoute/plans';
import { usePriceView } from '../lib/funding/usePriceView';

export interface CombatRouteState {
  report: PlanReport | null;
  /** The key of the adopted plan; null - the route's own. */
  adopted: string | null;
  adopt: (key: string | null) => void;
}

const hasMeleeGoal = (step: Step) => (step.foes?.length ?? 0) > 0 && stepGoals(step).length > 0;

/** The plans for a step, or none (not a combat training step, or the model has nothing honest to say). Prices are loaded only for such a step. */
export function useCombatRoute(step: Step): CombatRouteState {
  const { progress, mode } = useStore();
  const { stats, xp, gear, owned, combatLog, player } = useBridge();
  const profiles = useProfiles();
  const features = useFeatures();
  const trade = useTradeRestriction();
  const base = useMemo(() => stepsFor(mode), [mode]);
  const routeStep = useMemo(() => base.find((s) => s.id === step.id), [base, step.id]);
  const wanted = Boolean(routeStep && hasMeleeGoal(routeStep) && !isClosed(progress, step.id));
  const prices = usePriceView(wanted);
  const key = adoptStorageKey(profiles.active, player);
  const adoptedMap = useAdopted(key);
  const adopted = adoptedMap[step.id]?.key ?? null;
  const report = useMemo(() => {
    if (!wanted || !routeStep) return null;
    const live = { stats: stats as Partial<Record<string, number>> | null, xp: xp as Partial<Record<string, number>> | null, gear, combatLog };
    return evaluatePlans({
      step: routeStep, steps: base, ctx: estimateContext(routeStep, live, base, progress), owned, prices,
      foodPrice: foodPriceOf(routeStep, prices), keepDefenceOne: features.keepDefenceOne, adopted, restriction: trade.state,
      done: (id) => isClosed(progress, id),
    });
  }, [wanted, routeStep, base, stats, xp, gear, combatLog, progress, owned, prices, features.keepDefenceOne, adopted, trade.state]);
  return { report, adopted, adopt: (k) => adoptPlan(key, step.id, k) };
}

function foodPriceOf(step: Step, prices: ReturnType<typeof usePriceView>): number | null {
  const food = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  return food ? prices.buy(food.nameEn)?.price ?? null : null;
}

const minutesText = (m: number) => {
  const r = m < 10 ? Math.round(m) : Math.round(m / 5) * 5;
  return r >= 120 ? `${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60} min` : ''}` : `${r} min`;
};
const gp = (n: number) => `${n < 0 ? '−' : ''}${formatGp(Math.abs(Math.round(n)))} gp`;

function PlanRow({ p, now, route, onUse }: { p: EvaluatedPlan; now: boolean; route: boolean; onUse: () => void }) {
  return (
    <li className={`combat-plan-row${now ? ' is-now' : ''}`}>
      <p className="small">
        <strong>{p.title}</strong>{now && <span className="muted"> · in use</span>}{route && !now && <span className="muted"> · as written</span>}
        {!p.eligible && <span className="muted"> · not offered: {p.blockers[0]}</span>}
        {p.eligible && !now && <> <button type="button" className="btn btn-ghost btn-sm" onClick={onUse}>{route ? "Use the route's plan" : 'Use this plan'}</button></>}
      </p>
      <p className="small muted">
        {minutesText(p.minutes.mid)} ({minutesText(p.minutes.low)} to {minutesText(p.minutes.high)}) · food about {Math.round(p.food.mid / 5) * 5}{p.foodCost !== null ? ` (${gp(p.foodCost)})` : ''}
        {p.income.net > 0 ? ` · drops sold about ${gp(p.income.net)} (an estimate)` : ''}
      </p>
      <p className="small muted">{p.phases.map((x) => x.text).join(' → ')}</p>
      {p.income.lines.filter((l) => !l.counted || l.note).map((l) => <p key={l.name} className="small muted">{l.name}: {l.note}.</p>)}
      {p.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
      {p.risks.map((r) => <p key={r} className="small muted">⚠ {r}</p>)}
    </li>
  );
}

export function CombatRoute({ step }: { step: Step }) {
  const { report, adopted, adopt } = useCombatRoute(step);
  if (!report) return null;
  const best = report.plans.find((p) => p.key === report.recommended)!;
  const using = adopted ? report.plans.find((p) => p.key === adopted && p.eligible) : undefined;
  const offer = !using && best.id !== 'route';
  // Silent when the route's own plan is as good as any: the details are still in the food card's neighbour, but nothing is pushed.
  if (!using && !offer && report.plans.length < 2) return null;
  return (
    <section className={`combat-route${using ? ' is-using' : ''}`} aria-label="Combat plan">
      {using ? (
        <p className="plan-head" role="status">
          <span className="plan-pill">Your plan</span>
          <span className="plan-line">{using.title}</span>
        </p>
      ) : offer ? (
        <p className="plan-head" role="status">
          <span className="plan-pill is-offer">Another way</span>
          <span className="plan-line">{report.reason}</span>
        </p>
      ) : (
        <p className="small muted">{report.reason}</p>
      )}
      {using && <p className="small muted">{using.phases.map((x) => x.text).join(' → ')}</p>}
      <p className="plan-actions">
        {offer && <button type="button" className="btn btn-primary" onClick={() => adopt(best.key)}>Use this plan</button>}
        {using && <button type="button" className="btn btn-ghost" onClick={() => adopt(null)}>Back to the route's plan</button>}
      </p>
      <details className="zen-more combat-route-details">
        <summary className="small">Compare the plans</summary>
        <p className="small">For {report.objective}. Estimated for your levels, XP and worn gear, with the same combat model as the food plan.</p>
        <ul className="combat-plan-rows">{report.plans.map((p) => <PlanRow key={p.key} p={p} now={p.key === (using?.key ?? 'route')} route={p.id === 'route'} onUse={() => adopt(p.key)} />)}</ul>
        <p className="small muted">
          Compared: {report.compared.join(', ')}. The Big bones the step asks for are never counted as something to sell. Drops are valued at the exchange's sell side after the tax;
          what this account cannot sell yet is not counted. Defence training {report.plans.some((p) => p.id === 'defence-first' && p.blockers.some((b) => /keeps Defence at 1/.test(b))) ? 'is off: you keep Defence at 1 (Settings)' : 'is offered like any other plan (you can switch it off in Settings)'}.
        </p>
      </details>
    </section>
  );
}

/** One line for the step's status: an adopted plan in the phase it is in, or a better way waiting to be looked at. */
export function CombatRouteLine({ step, onOpen }: { step: Step; onOpen: () => void }) {
  const { report, adopted } = useCombatRoute(step);
  if (!report) return null;
  const best = report.plans.find((p) => p.key === report.recommended)!;
  const using = adopted ? report.plans.find((p) => p.key === adopted && p.eligible) : undefined;
  if (!using && best.id === 'route') return null;
  return (
    <p className="small status-combat-route" role="status">
      <span aria-hidden="true">⚔️</span> {using ? `Your plan: ${using.title}.` : `Another way looks better: ${best.title}.`}
      {' '}<button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>Open</button>
    </p>
  );
}
