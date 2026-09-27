// «🧭 Направить стрелку в игре»: временная цель в RuneLite — стрелка, маршрут Shortest Path и HUD ведут к месту,
// а дойдя (или купив нужный предмет), игрок снова видит свой шаг. Координаты сюда приходят только из поиска мест.
// Без RuneLite кнопка не ломает окно: рядом появляется «RuneLite offline», карта работает как раньше.

import { useState } from 'react';
import { useBridge } from '../bridge';
import type { NavTargetPayload } from '../services/runeliteBridge';

// Цель узнаётся по месту, NPC и предмету, а не по подписи: цель, выбранную в игре (список «Что нужно»), плагин
// подписывает по-своему — у точки шага подпись в игре и на карте программы бывает разной. NPC сравнивается: та же
// клетка без подсветки NPC — другая цель, её можно отправить.
const npcKey = (t: NavTargetPayload) => (t.npcNames ?? []).join('|');
const same = (a: NavTargetPayload | null, b: NavTargetPayload) =>
  !!a && a.x === b.x && a.y === b.y && a.plane === b.plane && (a.itemName ?? null) === (b.itemName ?? null) && npcKey(a) === npcKey(b);

interface Props {
  target: NavTargetPayload;
  label?: string;
  /** Маленькая кнопка-значок в строке списка. */
  compact?: boolean;
  className?: string;
}

export function NavigateButton({ target, label = '🧭 Направить стрелку в игре', compact, className = '' }: Props) {
  const { enabled, state, navigate, navTarget, clearNav } = useBridge();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (!enabled) return null;
  const active = same(navTarget, target);

  const go = async () => {
    setBusy(true);
    setProblem('');
    const r = await navigate(target);
    setBusy(false);
    if (!r.ok) setProblem(r.reason === 'refused' ? r.message : 'RuneLite offline');
  };

  if (active) {
    return (
      <span className={`nav-state ${className}`} role="status">
        <span className="badge badge-ingame">● Стрелка ведёт сюда</span>
        {!compact && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void clearNav()}>Вернуть к шагу</button>}
      </span>
    );
  }
  return (
    <span className={`nav-state ${className}`}>
      <button type="button" className={compact ? 'icon-btn nav-btn' : 'btn btn-sm'} onClick={() => void go()} disabled={busy}
        title="Указать в RuneLite: стрелка и маршрут к этому месту" aria-label={compact ? `Указать в RuneLite: ${target.label}` : undefined}>
        {compact ? '🧭' : busy ? '🧭 Отправляю…' : label}
      </button>
      {(problem || (!compact && state === 'offline')) && (
        <span className="nav-offline small" role="status">{problem || 'RuneLite offline'}</span>
      )}
    </span>
  );
}
