import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { stepReadiness } from '../src/lib/readiness';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { toInGameTarget, type GearState } from '../src/services/runeliteBridge';
import { navigationTarget } from '../src/lib/navigation';

// S4-03 after the combat brief: the food is part of the kit, with the numbers the wiki stats give (Hill Giant: 35 hit points, Attack 18, attack bonus
// +18, Defence 26, max hit 4, every 6 ticks, aggressive) at Defence 1 in iron armour; what to do in the game; the route into the dungeon.

const s = stepById.get('S4-03')!;
const FOOD = ['Salmon', 'Trout', 'Tuna', 'Lobster', 'Swordfish'];

function owned(items: Record<string, number>): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const n of ['Adamant scimitar', ...FOOD]) map.set(nameKey(n), { name: n, carried: items[n] ?? 0, noted: 0, bank: 0 });
  return { bankSeen: true, items: map };
}
const gear: GearState = { equipment: [{ id: 1331, name: 'Adamant scimitar' }], inventory: [], coins: 0, bankCoins: 5000 };
const readiness = (o: OwnedState) =>
  stepReadiness({ step: s, steps: allSteps, progress: emptyProgress(), qp: 40, mode: 'f2p', stats: { attack: 30, strength: 20, defence: 1, hitpoints: 25 }, owned: o, gear });

describe('S4-03: the Hill Giants need food at Defence 1', () => {
  it('the scimitar alone is not "ready"; 25 pieces of the listed fish are', () => {
    expect(readiness(owned({ 'Adamant scimitar': 1 })).status).toBe('MISSING_ITEM');
    expect(readiness(owned({ 'Adamant scimitar': 1, Salmon: 25 })).status).toBe('READY');
    expect(readiness(owned({ 'Adamant scimitar': 1, Lobster: 10, Trout: 15 })).status).toBe('READY');
  });

  it('the Food field gives the estimate and why the bones pay for it', () => {
    const food = s.fields!.find((f) => f.label === 'Food')!.text;
    expect(food).toMatch(/about 2 Salmon a giant/);
    expect(food).toMatch(/an estimate/);
    expect(food).toMatch(/Big bone, about 330 gp/);
  });

  it('the Strength potions and the amulet are advice', () => {
    expect((s.itemsRecommended ?? []).map((i) => i.nameEn)).toEqual(['Strength potion(4)', 'Amulet of strength']);
  });
});

describe('S4-03 in the game', () => {
  const p = toInGameTarget(s)!;

  it('the last line is the fight: style, food, potions, when to bank', () => {
    const fight = p.guide!.steps!.at(-1)!;
    expect(fight).toMatch(/Accurate \(Chop\) to Attack 40/);
    expect(fight).toMatch(/Eat at 8 health/);
    expect(fight).toMatch(/Strength potion/);
    expect(fight).toMatch(/bank the Big bones/);
  });

  it('the route goes down the trapdoor to the giants (wiki spawns in the Edgeville Dungeon); the step anchor stays the trapdoor', () => {
    expect(p.pathWaypoints!.map((w) => [w.x, w.y])).toEqual([[3097, 3468], [3111, 9838]]);
    expect(p.goal).toBe('Edgeville Dungeon: the Hill Giants');
    expect(navigationTarget(s)).toMatchObject({ x: 3097, y: 3468 });
  });

  it('the game counts the food alternatives and still highlights the Big bones', () => {
    expect(p.watchItems).toEqual(expect.arrayContaining(FOOD.slice(1)));
    expect(p.highlightItems).toEqual(['Big bones']);
  });
});
