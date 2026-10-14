// "🧭 How to get there": where you are now (the plugin) and how best to reach the step's place — on foot, by teleport, canoe, fairy ring or charter ship,
// and, when it is clearly worth it, by way of the bank or the exchange to fetch a teleport tablet first (the app only suggests; it never buys).
// What is available is counted from the levels and items from the game; what we do not know (the bank was not opened) is marked "?". The distances are in a
// straight line: this is a comparison of options, not an exact time.

import { useMemo, useState } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { usePlayerState } from '../playerStateContext';
import { checkStatus } from '../services/runeliteBridge';
import { fairyRingsUnlocked, travelInputOf } from '../lib/travelInput';
import { stepPlaces } from '../lib/stepPlaces';
import { dist, travelOptions, TRANSPORT, walkText, type Availability, type Point, type TravelOption } from '../lib/travel';
import { isOverworld } from '../lib/instances';
import { transportSources } from '../lib/liveTransport';
import { RoadSupplies } from './RoadSupplies';
import { roadSteps } from '../lib/travelSupplies';
import { isClosed } from '../lib/next-step';

const BADGE: Record<Availability, string> = { ready: '✓ available now', maybe: '? check', locked: '🔒 not yet' };
/** A way that starts with a stop (runes, a tablet, coins, an axe to get first) is neither "now" nor "check": it says what to do first. */
const badgeOf = (o: TravelOption) => (o.availability !== 'locked' && (o.prepare || o.acquire) ? '⇢ after a stop' : BADGE[o.availability]);

export function TravelPlan({ step }: { step: Step }) {
  const { progress, mode, steps } = useStore();
  const { prices, state: player } = usePlayerState();
  const { enabled, state, inGame, stats, gear, owned, navigate } = useBridge();
  const places = useMemo(() => stepPlaces(step), [step]);
  const [pos, setPos] = useState<Point | null>(null);
  const [homeCooldown, setHomeCooldown] = useState<number | null>(null);
  const [homeKnown, setHomeKnown] = useState<boolean | null>(null);
  const [spellbook, setSpellbook] = useState<number | null>(null);
  const [charges, setCharges] = useState<number | null>(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState(0);
  if (!enabled || !places.length) return null;
  const target = places[Math.min(to, places.length - 1)];

  const ask = async () => {
    setBusy(true);
    // One reply gives the place and the Home Teleport cooldown (plugin 2.37+).
    const st = await checkStatus();
    const live = st.online && st.inGame;
    setPos(live ? st.pos : null);
    setHomeCooldown(live ? st.homeTeleportSeconds : null);
    setHomeKnown(live ? st.homeTeleportKnown : null);
    setSpellbook(live ? st.spellbook : null);
    setCharges(live ? st.chronicleCharges : null);
    setAsked(true);
    setBusy(false);
  };

  const onMap = Boolean(pos) && isOverworld(pos) && isOverworld(target);
  const all: TravelOption[] = pos && onMap
    ? travelOptions(travelInputOf({
      from: pos, to: target, levels: progress.levels, stats, gear, owned, priceOf: prices.priceOf, mode, homeCooldownSec: homeCooldown, fairyRings: fairyRingsUnlocked(progress),
      ...(homeKnown !== null ? { homeCooldownKnown: homeKnown } : {}), spellbook, chronicleCharges: charges, sourceOf: transportSources(player, prices.priceOf),
    }))
    : [];
  // A way and the same way "after a stop" are one line: the one with the stop says what is missing and where to get it.
  const options = all.filter((o) => !all.some((x) => x.id === `${o.id}-prepare`));

  return (
    <section className="step-section travel-plan" aria-label="How to get there">
      <div className="ingame-row">
        <button type="button" className="btn" onClick={() => void ask()} disabled={busy || state !== 'online' || !inGame}>
          📍 Where am I? How to get there
        </button>
        {places.length > 1 && (
          <label className="small select-field">
            <span className="muted">to</span>
            <select value={to} onChange={(e) => setTo(Number(e.target.value))} aria-label="Where to go">
              {places.map((p, i) => <option key={`${p.x},${p.y},${i}`} value={i}>{p.label}</option>)}
            </select>
          </label>
        )}
      </div>
      {(state !== 'online' || !inGame) && <p className="muted small">The game with the plugin is needed: log in to the game in RuneLite and the app will know where you are.</p>}
      {asked && !pos && state === 'online' && inGame && (
        <p className="muted small" role="status">The plugin did not report the position: plugin 2.12+ and the "levels and XP" sending turned on in its settings are needed.</p>
      )}
      {pos && !onMap && (
        <p className="muted small">You or the target are underground or in an instance: a straight line over the world map cannot be counted there.</p>
      )}
      {pos && options.length > 0 && (
        <>
          <p className="small">You are at tile {pos.x}, {pos.y} — to "{target.label}" in a straight line {dist(pos, target)} tiles.</p>
          <ul className="travel-list">
            {options.slice(0, 4).map((o) => (
              <li key={o.id} className={`travel-option is-${o.availability}`}>
                <div className="travel-head">
                  <strong className="travel-title">{o.title}</strong>
                  <span className={`badge travel-badge is-${o.availability}`}>{badgeOf(o)}</span>
                </div>
                <p className="muted small travel-walk">on foot {walkText(o.walkTiles)}</p>
                {o.legs.length > 1 && <p className="muted small">{o.legs.map((l) => l.label).join(' → ')}</p>}
                {o.needs.filter((n) => n.ok !== true).length > 0 && (
                  <p className="small">
                    Needs: {o.needs.filter((n) => n.ok !== true).map((n) => `${n.text}${n.ok === null ? ' (?)' : ''}`).join(', ')}.
                  </p>
                )}
                {o.note && <p className="muted small">{o.note}</p>}
                {o.id === 'canoe' && o.availability !== 'locked' && (
                  <button type="button" className="btn btn-sm" onClick={() => void navigateToStation(o, navigate)}>🧭 Lead to the station</button>
                )}
                {o.go && o.availability !== 'locked' && (
                  <button type="button" className="btn btn-sm" onClick={() => void navigate({ label: o.go!.label, x: o.go!.x, y: o.go!.y, plane: o.go!.plane })}>🧭 Lead to {o.go.label}</button>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">Points and conditions — the wiki (checked {TRANSPORT.checked}). The distance is in a straight line: the app does not know the obstacles, in combat and at low energy it takes longer.</p>
        </>
      )}
      {pos && options.length === 1 && (
        <p className="small">You are already close — neither a teleport nor a canoe beats walking.</p>
      )}
      <RoadSupplies steps={roadSteps(steps, (id) => !isClosed(progress, id), step.id)} from={pos} locate heading="Supplies for the road ahead" quietWhenEmpty />
    </section>
  );
}

/** The arrow in the game — to the canoe station this variant starts from. */
async function navigateToStation(o: TravelOption, navigate: ReturnType<typeof useBridge>['navigate']): Promise<void> {
  const name = o.title.replace(/^Canoe\s+/, '').split(' → ')[0];
  const station = TRANSPORT.canoe.stations.find((s) => s.name === name);
  if (station) await navigate({ label: `Canoe station — ${station.name}`, x: station.x, y: station.y, plane: station.plane });
}
