import { describe, expect, it } from 'vitest';
import portalsFile from '../src/data/portals.json';
import { dedupePortals, fromRow, layerOf, parseTransports, pickPortal, type PortalRow } from '../src/lib/portals';

const all = (portalsFile.portals as PortalRow[]).map(fromRow);

describe('ways between layers (portals)', () => {
  it('reads only the rows that cross layers, with the object and the menu words', () => {
    const tsv = [
      '# Origin\tDestination\tmenuOption menuTarget objectID\tSkills\tItems\tQuests\tVarbits\tVarPlayers\tDuration\tDisplay info',
      '3097 3107 0\t3098 3107 0\tOpen Door 9398\t\t\t\t\t\t1\t',
      '2523 2860 0\t2012 9004 1\tEnter Hole 31791\t\t\t\t\t\t\t',
      '1296 3375 0\t1296 9767 0\tEnter Cave 56439\t\t\t\t16632>9\t\t2\t',
      'broken row',
    ].join('\n');
    const { portals, skipped } = parseTransports(tsv);
    expect(skipped).toBe(1);
    expect(portals).toHaveLength(2);
    expect(portals[0]).toMatchObject({ x: 2523, y: 2860, toY: 9004, toPlane: 1, id: 31791, action: 'Enter Hole', req: '' });
    expect(portals[1].req).toBe('16632>9');
  });

  it('one ladder listed from four tiles is one way; two far-apart doors of one kind stay two', () => {
    const p = (x: number, y: number) => ({ x, y, plane: 0, toX: 3104, toY: 9576, toPlane: 0, id: 2147, action: 'Climb-down Ladder', req: '' });
    expect(dedupePortals([p(3105, 3162), p(3104, 3163), p(3104, 3161), p(3103, 3162)])).toHaveLength(1);
    expect(dedupePortals([p(3105, 3162), p(3205, 3162)])).toHaveLength(2);
  });

  it('the shipped table: every row crosses layers, and there are many', () => {
    expect(all.length).toBeGreaterThan(500);
    for (const p of all) expect(layerOf(p.y)).not.toBe(layerOf(p.toY));
  });

  it('Chief Tess (The Corsair Curse) is reached through the hole on the beach, and left by the vine ladder', () => {
    expect(pickPortal(all, 2552, 2846, 2012, 9006)).toMatchObject({ id: 31791, action: 'Enter Hole' });
    expect(pickPortal(all, 2012, 9004, 2504, 2840)).toMatchObject({ id: 31790 });
  });

  it('the same layer needs no way', () => {
    expect(pickPortal(all, 3222, 3218, 3104, 3162)).toBeNull();
  });
});
