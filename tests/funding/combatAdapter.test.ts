import { describe, expect, it } from 'vitest';
import { cheapestFood, combatPersonaliser } from '../../src/lib/funding/combatAdapter';
import { evaluate } from '../../src/lib/funding/evaluate';
import { methodById } from '../../src/lib/funding/methods';
import { gearById } from '../../src/services/gearAdvisor';
import { ctxOf, fakePrices, fakeSnap } from './helpers';

const id = (n: string) => [...gearById.values()].find((p) => p.name === n)!.id;
// The character of the Hill Giants report: Attack 30, Strength 21, Defence 1, 24 hitpoints, an Adamant scimitar and iron armour.
const gear = {
  equipment: ['Adamant scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'].map((n) => ({ id: id(n), name: n })),
  inventory: [], coins: 400, bankCoins: 0,
};
const stats = { attack: 30, strength: 21, defence: 1, hitpoints: 24 };
const xp = { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 };
const prices = fakePrices({ Salmon: { buy: 33 }, Trout: { buy: 21 }, Tuna: { buy: 43 }, Lobster: { buy: 103 }, Swordfish: { buy: 231 }, 'Big bones': { sell: 325, volume: 32784 }, 'Limpwurt root': { sell: 216, volume: 69464 } });
const hill = methodById('hill-giants')!;
const live = (train: 'attack' | 'strength' | null) => ({ stats, xp, gear: gear as never, train });

describe('food for the monster', () => {
  it('picks the cheapest food per point of health, not the cheapest piece or the biggest heal', () => {
    // Trout 21 / 7 = 3.0 gp a point, Salmon 33 / 9 = 3.67, Tuna 4.3, Lobster 8.6, Swordfish 16.5.
    expect(cheapestFood(['Trout', 'Salmon', 'Tuna', 'Lobster', 'Swordfish'], prices)).toMatchObject({ name: 'Trout', heals: 7, price: 21 });
  });

  it('with no price for any, the first food is named so the evaluator reports the missing price', () => {
    expect(cheapestFood(['Salmon', 'Trout'], fakePrices({}))).toMatchObject({ name: 'Salmon', price: null });
  });

  it('a food the model does not know is skipped', () => {
    expect(cheapestFood(['Shark'], prices)).toBeNull();
  });
});

describe('Hill Giants for the reported character, from the shared combat model', () => {
  const p = combatPersonaliser(live('attack'), prices)(hill)!;

  it('a kill takes about a minute and eats three or four pieces of Trout: the slow, food-heavy fight the report describes', () => {
    expect(p.secondsPerUnit.typical).toBeGreaterThan(40);
    expect(p.secondsPerUnit.typical).toBeLessThan(80);
    expect(p.extraInputs[0].item.name).toBe('Trout');
    expect(p.extraInputs[0].qty).toBeGreaterThan(2.5);
    expect(p.extraInputs[0].qty).toBeLessThan(5);
    expect(p.caution).toMatch(/Food-intensive/);
    expect(p.secondsPerUnit.fast).toBeLessThan(p.secondsPerUnit.typical);
    expect(p.secondsPerUnit.typical).toBeLessThan(p.secondsPerUnit.slow);
  });

  it('keeps the style the player trains: Attack (accurate) is slower than Strength (aggressive), and the note says which', () => {
    const str = combatPersonaliser(live('strength'), prices)(hill)!;
    expect(p.secondsPerUnit.typical).toBeGreaterThan(str.secondsPerUnit.typical);
    expect(p.notes.join(' ')).toMatch(/training attack/);
    const none = combatPersonaliser(live(null), prices)(hill)!;
    expect(none.notes.join(' ')).toMatch(/Strength training is assumed/);
  });

  it('cows are quick and need no food', () => {
    const cows = combatPersonaliser(live('attack'), prices)(methodById('cows-cowhide')!)!;
    expect(cows.secondsPerUnit.typical).toBeLessThan(25);
    expect(cows.extraInputs).toEqual([]);
  });

  it('no gear or levels from the game: no personal model, never a guess', () => {
    expect(combatPersonaliser({ stats: null, gear: gear as never }, prices)(hill)).toBeNull();
    expect(combatPersonaliser({ stats, gear: null }, prices)(hill)).toBeNull();
    expect(combatPersonaliser({ stats, gear: { ...gear, equipment: [{ id: 99999, name: 'Strange sword', slot: 'weapon' }] } as never }, prices)(hill)).toBeNull();
    expect(combatPersonaliser(live('attack'), prices)(methodById('mine-iron-dwarven')!)).toBeNull();
  });

  it('feeds the evaluator: the food is priced, the kill pays, and the method is flagged food-intensive', () => {
    const snap = fakeSnap({
      levels: stats, position: { x: 3093, y: 3495, plane: 0 },
      protections: [{ name: 'Big bones', qty: 50, why: 'S4-03' }],
    });
    const e = evaluate(hill, ctxOf({ prices, snap, personalise: combatPersonaliser(live('attack'), prices), cash: 4000, target: 1000 }));
    expect(e.blockers).toEqual([]);
    expect(e.perUnit.inputs).toBeGreaterThan(55);
    expect(e.perUnit.inputs).toBeLessThan(110);
    expect(e.cautions.join(' ')).toMatch(/Food-intensive/);
    // The required 50 bones are filled first, so a small target is not met by selling them.
    expect(e.workingCapital!).toBeGreaterThan(1500);
  });
});
