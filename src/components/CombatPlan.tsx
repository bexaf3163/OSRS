// "🍖 Food and time" of a combat training step for this player: the next trip, the whole remaining goal, what you have and what to buy,
// with the phases, the other opponent version, the potions and the assumptions behind "Details". The numbers — lib/combatPlan.ts.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { assumptionsFor } from '../lib/foodPlan';
import { combatPlanView, type CombatPlanView } from '../lib/combatPlan';
import { foeLabel, COMBAT_FOES_DATE } from '../lib/combatEstimate';

export function useCombatPlan(step: Step): CombatPlanView | null {
  const { stats, xp, gear, owned, combatLog } = useBridge();
  const { steps, progress } = useStore();
  const fights = combatLog?.stepId === step.id ? combatLog.foes : null;
  return combatPlanView(step, {
    stats: stats as Partial<Record<string, number>> | null, xp: xp as Partial<Record<string, number>> | null, gear, owned, fights,
    assume: assumptionsFor(step, steps, progress),
  });
}

function span(low: number, high: number) {
  return low === high ? String(low) : `${low}–${high}`;
}

function OwnedLine({ v }: { v: CombatPlanView }) {
  if (!v.owned) return <p className="small muted">Your food is counted when the game is linked.</p>;
  const have = v.owned.equivalent
    ? `You have ${v.owned.equivalent} ${v.food}${v.owned.text !== `${v.owned.equivalent} ${v.food}` ? ` by healing (${v.owned.text})` : ''}`
    : `You have no ${v.food} or other listed fish`;
  if (v.buy === null) return <p className="small">{have} in the bag. Open the bank once to count the rest.</p>;
  return (
    <p className="small">
      {have}{v.buy > 0 ? <> — <strong>buy about {v.buy}</strong> for the whole goal.</> : ' — enough for the whole goal.'}
    </p>
  );
}

export function CombatPlan({ v }: { v: CombatPlanView }) {
  const e = v.primary;
  return (
    <section className="step-section combat-plan" aria-label="Food and time">
      <h4 className="subhead">🍖 Food and time <span className="muted small">· {foeLabel(e.foe)}</span></h4>
      <p>
        <strong>Next trip: {v.nextTrip} {v.food}</strong>
        <span className="muted"> · whole goal {span(v.total.low, v.total.high)} {v.food}</span>
      </p>
      <OwnedLine v={v} />
      <p className="small muted">{v.time} in all · {v.trips} · {e.kills} kills · {v.basis}</p>
      <details className="zen-more">
        <summary className="small">Details</summary>
        <ul className="small">
          {v.phases.map((p) => <li key={p}>{p}</li>)}
          <li>
            A bag of {e.foodSlots} {v.food} lasts {Number.isFinite(e.killsPerTrip) ? `about ${Math.round(e.killsPerTrip)} kills` : 'the whole goal: your health comes back faster than they hit'}.
            {' '}The whole goal: about {v.total.mid} {v.food}; plan {v.plan}, of them {v.plan - v.total.mid} for bad luck.
          </li>
          {v.compare.map((c) => <li key={c}>{c}</li>)}
          {v.potion && <li>{v.potion}</li>}
          {v.measured && <li>{v.measured}</li>}
        </ul>
        <p className="small muted">
          Why: your levels, XP and worn gear from the game against the wiki stats of the {foeLabel(e.foe)} ({COMBAT_FOES_DATE}), with the combat formulas,
          level ups on the way, 1 health a minute regenerating, finding the next target and walking to the bank. The range holds about 9 outcomes in 10.
          {v.assumed.length ? ` Assumed: ${v.assumed.join('; ')}.` : ''}
        </p>
      </details>
    </section>
  );
}
