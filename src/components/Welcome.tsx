// The first screen for a new player: what this is and the three things to do. It goes away on its own with the first mark or on "Got it".

import { useState } from 'react';
import { useStore } from '../store';

const KEY = 'osrs-put:welcome-done';

function dismissed(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function Welcome({ compact = false }: { compact?: boolean }) {
  const { progress } = useStore();
  const [hidden, setHidden] = useState(dismissed);
  if (hidden || Object.keys(progress.steps).length > 0) return null;
  const close = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* it comes back next time, which is harmless */ }
    setHidden(true);
  };
  return (
    <section className={`welcome-card ${compact ? 'is-compact' : ''}`} aria-label="Welcome">
      <div>
        <h2>Welcome to OSRS Path</h2>
        {compact
          ? <p className="muted">Do what the big heading says, press Done, and the page moves on.</p>
          : <p className="muted">A step-by-step route for a free-to-play account, from the first step after Tutorial Island to rune armour.</p>}
        {!compact && <ol>
          <li><strong>Read the big heading.</strong> It is what to do right now.</li>
          <li><strong>Press Done</strong> when you have finished. The page moves to the next step.</li>
          <li><strong>Optional:</strong> connect RuneLite to see arrows and highlights in the game and to have steps tick themselves.</li>
        </ol>}
      </div>
      <div className="welcome-actions">
        <button type="button" className="btn btn-primary" onClick={close}>Got it</button>
        <a className="btn btn-ghost" href="#/settings" onClick={() => { try { localStorage.setItem('osrs-put-settings-tab', 'game'); } catch { /* the tab opens on its own */ } }}>Set up RuneLite</a>
      </div>
    </section>
  );
}
