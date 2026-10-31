import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { floorLabel, initialPoint, isUnderground, mapSourceAt, parseMapSources, pxPerSquare, stepPoints, TILE, tilesAround, tileUrl } from '../src/lib/map';

describe('wiki map tiles', () => {
  it('uses the documented atlas schema and shares the selected source across a viewport', () => {
    expect(tileUrl(2, 0, 47, 50)).toBe('https://maps.runescape.wiki/osrs/tiles/0_2019-10-31_1/2/0_47_50.png');
    const source = { mapId: 6, cacheVersion: '2026-10-31_2' };
    expect(tileUrl(-1, 2, 6, 6, source)).toContain('/6_2026-10-31_2/-1/2_6_6.png');
    expect(tilesAround({ x: 3029, y: 3221, plane: 0 }, 2, 720, 132, 0.5, source).every((t) => t.url.includes('/6_2026-10-31_2/'))).toBe(true);
  });

  it('accepts published metadata, selects the smallest containing atlas and rejects malformed paths/bounds', () => {
    const surface = { mapId: 0, cacheVersion: '2026-10-31_1', bounds: [[1000, 1000], [4300, 13000]] };
    const dungeon = { ...surface, mapId: 6, bounds: [[3000, 9800], [3200, 10000]] };
    const sources = parseMapSources({ baseMaps: [surface, dungeon, { ...surface, cacheVersion: '../bad' }, { ...surface, bounds: [[5, 5], [1, 1]] }, null] });
    expect(sources).toHaveLength(2);
    expect(mapSourceAt(sources, { x: 3050, y: 9850 }).mapId).toBe(6);
    expect(mapSourceAt(sources, { x: 3029, y: 3221 }).mapId).toBe(0);
    expect(parseMapSources(null)).toEqual([]);
    expect(mapSourceAt([], { x: 3029, y: 3221 }).cacheVersion).toBe('2019-10-31_1');
  });

  it('the layout matches the preview map on the wiki page (Lumbridge, zoom 1)', () => {
    // In the Lumbridge article the wiki draws a 300×400 preview centred at x 3188, y 3220 and puts tile 0_24_25 at (−82, −16).
    // Ours centres on the middle of the tile (+0.5), so the shift is exactly one point: (−83, −15).
    const tiles = tilesAround({ x: 3188, y: 3220, plane: 0 }, 1, 300, 400);
    const t = tiles.find((x) => x.url.endsWith('/0_24_25.png'));
    expect(t).toMatchObject({ left: -83, top: -15 });
  });

  it('the point tile lands exactly on the marker — centred and at the given height', () => {
    for (const [zoom, anchor] of [[2, 0.5], [3, 0.42], [0, 0.42]] as const) {
      const p = { x: 3244, y: 3150, plane: 0 };
      const width = 720;
      const height = 132;
      const span = TILE / pxPerSquare(zoom);
      const tx = Math.floor((p.x + 0.5) / span);
      const ty = Math.floor((p.y + 0.5) / span);
      const t = tilesAround(p, zoom, width, height, anchor).find((x) => x.url.endsWith(`/0_${tx}_${ty}.png`))!;
      const px = t.left + ((p.x + 0.5) - tx * span) * pxPerSquare(zoom);
      const py = t.top + ((ty + 1) * span - (p.y + 0.5)) * pxPerSquare(zoom);
      expect(Math.abs(px - width / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(py - height * anchor)).toBeLessThanOrEqual(1);
    }
  });

  it('tiles cover the whole window without gaps', () => {
    const tiles = tilesAround({ x: 3081, y: 3420, plane: 0 }, 2, 720, 132, 0.42);
    const minLeft = Math.min(...tiles.map((t) => t.left));
    const maxRight = Math.max(...tiles.map((t) => t.left + TILE));
    const minTop = Math.min(...tiles.map((t) => t.top));
    const maxBottom = Math.max(...tiles.map((t) => t.top + TILE));
    expect(minLeft).toBeLessThanOrEqual(0);
    expect(maxRight).toBeGreaterThanOrEqual(720);
    expect(minTop).toBeLessThanOrEqual(0);
    expect(maxBottom).toBeGreaterThanOrEqual(132);
  });

  it('the floor is labelled the British way, the dungeon is recognised by coordinates', () => {
    expect(floorLabel(0)).toBe('Ground floor');
    expect(floorLabel(2)).toBe('2nd floor');
    expect(isUnderground({ y: 9894 })).toBe(true);
    expect(isUnderground({ y: 3420 })).toBe(false);
  });
});

describe('step points', () => {
  const step = (id: string) => allSteps.find((s) => s.id === id)!;

  it('S1-12: the mining spot is the start and is not duplicated', () => {
    const points = stepPoints(step('S1-12'));
    expect(points.length).toBeGreaterThan(0);
    expect(initialPoint(step('S1-12'))).toBe(0);
  });

  it('S1-05: the start at Veos and four treasures', () => {
    const points = stepPoints(step('S1-05'));
    expect(points).toHaveLength(5);
    expect(points[0].label).toContain('Sheared Ram');
    expect(initialPoint(step('S1-05'))).toBe(0);
  });

  it('S4-04: the lobsters are bought, so the map opens on the Grand Exchange', () => {
    const s = step('S4-04');
    expect(stepPoints(s)[initialPoint(s)].label).toContain('Grand Exchange');
  });

  it('key steps from the spec on the map (V2.1 numbers)', () => {
    // In the spec the numbers are V2.0: S1-07 Restless Ghost is now S1-06, S1-09 woodcutting is S1-08, S1-10 Stronghold is S1-09, S1-06 Diango is S1-10.
    const expected: Record<string, [number, number, number]> = {
      'S1-03': [3208, 3214, 0], 'S1-04': [3189, 3272, 0], 'S1-05': [3224, 3240, 0], 'S1-06': [3243, 3206, 0],
      'S1-08': [3190, 3222, 0], 'S1-09': [3081, 3420, 0], 'S1-10': [3082, 3248, 0], 'S2-01': [3164, 3487, 0], 'S2-08': [3098, 3268, 0],
    };
    for (const [id, [x, y, plane]] of Object.entries(expected)) {
      expect(step(id).mapLocation, id).toMatchObject({ x, y, plane });
    }
  });
});
