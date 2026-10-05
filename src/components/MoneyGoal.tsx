// "💰 Step goal": how many coins you already have and what selling the loot gives — for earning steps (S1-13, S3-06).
// Coins are exact, from the game; items are "~" at exchange prices. Without an open bank we do not invent progress.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { formatGp } from '../lib/shopping';
import { moneyGoalProgress, wealthOf } from '../lib/wealth';
import { usePlayerState } from '../playerStateContext';
import { ratePerMinute, resourceGoal } from '../lib/ledger';
import { priceNote } from '../lib/priceBook';

export function MoneyGoal({ step }: { step: Step }) {
  const { gear, state } = useBridge();
  const { ledger, summary, session: now, since: from, prices } = usePlayerState();
  if (!step.moneyGoal) return null;
  const w = wealthOf(gear);
  const p = moneyGoalProgress(step.moneyGoal, w);
  const goal = formatGp(step.moneyGoal);
  let body;
  if (!w) {
    body = <p className="small muted">{state === 'online' ? 'Log in to the game — the app will count the coins.' : 'The app learns how many coins you have from RuneLite. Without a link — check the bank yourself.'}</p>;
  } else if (!p) {
    body = <p className="small">{formatGp(w.cash.bag ?? 0)} gp in the bag. <span className="muted">Open the bank in the game — I will count how much is there and show the progress.</span></p>;
  } else {
    const pct = Math.min(100, Math.round((p.cash / p.goal) * 100));
    body = (
      <>
        <div className="money-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.goal} aria-valuenow={p.cash} aria-label={`Coins: ${formatGp(p.cash)} of ${goal}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="small">
          <strong>Coins: {formatGp(p.cash)} / {goal} gp</strong>
          <span className="muted"> (bag {formatGp(w.cash.bag ?? 0)}, bank {formatGp(w.cash.bank ?? 0)})</span>
          {p.done ? <strong className="ok-text"> — the goal is met ✓</strong> : <> — {formatGp(p.missingCash)} missing</>}
        </p>
        {p.itemsValue !== null && p.itemsValue > 0 && (
          <p className="small muted">
            Items in the bag and bank — ~{formatGp(p.itemsValue)} gp at exchange prices (an estimate, not money).
            {p.doneIfSold && <strong> Sell the loot — the goal is covered: ~{formatGp(p.withItems!)} gp.</strong>}
          </p>
        )}
      </>
    );
  }
  // For the session: the known coins and the loot estimate — separately; the time — only from enough measurements.
  const rate = ratePerMinute(ledger, Date.now(), (e) => (e.name === 'Coins' ? e.quantityDelta : e.estimatedGpValue ?? 0));
  const g = p ? resourceGoal('Coins', p.cash, p.goal, { estimated: summary.estimatedLootValue > 0 ? summary.estimatedLootValue : undefined, ratePerMinute: rate }) : null;
  const session = now.entries > 0 && (now.coinsEarned > 0 || now.estimatedLootValue > 0) ? (
    <p className="small muted">
      This session: coins +{formatGp(now.coinsEarned)}{now.estimatedLootValue > 0 ? <>, loot ≈{formatGp(now.estimatedLootValue)} gp (an estimate, not money; {priceNote(prices)})</> : null}
      {g?.estimatedProgress !== undefined && !g.done ? <> · with the loot ≈{formatGp(g.estimatedProgress)} of {goal}</> : null}
      {g?.etaMinutes ? <> · at this pace ≈{g.etaMinutes} min</> : null}.
    </p>
  ) : null;
  // The journal is kept between sessions: if it has earlier days too, the all-time total goes on a separate line.
  const total = from !== null && summary.entries > now.entries && (summary.coinsEarned > 0 || summary.estimatedLootValue > 0) ? (
    <p className="small muted">
      Since {new Date(from).toLocaleDateString('en-US')}: coins +{formatGp(summary.coinsEarned)}{summary.estimatedLootValue > 0 ? <>, loot ≈{formatGp(summary.estimatedLootValue)} gp</> : null}.
    </p>
  ) : null;
  return (
    <section className="money-goal" aria-label="Coin goal">
      <p className="readiness-head">💰 <strong>Step goal: {goal} gp</strong></p>
      {body}
      {session}
      {total}
    </section>
  );
}
