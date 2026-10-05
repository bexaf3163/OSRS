// "🍖 Food for combat": how and when the step's opponent hits (wiki) and what food you already have. Health — from the game or from the skills page.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { foodInBag, foodsCovering, threatKeys, THREATS_DATE, viewThreat } from '../lib/foodAdvice';

export function FoodAdvice({ step }: { step: Step }) {
  const { progress } = useStore();
  const { stats, gear } = useBridge();
  const keys = threatKeys(step);
  if (!keys.length) return null;
  const hp = stats?.hitpoints ?? progress.levels.hitpoints;
  const views = keys.map((k) => viewThreat(k, hp));
  const worst = Math.max(...views.map((v) => v.typical));
  const bag = foodInBag(gear?.inventory ?? null);
  const covering = foodsCovering(worst);
  const best = bag[0];

  return (
    <section className="step-section food-advice" aria-label="Food for combat">
      <h4 className="subhead">🍖 Food for combat</h4>
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
          ? <p className="small">In the bag: {bag.map((b) => `${b.food.name} ×${b.count} (+${b.food.heals})`).join(', ')}.{best.food.heals >= worst ? ' One bite is enough to cover the max hit.' : ` One portion heals less than the max hit (${worst}) — eat ahead of time.`}</p>
          : <p className="small">No food in the bag. These cover the max hit ({worst}) with one bite: {covering.slice(0, 4).map((f) => `${f.name} (+${f.heals})`).join(', ') || 'you need stronger food'}.</p>
      ) : (
        <p className="muted small">Food that covers the max hit ({worst}): {covering.slice(0, 4).map((f) => `${f.name} (+${f.heals})`).join(', ') || '—'}.</p>
      )}
      <p className="muted small">Hits and healing — the wiki as of {THREATS_DATE}. The "two hits" threshold is a margin for two hits in a row.</p>
    </section>
  );
}
