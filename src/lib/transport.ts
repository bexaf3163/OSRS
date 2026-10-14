// The way to the step that is not walking, as the game needs it: what kind, where it ends, what to interact with, what to take out of the bag.
// The desktop planner (travel.ts) already knows; this turns its best option into the small record the plugin draws and highlights
// (`recommendedTransport` in the plan payload). The plugin never activates anything: it only points, and the player clicks.
//
// The data has no game object or NPC ids for the transports (the wiki tables give names and tiles), so interactionId is 0 (unknown) and the NAME is what
// the game highlights: the plugin already finds NPCs and objects by name. An id is added only where it is known.

import { TILES_PER_SECOND, NET, TRANSPORT, effectiveTiles, shortOf, shortOnHand, stopText, type Point, type PrepStop, type TravelOption } from './travel';
import { TIP_MIN_SAVING_TILES } from './tips';

export type TransportType = 'item_teleport' | 'tablet' | 'spell_teleport' | 'fairy_ring' | 'charter_ship' | 'canoe' | 'ferry';
/** ready: usable now. check: usable if what the app cannot see is fine (charges, a cooldown, a quest). prepare: usable after the listed stop. */
export type TransportState = 'ready' | 'check' | 'prepare';

export interface TransportPreparation {
  /** "Missing: Law rune ×1, Air rune ×2. Withdraw Law rune at Varrock West Bank; buy Air rune ×2 at Aubury's Rune Shop (~8 gp)." */
  text: string;
  /** What the bank should hand over: the plugin frames these when the bank is open. */
  withdraw: { name: string; quantity: number }[];
  stops: PrepStop[];
  /** gp for what is bought; null when a price is not known. */
  cost: number | null;
}

export interface RecommendedTransport {
  type: TransportType;
  /** Where it ends: "Falador", "Fairy ring AJR", "Catherby". */
  destination: string;
  /** The game object or NPC id to interact with; 0 means not known (the name is used). */
  interactionId: number;
  /** The NPC or object to find by name: "Fairy ring", "Trader Crewmember", "Captain Tobias". */
  interactionName?: string;
  /** The item in the bag to use: the plugin frames it in the inventory. */
  item?: string;
  /** Where to go first (the ring, the dock, the station, the pier, or the stop of a preparation): a click on the line points the arrow there. */
  tile?: Point;
  /** One line: "Teleport: Falador teleport tablet to Falador (saves ~330 tiles, about 1 min)". */
  text: string;
  /** The short action for the game screen: "⚡ Use Chronicle → Champions' Guild", "⚡ Break Varrock teleport tablet → Varrock Square". Up to 60 characters. */
  chip: string;
  state: TransportState;
  /** The line for the main card of the game, without the marker: "Use Chronicle → Champions' Guild · saves ~37 s · check charges". */
  summary: string;
  /** What to check first, in a few words; only with state "check". */
  check?: string;
  /** What to get first; only with state "prepare". */
  prepare?: TransportPreparation;
  /** Tiles of running saved over walking, with the stops and the cast time counted. */
  savedTiles: number;
}

const CHIP_MAX = 60;
/** Time at a counter or a bank booth: the walk in, the trade, the walk out. The same number the purchase detours use (detours.ts STOP_SECONDS). */
export const PREP_STOP_SECONDS = 20;
/** "by Champions' Guild", "Varrock Square by the fountain" and "Musa Point, Karamja" read better as just the place. */
const placeOf = (label: string) => label.replace(/^(by|at|the)\s+/i, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/,.*$/, '').replace(/\s+(by|at|near)\s+.*$/i, '').trim();
function chipOf(c: string): string {
  const s = `⚡ ${c}`;
  return s.length <= CHIP_MAX ? s : `${s.slice(0, CHIP_MAX - 1)}…`;
}

const TIP = TIP_MIN_SAVING_TILES;

function sec(tiles: number): string {
  const s = Math.max(1, Math.ceil(tiles / TILES_PER_SECOND));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

/** The names of the NPCs in a label like "the Port Sarim dock (Captain Tobias, Seaman Lorris)": the first one is what the plugin looks for. */
function npcsIn(label: string): string[] {
  const m = /\(([^)]+)\)/.exec(label);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

const cap = (s: string) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);
const qty = (m: { name: string; n: number }) => (m.n > 1 ? `${m.name} ×${m.n}` : m.name);

/** What a way costs for the comparison: the walk, the cast time, and the time at each stop of a preparation. */
export function journeyTiles(o: TravelOption): number {
  const stops = o.prepare?.stops.length ?? (o.acquire ? 1 : 0);
  return effectiveTiles(o) + stops * Math.round(PREP_STOP_SECONDS * TILES_PER_SECOND);
}

export function transportStateOf(o: TravelOption): TransportState {
  return o.prepare || o.acquire ? 'prepare' : o.availability === 'ready' ? 'ready' : 'check';
}

