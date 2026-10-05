// The game mode switch in the header: [ 🛡️ F2P | 👑 Members ].
// Members adds stages 7–9, members skills and the members alternatives in the F2P steps.

import type { GameMode } from '../types';
import { useStore } from '../store';

const MODES: [GameMode, string, string, string][] = [
  ['f2p', '🛡️', 'F2P', 'Free version: stages 1–6'],
  ['members', '👑', 'Members', 'Membership: stages 1–9 and members skills'],
];

export function ModeToggle() {
  const { mode, setMode } = useStore();
  return (
    <div className="mode-toggle" role="group" aria-label="Game mode">
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
