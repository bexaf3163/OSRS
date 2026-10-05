// The places of a step: the step point, the places from the step map, where items come from (an NPC or a shop from the place dictionary) and the quest NPCs.
// One layout for the app and the game: the same places — as points on the step map in the app and as "Where to go" rows
// in the "What is needed" list on the game screen (a click — an arrow and the path there).

import type { GamePoint, MapLocation, Step, StepBranch } from '../types';
import npcJson from '../data/npcLocations.json';
import locationsJson from '../data/majorLocations.json';
import { initialPoint, stepPoints } from './map';

/** Where an NPC stands (the map of its OSRS Wiki article). steps — only for these steps: one name can belong to different NPCs. */
export interface NpcSpot {
  x: number;
  y: number;
  plane: number;
  /** Briefly where it is: "Draynor Village market". */
  area: string;
  page: string;
  steps?: string[];
}

export const npcSpots = (npcJson as { npcs: Record<string, NpcSpot[]> }).npcs;
const DICT = (locationsJson as { locations: Record<string, { x: number; y: number; plane: number; label: string; kind: string }> }).locations;

/** Where the NPC is on this step: the entry made for the step, otherwise the general one. */
export function npcSpot(name: string, stepId: string): NpcSpot | undefined {
  const rows = npcSpots[name];
  if (!rows) return undefined;
  return rows.find((r) => r.steps?.includes(stepId)) ?? rows.find((r) => !r.steps);
}

/**
 * Where an item comes from by the "from" field: an NPC (highlighted when the arrow brings you there) or a place from the dictionary — a shop,
 * a dungeon. For general shops the seller is called Shop keeper.
 */
export function itemSource(from: string, stepId: string): MapLocation | undefined {
  const n = npcSpot(from, stepId);
  if (n) return { x: n.x, y: n.y, plane: n.plane, label: `${from} — ${n.area}`, npc: from };
  const d = DICT[from];
  if (d) return { x: d.x, y: d.y, plane: d.plane, label: d.label, ...(/General Store$/.test(from) ? { npc: 'Shop keeper' } : {}) };
  return undefined;
}

const near = (a: GamePoint, b: GamePoint) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && a.plane === b.plane;

/**
 * Where the items and the quest NPCs are — added to the step points already collected. One tile — one place: the items and NPCs
 * merge into it. main — the number of the main point (the step's NPC stands there), −1 — there is no main one.
 */
function withSources(step: Step, places: MapLocation[], main: number, branch: StepBranch | undefined): MapLocation[] {
  for (const i of step.itemsRequired ?? []) {
    if (!i.from) continue;
    // An item is given by the step's own NPC — that is its point, not one more next to it.
    const own = !branch && main >= 0 && i.from === step.npc?.nameEn ? main : -1;
    const src = own >= 0 ? places[own] : itemSource(i.from, step.id);
    if (!src) continue;
    const at = own >= 0 ? own : places.findIndex((q) => near(q, src));
    if (at >= 0) {
      const q = places[at];
      if (!q.items?.includes(i.nameEn)) places[at] = { ...q, items: [...(q.items ?? []), i.nameEn], npc: q.npc ?? src.npc };
    } else {
      places.push({ ...src, items: [i.nameEn] });
    }
  }
  for (const name of step.inGame?.npcNames ?? []) {
    // The step's NPC is at the main point; with the quick variant the main point is different, and the step's NPC is a separate row.
    if ((!branch && main >= 0 && name === step.npc?.nameEn) || places.some((q) => q.npc === name)) continue;
    const n = npcSpot(name, step.id);
    if (!n) continue;
    const at = places.findIndex((q) => near(q, n));
    if (at >= 0) {
      if (!places[at].npc) places[at] = { ...places[at], npc: name };
      continue;
    }
    places.push({ x: n.x, y: n.y, plane: n.plane, label: `${name} — ${n.area}`, npc: name });
  }
  return places;
}

/**
 * Places for the game: first where the step arrow leads (the quick variant, a point in the game or on the map), then the places
 * from the step map, where items come from, the quest NPCs.
 */
export function stepPlaces(step: Step, branch?: StepBranch): MapLocation[] {
  const main: GamePoint | undefined = branch?.replacementTarget ?? step.inGame?.worldPoint ?? step.mapLocation;
  const places: MapLocation[] = [];
  if (main) {
    places.push({
      x: main.x, y: main.y, plane: main.plane, label: main.label ?? step.title,
      ...(step.npc && !branch ? { npc: step.npc.nameEn } : {}),
    });
  }
  for (const p of step.resourceSpots ?? []) {
    const same = places.findIndex((q) => near(q, p));
    // The step point and the first map place are often the same — we keep one, with a label and the place note.
    if (same >= 0) places[same] = { ...places[same], ...p, npc: p.npc ?? places[same].npc };
    else places.push({ ...p });
  }
  return withSources(step, places, main ? 0 : -1, branch);
}

/**
 * Places for the step map in the app: the step map points in the former order ("Up to 40" before "From 40"), followed by where the
 * items come from and the quest NPCs.
 */
export function mapPlaces(step: Step): MapLocation[] {
  const points = stepPoints(step).map((p) => ({ ...p }));
  const main = step.mapLocation ? initialPoint(step) : -1;
  if (main >= 0 && step.npc && !points[main].npc) points[main] = { ...points[main], npc: step.npc.nameEn };
  return withSources(step, points, main, undefined);
}
