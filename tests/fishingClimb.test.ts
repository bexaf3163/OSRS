import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import locationsJson from '../src/data/majorLocations.json';
import { stepPoints, initialPoint } from '../src/lib/map';

// Fishing 1-40 (the Fishing 1-40 item of the audit, finished in 2.54.2): the route reaches S6-02 at Fishing 1, so the arrow starts where the climb starts and the later spots follow in
// level order. The live check found the arrow still leading to Musa Point (level 40+) while the card told the player to net shrimps first.

const LOCATIONS = (locationsJson as { locations: Record<string, { x: number; y: number; plane: number }> }).locations;

describe('S6-02 Fishing: the climb is on the map in level order', () => {
  const step = stepById.get('S6-02')!;

  it('the arrow starts at the net spots; fly fishing and the lobsters follow', () => {
    const points = stepPoints(step);
    expect(points.map((p) => p.label)).toEqual([
      expect.stringContaining('Draynor Village (Fishing 1-20)'),
      expect.stringContaining('Barbarian Village (Fishing 20-40)'),
      expect.stringContaining('Musa Point'),
    ]);
    expect(initialPoint(step)).toBe(0);
    expect(step.mapLocation).toMatchObject({ x: points[0].x, y: points[0].y });
  });

  it('the places are the ones in the location dictionary, not invented tiles', () => {
    const want = ['Draynor Village fishing spots', 'Barbarian Village fishing spots', 'Musa Point fishing spots'].map((n) => LOCATIONS[n]);
    expect(want.every(Boolean)).toBe(true);
    stepPoints(step).forEach((p, i) => expect(p).toMatchObject({ x: want[i].x, y: want[i].y, plane: want[i].plane }));
  });

  it('the first tool of the climb is the requirement; the later tools are recommended, so a level-1 account is not sent to buy a harpoon first', () => {
    expect(step.itemsRequired?.map((i) => i.nameEn)).toEqual(['Small fishing net']);
    // Any later tool also satisfies it: a player past the nets is not sent to buy one.
    expect(step.itemsRequired![0].anyOf).toEqual(expect.arrayContaining(['Fly fishing rod', 'Lobster pot', 'Harpoon']));
    expect(step.itemsRecommended?.map((i) => i.nameEn)).toEqual(['Fly fishing rod', 'Feather', 'Lobster pot', 'Harpoon']);
    expect(step.inGame?.highlightItems).toEqual(expect.arrayContaining(['Small fishing net', 'Fly fishing rod', 'Lobster pot', 'Harpoon']));
  });
});
