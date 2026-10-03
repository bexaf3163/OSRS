// «🛒 Одна ходка»: что взять сейчас на этот шаг и ближайшие три — вместо отдельных заходов в банк и на биржу.
// Что уже есть, не покупается; «потом» не значит «купи сейчас». Для каждого предмета, которого нет, — лучший источник.
// Ничего не покупает: решает и подтверждает игрок.

import { useMemo } from 'react';
import type { Step } from '../types';
import { itemById } from '../data';
import { useStore } from '../store';
import { usePlayerState } from '../playerStateContext';
import { isClosed } from '../lib/next-step';
import { planOneTrip, type TripLine } from '../lib/oneTrip';
import { planSources } from '../lib/sourceRouter';
import { formatGp } from '../lib/shopping';

const STATUS_TEXT = { GET: 'взять', BANK: 'в банке — забери', UNKNOWN: 'не проверено', HAVE: 'есть' } as const;

function Line({ t }: { t: TripLine }) {
  const { state } = usePlayerState();
  const src = useMemo(() => {
    if (t.status !== 'GET') return null;
    const detail = t.line.id !== undefined ? itemById.get(t.line.id) : undefined;
    return planSources({ name: t.line.nameEn, need: t.line.count, detail, manualKey: t.line.key }, state).primary;
  }, [t, state]);
  const count = t.toGet && t.toGet > 0 ? ` ×${t.toGet}${t.line.exact ? '' : '+'}` : '';
  return (
    <li className={`trip-line is-${t.status.toLowerCase()}`}>
      <strong>{t.line.nameEn}{count}</strong>
      <span className="muted"> — {STATUS_TEXT[t.status]}</span>
      {src && <span className="muted"> · {src.label}{src.price ? `, ${formatGp(src.price)} gp` : ''}</span>}
    </li>
  );
}

export function OneTripCard({ step }: { step: Step }) {
  const { progress, steps } = useStore();
  const { state } = usePlayerState();
  const plan = useMemo(() => planOneTrip(steps, progress, step.id, state), [steps, progress, step.id, state]);
  if (isClosed(progress, step.id)) return null;
  const coinsShort = plan.coins.missing !== null && plan.coins.missing > 0;
  if (!plan.now.length && !plan.soon.length && !coinsShort) return null;
  const unknown = plan.unknown.length;
  return (
    <section className="one-trip" aria-label="Одна ходка">
      <p className="readiness-head">🛒 <strong>Возьми за один заход</strong> <span className="muted">— на {plan.stepIds.length} {plan.stepIds.length === 1 ? 'шаг' : 'шага'} вперёд</span></p>
      {plan.now.length > 0 && (
        <>
          <p className="small"><strong>Сейчас</strong></p>
          <ul className="small">{plan.now.map((t) => <Line key={t.line.key} t={t} />)}</ul>
        </>
      )}
      {plan.soon.length > 0 && (
        <>
          <p className="small"><strong>Заодно</strong> <span className="muted">— понадобится в ближайших шагах</span></p>
          <ul className="small">{plan.soon.map((t) => <Line key={t.line.key} t={t} />)}</ul>
        </>
      )}
      {coinsShort && <p className="small">💰 Монеты на шаги: не хватает {formatGp(plan.coins.missing!)} gp из {formatGp(plan.coins.need)}.</p>}
      {plan.later.length > 0 && (
        <details className="small">
          <summary className="muted">Позже: {plan.later.length}</summary>
          <ul>{plan.later.map((t) => <Line key={t.line.key} t={t} />)}</ul>
        </details>
      )}
      {unknown > 0 && <p className="small muted">Не проверено: {unknown} — открой банк в игре, и я посчитаю точнее.</p>}
      <p className="small"><a className="btn btn-ghost btn-sm" href="#/shopping">🛒 Открыть закупки</a></p>
    </section>
  );
}