/** Why a way was or was not chosen: one row per candidate, for the developer diagnostics (never drawn for the player). */
export interface TransportVerdict {
  id: string;
  title: string;
  availability: TravelOption['availability'];
  state: TransportState | 'walk';
  /** Tiles on foot, and the same with the cast time and the stops counted. */
  walkTiles: number;
  journeyTiles: number;
  savedTiles: number;
  outcome: 'chosen' | 'rejected';
  /** Why not: locked, short on hand, saves too little, or a better way exists. */
  reason?: 'locked' | 'short_on_hand' | 'saves_too_little' | 'better_way';
  /** What is missing or unknown, as the planner words it. */
  needs: string[];
}

const RANK: Record<TransportState, number> = { ready: 0, check: 1, prepare: 2 };

/** The planner's options judged for the game: the chosen way (or none) and the verdict on every candidate. */
export function judgeTransport(options: readonly TravelOption[]): { best: TravelOption | null; verdicts: TransportVerdict[] } {
  const walk = options.find((o) => o.id === 'walk');
  if (!walk) return { best: null, verdicts: [] };
  const rows = options.filter((o) => o.id !== 'walk').map((o) => {
    const journey = journeyTiles(o);
    const saved = walk.walkTiles - journey;
    const reason: TransportVerdict['reason'] | undefined = o.availability === 'locked' ? 'locked' : shortOnHand(o) ? 'short_on_hand' : saved < TIP ? 'saves_too_little' : undefined;
    return { o, journey, saved, reason, state: transportStateOf(o) };
  });
  const best = rows.filter((r) => !r.reason).sort((a, b) => RANK[a.state] - RANK[b.state] || a.journey - b.journey)[0] ?? null;
  const verdicts: TransportVerdict[] = [
    { id: 'walk', title: walk.title, availability: walk.availability, state: 'walk', walkTiles: walk.walkTiles, journeyTiles: walk.walkTiles, savedTiles: 0, outcome: best ? 'rejected' : 'chosen', ...(best ? { reason: 'better_way' as const } : {}), needs: [] },
    ...rows.map((r): TransportVerdict => ({
      id: r.o.id, title: r.o.title, availability: r.o.availability, state: r.state, walkTiles: r.o.walkTiles, journeyTiles: r.journey, savedTiles: r.saved,
      outcome: r === best ? 'chosen' : 'rejected',
      ...(r === best ? {} : { reason: r.reason ?? ('better_way' as const) }),
      // A counted thing says what the bank holds as well: a number, or unknown (never read as zero).
      needs: r.o.needs.filter((n) => n.ok !== true).map((n) => `${n.text}${n.item ? ` [bank: ${n.item.bank ?? 'unknown'}]` : ''}${n.ok === null ? ' (?)' : ''}`),
    })),
  ];
  return { best: best?.o ?? null, verdicts };
}

/** What cannot be seen from the app and has to be checked before relying on the way. */
function checkOf(o: TravelOption): string {
  const spell = TRANSPORT.teleports.find((t) => t.id === o.id);
  if (spell?.kind === 'item') return 'check charges';
  if (spell?.kind === 'home') return 'check the cooldown';
  const open = o.needs.find((n) => n.ok === null);
  if (!open) return 'check what it needs';
  const text = open.text.replace(/\s*\([^)]*\)\s*$/, '');
  return `check: ${text.length <= 34 ? text : `${text.slice(0, 33)}…`}`;
}

function preparationOf(o: TravelOption): TransportPreparation | undefined {
  const p = o.prepare;
  if (!p) return undefined;
  const missing = p.missing.map((m) => qty({ name: m.name, n: m.need - (m.have ?? 0) }));
  const stops = p.stops.map((s) => cap(stopText(s)));
  return {
    text: `Missing: ${missing.join(', ')}. ${stops.join('; ')}.`,
    withdraw: p.stops.filter((s) => s.action === 'withdraw').flatMap((s) => s.items.map((i) => ({ name: i.name, quantity: i.qty }))),
    stops: p.stops, cost: p.cost,
  };
}

/**
 * The best way that is clearly shorter than walking, or null. A way that is usable now comes first, then one that needs a check (an unknown bag, charges,
 * a cooldown), then one that needs a stop first (runes, a tablet, coins, an axe). Never a locked way, and never a spell that is known to be short of runes
 * in the bag: that one is offered only as "get it first", with the stop counted in the trip.
 */
