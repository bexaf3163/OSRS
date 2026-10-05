import { describe, expect, it } from 'vitest';
import { bagCleanup, cleanupLine, MIN_SLOTS_TO_ADVISE } from '../src/lib/bagCleanup';
import type { PlayerState } from '../src/lib/playerState';
import type { PrepLine, PrepPlan } from '../src/lib/prepPlan';

const line = (name: string, timing: PrepLine['timing'] = 'NOW'): PrepLine => ({
  key: `${name}:${timing}`, name, count: 1, exact: true, where: 'INVENTORY',
  have: { bag: 1, noted: 0, bank: null, equipped: 0 }, toGet: 0, priority: 'IMPORTANT', timing, why: '', usedIn: [],
});
const plan = (lines: PrepLine[], over = 0, used: number | null = 10, adding = 0): Pick<PrepPlan, 'lines' | 'later' | 'slots'> => ({
  lines, later: lines.filter((l) => l.timing === 'LATER'), slots: { used, adding, over },
});
const state = (bag: [string, number][] | null): PlayerState => ({
  bagItems: bag ? { known: true, value: bag.map(([name, count]) => ({ name, count })), source: 'game' } : { known: false },
} as unknown as PlayerState);

describe('bag cleanup', () => {
  it('without the bag from the game there is no advice: unknown is not "nothing"', () => {
    expect(bagCleanup(plan([]), state(null))).toBeNull();
  });

  it('what the nearest steps name is never advised away, wherever it is listed', () => {
    const p = plan([line('Rope'), line('Bucket', 'SOON'), line('Soft clay', 'IN_STEP')], 0, 25);
    expect(bagCleanup(p, state([['Rope', 1], ['Bucket', 1], ['Soft clay', 1], ['Mithril scimitar', 1], ['Iron axe', 1], ['Tinderbox', 1]]))!.items.map((i) => i.name).sort())
      .toEqual(['Iron axe', 'Mithril scimitar', 'Tinderbox']);
  });

  it('money, food, runes, staffs, teleports and jewellery are never listed', () => {
    const keep: [string, number][] = [['Coins', 500], ['Lobster', 4], ['Air rune', 90], ['Staff of fire', 1], ['Varrock teleport', 3], ['Chronicle', 1],
      ['Amulet of glory', 1], ['Ring of dueling', 1], ['Rune pouch', 1], ['Fire cape', 1]];
    expect(bagCleanup(plan([], 2), state([...keep, ['Tinderbox', 1]]))!.items.map((i) => i.name)).toEqual(['Tinderbox']);
  });

  it('a stack takes one slot, other items one slot per piece; the biggest saving comes first', () => {
    const a = bagCleanup(plan([], 1), state([['Arrow shaft', 1], ['Iron arrow', 300], ['Raw trout', 1], ['Logs', 6], ['Bronze dagger', 3]]))!;
    expect(a.items.find((i) => i.name === 'Iron arrow')!.slots).toBe(1);
    expect(a.items[0]).toMatchObject({ name: 'Logs', slots: 6 });
    expect(a.slotsFreed).toBe(a.items.reduce((s, i) => s + i.slots, 0));
  });

  it('a later step asking for it is said apart from plain leftovers', () => {
    const p = plan([line('Rope'), line('Bronze bar', 'LATER')], 0, 25);
    const a = bagCleanup(p, state([['Rope', 1], ['Bronze bar', 1], ['Logs', 5]]))!;
    expect(a.items.find((i) => i.name === 'Bronze bar')!.reason).toBe('later');
    expect(a.items.find((i) => i.name === 'Logs')!.reason).toBe('unused');
    expect(cleanupLine(a.items.find((i) => i.name === 'Bronze bar')!)).toContain('needed in a later step');
    expect(cleanupLine(a.items.find((i) => i.name === 'Logs')!)).toBe('Logs ×5 (5 slots)');
  });

  it('speaks up only when the bag is tight or enough slots can be freed', () => {
    const bag: [string, number][] = [['Tinderbox', 1], ['Spade', 1]];
    expect(bagCleanup(plan([], 0, 10), state(bag)), 'two slots, plenty of room: quiet').toBeNull();
    expect(bagCleanup(plan([], 1, 28, 1), state(bag))!.tight, 'things to take will not fit').toBe(true);
    expect(bagCleanup(plan([], 0, 27, 3), state(bag))!.tight, 'used plus adding is over 28').toBe(true);
    const three: [string, number][] = [['Tinderbox', 1], ['Spade', 1], ['Hammer', 1]];
    expect(MIN_SLOTS_TO_ADVISE).toBe(3);
    const idle = bagCleanup(plan([], 0, 10), state(three))!;
    expect(idle.tight).toBe(false);
    expect(idle.slotsFreed).toBe(3);
  });

  it('an empty bag or nothing to advise is no advice, and the list is capped', () => {
    expect(bagCleanup(plan([], 1), state([]))).toBeNull();
    const many: [string, number][] = Array.from({ length: 12 }, (_, i) => [`Junk ${i}`, 1] as [string, number]);
    expect(bagCleanup(plan([], 1), state(many))!.items.length).toBe(8);
    expect(bagCleanup(plan([], 1), state([['Coins', 5], ['Air rune', 5]]))).toBeNull();
  });
});
