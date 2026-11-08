// "🧭 How to get there": where you are now (the plugin) and how best to reach the step's place — on foot, by teleport, canoe, fairy ring or charter ship,
// and, when it is clearly worth it, by way of the bank or the exchange to fetch a teleport tablet first (the app only suggests; it never buys).
// What is available is counted from the levels and items from the game; what we do not know (the bank was not opened) is marked "?". Walks follow the
// shortest known path when the route worker has one (2.82.7), else a labelled straight line: a comparison, not an exact time.

import { useMemo, useState } from 'react';
import type { Step } from '../../../types';
import { useBridge } from '../../../state/bridge';
import { useStore } from '../../../state/store';
import { useDecision, useDecisionWindow } from '../../../state/decision';
import { routedWalk } from '../../../services/routedWalk';
import { roadFrom } from '../../../domain/prep/oneTrip';
import { usePlayerState } from '../../../state/playerStateContext';
import { checkStatus } from '../../../services/runeliteBridge';
import { fairyRingsUnlocked, oneTimeUsedOf, travelInputOf } from '../../../domain/travel/travelInput';
import { stepPlaces } from '../../../domain/travel/stepPlaces';
import { dist, travelOptions, TRANSPORT, walkText, type Availability, type Point, type TravelInput, type TravelOption } from '../../../domain/travel/travel';
import { isOverworld } from '../../../domain/travel/instances';
import { transportSources } from '../../../domain/readiness/liveTransport';
import { RoadSupplies } from '../../shopping/RoadSupplies';
import { isClosed } from '../../../domain/quests/next-step';

const BADGE: Record<Availability, string> = { ready: '✓ available now', maybe: '? check', locked: '🔒 not yet' };
/** A way that starts with a stop (runes, a tablet, coins, an axe to get first) is neither "now" nor "check": it says what to do first. */
const badgeOf = (o: TravelOption) => (o.availability !== 'locked' && (o.prepare || o.acquire) ? '⇢ after a stop' : BADGE[o.availability]);

export function TravelPlan({ step }: { step: Step }) {
  const { progress, mode } = useStore();
  const ahead = useDecisionWindow();
  const { prices, state: player } = usePlayerState();
  const { enabled, state, inGame, stats, gear, owned, navigate, questsDone } = useBridge();
  const places = useMemo(() => stepPlaces(step), [step]);
  const [pos, setPos] = useState<Point | null>(null);
  const [homeCooldown, setHomeCooldown] = useState<number | null>(null);
  const [homeKnown, setHomeKnown] = useState<boolean | null>(null);
  const [spellbook, setSpellbook] = useState<number | null>(null);
  const [charges, setCharges] = useState<number | null>(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState(0);
  const decision = useDecision();
  /** Real walks for one start and destination (routedWalk); another pair falls back to the labelled straight line. */
  const [routed, setRouted] = useState<{ key: string; walk: NonNullable<TravelInput['walk']> } | null>(null);
  if (!enabled || !places.length) return null;
  const target = places[Math.min(to, places.length - 1)];

  const pairKey = (a: Point, b: Point) => `${a.x},${a.y},${a.plane}>${b.x},${b.y},${b.plane}`;
  const inputOf = (from: Point, dest: Point): TravelInput => travelInputOf({
    from, to: dest, levels: progress.levels, stats, gear, owned, priceOf: prices.priceOf, mode, homeCooldownSec: homeCooldown, fairyRings: fairyRingsUnlocked(progress), oneTimeUsed: oneTimeUsedOf(progress), questsDone,
    ...(homeKnown !== null ? { homeCooldownKnown: homeKnown } : {}),
    spellbook, chronicleCharges: charges, sourceOf: transportSources(player, prices.priceOf),
  });
  const routeFor = async (from: Point, dest: Point) => {
    if (!decision || !isOverworld(from) || !isOverworld(dest)) return;
    const walk = await routedWalk(decision, from, dest, (w) => travelOptions({ ...inputOf(from, dest), walk: w }));
    setRouted({ key: pairKey(from, dest), walk });
  };
  const ask = async () => {
    setBusy(true);
    // One reply gives the place and the Home Teleport cooldown (plugin 2.37+).
    const st = await checkStatus();
    const live = st.online && st.inGame;
    setPos(live ? st.pos : null);
    if (live && st.pos) void routeFor(st.pos, target);
    setHomeCooldown(live ? st.homeTeleportSeconds : null);
    setHomeKnown(live ? st.homeTeleportKnown : null);
    setSpellbook(live ? st.spellbook : null);
    setCharges(live ? st.chronicleCharges : null);
    setAsked(true);
    setBusy(false);
  };

  const onMap = Boolean(pos) && isOverworld(pos) && isOverworld(target);
  const walk = pos && routed?.key === pairKey(pos, target) ? routed.walk : undefined;
  const all: TravelOption[] = pos && onMap ? travelOptions({ ...inputOf(pos, target), walk }) : [];
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
            <select value={to} onChange={(e) => { const n = Number(e.target.value); setTo(n); if (pos) void routeFor(pos, places[n]); }} aria-label="Where to go">
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
          <p className="small">You are at tile {pos.x}, {pos.y} — to "{target.label}" {walk?.(pos, target) != null ? <>{walk(pos, target)} tiles on foot by the shortest known path</> : <>in a straight line {dist(pos, target)} tiles</>}.</p>
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
          <p className="muted small">Points and conditions from the OSRS Wiki. {walk ? 'Walks follow the shortest known path; doors and stairs are labelled allowances.' : 'The distance is in a straight line: the route is not known yet.'} In combat and at low energy it takes longer.</p>
        </>
      )}
      {pos && options.length === 1 && (
        <p className="small">You are already close — neither a teleport nor a canoe beats walking.</p>
      )}
      <RoadSupplies steps={roadFrom(ahead, step).filter((s) => !isClosed(progress, s.id))} from={pos} locate heading="Supplies for the road ahead" quietWhenEmpty />
    </section>
  );
}

/** The arrow in the game — to the canoe station this variant starts from. */
async function navigateToStation(o: TravelOption, navigate: ReturnType<typeof useBridge>['navigate']): Promise<void> {
  const name = o.title.replace(/^Canoe\s+/, '').split(' → ')[0];
  const station = TRANSPORT.canoe.stations.find((s) => s.name === name);
  if (station) await navigate({ label: `Canoe station — ${station.name}`, x: station.x, y: station.y, plane: station.plane });
}
