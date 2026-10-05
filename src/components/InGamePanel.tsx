// "🧭 Show in the game": the step goes to the RuneLite plugin — the arrow, the highlight of NPCs, objects, tiles,
// the needed dialogue options and items. Below — what exactly will be highlighted.

import { useState } from 'react';
import type { InGameTarget, Step } from '../types';
import { useBridge } from '../bridge';
import { toInGameTarget } from '../services/runeliteBridge';
import { PreflightPanel } from './PreflightPanel';
import { PacingLine } from './PacingLine';
import { PluginUpdateNote } from './PluginUpdateNote';
import { triggerText } from '../lib/triggers';
import { plural } from '../lib/shopping';

const GROUPS: [keyof InGameTarget, string][] = [
  ['npcNames', 'NPC'],
  ['objectNames', 'Object'],
  ['dialogChoices', 'Dialogue'],
  ['highlightItems', 'Item'],
];

export function InGamePanel({ step }: { step: Step }) {
  const { enabled, state, activeStepId, pointInGame, clear, canLaunch, launchRuneLite, shortestPath } = useBridge();
  const [notice, setNotice] = useState<'' | 'sending' | 'offline'>('');
  if (!enabled || !toInGameTarget(step)) return null;
  const active = activeStepId === step.id;
  // Without a link the step is not "active in RuneLite" but waits for the connection — it will return there by itself.
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
    <section className="step-section ingame" aria-label="In-game hints">
      <div className="ingame-row">
        <button type="button" className={`btn ${active ? 'btn-ingame-active' : ''}`} onClick={point} disabled={notice === 'sending'}
          title={active ? 'The step already guides you in the game. Click to send it again' : undefined}
          aria-describedby={notice === 'offline' ? `ingame-${step.id}` : undefined}>
          {active ? '✓ Shown in the game' : '🧭 Show in the game'}
        </button>
        {live && <span className="badge badge-ingame">● Active in RuneLite</span>}
        {active && !live && <span className="badge">○ It will return to the game when RuneLite connects</span>}
        {active && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void clear()}>Remove from the game</button>}
      </div>
      {notice === 'offline' && (
        <p className="muted small" id={`ingame-${step.id}`} role="status">
          RuneLite bridge offline{state === 'online' ? ' or refused' : ''}
          {canLaunch
            ? <>. <button type="button" className="btn btn-sm" onClick={() => void launchRuneLite()}>🎮 Launch RuneLite</button> — in ~10 seconds press "Show in the game" again.</>
            : <>: start RuneLite with the OSRS Path Bridge plugin (how — in the README, the "RuneLite bridge" section).</>}
        </p>
      )}
      {active && <PluginUpdateNote />}
      <PacingLine step={step} />
      {trigger && <p className="muted small">The step will be marked by itself when {triggerText(trigger)}.</p>}
      {active && !shortestPath && (
        <p className="muted small">
          {waypoints.length ? `🗺 A route through ${waypoints.length} ${plural(waypoints.length, 'point', 'points')}.` : '🗺 The arrow shows the straight-line direction.'}
          {' '}Install Shortest Path from the Plugin Hub for the path with walls.
        </p>
      )}
      <PreflightPanel step={step} />
      {waypoints.length > 0 && (
        <details className="ingame-details">
          <summary className="subhead">Route · {waypoints.length} {plural(waypoints.length, 'point', 'points')}</summary>
          <ol className="ingame-route">{waypoints.map((w, i) => <li key={i}>{w.label ?? `${w.x}, ${w.y}`}</li>)}</ol>
        </details>
      )}
      {chips.length > 0 && (
        <details className="ingame-details">
          <summary className="subhead">Highlighted in the game · {chips.length}</summary>
          <ul className="ingame-chips">
            {chips.map((c) => (
              <li key={`${c.kind}:${c.name}`} className={`ingame-chip is-${c.kind === 'Dialogue' ? 'dialog' : 'plain'}`}>
                <span className="ingame-kind">{c.kind}</span> {c.name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
