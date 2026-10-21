// "Magic to the goal: how many spells and what it costs" — for steps with `magicPlan` (S2-04). Prices — from the exchange, XP —
// from the game (or by level); without prices and the game link the calculation is still shown, but marked approximate.

import { useEffect, useState } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { formatGp } from '../lib/shopping';
import { usePlayerState } from '../playerStateContext';
import { heldExact } from '../lib/playerState';
import { liquidOf } from '../lib/funding/snapshot';
import { gapFor } from '../lib/funding/budget';
import { useTradeRestriction } from '../lib/useTradeRestriction';
import { xpForLevel } from '../lib/xp';
import { getGePrice } from '../services/pricesApi';
import {
  OPTIONS, planFor, PLAN_PRICE_IDS, SPELLS, SPELLS_CHECKED, STAFFS, staffPayback, type PlanResult, type PriceMap,
} from '../lib/magicPlan';

/** The Magic level the user needs, from the step's goal. */
function targetLevel(step: Step): number {
  return step.magicPlan?.target ?? step.inGame?.completionTrigger?.levels?.find((l) => l.skill === 'magic')?.level ?? 25;
}

export function MagicPlan({ step }: { step: Step }) {
  const { progress } = useStore();
  const { xp, stats, gear, owned } = useBridge();
  const { state } = usePlayerState();
  const restriction = useTradeRestriction();
  const [prices, setPrices] = useState<PriceMap | null>(null);
  const [failed, setFailed] = useState(false);
  const plan = step.magicPlan;

  useEffect(() => {
    if (!plan) return undefined;
    let alive = true;
    void Promise.all(PLAN_PRICE_IDS.map(async (id) => [id, (await getGePrice(id))?.buyPrice] as const))
      .then((rows) => { if (alive) setPrices(new Map(rows.filter((r): r is readonly [number, number] => typeof r[1] === 'number'))); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [plan]);

  if (!plan) return null;
  const target = targetLevel(step);
  const level = stats?.magic ?? progress.levels.magic;
  const gameXp = xp?.magic;
  // XP: exact from the game; otherwise the start of the entered level; otherwise — after Imp Catcher and Witch's Potion (875 + 325) level 10.
  const fromXp = gameXp ?? (level !== undefined ? xpForLevel(level) : xpForLevel(plan.from));
  const basis = gameXp !== undefined ? 'XP from the game' : level !== undefined ? `Magic ${level}, XP from the start of the level` : `Magic ${plan.from} — as by the route, your level is unknown`;
  const liquid = liquidOf(state);
  const cash = liquid.amount;
  const has = (name: string) => [...(gear?.equipment ?? []), ...(gear?.inventory ?? [])].some((i) => i.name === name)
    || (heldExact({ owned, bankSeen: owned?.bankSeen === true, equipment: {}, manual: {} }, name).total ?? 0) > 0;

  if (!prices) {
    return (
      <section className="step-section magic-plan" aria-label="Magic calculation">
        <h4 className="subhead">🔮 What it costs to reach Magic {target}</h4>
        <p className="muted small">{failed ? 'The exchange prices are unavailable. The cached spell table is available below; no current cost comparison can be shown.' : 'Loading the exchange prices…'}</p>
        <SpellTable />
      </section>
    );
  }

  const results = OPTIONS.map((o) => planFor(o, fromXp, target, prices, o.staff ? has(STAFFS[o.staff].name) : false)).filter((r): r is PlanResult => r !== null);
  if (!results.length) return null;
  const cheapest = results.reduce((a, b) => (b.total < a.total ? b : a));
  const fewest = results.reduce((a, b) => (b.casts < a.casts ? b : a));
  const gap = gapFor(cheapest.total, liquid);
  const fireSpell = SPELLS.find((s) => s.id === 'fire-strike')!;
  const pay = staffPayback('fire', fireSpell, prices);

  return (
    <section className="step-section magic-plan" aria-label="Magic calculation">
      <h4 className="subhead">🔮 What it costs to reach Magic {target}</h4>
      <p className="muted small">
        From here: {basis}. {Math.max(0, xpForLevel(target) - fromXp).toLocaleString('en-US')} XP more is needed.
        Prices — the exchange now; spells — the wiki cards (checked {SPELLS_CHECKED}).
        {' '}Cast XP only: damage XP is not counted. These are comparison estimates, not measured training times.
      </p>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead><tr><th>Option</th><th>Casts</th><th>Runes</th><th>Staff</th><th>Total</th></tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.option.id} className={r === cheapest ? 'is-current' : ""}>
                <td>{r.option.label}{r === cheapest && ' · lowest full cost'}{r === fewest && r !== cheapest && ' · fewest casts'}</td>
                <td>{r.casts.toLocaleString('en-US')}</td>
                <td>{formatGp(r.runesCost)}</td>
                <td>{r.staffCost ? formatGp(r.staffCost) : '—'}</td>
                <td><strong>{formatGp(r.total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Full rune replacement cost; runes you already own are not deducted. A confirmed owned elemental staff is not purchased again. Use Preparation for the current supplies.</p>
      {cash !== null && (
        <p className="small">
          Confirmed coins: {formatGp(cash)} gp{!liquid.complete ? ' (the full coin total is not checked)' : ''}.{' '}
          {gap === 0
            ? <strong className="ok-text">That covers the lowest full cost.</strong>
            : gap === null ? 'Check the bank before judging affordability.'
              : `Buying every listed rune would need ${formatGp(gap)} gp more; this is not a deficit after owned supplies.`}
        </p>
      )}
      <ul className="small">
        <li>{progress.gameMode === 'f2p' && restriction.state === 'RESTRICTED'
          ? 'Cowhides and leather cannot fund rune purchases while your account sale restrictions apply. '
          : progress.gameMode === 'f2p' && restriction.state === 'UNKNOWN'
            ? 'Cowhide sales are unconfirmed; check the account selling limits before relying on that income. '
            : 'Only a completed sale replenishes your coins; future drops are not an available budget. '}
          <a href="#/money">Compare available earning methods in Money.</a>
        </li>
        {pay && (
          <li>The staff of fire replaces {formatGp(pay.perCast)} gp of fire runes per Fire Strike at these prices (about {pay.casts} casts to cover its quoted price). {has(STAFFS.fire.name) ? 'You already own it; withdraw or unnote it if needed.' : 'Compare its upfront cost with your available coins before buying.'}</li>
        )}
        <li>Spell choice also needs usable runes and the right autocast setting. The table compares the listed cast XP and rune costs; it does not rank combat damage or elapsed time.</li>
      </ul>
      <SpellTable />
    </section>
  );
}

function SpellTable() {
  return (
    <details className="small">
      <summary>Spells: level, XP, runes</summary>
      <ul>
        {SPELLS.map((s) => (
          <li key={s.id}><strong>{s.name}</strong> — Magic {s.level}, {s.xp} XP; {Object.entries(s.runes).map(([r, n]) => `${n} ${r}`).join(' + ')}</li>
        ))}
      </ul>
    </details>
  );
}
