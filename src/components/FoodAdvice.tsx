// "🍖 Food for combat" (a combat training step with the game linked: CombatPlan, the food planned for this player): how and when the step's opponent hits (wiki) and what food you already have. Health — from the game or from the skills page.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { effectiveHeal, foodInBag, foodsCovering, threatKeys, viewThreat } from '../lib/foodAdvice';
import { estimateStepFights, fightLine, OTHER_METHOD } from '../lib/fightEstimate';
import { foeLabel } from '../lib/combatEstimate';
import { CombatPlan, useCombatPlan } from './CombatPlan';
import { CombatRoute } from './CombatRoute';
import { usePriceView } from '../lib/funding/usePriceView';

export function FoodAdvice({ step }: { step: Step }) {
  const { progress, mode } = useStore();
  const { stats, gear } = useBridge();
  const prices = usePriceView(true);
  // A combat training step with the game linked: the food is planned for this player (trip, whole goal, what to buy) instead.
  const plan = useCombatPlan(step);
  if (plan) return <><CombatRoute step={step} /><CombatPlan v={plan} /></>;
  const keys = threatKeys(step);
  if (!keys.length) return null;
  const hp = stats?.hitpoints ?? progress.levels.hitpoints;
  const views = keys.map((k) => viewThreat(k, hp));
  const worst = Math.max(...views.map((v) => v.typical));
  const bag = foodInBag(gear?.inventory ?? null, mode);
  const covering = foodsCovering(worst, mode, hp, prices);
  const best = bag[0];
  // One fight with your kit (2.63.0): how long, how much damage, how much food; the fights the route does another way say so.
  const fights = estimateStepFights(step, stats as Partial<Record<string, number>> | null, gear);
  const other = keys.filter((k) => OTHER_METHOD[k]);

  return (
    <section className="step-section food-advice" aria-label="Food for combat">
      <h4 className="subhead">🍖 Food for combat</h4>
      {fights.length > 0 && (
        <div className="fight-plan">
          <ul className="small">{fights.map((f) => <li key={foeLabel(f.foe)}><strong>{fightLine(f)}</strong></li>)}</ul>
          <details className="zen-more">
            <summary className="small">How this is worked out</summary>
            <ul className="small">
              {fights.map((f) => (
                <li key={`d-${foeLabel(f.foe)}`}>
                  {foeLabel(f.foe)}: you hit {Math.round(f.hitChance * 100)}% of swings for up to {f.maxHit}; it hits you {Math.round(f.foeHitChance * 100)}% of its
                  swings for up to {f.foe.maxHit}. {f.style[0].toUpperCase() + f.style.slice(1)} is the style that takes the least damage.
                  {f.assumed.length ? ` Assumed: ${f.assumed.join('; ')}.` : ''}
                </li>
              ))}
            </ul>
            <p className="small muted">
              Your levels and worn gear from the game against the wiki stats, with the combat formulas; one fight at your
              current levels; the range holds about 9 outcomes in 10. The health above two of its max hits is counted before food. No kit guarantees survival.
            </p>
          </details>
        </div>
      )}
      {other.map((k) => <p key={`o-${k}`} className="small">{k}: {OTHER_METHOD[k]}.</p>)}
      <ul className="small">
        {views.map((v) => (
          <li key={v.key}>
            <strong>{v.key}</strong>: hits up to {v.typical}{v.excluded ? ` (without protection — up to ${v.worst}: ${v.excluded.label})` : ''} once every {v.everySeconds} s.
            {v.threat.hits.length > 1 && !v.excluded && <> Hits: {v.threat.hits.map((h) => `${h.n}${h.label ? ` ${h.label}` : ''}`).join(', ')}.</>}
            {' '}Eat when HP is below {v.eatBelow}.
            {v.survives !== null && <> Your HP {hp} — that is {v.survives} {v.survives === 1 ? 'max hit' : 'max hits'} in a row.</>}
          </li>
        ))}
      </ul>
      {gear?.inventory ? (
        best
          ? <p className="small">In the bag: {bag.map((b) => `${b.food.name} ×${b.count} (+${b.food.heals})`).join(', ')}.{effectiveHeal(best.food, hp) >= worst ? ' One bite is enough to cover the max hit.' : ` One portion heals less than the max hit (${worst}) — eat ahead of time.`}</p>
          : <p className="small">No food in the bag. These cover the max hit ({worst}) with one bite: {covering.slice(0, 4).map((f) => `${f.name} (+${f.heals})`).join(', ') || (hp !== undefined && hp <= worst ? 'your maximum health is too low to cover this hit with ordinary food' : 'you need stronger food')}.</p>
      ) : (
        <p className="muted small">Food that covers the max hit ({worst}): {covering.slice(0, 4).map((f) => `${f.name} (+${f.heals})`).join(', ') || '—'}.</p>
      )}
      <p className="muted small">Hits and healing from the OSRS Wiki. The "two hits" threshold is a margin for two hits in a row.</p>
    </section>
  );
}
