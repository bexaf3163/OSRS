// «💰 Цель шага»: сколько монет уже есть и сколько даст продажа добытого — у шагов-заработков (S1-13, S3-06).
// Монеты — точно, из игры; предметы — «~» по ценам биржи. Без открытого банка прогресс не выдумываем.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { formatGp } from '../lib/shopping';
import { moneyGoalProgress, wealthOf } from '../lib/wealth';

export function MoneyGoal({ step }: { step: Step }) {
  const { gear, state } = useBridge();
  if (!step.moneyGoal) return null;
  const w = wealthOf(gear);
  const p = moneyGoalProgress(step.moneyGoal, w);
  const goal = formatGp(step.moneyGoal);
  let body;
  if (!w) {
    body = <p className="small muted">{state === 'online' ? 'Войди в игру — программа посчитает монеты.' : 'Сколько монет уже есть, программа узнает из RuneLite. Без связи — проверь банк сам.'}</p>;
  } else if (!p) {
    body = <p className="small">В сумке {formatGp(w.cash.bag ?? 0)} gp. <span className="muted">Открой банк в игре — посчитаю, сколько там, и покажу прогресс.</span></p>;
  } else {
    const pct = Math.min(100, Math.round((p.cash / p.goal) * 100));
    body = (
      <>
        <div className="money-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.goal} aria-valuenow={p.cash} aria-label={`Монеты: ${formatGp(p.cash)} из ${goal}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="small">
          <strong>Монеты: {formatGp(p.cash)} / {goal} gp</strong>
          <span className="muted"> (сумка {formatGp(w.cash.bag ?? 0)}, банк {formatGp(w.cash.bank ?? 0)})</span>
          {p.done ? <strong className="ok-text"> — цель есть ✓</strong> : <> — не хватает {formatGp(p.missingCash)}</>}
        </p>
        {p.itemsValue !== null && p.itemsValue > 0 && (
          <p className="small muted">
            Предметы в сумке и банке — ~{formatGp(p.itemsValue)} gp по ценам биржи (оценка, не деньги).
            {p.doneIfSold && <strong> Продашь добытое — цели хватит: ~{formatGp(p.withItems!)} gp.</strong>}
          </p>
        )}
      </>
    );
  }
  return (
    <section className="money-goal" aria-label="Цель по монетам">
      <p className="readiness-head">💰 <strong>Цель шага: {goal} gp</strong></p>
      {body}
    </section>
  );
}
