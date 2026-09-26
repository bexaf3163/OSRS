import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { floorLabel, initialPoint, isUnderground, pxPerSquare, stepPoints, TILE, tilesAround, tileUrl } from '../src/lib/map';

describe('тайлы карты вики', () => {
  it('адрес тайла: версия рендера, масштаб, этаж и номер', () => {
    expect(tileUrl(2, 0, 50, 50)).toMatch(/^https:\/\/maps\.runescape\.wiki\/osrs\/versions\/\d{4}-\d{2}-\d{2}_\w\/tiles\/rendered\/0\/2\/0_50_50\.png$/);
    expect(tileUrl(-1, 2, 6, 6)).toContain('/0/-1/2_6_6.png');
  });

  it('раскладка совпадает с картой-превью на странице вики (Lumbridge, масштаб 1)', () => {
    // В статье Lumbridge вики рисует превью 300×400 с центром x 3188, y 3220 и ставит тайл 0_24_25 в (−82, −16).
    // У нас центр — середина клетки (+0.5), поэтому сдвиг ровно на одну точку: (−83, −15).
    const tiles = tilesAround({ x: 3188, y: 3220, plane: 0 }, 1, 300, 400);
    const t = tiles.find((x) => x.url.endsWith('/0_24_25.png'));
    expect(t).toMatchObject({ left: -83, top: -15 });
  });

  it('клетка точки попадает ровно в метку — по центру и на заданной высоте', () => {
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

  it('тайлы закрывают всё окно без дыр', () => {
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

  it('этаж подписан по-британски, подземелье распознаётся по координатам', () => {
    expect(floorLabel(0)).toBe('Ground floor (1-й этаж / земля)');
    expect(floorLabel(2)).toBe('2nd floor (3-й этаж)');
    expect(isUnderground({ y: 9894 })).toBe(true);
    expect(isUnderground({ y: 3420 })).toBe(false);
  });
});

describe('точки шага', () => {
  const step = (id: string) => allSteps.find((s) => s.id === id)!;

  it('S1-11: две точки ловли креветок, старт не дублируется', () => {
    const points = stepPoints(step('S1-11'));
    expect(points.map((p) => [p.x, p.y])).toEqual([[3244, 3150], [3086, 3227]]);
    expect(initialPoint(step('S1-11'))).toBe(0);
  });

  it('S1-05: старт у Veos и четыре клада', () => {
    const points = stepPoints(step('S1-05'));
    expect(points).toHaveLength(5);
    expect(points[0].label).toContain('Sheared Ram');
    expect(initialPoint(step('S1-05'))).toBe(0);
  });

  it('S4-04: карта открывается на омарах, хотя они вторая точка', () => {
    const s = step('S4-04');
    expect(stepPoints(s)[initialPoint(s)].label).toContain('Musa Point');
  });

  it('ключевые шаги из ТЗ на карте (номера V2.1)', () => {
    // В ТЗ номера V2.0: S1-07 Restless Ghost — теперь S1-06, S1-09 рубка — S1-08, S1-10 Stronghold — S1-09, S1-06 Diango — S1-10.
    const expected: Record<string, [number, number, number]> = {
      'S1-03': [3208, 3214, 0], 'S1-04': [3189, 3272, 0], 'S1-05': [3224, 3240, 0], 'S1-06': [3243, 3206, 0],
      'S1-08': [3190, 3222, 0], 'S1-09': [3081, 3420, 0], 'S1-10': [3082, 3248, 0], 'S2-01': [3164, 3487, 0], 'S2-08': [3098, 3268, 0],
    };
    for (const [id, [x, y, plane]] of Object.entries(expected)) {
      expect(step(id).mapLocation, id).toMatchObject({ x, y, plane });
    }
  });
});
