// The way to the step that is not walking, as the game needs it: what kind, where it ends, what to interact with, what to take out of the bag.
// The desktop planner (travel.ts) already knows; this turns its best option into the small record the plugin draws and highlights
// (`recommendedTransport` in the plan payload). The plugin never activates anything: it only points, and the player clicks.
//
// The data has no game object or NPC ids for the transports (the wiki tables give names and tiles), so interactionId is 0 (unknown) and the NAME is what
// the game highlights: the plugin already finds NPCs and objects by name. An id is added only where it is known.

import { TILES_PER_SECOND, NET, TRANSPORT, type Point, type TravelOption } from './travel';
import { TIP_MIN_SAVING_TILES } from './tips';

export type TransportType = 'item_teleport' | 'tablet' | 'spell_teleport' | 'fairy_ring' | 'charter_ship' | 'canoe' | 'ferry';

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
  /** Where to go first (the ring, the dock, the station, the pier): a click on the line points the arrow there. */
  tile?: Point;
  /** One line: "Teleport: Falador teleport tablet to Falador (saves ~330 tiles, about 1 min)". */
  text: string;
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

/**
 * The best available way that is clearly shorter than walking, or null. "Available" is the planner's word: ready, or may be (an unknown bag), never locked;
 * a way that starts by fetching an item is the purchase detour's job, not this one.
 */
export function recommendedTransport(options: readonly TravelOption[]): RecommendedTransport | null {
  const walk = options.find((o) => o.id === 'walk');
  if (!walk) return null;
  const rank = (o: TravelOption) => (o.availability === 'ready' ? 0 : 1);
  const best = options
    .filter((o) => o.id !== 'walk' && !o.acquire && o.availability !== 'locked' && walk.walkTiles - o.walkTiles >= TIP)
    .sort((a, b) => rank(a) - rank(b) || a.walkTiles - b.walkTiles)[0];
  if (!best) return null;
  const saved = walk.walkTiles - best.walkTiles;
  const tail = `(saves ~${saved} tiles, about ${sec(walk.walkTiles - best.walkTiles)})`;
  const base = { interactionId: 0 };

  if (best.id === 'fairy') {
    const code = /→\s*([A-Z]{3})/.exec(best.title)?.[1] ?? '';
    return { ...base, type: 'fairy_ring', destination: `Fairy ring ${code}`.trim(), interactionName: 'Fairy ring', ...(best.go ? { tile: best.go } : {}), text: `Fairy ring: ${best.title} ${tail}` };
  }
  if (best.id === 'charter') {
    return { ...base, type: 'charter_ship', destination: best.title.replace(/^Charter ship /, '').split('→').pop()!.trim(), interactionName: 'Trader Crewmember', ...(best.go ? { tile: best.go } : {}), text: `Charter: ${best.title} ${tail}` };
  }
  if (best.id === 'canoe') {
    return { ...base, type: 'canoe', destination: best.title.replace(/^Canoe /, '').split('→').pop()!.trim(), interactionName: 'Canoe Station', text: `Canoe: ${best.title} ${tail}` };
  }
  const boat = TRANSPORT.boats.find((b) => b.id === best.id);
  if (boat) {
    const npc = npcsIn(boat.from.label)[0];
    return { ...base, type: 'ferry', destination: boat.to.label, ...(npc ? { interactionName: npc } : {}), tile: boat.from, text: `Boat: ${boat.name} ${tail}` };
  }
  const spell = TRANSPORT.teleports.find((t) => t.id === best.id);
  if (spell) {
    const item = spell.kind === 'item' ? spell.items?.[0] : undefined;
    return { ...base, type: item ? 'item_teleport' : 'spell_teleport', destination: spell.dest.label, ...(item ? { item } : {}), text: `Teleport: ${spell.name} to ${spell.dest.label} ${tail}` };
  }
  const tablet = NET.tablets.find((t) => t.id === best.id);
  if (tablet) {
    const dest = TRANSPORT.teleports.find((t) => t.id === tablet.spell)?.dest.label ?? best.title;
    return { ...base, type: 'tablet', destination: dest, item: tablet.item, text: `Teleport: ${tablet.item} tablet to ${dest} ${tail}` };
  }
  return null;
}
