// "Magic to the goal: how many spells and what it costs" — for steps with `magicPlan` (S2-04). Prices — from the exchange, XP —
// from the game (or by level); without prices and the game link the calculation is still shown, but marked approximate.

import { useEffect, useState } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { formatGp } from '../lib/shopping';
import { wealthOf } from '../lib/wealth';
import { xpForLevel } from '../lib/xp';
import { getGePrice } from '../services/pricesApi';
import {
  hidesToCover, OPTIONS, planFor, PLAN_PRICE_IDS, SPELLS, SPELLS_CHECKED, STAFFS, staffPayback, type PlanResult, type PriceMap,
} from '../lib/magicPlan';

/** The Magic level the user needs, from the step's goal. */
function targetLevel(step: Step): number {
  return step.magicPlan?.target ?? step.inGame?.completionTrigger?.levels?.find((l) => l.skill === 'magic')?.level ?? 25;
}

export function MagicPlan({ step }: { step: Step }) {
  const { progress } = useStore();
  const { xp, stats, gear, owned } = useBridge();
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
  const w = wealthOf(gear);
  const cash = w ? (w.cash.total ?? w.cash.bag ?? 0) : null;
  const has = (name: string) => [...(gear?.equipment ?? []), ...(gear?.inventory ?? [])].some((i) => i.name === name)
    || (owned?.items.get(name.toLowerCase())?.carried ?? 0) > 0;

  if (!prices) {
    return (
      <section className="step-section magic-plan" aria-label="Magic calculation">
        <h4 className="subhead">🔮 What it costs to reach Magic {target}</h4>
        <p className="muted small">{failed ? 'The exchange prices are unavailable — the calculation by them is impossible. The spell table below is right.' : 'Loading the exchange prices…'}</p>
        <SpellTable />
      </section>
    );
  }

  const results = OPTIONS.map((o) => planFor(o, fromXp, target, prices, o.staff ? has(STAFFS[o.staff].name) : false)).filter((r): r is PlanResult => r !== null);
  if (!results.length) return null;
  const cheapest = results.reduce((a, b) => (b.total < a.total ? b : a));
  const fastest = results.reduce((a, b) => (b.casts < a.casts ? b : a));
  const hides = hidesToCover(cheapest.total, prices);
  const fireSpell = SPELLS.find((s) => s.id === 'fire-strike')!;
  const pay = staffPayback('fire', fireSpell, prices);

  return (
    <section className="step-section magic-plan" aria-label="Magic calculation">
      <h4 className="subhead">🔮 What it costs to reach Magic {target}</h4>
      <p className="muted small">
        From here: {basis}. {Math.max(0, xpForLevel(target) - fromXp).toLocaleString('en-US')} XP more is needed.
        Prices — the exchange now; spells — the wiki cards (checked {SPELLS_CHECKED}).
      </p>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead><tr><th>Option</th><th>Casts</th><th>Runes</th><th>Staff</th><th>Total</th></tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.option.id} className={r === cheapest ? 'is-current' : ""}>
                <td>{r.option.label}{r === cheapest && ' · cheapest'}{r === fastest && r !== cheapest && ' · fastest'}</td>
                <td>{r.casts.toLocaleString('ru-RU')}</td>
                <td>{formatGp(r.runesCost)}</td>
                <td>{r.staffCost ? formatGp(r.staffCost) : '—'}</td>
                <td><strong>{formatGp(r.total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cash !== null && (
        <p className="small">
          You have {formatGp(cash)} gp{w?.bankUnknown ? ' in the bag (the bank was not opened)' : ''}.{' '}
          {cash >= cheapest.total
            ? <strong className="ok-text">That covers the cheapest option.</strong>
            : <>The cheapest option is {formatGp(cheapest.total - cash)} gp short — but spells can be cast in batches: the money comes back as hides.</>}
        </p>
      )}
      <ul className="small">
        <li><strong>Kill cows in Lumbridge.</strong> Level 2, 8 hitpoints, a hide drops from each.{hides !== null ? ` To pay back ${formatGp(cheapest.total)} gp on runes you need to sell ≈ ${hides} hides.` : ''} Hides go to the exchange or to Ellis in Al Kharid (tanned leather is worth more).</li>
        {pay && (
          <li>The staff of fire pays for itself in ≈ {pay.casts} Fire Strike casts: it saves {formatGp(pay.perCast)} gp on each (the fire runes are not spent). {has(STAFFS.fire.name) ? 'You already have it.' : 'Buy it with the first hides.'}</li>
        )}
        <li>Spells of the same tier hit the same — Wind Strike with a staff of air is cheaper, and Fire Strike is twice as fast in XP. Choose by what you lack: coins or time.</li>
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
