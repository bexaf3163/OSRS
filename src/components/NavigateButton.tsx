// "🧭 Point the arrow in the game": a temporary target in RuneLite — the arrow, the Shortest Path route and the HUD lead to the place,
// and on arrival (or after buying the needed item) the player sees their step again. Coordinates come here only from place search.
// Without RuneLite the button does not break the window: "RuneLite offline" appears next to it, the map works as before.

import { useState } from 'react';
import { useBridge } from '../bridge';
import type { NavTargetPayload } from '../services/runeliteBridge';

// The target is recognised by place, NPC and item, not by the label: a target chosen in the game (the "What you need" list) the plugin
// labels in its own way — for a step point the label in the game and on the app map can differ. The NPC is compared: the same
// tile without an NPC highlight is a different target, it can be sent.
const npcKey = (t: NavTargetPayload) => (t.npcNames ?? []).join('|');
const same = (a: NavTargetPayload | null, b: NavTargetPayload) =>
  !!a && a.x === b.x && a.y === b.y && a.plane === b.plane && (a.itemName ?? null) === (b.itemName ?? null) && npcKey(a) === npcKey(b);

interface Props {
  target: NavTargetPayload;
  label?: string;
  /** A small icon button in a list row. */
  compact?: boolean;
  className?: string;
}

export function NavigateButton({ target, label = '🧭 Point the arrow in the game', compact, className = '' }: Props) {
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
        <span className="badge badge-ingame">● The arrow leads here</span>
        {!compact && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void clearNav()}>Return to the step</button>}
      </span>
    );
  }
  return (
    <span className={`nav-state ${className}`}>
      <button type="button" className={compact ? 'icon-btn nav-btn' : 'btn btn-sm'} onClick={() => void go()} disabled={busy}
        title="Point in RuneLite: the arrow and the route to this place" aria-label={compact ? `Point in RuneLite: ${target.label}` : undefined}>
        {compact ? '🧭' : busy ? '🧭 Sending…' : label}
      </button>
      {(problem || (!compact && state === 'offline')) && (
        <span className="nav-offline small" role="status">{problem || 'RuneLite offline'}</span>
      )}
    </span>
  );
}