export function recommendedTransport(options: readonly TravelOption[]): RecommendedTransport | null {
  const walk = options.find((o) => o.id === 'walk');
  const { best } = judgeTransport(options);
  if (!walk || !best) return null;
  const saved = walk.walkTiles - journeyTiles(best);
  const state = transportStateOf(best);
  const prepare = preparationOf(best);
  const first = best.prepare?.stops[0];
  const time = sec(saved);
  const tail = `(saves ~${saved} tiles, about ${time})`;
  const check = state === 'check' ? checkOf(best) : undefined;
  // The prepared and the fetched variants carry the id of the way they prepare.
  const id = best.id.replace(/-(prepare|acquire)$/, '');
  const finish = (r: Omit<RecommendedTransport, 'state' | 'summary' | 'savedTiles' | 'interactionId'>, use: string, name: string): RecommendedTransport => {
    const summary = state === 'prepare' && first
      ? `${name} saves ~${time}: ${stopText(first)}${best.prepare!.stops.length > 1 ? `, then ${best.prepare!.stops.slice(1).map((s) => stopText(s)).join(', then ')}` : ''}`
      : `${use} · saves ~${time}${check ? ` · ${check}` : ''}`;
    return {
      ...r, interactionId: 0, state, summary, savedTiles: saved,
      ...(check ? { check } : {}),
      ...(prepare ? { prepare, text: `${name} ${tail}. ${prepare.text}`, chip: chipOf(`${cap(stopText(first!))}`) } : {}),
      // The first stop of a preparation is where the arrow leads; the transport's own stop comes after it.
      ...(first ? { tile: first.point } : {}),
    };
  };

  if (id === 'fairy') {
    const code = /→\s*([A-Z]{3})/.exec(best.title)?.[1] ?? '';
    const pair = best.title.replace(/^Fairy ring /, '').replace(/:.*$/, '');
    return finish({ type: 'fairy_ring', destination: `Fairy ring ${code}`.trim(), interactionName: 'Fairy ring', ...(best.go ? { tile: best.go } : {}), text: `Fairy ring: ${best.title} ${tail}`, chip: chipOf(`Fairy ring: ${pair}`) }, `Fairy ring ${pair}`, `Fairy ring ${pair}`);
  }
  if (id === 'charter') {
    const to = best.title.replace(/^Charter ship /, '').replace(/:.*$/, '').split('→').pop()!.trim();
    return finish({ type: 'charter_ship', destination: to, interactionName: 'Trader Crewmember', ...(best.go ? { tile: best.go } : {}), text: `Charter: ${best.title} ${tail}`, chip: chipOf(`Charter ship → ${to}`) }, `Charter ship → ${to}`, `The charter ship to ${to}`);
  }
  if (id === 'canoe' || id === 'canoe-now') {
    const pair = best.title.replace(/^Canoe /, '').replace(/:.*$/, '');
    const to = pair.split('→').pop()!.trim();
    const station = TRANSPORT.canoe.stations.find((s) => s.name === pair.split('→')[0].trim());
    return finish({ type: 'canoe', destination: to, interactionName: 'Canoe Station', ...(station ? { tile: { x: station.x, y: station.y, plane: station.plane } } : best.go ? { tile: best.go } : {}), text: `Canoe: ${best.title} ${tail}`, chip: chipOf(`Canoe: ${pair}`) }, `Canoe ${pair}`, `The canoe ${pair}`);
  }
  const boat = TRANSPORT.boats.find((b) => b.id === id);
  if (boat) {
    const npc = npcsIn(boat.from.label)[0];
    const to = placeOf(boat.to.label);
    return finish({ type: 'ferry', destination: boat.to.label, ...(npc ? { interactionName: npc } : {}), tile: boat.from, text: `Boat: ${boat.name} ${tail}`, chip: chipOf(npc ? `Ferry: talk to ${npc} → ${to}` : `Ferry → ${to}`) }, npc ? `Ferry: talk to ${npc} → ${to}` : `Ferry → ${to}`, `The ferry to ${to}`);
  }
  const spell = TRANSPORT.teleports.find((t) => t.id === id);
  if (spell) {
    const item = spell.kind === 'item' ? spell.items?.[0] : undefined;
    const to = placeOf(spell.dest.label);
    const use = item ? `Use ${item} → ${to}` : `Cast ${spell.name} → ${to}`;
    return finish({
      type: item ? 'item_teleport' : 'spell_teleport', destination: spell.dest.label, ...(item ? { item } : {}), text: `Teleport: ${spell.name} to ${to} ${tail}`,
      chip: chipOf(use),
    }, use, spell.name);
  }
  const tablet = NET.tablets.find((t) => t.id === id);
  if (tablet) {
    const dest = TRANSPORT.teleports.find((t) => t.id === tablet.spell)?.dest.label ?? best.title;
    const use = `Break ${tablet.item} tablet → ${placeOf(dest)}`;
    return finish({ type: 'tablet', destination: dest, item: tablet.item, text: `Teleport: ${tablet.item} tablet to ${placeOf(dest)} ${tail}`, chip: chipOf(use) }, use, `${cap(tablet.item)} tablet`);
  }
  return null;
}

/** The things of the chosen way that are short, for the tests and the diagnostics. */
export function missingOf(o: TravelOption): { name: string; need: number; have: number | null; bank: number | null }[] {
  return o.prepare ? o.prepare.missing : shortOf(o.needs);
}
