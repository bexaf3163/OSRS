// «🧭 Указать в игре»: шаг уходит в плагин RuneLite — стрелка, подсветка NPC, объектов, клеток,
// нужных вариантов диалога и предметов. Ниже — что именно подсветится.

import { useState } from 'react';
import type { InGameTarget, Step } from '../types';
import { useBridge } from '../bridge';
import { toInGameTarget } from '../services/runeliteBridge';

const TRIGGER_TEXT: Record<NonNullable<InGameTarget['completionTrigger']>['type'], string> = {
  QUEST_COMPLETED: 'квест засчитается в игре',
  CHAT_MESSAGE: 'в чате игры появится сообщение о нужном уровне',
  VARBIT_CHANGED: 'игра засчитает этот этап',
};

const GROUPS: [keyof InGameTarget, string][] = [
  ['npcNames', 'NPC'],
  ['objectNames', 'Объект'],
  ['dialogChoices', 'Диалог'],
  ['highlightItems', 'Предмет'],
];

export function InGamePanel({ step }: { step: Step }) {
  const { enabled, state, activeStepId, pointInGame, clear } = useBridge();
  const [notice, setNotice] = useState<'' | 'sending' | 'offline'>('');
  if (!enabled || !toInGameTarget(step)) return null;
  const active = activeStepId === step.id;
  const g = step.inGame;
  const trigger = g?.completionTrigger;
  const chips = GROUPS.flatMap(([key, kind]) => ((g?.[key] as string[] | undefined) ?? []).map((name) => ({ kind, name })));

  const point = async () => {
    setNotice('sending');
    const r = await pointInGame(step);
    setNotice(r === 'ok' ? '' : 'offline');
  };

  return (
    <section className="step-section ingame" aria-label="Подсказки в игре">
      <div className="ingame-row">
        <button type="button" className={`btn ${active ? 'btn-ingame-active' : ''}`} onClick={point} disabled={notice === 'sending'}
          aria-describedby={notice === 'offline' ? `ingame-${step.id}` : undefined}>
          🧭 {active ? 'Обновить в игре' : 'Указать в игре'}
        </button>
        {active && <span className="badge badge-ingame">● Активно в RuneLite</span>}
        {active && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void clear()}>Убрать из игры</button>}
      </div>
      {notice === 'offline' && (
        <p className="muted small" id={`ingame-${step.id}`} role="status">
          RuneLite мост оффлайн{state === 'online' ? ' или отказал' : ''}: запусти RuneLite с плагином OSRS Path Bridge (как — в README, раздел «RuneLite bridge»).
        </p>
      )}
      {trigger && <p className="muted small">Шаг отметится сам, когда {TRIGGER_TEXT[trigger.type]}.</p>}
      {chips.length > 0 && (
        <details className="ingame-details">
          <summary className="subhead">Подсвечено в игре · {chips.length}</summary>
          <ul className="ingame-chips">
            {chips.map((c) => (
              <li key={`${c.kind}:${c.name}`} className={`ingame-chip is-${c.kind === 'Диалог' ? 'dialog' : 'plain'}`}>
                <span className="ingame-kind">{c.kind}</span> {c.name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
