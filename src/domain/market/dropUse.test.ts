import { describe, expect, it } from 'vitest';
import { dropUse } from './dropUse';

const player = (levels: Record<string, number>, goals: Record<string, number>, coinsEach: number | null) =>
  ({ level: (s: string) => levels[s] ?? null, goal: (s: string) => goals[s] ?? null, coinsEach });

describe('what to do with a drop', () => {
  // Owner report 2026-11-09: the app said nothing about the Big bones of frogs and giants, sell or bury.
  it('buries bones toward a Prayer goal above the current level, sells them otherwise', () => {
    expect(dropUse('Big bones', player({ prayer: 20 }, { prayer: 31 }, 290))).toMatchObject({ action: 'bury' });
    expect(dropUse('Big bones', player({ prayer: 20 }, { prayer: 31 }, 290)).text).toMatch(/15 Prayer XP each toward Prayer 31/);
    expect(dropUse('Big bones', player({ prayer: 31 }, { prayer: 31 }, 290))).toMatchObject({ action: 'sell' });
    expect(dropUse('Big bones', player({ prayer: 20 }, {}, 290)).text).toMatch(/about 290 gp each after tax; no Prayer goal needs them/);
  });

  it('buries bones that sell for nothing and leaves other worthless drops', () => {
    expect(dropUse('Big bones', player({ prayer: 20 }, {}, null))).toMatchObject({ action: 'bury' });
    expect(dropUse('Cowhide', player({ prayer: 20 }, { prayer: 31 }, 100))).toMatchObject({ action: 'sell' });
    expect(dropUse('Raw beef', player({ cooking: 1 }, {}, null))).toMatchObject({ action: 'leave' });
    // No sale is not no value: a new account banks what it cannot sell yet, and a missing price is said as missing.
    expect(dropUse('Cowhide', { ...player({}, {}, null), noSale: 'restricted' }).text).toBe('Cowhide: bank them; this account cannot sell them yet.');
    expect(dropUse('Cowhide', { ...player({}, {}, null), noSale: 'unpriced' })).toMatchObject({ action: 'keep' });
  });

  // Owner 2026-11-09: cowhides, tan or sell. A Money processing method that pays more than the raw sale wins.
  it('processes a drop when a Money processing method pays more than selling it raw', () => {
    const tan = (extraEach: number) => ({ ...player({}, {}, 100), processed: { title: 'Tanning cowhide', extraEach } });
    expect(dropUse('Cowhide', tan(140)).text).toBe('Cowhide: Tanning cowhide pays about 140 gp more each than selling them raw.');
    expect(dropUse('Cowhide', tan(0))).toMatchObject({ action: 'sell' });
  });

  // Feathers, runes or arrows that the followed training uses up are kept, not sold.
  it('keeps a drop the followed training method uses up', () => {
    expect(dropUse('Feather', { ...player({}, {}, 2), keepFor: 'fly fishing' }).text).toBe('Feather: keep them for fly fishing.');
  });

  // Cook or sell, by the burns: the cooked one's sale after tax times the Wiki success chance at this level, against the raw sale.
  it('cooks a catch to sell only when the cooked sale, after the burns at this level, beats selling it raw', () => {
    const sale = (prices: Record<string, number>) => (name: string) => prices[name] ?? null;
    const cookOrSell = (level: number, raw: number, cooked: number) => dropUse('Raw lobster', { ...player({ cooking: level }, {}, raw), saleOf: sale({ Lobster: cooked }) });
    // Cooking 40 burns lobsters often; at 74 they never burn (success low 38, high 332).
    expect(cookOrSell(40, 100, 200)).toMatchObject({ action: 'cook' });
    expect(cookOrSell(40, 100, 200).text).toMatch(/^Raw lobster: cook and sell them, about \d+ gp more each than raw after the burns at Cooking 40\.$/);
    expect(cookOrSell(40, 117, 125)).toMatchObject({ action: 'sell' }); // A small margin is eaten by the burns.
    expect(cookOrSell(74, 117, 125)).toMatchObject({ action: 'cook' });
    expect(cookOrSell(39, 100, 200)).toMatchObject({ action: 'sell' }); // Below the level that cooks it.
    expect(dropUse('Raw lobster', player({ cooking: 40 }, {}, 100))).toMatchObject({ action: 'sell' }); // No cooked price known.
  });

  // The same rule for a raw catch: cook it toward a Cooking goal the player can cook it at, sell it otherwise.
  it('cooks a raw catch toward a Cooking goal only from the level that cooks it', () => {
    expect(dropUse('Raw lobster', player({ cooking: 40 }, { cooking: 50 }, 150)).text).toMatch(/cook them, 120 Cooking XP each toward Cooking 50/);
    expect(dropUse('Raw lobster', player({ cooking: 30 }, { cooking: 50 }, 150))).toMatchObject({ action: 'sell' });
    expect(dropUse('Raw lobster', player({ cooking: 40 }, {}, 150)).text).toMatch(/no Cooking goal needs them/);
  });
});
