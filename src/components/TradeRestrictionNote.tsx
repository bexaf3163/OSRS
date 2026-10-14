// "🔒 New account": a step that sells restricted items on the Grand Exchange (cowhides, iron ore) tells a player whose account may still be restricted
// that the sale can fail, and what to do instead. The state is lib/tradeRestriction.ts; the shopping list is cut by lib/fundingPlan.ts.
// Nothing here spends coins: it names what to buy and what to wait for.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { nameKey } from '../lib/checklist';
import { formatGp } from '../lib/shopping';
import { wealthOf } from '../lib/wealth';
import { fundingPlan, type PlanLine } from '../lib/fundingPlan';
import { isRestrictedItem, LIFT, restrictionSummary } from '../lib/tradeRestriction';
import { useTradeRestriction } from '../lib/useTradeRestriction';

const line = (l: PlanLine) => `${l.name}${l.amount > 1 ? ` ×${l.amount}` : ''} ≈ ${formatGp(l.total)} gp`;

/** The shopping plan of a step whose items carry a tier and a planning price (S2-01). */
function Plan({ step }: { step: Step }) {
  const { gear } = useBridge();
  const w = wealthOf(gear);
  const coins = w ? w.cash.total : null;
  const bag = new Map<string, number>();
  for (const i of gear?.inventory ?? []) bag.set(nameKey(i.name), (bag.get(nameKey(i.name)) ?? 0) + (i.count ?? 1));
  const plan = fundingPlan(step.itemsRequired ?? [], coins, (name) => bag.get(nameKey(name)) ?? 0);
  if (!plan.buy.length && !plan.later.length) return null;
  if (plan.coins === null) {
    return (
      <p className="small muted">Open the bank in the game and I will count your coins and split this list into what to buy now and what to wait for.</p>
    );
  }
  return (
    <div className="small">
      <p><strong>With your {formatGp(plan.coins)} gp, no sales:</strong></p>
      {plan.buy.length > 0 && <p><strong>Buy now</strong> ({formatGp(plan.costBuy)} gp): {plan.buy.map(line).join('; ')}.</p>}
      {plan.later.length > 0 && (
        <p>
          <strong>Wait</strong> ({formatGp(plan.costLater)} gp){plan.short ? <>, short by {formatGp(plan.short.by)} gp</> : null}: {plan.later.map(line).join('; ')}.
        </p>
      )}
      {plan.left !== null && plan.later.length === 0 && <p className="muted">Everything is covered; {formatGp(plan.left)} gp is left.</p>}
    </div>
  );
}

export function TradeRestrictionNote({ step }: { step: Step }) {
  const r = useTradeRestriction();
  const { progress, setSellRestrictions } = useStore();
  const blocked = (step.sells ?? []).filter(isRestrictedItem);
  if (!blocked.length) return null;
  if (r.state === 'LIFTED') {
    // Only the player's own word reaches here: a way back to automatic.
    return progress.sellRestrictions === 'lifted' ? (
      <p className="small muted trade-note">
        You marked the sale restrictions as lifted. <button type="button" className="link-btn" onClick={() => setSellRestrictions(null)}>Decide from the game again</button>
      </p>
    ) : null;
  }
  const names = blocked.join(', ');
  if (r.state === 'UNKNOWN') {
    return (
      <p className="small muted trade-note">
        A new free-to-play account cannot sell {names} on the Grand Exchange until it has {LIFT.hours} hours of play, {LIFT.questPoints} quest points and total level {LIFT.totalLevel}.
        {' '}{restrictionSummary(r)}{' '}
        <button type="button" className="link-btn" onClick={() => setSellRestrictions('lifted')}>I can already sell these</button>
      </p>
    );
  }
  return (
    <section className="money-goal trade-note" aria-label="New account restrictions">
      <p className="readiness-head">🔒 <strong>This account cannot sell {names} yet</strong></p>
      <p className="small">{restrictionSummary(r)} The Grand Exchange refuses these items until all three conditions hold. Buying is not restricted.</p>
      {step.moneyGoalNoSale !== undefined && (
        <p className="small">
          Goal without selling: <strong>{formatGp(step.moneyGoalNoSale)} gp</strong>.
        </p>
      )}
      <Plan step={step} />
      <p className="small muted">
        {r.by === 'player' ? 'You marked this account as restricted. ' : ''}
        {r.by === 'player'
          ? <button type="button" className="link-btn" onClick={() => setSellRestrictions(null)}>Decide from the game again</button>
          : <button type="button" className="link-btn" onClick={() => setSellRestrictions('lifted')}>I can already sell these</button>}
      </p>
    </section>
  );
}
