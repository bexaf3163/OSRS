// Карта мира OSRS Wiki: тайлы, этажи и точки шага.
// Встроить саму карту вики нельзя — oldschool.runescape.wiki отвечает X-Frame-Options: DENY и
// frame-ancestors 'none', поэтому карта рисуется у нас из тех же тайлов (maps.runescape.wiki,
// Access-Control-Allow-Origin: *). Тайл масштаба z — 256×256 точек, в клетке игры 2^z точек.

import type { MapLocation, Step } from '../types';

/** Версия рендера карты, которую сейчас показывает вики (проверено 26.09.2026). */
export const MAP_VERSION = '2026-08-12_a';
const TILE_ROOT = `https://maps.runescape.wiki/osrs/versions/${MAP_VERSION}/tiles/rendered`;

export const MIN_ZOOM = -3;
export const MAX_ZOOM = 3;
export const DEFAULT_ZOOM = 2;
export const TILE = 256;

export const MAP_ATTRIBUTION = 'Карта © OSRS Wiki (Weird Gloop), игра © Jagex';

/** Тайл карты мира (mapId 0 — поверхность и подземелья основного мира). */
export function tileUrl(zoom: number, plane: number, tx: number, ty: number): string {
  return `${TILE_ROOT}/0/${zoom}/${plane}_${tx}_${ty}.png`;
}

/** Сколько экранных точек в одной клетке игры на этом масштабе. */
export const pxPerSquare = (zoom: number) => 2 ** zoom;

export interface PlacedTile {
  url: string;
  left: number;
  top: number;
}

/**
 * Тайлы, которые закрывают окно width×height; клетка p — по центру по горизонтали и на высоте anchorY
 * (доля от верха: у превью метка чуть выше центра, чтобы подпись внизу её не закрывала).
 * Координаты — от левого верхнего угла окна. Центр клетки (x + 0.5) — метка посередине клетки, а не на углу.
 */
export function tilesAround(p: { x: number; y: number; plane: number }, zoom: number, width: number, height: number, anchorY = 0.5): PlacedTile[] {
  const ppt = pxPerSquare(zoom);
  const span = TILE / ppt;
  const cx = p.x + 0.5;
  const cy = p.y + 0.5;
  const ay = height * anchorY;
  const tx0 = Math.floor((cx - width / 2 / ppt) / span);
  const tx1 = Math.floor((cx + width / 2 / ppt) / span);
  const ty0 = Math.floor((cy - (height - ay) / ppt) / span);
  const ty1 = Math.floor((cy + ay / ppt) / span);
  const out: PlacedTile[] = [];
  for (let ty = ty1; ty >= ty0; ty--) {
    for (let tx = tx0; tx <= tx1; tx++) {
      out.push({
        url: tileUrl(zoom, p.plane, tx, ty),
        left: Math.round(width / 2 + (tx * span - cx) * ppt),
        // Север сверху: у тайла ty верхний край — клетка (ty + 1) * span.
        top: Math.round(ay - ((ty + 1) * span - cy) * ppt),
      });
    }
  }
  return out;
}

const FLOORS = ['Ground floor (1-й этаж / земля)', '1st floor (2-й этаж)', '2nd floor (3-й этаж)', '3rd floor (4-й этаж)'];

/** Этаж по британскому счёту, как в игре и в карточках шагов. */
export function floorLabel(plane: number): string {
  return FLOORS[plane] ?? `Этаж ${plane}`;
}

/** Подземелья лежат на карте мира далеко к северу (y > 6400) — это не этаж, а отдельная область. */
export const isUnderground = (p: { y: number }) => p.y > 6400;

const same = (a: MapLocation, b: MapLocation) => a.x === b.x && a.y === b.y && a.plane === b.plane;

/**
 * Все точки шага для переключателя: старт и места сбора. Если старт совпадает с одним из мест
 * (у шагов прокачки старт — это первое место), он не дублируется.
 */
export function stepPoints(step: Pick<Step, 'mapLocation' | 'resourceSpots'>): MapLocation[] {
  const spots = step.resourceSpots ?? [];
  const start = step.mapLocation;
  if (!start) return spots;
  return spots.some((s) => same(s, start)) ? spots : [start, ...spots];
}

/** С какой точки открыть карту: со старта шага (он есть в списке точек). */
export function initialPoint(step: Pick<Step, 'mapLocation' | 'resourceSpots'>): number {
  const points = stepPoints(step);
  const start = step.mapLocation;
  const i = start ? points.findIndex((p) => same(p, start)) : 0;
  return Math.max(0, i);
}
