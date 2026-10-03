// «💰 Цель шага»: сколько монет уже есть и сколько даст продажа добытого — у шагов-заработков (S1-13, S3-06).
// Монеты — точно, из игры; предметы — «~» по ценам биржи. Без открытого банка прогресс не выдумываем.

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
  // За сеанс: известные монеты и оценка добычи — раздельно; время — только по достаточным замерам.
  const rate = ratePerMinute(ledger, Date.now(), (e) => (e.name === 'Coins' ? e.quantityDelta : e.estimatedGpValue ?? 0));
  const g = p ? resourceGoal('Монеты', p.cash, p.goal, { estimated: summary.estimatedLootValue > 0 ? summary.estimatedLootValue : undefined, ratePerMinute: rate }) : null;
  const session = now.entries > 0 && (now.coinsEarned > 0 || now.estimatedLootValue > 0) ? (
    <p className="small muted">
      За этот сеанс: монет +{formatGp(now.coinsEarned)}{now.estimatedLootValue > 0 ? <>, добыча ≈{formatGp(now.estimatedLootValue)} gp (оценка, не деньги; {priceNote(prices)})</> : null}
      {g?.estimatedProgress !== undefined && !g.done ? <> · с добычей ≈{formatGp(g.estimatedProgress)} из {goal}</> : null}
      {g?.etaMinutes ? <> · при таком темпе ≈{g.etaMinutes} мин</> : null}.
    </p>
  ) : null;
  // Журнал хранится между сеансами: если в нём есть и прежние дни, итог за всё время — отдельной строкой.
  const total = from !== null && summary.entries > now.entries && (summary.coinsEarned > 0 || summary.estimatedLootValue > 0) ? (
    <p className="small muted">
      С {new Date(from).toLocaleDateString('ru-RU')}: монет +{formatGp(summary.coinsEarned)}{summary.estimatedLootValue > 0 ? <>, добыча ≈{formatGp(summary.estimatedLootValue)} gp</> : null}.
    </p>
  ) : null;
  return (
    <section className="money-goal" aria-label="Цель по монетам">
      <p className="readiness-head">💰 <strong>Цель шага: {goal} gp</strong></p>
      {body}
      {session}
      {total}
    </section>
  );
}
