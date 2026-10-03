// «🍖 Еда на бой»: чем и когда бьёт противник шага (вики) и что из еды у тебя уже есть. Здоровье — из игры или со страницы навыков.

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
    <section className="step-section food-advice" aria-label="Еда на бой">
      <h4 className="subhead">🍖 Еда на бой</h4>
      <ul className="small">
        {views.map((v) => (
          <li key={v.key}>
            <strong>{v.key}</strong>: бьёт до {v.typical}{v.excluded ? ` (без защиты — до ${v.worst}: ${v.excluded.label})` : ''} раз в {v.everySeconds} с.
            {v.threat.hits.length > 1 && !v.excluded && <> Удары: {v.threat.hits.map((h) => `${h.n}${h.label ? ` ${h.label}` : ''}`).join(', ')}.</>}
            {' '}Ешь, когда HP ниже {v.eatBelow}.
            {v.survives !== null && <> Твоё HP {hp} — это {v.survives} {v.survives === 1 ? 'максимальный удар' : 'максимальных ударов'} подряд.</>}
          </li>
        ))}
      </ul>
      {gear?.inventory ? (
        best
          ? <p className="small">В сумке: {bag.map((b) => `${b.food.name} ×${b.count} (+${b.food.heals})`).join(', ')}.{best.food.heals >= worst ? ' Одного укуса хватает, чтобы перекрыть максимальный удар.' : ` Одна порция лечит меньше максимального удара (${worst}) — ешь заранее.`}</p>
          : <p className="small">Еды в сумке нет. Одним укусом перекрывают максимальный удар ({worst}): {covering.slice(0, 4).map((f) => `${f.name} (+${f.heals})`).join(', ') || 'нужна еда посильнее'}.</p>
      ) : (
        <p className="muted small">Еда, которая перекрывает максимальный удар ({worst}): {covering.slice(0, 4).map((f) => `${f.name} (+${f.heals})`).join(', ') || '—'}.</p>
      )}
      <p className="muted small">Удары и лечение — вики на {THREATS_DATE}. Порог «в два удара» — запас на случай двух ударов подряд.</p>
    </section>
  );
}
