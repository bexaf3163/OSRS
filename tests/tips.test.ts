import { describe, expect, it } from 'vitest';
import { TIP_MIN_SAVING_TILES, travelTip } from '../src/lib/tips';
import { bankCounts, travelInputOf } from '../src/lib/travelInput';
import { travelOptions, type TravelInput } from '../src/lib/travel';
import type { GearState } from '../src/services/runeliteBridge';

const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const gear = (...rows: [string, number][]): GearState => ({
  equipment: [], inventory: rows.map(([name, count], i) => ({ id: i + 1, name, count })), coins: null, bankCoins: null,
} as unknown as GearState);
const input = (over: Partial<TravelInput> = {}): TravelInput => ({ from: at(3222, 3218), to: at(2780, 3613), levels: {}, carried: null, bankSeen: false, ...over });

describe('the one-line travel tip', () => {
  it('says the fastest way that is not walking, with the saving', () => {
    const tip = travelTip(travelOptions(input({ members: true, carried: [{ id: 1, name: 'Dramen staff', count: 1 }] })))!;
    expect(tip).toMatch(/^Fastest: Fairy ring [A-D][I-L][P-S] → [A-D][I-L][P-S] — saves ~\d+ tiles/);
    expect(tip).toMatch(/\(about \d+ (s|min) instead of \d+ (s|min) on foot\)/);
    expect(tip).toContain('(check what it needs)');
  });

  it('a short trip, or no way clearly shorter than walking, earns no tip', () => {
    expect(travelTip(travelOptions(input({ from: at(3222, 3218), to: at(3213, 3240) })))).toBeNull();
    expect(travelTip([])).toBeNull();
  });

  it('a locked way is never told, and an available one beats one that needs checking', () => {
    // Free-to-play: the members-only ways are not even listed; the Falador spell is locked without runes once the bank was seen.
    const f2p = travelTip(travelOptions(input({ to: at(2970, 3380), members: false, levels: { magic: 40 }, carried: [{ id: 1, name: 'Coins', count: 5 }], bankSeen: true })));
    expect(f2p === null || !f2p.includes('Falador Teleport')).toBe(true);
    const ready = travelTip(travelOptions(input({ from: at(3165, 3440), to: at(2970, 3380), carried: [{ id: 1, name: 'Falador teleport', count: 1 }], members: true })))!;
    expect(ready).toContain('Falador teleport tablet');
    expect(ready).not.toContain('check what it needs');
  });

  it('a way that starts with a purchase or a withdrawal says what and where', () => {
    // With a bag and the bank seen, the Falador spell is locked (no runes), so the tablet is the way.
    const coins = [{ id: 1, name: 'Coins', count: 5000 }];
    const buy = travelTip(travelOptions(input({ from: at(3165, 3440), to: at(2970, 3380), members: false, carried: coins, bankSeen: true, priceOf: (n) => (n === 'Falador teleport' ? 640 : undefined) })))!;
    expect(buy).toContain('buy it at the Grand Exchange first (~640 gp)');
    const bank = travelTip(travelOptions(input({ from: at(3165, 3440), to: at(2970, 3380), members: false, carried: coins, bankSeen: true, bank: new Map([['falador teleport', 2]]) })))!;
    expect(bank).toMatch(/withdraw it at the .*Bank first/);
  });

  it('the threshold is a real saving: just under it is quiet', () => {
    expect(TIP_MIN_SAVING_TILES).toBeGreaterThanOrEqual(60);
    const walk = { id: 'walk', title: 'On foot', legs: [], walkTiles: 200, availability: 'ready' as const, needs: [] };
    const near = { id: 'x', title: 'X', legs: [], walkTiles: 200 - TIP_MIN_SAVING_TILES + 1, availability: 'ready' as const, needs: [] };
    const enough = { ...near, walkTiles: 200 - TIP_MIN_SAVING_TILES };
    expect(travelTip([walk, near])).toBeNull();
    expect(travelTip([walk, enough])).toContain('saves ~80 tiles');
  });
});

describe('the planner input from the app state', () => {
  it('members mode, the game levels over the typed ones, the bag and the equipment together', () => {
    const i = travelInputOf({
      from: at(1, 1), to: at(2, 2), levels: { magic: 10, woodcutting: 20 }, stats: { magic: 25 } as never,
      gear: { equipment: [{ id: 1, name: 'Dramen staff', count: 1 }], inventory: [{ id: 2, name: 'Coins', count: 5 }], coins: 5, bankCoins: null } as unknown as GearState,
      owned: null, mode: 'members', homeCooldownSec: 600,
    });
    expect(i.members).toBe(true);
    expect(i.levels).toMatchObject({ magic: 25, woodcutting: 20 });
    expect(i.carried!.map((g) => g.name)).toEqual(['Dramen staff', 'Coins']);
    expect(i.homeCooldownSec).toBe(600);
    expect(i.bank).toBeNull();
    expect(i.bankSeen).toBe(false);
  });

  it('free-to-play mode, no game data: nothing is invented', () => {
    const i = travelInputOf({ from: at(1, 1), to: at(2, 2), levels: {}, stats: null, gear: null, owned: undefined, mode: 'f2p' });
    expect(i.members).toBe(false);
    expect(i.carried).toBeNull();
    expect(i.homeCooldownSec).toBeNull();
    expect(gear().inventory).toEqual([]);
  });

  it('the bank counts are by name key, and only for what the bank really holds', () => {
    const m = bankCounts([{ name: 'Falador teleport', bank: 3 }, { name: 'Rope', bank: 0 }, { name: 'Logs' }]);
    expect([...m.entries()]).toEqual([['falador teleport', 3]]);
  });
});
