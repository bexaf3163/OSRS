// Места шага: точка шага, места с карты шага, откуда предметы (NPC или магазин из словаря мест) и NPC квеста.
// Одна раскладка для программы и игры: те же места — точками на карте шага в программе и строками «Куда идти»
// в списке «Что нужно» на экране игры (клик — стрелка и путь туда).

import type { GamePoint, MapLocation, Step, StepBranch } from '../types';
import npcJson from '../data/npcLocations.json';
import locationsJson from '../data/majorLocations.json';
import { initialPoint, stepPoints } from './map';

/** Где стоит NPC (карта его статьи на OSRS Wiki). steps — только для этих шагов: одно имя бывает у разных NPC. */
export interface NpcSpot {
  x: number;
  y: number;
  plane: number;
  /** Коротко, где это: «рынок Draynor Village». */
  area: string;
  page: string;
  steps?: string[];
}

export const npcSpots = (npcJson as { npcs: Record<string, NpcSpot[]> }).npcs;
const DICT = (locationsJson as { locations: Record<string, { x: number; y: number; plane: number; label: string; kind: string }> }).locations;

/** Где NPC на этом шаге: запись именно для шага, иначе общая. */
export function npcSpot(name: string, stepId: string): NpcSpot | undefined {
  const rows = npcSpots[name];
  if (!rows) return undefined;
  return rows.find((r) => r.steps?.includes(stepId)) ?? rows.find((r) => !r.steps);
}

/**
 * Откуда предмет по полю from: NPC (подсветится, когда стрелка приведёт) или место из словаря — магазин,
 * подземелье. У общих магазинов продавца зовут Shop keeper.
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
 * Откуда предметы и NPC квеста — к уже собранным точкам шага. Одна клетка — одно место: предметы и NPC
 * сливаются в него. main — номер главной точки (NPC шага стоит там), −1 — главной нет.
 */
function withSources(step: Step, places: MapLocation[], main: number, branch: StepBranch | undefined): MapLocation[] {
  for (const i of step.itemsRequired ?? []) {
    if (!i.from) continue;
    // Предмет выдаёт NPC самого шага — это его точка, а не ещё одна рядом.
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
    // NPC шага — в главной точке; с быстрым вариантом главная точка другая, и NPC шага — отдельной строкой.
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
 * Места для игры: первой — куда ведёт стрелка шага (быстрый вариант, точка в игре или на карте), потом места
 * с карты шага, откуда предметы, NPC квеста.
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
    // Точка шага и первое место карты часто одно и то же — оставляем одну, с подписью и заметкой места.
    if (same >= 0) places[same] = { ...places[same], ...p, npc: p.npc ?? places[same].npc };
    else places.push({ ...p });
  }
  return withSources(step, places, main ? 0 : -1, branch);
}

/**
 * Места для карты шага в программе: точки карты шага в прежнем порядке («До 40» перед «С 40»), за ними — откуда
 * предметы и NPC квеста.
 */
export function mapPlaces(step: Step): MapLocation[] {
  const points = stepPoints(step).map((p) => ({ ...p }));
  const main = step.mapLocation ? initialPoint(step) : -1;
  if (main >= 0 && step.npc && !points[main].npc) points[main] = { ...points[main], npc: step.npc.nameEn };
  return withSources(step, points, main, undefined);
}
