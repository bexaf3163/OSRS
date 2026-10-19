// "You are short of coins for the next trip" and what to do about it: one line, one recommended way, one button. The rest (the other ways, the numbers,
// why a method was left out, where the figures come from) is one click away. While a plan runs the card shows only the step in hand and its progress.
//
// Advice only. Starting a plan sets the arrow and keeps count; it never buys, sells, takes, equips or fights for the player, and the route step it was
// started for stays exactly where it was.

import type { ReactNode } from 'react';
import type { Step } from '../types';
import { useFunding, useFundingScreen, useFundingView } from '../fundingContext';
import { useReadinessEngine } from '../readinessContext';
import { useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { formatGp } from '../lib/shopping';
import type { FundingAssessment, FundingOption } from '../lib/funding/assess';
import type { MethodEvaluation } from '../lib/funding/evaluate';
import type { PriceView } from '../lib/funding/quotes';
import type { Realized } from '../lib/funding/session';

const gp = (n: number) => `${formatGp(Math.round(n))} gp`;

export function PriceNote({ prices }: { prices: PriceView }) {
  const text = prices.status === 'live'
    ? 'Prices: from the Grand Exchange, a few minutes old.'
    : prices.status === 'stale'
      ? 'Prices: the exchange did not answer, so these are earlier prices.'
      : prices.status === 'baked'
        ? 'Prices: the exchange is not reachable, so these are rough estimates from the guide.'
        : 'Prices: not available.';
  return <p className="small muted">{text}</p>;
}

/** The money side of one method, in the same words on the coin card and in the Money section. `earn` - the method is judged for the coins it brings. */
export function Economics({ e, earn }: { e: MethodEvaluation | undefined; earn: boolean }) {
  if (!e) return null;
  const hr = e.netPerHour;
  return (
    <ul className="small funding-facts">
      {earn && hr.typical > 0 && <li>About {gp(hr.typical)} an hour after tax and supplies (between {gp(hr.slow)} and {gp(hr.fast)}).</li>}
      {e.workingCapital !== null && e.workingCapital > 0 && <li>With full trips, up to about {gp(e.workingCapital)} of your own coins is tied up before the sales come in.</li>}
      {e.upfront.setup > 0 && <li>A tool you do not have yet: about {gp(e.upfront.setup)}.</li>}
      {e.upfront.owned.length > 0 && <li>Uses what you already carry: {e.upfront.owned.map((o) => `${o.qty} ${o.name}`).join(', ')}.</li>}
      {e.synergy && <li>{e.synergy}</li>}
      {e.cautions.map((c) => <li key={c}>⚠ {c}</li>)}
      {e.confidenceReasons.map((c) => <li key={c} className="muted">{c}</li>)}
      {e.method.sources.length > 0 && (
        <li className="muted">
          Figures from{' '}
          {e.method.sources.slice(0, 2).map((s, i) => (
            <span key={s.url}>{i > 0 && ', '}<a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></span>
          ))}
          .
        </li>
      )}
    </ul>
  );
}

function Details({ a, prices, onUse }: { a: FundingAssessment; prices: PriceView; onUse?: (o: FundingOption) => void }) {
  const { need, budget } = a;
  const coins = budget.liquid;
  const upTo = (label: string, cost: number) => (cost > need.minimum.cost ? <li>{label}: {gp(cost)}</li> : null);
  return (
    <details className="zen-more funding-details">
      <summary className="small">Details</summary>
      <ul className="small funding-facts">
        <li>
          Your coins: {coins.amount === null ? 'not known yet' : `${gp(coins.amount)}${coins.complete ? '' : ' (the bank has not been read, so this is the bag only)'}`}.
        </li>
        <li>The next trip needs {gp(a.required)}{need.minimum.lines.length > 0 && <>: {need.minimum.lines.map((l) => `${l.qty} ${l.name}`).join(', ')}</>}.</li>
        {upTo('With the steps after it', need.recommended.cost + need.fees.now)}
        {upTo('For the whole goal', need.objective.cost + need.fees.now)}
        {need.optional.cost > 0 && <li className="muted">Optional upgrades: {gp(need.optional.cost)}</li>}
        {budget.surplus.excluded.slice(0, 3).map((x) => <li key={x.name} className="muted">Not for sale: {x.name} ({x.why})</li>)}
      </ul>
      {a.recommendation && <Economics e={a.recommendation.evaluation} earn={a.recommendation.kind === 'EARN'} />}
      {a.alternatives.length > 0 && (
        <div>
          <p className="small subhead">Other ways</p>
          <ul className="small funding-facts">
            {a.alternatives.map((o) => (
              <li key={o.id} className="has-action">
                <span><strong>{o.title}</strong> — {o.detail}</span>
                {onUse && <button type="button" className="btn btn-ghost" onClick={() => onUse(o)}>Use this</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.notOffered.length > 0 && (
        <div>
          <p className="small subhead">Left out</p>
          <ul className="small funding-facts muted">
            {a.notOffered.slice(0, 5).map((n) => <li key={n.method}>{n.method}: {n.why}</li>)}
          </ul>
        </div>
      )}
      <PriceNote prices={prices} />
    </details>
  );
}

function Earned({ r }: { r: Realized }) {
  return (
    <ul className="small funding-facts">
      <li>Coins in hand from this: {gp(Math.max(0, r.net))}.</li>
      {r.unsoldEstimate > 0 && <li>Loot not sold yet: about {gp(r.unsoldEstimate)} (an estimate until it is sold).</li>}
    </ul>
  );
}

function Body({ step, fallback }: { step: Step; fallback: ReactNode }) {
  const f = useFunding();
  const { assessment: a, snap, prices, plan, view, realized } = useFundingScreen(step, true);

  if (plan && view) {
    const sub = plan.subSteps[Math.min(plan.active, plan.subSteps.length - 1)];
    const paused = plan.status === 'PAUSED';
    return (
      <section className={`funding-card is-running${paused ? ' is-paused' : ''}`} aria-label="Raising coins">
        <p className="funding-head" role="status">
          <span className="funding-pill">{paused ? 'Paused' : 'Raising coins'}</span>
          <span className="funding-line">{paused ? plan.title : view.action}</span>
        </p>
        {!paused && <p className="small muted">{plan.title} · step {view.stepIndex} of {view.stepCount}{view.progress ? ` · ${view.progress}${view.estimated ? ' (estimated)' : ''}` : ''}</p>}
        <p className="funding-actions">
          {paused
            ? <button type="button" className="btn btn-primary" disabled={!snap} onClick={() => snap && f.resume(snap)}>Resume</button>
            : view.needsConfirm && <button type="button" className="btn btn-primary" disabled={!snap} onClick={() => snap && f.confirm(sub.id, snap)}>I did this</button>}
          {!paused && <button type="button" className="btn btn-ghost" onClick={f.pause}>Pause</button>}
          <button type="button" className="btn btn-ghost" onClick={f.cancel}>Cancel</button>
        </p>
        {(realized || f.arrowOff) && (
          <details className="zen-more funding-details">
            <summary className="small">Details</summary>
            {realized && <Earned r={realized} />}
            {f.arrowOff && <p className="small"><button type="button" className="btn btn-ghost" onClick={f.showArrow}>Show the arrow again</button></p>}
            <p className="small muted">Your route step is not changed. When the coins are in hand, this closes and you go back to it.</p>
          </details>
        )}
      </section>
    );
  }

  if (f.ended && f.ended.stepId === step.id) {
    return (
      <p className="small funding-done" role="status">
        ✓ {f.ended.title}: you have the coins. Back to your step. <button type="button" className="btn btn-ghost" onClick={f.dismissEnded}>OK</button>
      </p>
    );
  }

  if (!a || a.state !== 'SHORT' || a.gap === null) return <>{fallback}</>;

  const rec = a.recommendation;
  return (
    <section className="funding-card" aria-label="Coins">
      <p className="funding-head" role="status">
        <span className="funding-pill">{gp(a.gap)} short</span>
        <span className="funding-line">{rec ? rec.title : 'No safe way to raise it could be worked out.'}</span>
      </p>
      <p className="small muted">{rec ? rec.detail : 'What is known about your account and the market does not point to one. Details below.'}</p>
      <p className="funding-actions">
        {rec && <button type="button" className="btn btn-primary" disabled={!snap} onClick={() => snap && f.start(a, rec, snap)}>Start</button>}
        <a className="small funding-browse" href="#/money">Browse earning methods</a>
      </p>
      <Details a={a} prices={prices} onUse={snap ? (o) => f.start(a, o, snap) : undefined} />
    </section>
  );
}

/**
 * `children` is what the screen showed before: it stays when there is nothing for this card to say (the next trip is paid for, or the coins are not known).
 */
export function FundingCard({ step, children }: { step: Step; children?: ReactNode }) {
  const { plan, ended } = useFunding();
  const prep = useReadinessEngine().plan(step, { ahead: styleOf(useFeatures()).lookAhead });
  const mine = plan !== null && plan.sourceStepId === step.id;
  const wanted = mine || prep.coins.need > 0 || ended?.stepId === step.id;
  if (!wanted) return <>{children}</>;
  return <Body step={step} fallback={children} />;
}

/** One line for the step's status while a plan runs, so the plan is not hidden behind a closed tab. */
export function FundingStatusLine({ step, onOpen }: { step: Step; onOpen: () => void }) {
  const { plan, view } = useFundingView(step.id);
  if (!plan || !view) return null;
  const paused = plan.status === 'PAUSED';
  return (
    <p className="small status-funding" role="status">
      <span aria-hidden="true">💰</span> {paused ? 'Raising coins: paused.' : view.action}
      {!paused && view.progress && <span className="muted"> · {view.progress}{view.estimated ? ' (estimated)' : ''}</span>}
      {' '}<button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>Open</button>
    </p>
  );
}
