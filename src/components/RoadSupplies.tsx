// "For the road": before a long run, the teleports that clearly pay off on the coming steps and what to get for them (Teleport cards for the
// Chronicle, runes for the spells, the book itself), held against what the game reports. The planner is travelSupplies.ts; the game card shows the
// same plan as a "stock up here" line when the player passes the shop. The app only suggests: it never buys.

import { useEffect, useMemo, useState } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { usePlayerState } from '../playerStateContext';
import { transportSources } from '../lib/liveTransport';
import { planTravelSupplies, savedText, type SupplyItem } from '../lib/travelSupplies';
import { formatGp } from '../lib/shopping';
import type { Point } from '../lib/travel';

function haveText(i: SupplyItem, connected: boolean, chargesKnown: boolean): string {
  if (i.buy === 0) return `✓ enough (${i.have})`;
  if (i.have === null) {
    if (!connected) return 'not checked: log in with RuneLite';
    return i.name === 'Teleport card' && !chargesKnown ? '? check the book’s charges and your bank' : '? open your bank in the game';
  }
  return `you have ${i.have}`;
}

/**
 * locate: the road starts where the player stands (the current step's drawer); without a position given, the game is asked once. The Shopping page
 * plans whole stages and starts at their first place.
 */
export function RoadSupplies({ steps, from = null, locate = false, heading, quietWhenEmpty = false }: {
  steps: Step[]; from?: Point | null; locate?: boolean; heading: string; quietWhenEmpty?: boolean;
}) {
  const { progress, mode } = useStore();
  const { state, inGame, stats, gear, owned, chronicleCharges, spellbook, questInstruction, navigate, locate: whereAmI } = useBridge();
  const { prices, state: player } = usePlayerState();
  const connected = state === 'online' && inGame;
  const [here, setHere] = useState<Point | null>(null);
  const firstStep = steps[0]?.id;
  useEffect(() => {
    if (!locate || from || !connected) return;
    let live = true;
    void whereAmI().then((p) => { if (live) setHere(p); });
    return () => { live = false; };
  }, [locate, from, connected, firstStep, whereAmI]);
  const start = from ?? (locate && connected ? here : null);
  const plan = useMemo(() => planTravelSupplies({
    steps, from: start, instruction: questInstruction, levels: { ...progress.levels, ...(stats ?? {}) }, members: mode === 'members',
    gear: connected ? gear : null, owned: connected ? owned : null, spellbook, chronicleCharges, sourceOf: transportSources(player, prices.priceOf),
  }), [steps, start, questInstruction, progress.levels, stats, mode, connected, gear, owned, spellbook, chronicleCharges, player, prices.priceOf]);

  if (!plan.uses.length) {
    return quietWhenEmpty ? null : (
      <section className="road-supplies" aria-label={heading}>
        <h3 className="subhead">{heading}</h3>
        <p className="muted small">No teleport clearly beats walking on these steps with your levels: nothing to stock up for the road.</p>
      </section>
    );
  }
  const open = plan.items.filter((i) => i.buy > 0);
  const known = open.filter((i) => i.cost !== null);
  const total = known.reduce((s, i) => s + (i.cost ?? 0), 0);
  return (
    <section className="road-supplies" aria-label={heading}>
      <h3 className="subhead">{heading}</h3>
      <p className="small">
        {plan.uses.map((u) => `${u.way} ×${u.count}`).join(', ')} save <strong>{savedText(plan.savedTiles)}</strong> over {plan.steps} {plan.steps === 1 ? 'step' : 'steps'}
        {' '}(counted only where a teleport beats walking and the canoe by a clear margin).
      </p>
      <ul className="travel-list">
        {plan.items.map((i) => (
          <li key={i.name} className={`travel-option is-${i.buy === 0 ? 'ready' : i.certain ? 'locked' : 'maybe'}`}>
            <div className="travel-head">
              <strong className="travel-title">{i.buy === 0 ? i.name : `${i.certain ? '' : 'up to '}${i.name} ×${i.buy}`}</strong>
              <span className="badge travel-badge">{haveText(i, connected, chronicleCharges !== null)}</span>
            </div>
            <p className="muted small">
              for {i.for.join(', ')}{i.need > 1 ? ` · ${i.need} in all` : ''}
              {i.buy > 0 && i.source ? ` · at ${i.source.where}${i.cost !== null ? ` (~${formatGp(i.cost)} gp)` : ' (price unknown)'}` : ''}
              {i.buy > 0 && !i.source ? ' · no place to buy it is known' : ''}
            </p>
            {i.use && i.buy > 0 && <p className="muted small">Then {i.use}.</p>}
            {i.buy > 0 && i.source && connected && (
              <button type="button" className="btn btn-sm" onClick={() => void navigate({ label: i.source!.where, x: i.source!.point.x, y: i.source!.point.y, plane: i.source!.point.plane })}>
                🧭 Lead to {i.source.where.replace(/ — .*$/, '')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {plan.staffHints.map((h) => <p key={h} className="small">💡 {h[0].toUpperCase()}{h.slice(1)}.</p>)}
      {open.length > 0 && (
        <p className="muted small">
          To buy: {open.length} {open.length === 1 ? 'item' : 'items'}{known.length ? ` · ~${formatGp(total)} gp${known.length < open.length ? ' and some without a price' : ''}` : ''}.
          {' '}The game card says "Stock up" when you pass the shop.
        </p>
      )}
    </section>
  );
}
