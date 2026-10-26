import { describe, expect, it } from 'vitest';
import { attackCounts, attacksToKill, combatRecovery, foeVariants } from '../src/lib/combatEstimate';
import { combatRate } from '../src/lib/combatRates';
import { rangedNeeds } from '../src/lib/rangedLoadout';
import { goalArrows } from '../src/lib/rangedAmmo';
import { xpForLevel } from '../src/lib/xp';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { trainingMethods } from '../src/lib/trainingRouter';
import type { PriceView } from '../src/lib/funding/quotes';

const method = (id: string) => trainingMethods.find((m) => m.id === id)!;
const quote = (price: number) => ({ price, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] });
const market: PriceView = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined,
  buy: (n) => / rune$/.test(n) ? quote(5) : / arrow$/.test(n) ? quote(3) : ['Salmon', 'Trout'].includes(n) ? quote(40) : null,
  sell: (n) => n === 'Cowhide' ? quote(120) : n === 'Big bones' ? quote(200) : null };
const state = (levels: Record<string, number> = { ranged: 30, magic: 13, defence: 1, hitpoints: 30 }) => buildPlayerState({
  mode: 'f2p', stats: levels, progress: emptyProgress(), questsDone: [], connected: true,
  gear: { equipment: [{ id: 841, name: 'Shortbow', slot: 'weapon' }, { id: 882, name: 'Bronze arrow', count: 100, slot: 'ammo' }], inventory: [], coins: 1000, bankCoins: 0 }, owned: null,
});

describe('one recovery model for every combat style', () => {
  it('a banked bow replaces the worn melee weapon and shield in both food and ammunition predictions', () => {
    const build = (melee: boolean) => buildPlayerState({
      mode: 'f2p', stats: { ranged: 30, defence: 10, hitpoints: 30 }, progress: emptyProgress(), connected: true, questsDone: [],
      gear: { inventory: [], coins: 100, bankCoins: 0, equipment: melee
        ? [{ id: 1329, name: 'Mithril scimitar', slot: 'weapon' }, { id: 1191, name: 'Iron kiteshield', slot: 'shield' }]
        : [{ id: 841, name: 'Shortbow', slot: 'weapon' }] },
      owned: { bankSeen: true, items: new Map([
        ['shortbow', { name: 'Shortbow', carried: 0, noted: 0, bank: melee ? 1 : 0 }],
        ['bronze arrow', { name: 'Bronze arrow', carried: 100, noted: 0, bank: 0 }],
      ]) },
    });
    const banked = build(true), equipped = build(false);
    const before = { ...banked.equipment };
    expect(combatRate(method('ra-frog'), 'ranged', banked, { prices: market })).toEqual(combatRate(method('ra-frog'), 'ranged', equipped, { prices: market }));
    const legs = [{ method: method('ra-frog'), fromLevel: 30, toLevel: 35 }];
    expect(goalArrows(legs, banked, xpForLevel(30))).toEqual(goalArrows(legs, equipped, xpForLevel(30)));
    expect(banked.equipment).toEqual(before);
  });

  it('ranged food costs are real and more Defence improves the same fight', () => {
    const low = combatRate(method('ra-frog'), 'ranged', state(), { prices: market })!;
    const high = combatRate(method('ra-frog'), 'ranged', state({ ranged: 30, defence: 99, hitpoints: 30 }), { prices: market })!;
    expect(low.costName).toContain('salmon');
    expect(high.xph[0]).toBeGreaterThan(low.xph[0]);
    expect(high.costPerHour!).toBeLessThan(low.costPerHour!);
    const unpriced = combatRate(method('ra-frog'), 'ranged', state(), { prices: { ...market, buy: (n) => n === 'Salmon' ? null : market.buy(n) } })!;
    expect(unpriced.costPerHour).toBeNull();
  });
  it('monks use healing time rather than inventing a food bill', () => {
    const r = combatRate(method('ra-monk'), 'ranged', state(), { prices: market })!;
    expect(r.costName).toBe('arrows');
    expect(r.costPerHour).toBeGreaterThan(0);
  });
  it('an unread defensive level/HP or unsafe Magic target is not a safe personalized estimate', () => {
    expect(combatRate(method('ra-frog'), 'ranged', state({ ranged: 30, hitpoints: 30 }))).toBeNull();
    const s = state({ magic: 13, defence: 1 }); s.equipment = {};
    expect(combatRate(method('ma-strike'), 'magic', s)).toBeNull();
    const unsafe = state({ magic: 13, defence: 1, hitpoints: 10 }); unsafe.equipment = {};
    expect(combatRate({ ...method('ma-strike'), npcNames: ['Elvarg'] }, 'magic', unsafe)).toBeNull();
  });
  it('unknown Ranged level produces an unchecked requirement, not a loadout crash', () => {
    const needs = rangedNeeds(state({ defence: 1, hitpoints: 10 }));
    expect(needs).toContainEqual({ type: 'skill', skill: 'ranged', min: 1 });
    expect(needs).toContainEqual(expect.objectContaining({ name: 'Shortbow', equip: true }));
  });
  it('longer bank trips and smaller bags cost time for the same damage', () => {
    const inp = { foe: foeVariants('Giant frog')[0], hitpoints: 30, food: { name: 'Salmon', heals: 9 }, kills: 100,
      fightMean: 1000, fightVar: 0, damageMean: 1000, damageVar: 0, margin: 0.15, foodSlots: 10, tripMinutes: [1, 1] as [number, number] };
    const base = combatRecovery(inp);
    expect(combatRecovery({ ...inp, tripMinutes: [5, 5] }).totalMinutes.mid).toBeGreaterThan(base.totalMinutes.mid);
    expect(combatRecovery({ ...inp, foodSlots: 5 }).totalMinutes.mid).toBeGreaterThan(base.totalMinutes.mid);
  });
  it('Magic count distributions include successful zeroes, matching the shared timing moments', () => {
    const counts = attackCounts(8, 2, 0.8, false);
    const total = counts.reduce((a, p) => a + p, 0);
    const mean = counts.reduce((a, p, n) => a + p * n, 0) / total;
    expect(mean).toBeCloseTo(attacksToKill(8, 2, 0.8, false).mean, 3);
  });
  it('Magic earns banked loot under the same rule, and pickup time slows both XP and rune spending', () => {
    const s = state(); s.equipment = {}; s.equipmentItems = [];
    const bare = combatRate(method('ma-strike'), 'magic', s, { prices: market, objective: 'fastest' })!;
    const loot = combatRate(method('ma-strike'), 'magic', s, { prices: market, objective: 'balanced', restriction: 'LIFTED' })!;
    expect(loot.loot).toBe('Cowhide');
    expect(loot.lootPerHour).toBeGreaterThan(0);
    expect(loot.xph[1]).toBeLessThan(bare.xph[1]);
    expect(loot.costPerHour).toBeLessThan(bare.costPerHour!);
    expect(loot.costPerHour! / bare.costPerHour!).toBeCloseTo(loot.xph[1] / bare.xph[1]);
  });
});
