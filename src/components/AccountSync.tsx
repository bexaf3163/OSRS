// «Синхронизировать с аккаунтом»: игра знает завершённые квесты и взятые уровни — шаги с такой автоотметкой
// можно закрыть сразу. Только отмечает (ничего не снимает) и с отменой.

import { useMemo, useState } from 'react';
import { stepById } from '../data';
import { useBridge } from '../bridge';
import { syncCandidates } from '../lib/accountSync';
import { gateAllows } from '../lib/profiles';
import { withReviewed, withStep } from '../lib/progress';
import { useStore } from '../store';

/** compact — плашка наверху «Пути» (прячется, если нечего отмечать); иначе карточка в настройках. */
export function AccountSync({ compact = false }: { compact?: boolean }) {
  const { steps, progress, replace } = useStore();
  const { state, plugin, questsDone, stats, gate } = useBridge();
  const [hidden, setHidden] = useState(false);
  const allowed = gateAllows(gate);
  const list = useMemo(() => (allowed ? syncCandidates(steps, progress, questsDone, stats) : []), [allowed, steps, progress, questsDone, stats]);

  const apply = () => {
    let p = progress;
    for (const c of list) {
      p = withStep(p, c.step.id, 'done');
      if (stepById.get(c.step.id)?.updatedInV2) p = withReviewed(p, [c.step.id]);
    }
    replace(p, `🎮 Из игры отмечено шагов: ${list.length}`);
  };

  if (compact) {
    if (state !== 'online' || hidden || !list.length) return null;
    return (
      <div className="plaque plaque-tip" role="note">
        <p><strong>🎮 Игра знает, что ты уже прошёл {list.length} {list.length === 1 ? 'шаг' : 'шагов'}</strong></p>
        <details>
          <summary className="small">Какие</summary>
          <ul className="small">{list.map((c) => <li key={c.step.id}><code className="code">{c.step.id}</code> {c.step.title} — {c.why}</li>)}</ul>
        </details>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={apply}>Отметить выполненными</button>
          <button type="button" className="btn btn-ghost" onClick={() => setHidden(true)}>Не сейчас</button>
        </div>
      </div>
    );
  }

  const old = state === 'online' && plugin !== null && (plugin.protocol ?? 0) < 5;
  return (
    <section className="card section-card">
      <h2 className="card-title">Синхронизация с аккаунтом</h2>
      <p className="muted small">
        Плагин сообщает, какие квесты завершены и какие уровни взяты. Шаги с такой автоотметкой можно закрыть сразу, не проходя
        их заново. Шаги, где нужны ещё и вещи, не трогаются. Только отмечает, ничего не снимает.
      </p>
      {state !== 'online' && <p className="muted small">Нет связи с RuneLite — запусти игру с плагином.</p>}
      {old && <p className="notice small">Нужен плагин 2.12 (протокол 5): перезапусти RuneLite из программы.</p>}
      {state === 'online' && !old && !gateAllows(gate) && <p className="notice small">В игре другой персонаж, чем в этом профиле — выбери профиль выше.</p>}
      {state === 'online' && !old && gateAllows(gate) && (questsDone === null
        ? <p className="muted small">Квесты ещё не пришли из игры — войди в игру (передача данных должна быть включена в плагине).</p>
        : list.length === 0
          ? <p className="muted small">✓ Всё, что игра знает, уже отмечено ({questsDone.length} квестов завершено).</p>
          : (
            <>
              <ul className="small">{list.map((c) => <li key={c.step.id}><code className="code">{c.step.id}</code> {c.step.title} — {c.why}</li>)}</ul>
              <div className="actions"><button type="button" className="btn btn-primary" onClick={apply}>Отметить {list.length} шагов</button></div>
            </>
          ))}
    </section>
  );
}
