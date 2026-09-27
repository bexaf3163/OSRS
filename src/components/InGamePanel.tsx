// «🧭 Указать в игре»: шаг уходит в плагин RuneLite — стрелка, подсветка NPC, объектов, клеток,
// нужных вариантов диалога и предметов. Ниже — что именно подсветится.

import { useState } from 'react';
import type { InGameTarget, Step } from '../types';
import { useBridge } from '../bridge';
import { toInGameTarget } from '../services/runeliteBridge';
import { PreflightPanel } from './PreflightPanel';
import { PacingLine } from './PacingLine';
import { triggerText } from '../lib/triggers';

const GROUPS: [keyof InGameTarget, string][] = [
  ['npcNames', 'NPC'],
  ['objectNames', 'Объект'],
  ['dialogChoices', 'Диалог'],
  ['highlightItems', 'Предмет'],
];

export function InGamePanel({ step }: { step: Step }) {
  const { enabled, state, activeStepId, pointInGame, clear, canLaunch, launchRuneLite, shortestPath } = useBridge();
  const [notice, setNotice] = useState<'' | 'sending' | 'offline'>('');
  if (!enabled || !toInGameTarget(step)) return null;
  const active = activeStepId === step.id;
  // Без связи шаг не «активен в RuneLite», а ждёт подключения — вернётся туда сам.
  const live = active && state === 'online';
  const g = step.inGame;
  const trigger = g?.completionTrigger;
  const waypoints = g?.pathWaypoints ?? [];
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
        {live && <span className="badge badge-ingame">● Активно в RuneLite</span>}
        {active && !live && <span className="badge">○ Вернётся в игру, когда RuneLite подключится</span>}
        {active && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void clear()}>Убрать из игры</button>}
      </div>
      {notice === 'offline' && (
        <p className="muted small" id={`ingame-${step.id}`} role="status">
          RuneLite мост оффлайн{state === 'online' ? ' или отказал' : ''}
          {canLaunch
            ? <>. <button type="button" className="btn btn-sm" onClick={() => void launchRuneLite()}>🎮 Запустить RuneLite</button> — через ~10 секунд нажми «Указать в игре» ещё раз.</>
            : <>: запусти RuneLite с плагином OSRS Path Bridge (как — в README, раздел «RuneLite bridge»).</>}
        </p>
      )}
      <PacingLine step={step} />
      {trigger && <p className="muted small">Шаг отметится сам, когда {triggerText(trigger)}.</p>}
      {active && (
        <p className="muted small">
          {shortestPath
            ? '🗺 Путь по земле прокладывает Shortest Path — с учётом стен и дверей.'
            : waypoints.length ? `🗺 Маршрут по ${waypoints.length} точкам: стрелка и HUD ведут от точки к точке. Путь с учётом стен рисует плагин Shortest Path из Plugin Hub.`
              : '🗺 Стрелка показывает направление по прямой. Путь с учётом стен рисует плагин Shortest Path из Plugin Hub.'}
        </p>
      )}
      <PreflightPanel step={step} />
      {waypoints.length > 0 && (
        <details className="ingame-details">
          <summary className="subhead">Маршрут · {waypoints.length} {waypoints.length < 5 ? 'точки' : 'точек'}</summary>
          <ol className="ingame-route">{waypoints.map((w, i) => <li key={i}>{w.label ?? `${w.x}, ${w.y}`}</li>)}</ol>
        </details>
      )}
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
