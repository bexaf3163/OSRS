// The combat plan of a training step (2.69). The guide selects the recommended plan by itself (playerStateContext, lib/combatRoute/selection.ts): the step's
// instructions, the arrow, preparation, shopping and the game already follow it, so nothing here needs a press to become useful. The status line names the
// plan with one short reason; "Why this plan?" holds the comparison, and any other plan can be chosen there. A choice of the player's stays; a clearly
// better plan is then offered, never forced. The step is never completed by a plan: its goal is the route's.
//
// 2.75 (T10): the comparison is one answer, not a table of everything. One sentence says why; a few rows (the plan in use, the best, the route's own and
// the next best) give each the three things a player weighs - the time, the food, the coins the loot brings - and a button; everything else compared,
// and what is not open yet, is one line under them. The numbers behind it (bank trips, drops at exchange prices, food for these levels) stay in the model.

import type { Step } from '../types';
import { usePlayerState, type CombatPlanEntry } from '../playerStateContext';
import { formatGp } from '../lib/shopping';
import { planWhy, type EvaluatedPlan, type PlanPhase } from '../lib/combatRoute/plans';

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

/** Rows the comparison shows at most: the plan in use, the best, the route's own and the next best. */
const ROWS = 4;

const minutesText = (m: number) => {
  const r = m < 10 ? Math.round(m) : Math.round(m / 5) * 5;
  return r >= 60 ? `${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60} min` : ''}` : `${r} min`;
};
/** "83k", "4,900": coins in a column. */
const coinsText = (n: number) => (Math.abs(n) >= 10000 ? `${Math.round(n / 1000)}k` : formatGp(Math.abs(n) < 100 ? Math.round(n) : Math.round(n / 100) * 100));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const titleOf = (p: EvaluatedPlan) => (p.id === 'route' ? 'The route as written' : p.title);
/** The phases that make this plan what it is: after the armour stop, the preparation every plan of the step shares is not repeated in each row. */
const fights = (p: EvaluatedPlan): PlanPhase[] => p.phases.slice(p.phases.map((x) => x.kind).lastIndexOf('armour') + 1);
/** A row's name: the spot for a plan of one spot ("Giant frogs (the route)"), else the plan's own title. */
const rowName = (p: EvaluatedPlan) => {
  const one = fights(p).length === 1 ? cap(fights(p)[0].spot.name) : null;
  return p.id === 'xp-only' && one ? one : p.id === 'route' && one ? `${one} (the route)` : titleOf(p);
};
/** Where a row's plan is fought, in a few words: "Lumbridge Swamp: level 13 Giant frogs", "cows → Hill Giants". */
function rowWhere(p: EvaluatedPlan): string {
  const spots = [...new Set(fights(p).map((x) => x.spot))];
  return spots.length === 1 ? spots[0].place.label : spots.map((s) => s.name).join(' → ');
}

function PlanRow({ p, now, best, food, onUse }: { p: EvaluatedPlan; now: boolean; best: boolean; food: string; onUse: () => void }) {
  const pieces = Math.round(p.food.mid / 5) * 5;
  // What is worth knowing stays with the plan it is about, and only for the plan in use or the one recommended: the rest is a row of figures.
  const notes = now || best ? [...p.risks.map((r) => `⚠ ${r}`), ...p.notes] : [];
  return (
    <li className={`combat-plan-row${now ? ' is-now' : ''}${best ? ' is-best' : ''}`}>
      <div className="cpr-main">
        <span className="cpr-name">{rowName(p)}</span>
        {now && <span className="plan-pill">in use</span>}
        {best && !now && <span className="plan-pill is-best">best</span>}
        <span className="cpr-where small muted">{rowWhere(p)}</span>
      </div>
      <div className="cpr-figs small" aria-label="Time, food and coins">
        <span title={`${minutesText(p.minutes.low)} to ${minutesText(p.minutes.high)}`}>{minutesText(p.minutes.mid)}</span>
        <span>{pieces > 0 ? `${pieces} ${food}` : 'no food'}</span>
        <span className={(p.net ?? 0) > 0 ? 'cpr-gp' : 'muted'} title="Estimated net after food, consumed potions and needed armour; drops valued after exchange tax">
          {p.net === null ? 'Not priced' : `${p.net > 0 ? '+' : ''}${coinsText(p.net)} gp net`}
        </span>
      </div>
      <div className="cpr-act">
        {!now && p.eligible && <button type="button" className="btn btn-ghost btn-sm" onClick={onUse}>Use</button>}
      </div>
      {notes.length > 0 && <ul className="cpr-notes small muted">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </li>
  );
}

/** "Why this plan?": the comparison the plan was chosen from, with a way to choose another one. */
export function CombatRoute({ step }: { step: Step }) {
  const { entry, choose } = useCombatRoute(step);
  if (!entry || entry.report.plans.length < 2) return null;
  const { report, selection, lastKnown } = entry;
  const byKey = new Map(report.plans.map((p) => [p.key, p]));
  const recommended = byKey.get(selection.recommended);
  const ranked = report.order.map((k) => byKey.get(k)!).filter(Boolean);
  // The plan in use, the recommendation, the route's own, then the best of the rest, up to ROWS, in the ranking's order.
  const must = new Set([selection.key, selection.recommended, 'route']);
  const shown = new Set<string>(ranked.filter((p) => must.has(p.key)).map((p) => p.key));
  for (const p of ranked) if (shown.size < ROWS && p.eligible) shown.add(p.key);
  const rows = ranked.filter((p) => shown.has(p.key));
  const others = ranked.filter((p) => !shown.has(p.key) && p.eligible).map(rowName);
  const food = report.food.name;
  const defenceOff = report.plans.some((p) => p.id === 'defence-first' && p.blockers.some((b) => /keeps Defence at 1/.test(b)));
  return (
    <section className="combat-route" aria-label="Combat plan">
      <details className="zen-more combat-route-details" data-step={step.id}>
        <summary className="small">Why this plan?</summary>
        <p className="combat-verdict">{report.reason}</p>
        <ul className="combat-plan-rows">
          {rows.map((p) => <PlanRow key={p.key} p={p} now={p.key === selection.key} best={p.key === selection.recommended} food={food} onUse={() => choose(p.key)} />)}
        </ul>
        {selection.source === 'player' && recommended && (
          <p className="small"><button type="button" className="btn btn-ghost btn-sm" onClick={() => choose(null)}>Follow the recommendation</button> <span className="muted">({rowName(recommended)})</span></p>
        )}
        {(others.length > 0 || report.locked.length > 0) && (
          <p className="small muted">
            {others.length > 0 && <>Also compared: {others.join(', ')}.</>}
            {others.length > 0 && report.locked.length > 0 && ' '}
            {report.locked.length > 0 && <>Not yet: {report.locked.map((l) => `${cap(l.name)} (${l.why})`).join(', ')}.</>}
          </p>
        )}
        <p className="small muted">
          For {report.objective}, with your {lastKnown ? 'last known ' : ''}levels, XP and worn gear. Walks to the bank count; drops are at exchange prices after
          tax and are banked only where they pay for the time. Defence training {defenceOff ? 'is off (Settings)' : 'is compared too (Settings)'}.
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
 * One line for the step's status: the plan in effect and why, in one sentence ("go here, because"). Silent only when nothing else was compared. A better
 * plan waiting for the next bank trip, or offered against the player's own choice, is said here too.
 */
export function CombatRouteLine({ step, onOpen }: { step: Step; onOpen: () => void }) {
  const { entry, choose } = useCombatRoute(step);
  if (!entry) return null;
  const { report, selection } = entry;
  const plan = report.plans.find((p) => p.key === selection.key);
  const pending = selection.pending ? report.plans.find((p) => p.key === selection.pending) : undefined;
  const offer = selection.offer ? report.plans.find((p) => p.key === selection.offer) : undefined;
  if (!plan || report.plans.length < 2) return null;
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
