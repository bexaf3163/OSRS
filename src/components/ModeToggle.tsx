// Переключатель режима игры в шапке: [ 🛡️ F2P | 👑 Members ].
// Members добавляет этапы 7–9, навыки подписки и альтернативы для членов в шагах F2P.

import type { GameMode } from '../types';
import { useStore } from '../store';

const MODES: [GameMode, string, string, string][] = [
  ['f2p', '🛡️', 'F2P', 'Бесплатная версия: этапы 1–6'],
  ['members', '👑', 'Members', 'Подписка: этапы 1–9 и навыки подписки'],
];

export function ModeToggle() {
  const { mode, setMode } = useStore();
  return (
    <div className="mode-toggle" role="group" aria-label="Режим игры">
      {MODES.map(([m, icon, label, title]) => (
        <button key={m} type="button" className={`mode-btn is-${m} ${mode === m ? 'is-active' : ''}`}
          aria-pressed={mode === m} title={title} onClick={() => setMode(m)}>
          <span aria-hidden="true">{icon}</span>
          <span className="mode-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
