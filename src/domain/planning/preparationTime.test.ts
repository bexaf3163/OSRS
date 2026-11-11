import { describe, expect, it } from 'vitest';
import { preparationTime } from './preparationTime';
import { BANKS, dist } from '../travel/travel';
import type { WorldPoint } from '../player/playerState';

const origin = { x: 3222, y: 3218, plane: 0 };
const minute = { fast: 1, typical: 1, slow: 1, source: 'test walk' };
const line = (over: object) => ({ key: 'k', name: 'Spade', count: 1, timing: 'NOW', priority: 'CRITICAL', have: { bag: 0, noted: 0, bank: 0, equipped: 0 }, ...over });
const frame = (lines: object[], kind = 'BUY') => ({ action: { kind }, plan: { lines } }) as never;

describe('the complete preparation trip', () => {
  it('costs nothing more when everything is carried', () => {
    expect(preparationTime(frame([line({ have: { bag: 1, noted: 0, bank: 0, equipped: 0 } })], 'EQUIP'), origin, () => minute)).toMatchObject({ typical: 0 });
  });

  it('walks to the nearest bank once and to each placed purchase, adding each visit', () => {
    const legs: unknown[] = [];
    const walk = (from: unknown, to: unknown) => { legs.push([from, to]); return minute; };
    const lines = [
      line({ have: { bag: 0, noted: 0, bank: 1, equipped: 0 } }),
      line({ key: 'b', have: { bag: 0, noted: 0, bank: 2, equipped: 0 }, count: 2 }),
      line({ key: 'c', where: 'MISSING', action: { kind: 'BUY', nav: { x: 3210, y: 3240, plane: 0 } } }),
    ];
    const total = preparationTime(frame(lines), origin, walk);
    // One bank stop: a single leg leaves a bank for the shop (the other origin legs only compare banks).
    expect((legs as [unknown, unknown][]).filter(([from]) => from !== origin)).toHaveLength(1);
    expect(total!.typical).toBeGreaterThan(2);
  });

  it('keeps gathering, unplaced purchases, checks and an unknown start UNKNOWN', () => {
    expect(preparationTime(frame([line({ action: { kind: 'GATHER' } })]), origin, () => minute)).toBeNull();
    expect(preparationTime(frame([line({ action: { kind: 'BUY' } })]), origin, () => minute)).toBeNull();
    expect(preparationTime(frame([], 'VERIFY'), origin, () => minute)).toBeNull();
    expect(preparationTime(frame([]), null, () => minute)).toBeNull();
    expect(preparationTime(frame([line({ action: { kind: 'BUY', nav: origin } })]), origin, () => null)).toBeNull();
  });
  it('prices the bought item, not the ingredients that are the other way to make it', () => {
    const buy = line({ key: 'dye', name: 'Orange dye', action: { kind: 'BUY', nav: { x: 3210, y: 3240, plane: 0 } } });
    const ingredient = line({ key: 'recipe:dye:Red dye', name: 'Red dye', priority: 'IMPORTANT', action: { kind: 'GATHER' } });
    expect(preparationTime(frame([buy, ingredient]), origin, () => minute)).toEqual(preparationTime(frame([buy]), origin, () => minute));
  });
  it('continues from the purchase to the encounter once, without adding a second origin-to-encounter trip', () => {
    const shop = { x: 3210, y: 3240, plane: 0 }, finish = { x: 3030, y: 3500, plane: 0 };
    const legs: unknown[] = [];
    const total = preparationTime(frame([line({ action: { kind: 'BUY', nav: shop } })]), origin,
      (from, to) => { legs.push([from, to]); return minute; }, undefined, finish);
    expect(legs).toEqual([[origin, shop], [shop, finish]]);
    expect(total!.typical).toBeGreaterThan(2);
    expect(preparationTime(frame([]), origin, () => null, undefined, finish)).toBeNull();
  });
});

describe('S40: the bank is chosen by its walk, never by straight-line distance', () => {
  const lines = [line({ key: 'b', have: { bag: 0, noted: 0, bank: 2, equipped: 0 }, count: 2 }), line({ key: 'c', where: 'MISSING', action: { kind: 'BUY', nav: { x: 3210, y: 3240, plane: 0 } } })];
  const [first, second] = BANKS.filter(bank => bank.plane === 0).sort((a, b) => dist(origin, a) - dist(origin, b));
  const usedBank = (toFirst: typeof minute | null) => {
    const legs: [WorldPoint, WorldPoint][] = [];
    const walk = (from: WorldPoint | null, to: WorldPoint) => {
      legs.push([from!, to]);
      if (from === origin && to.x === first.x && to.y === first.y) return toFirst;
      const m = 1 + dist(from!, to) / 100;
      return { fast: m, typical: m, slow: m, source: 'test walk' };
    };
    expect(preparationTime(frame(lines), origin, walk)).not.toBeNull();
    const out = legs.find(([from, to]) => from !== origin && to.x === 3210 && to.y === 3240)![0];
    return out.x === first.x && out.y === first.y ? 'first' : out.x === second.x && out.y === second.y ? 'second' : 'other';
  };

  it('the straight-line nearest bank wins only when its walk is also the shortest', () => {
    expect(usedBank(minute)).toBe('first');
  });

  it('a bank behind a barrier (long detour) or with no route loses to a reachable one', () => {
    expect(usedBank({ fast: 60, typical: 60, slow: 60, source: 'detour' })).not.toBe('first');
    expect(usedBank(null)).not.toBe('first');
  });
});

describe('free pickups in the preparation trip', () => {
  const free = (count: number, access?: string) => line({ count, action: { kind: 'GATHER', acquisition: { kind: 'free', label: 'Free', point: { x: 3109, y: 3330, plane: 0, label: 'Draynor Manor' }, access } } });
  it('walks to a single open free pickup and counts the visit', () => {
    expect(preparationTime(frame([free(1)], 'GATHER'), origin, () => minute)!.typical).toBeGreaterThan(1);
  });
  it('keeps repeated or closed pickups UNKNOWN', () => {
    expect(preparationTime(frame([free(2)], 'GATHER'), origin, () => minute)).toBeNull();
    expect(preparationTime(frame([free(1, 'closed')], 'GATHER'), origin, () => minute)).toBeNull();
  });
});

describe('earning before a purchase', () => {
  const short = line({ action: { kind: 'EARN', acquisition: { kind: 'shop', label: 'Shop', point: { x: 3210, y: 3240, plane: 0, label: 'Shop' } } } });
  const earning = (time: object | null) => ({ action: { kind: 'EARN', time }, plan: { lines: [short] } }) as never;
  it('adds the earning time to the walk to the shop', () => {
    expect(preparationTime(earning({ fast: 10, typical: 10, slow: 10, source: 'rate' }), origin, () => minute)!.typical).toBeGreaterThan(11);
  });
  it('keeps the preparation UNKNOWN when the earning has no time', () => {
    expect(preparationTime(earning(null), origin, () => minute)).toBeNull();
  });
});
