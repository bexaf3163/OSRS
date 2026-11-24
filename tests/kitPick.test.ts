import { describe, expect, it } from 'vitest';
import { pickKit } from '../src/domain/combat/kitPick';
import { adviseGear, gearData } from '../src/domain/combat/gearAdvisor';
import fixture from './fixtures/gePrices.json';
import { combatFoesJson } from '../src/data';
import type { Foe } from '../src/types';

describe('pickKit', () => {
  const prices: Record<string, number> = { 'Dragon kiteshield': 58_498_000, 'Rune kiteshield': 32_000 };
  const kit = (budget: number) => pickKit({
    slots: [{ slot: 'shield', names: ['Rune kiteshield', 'Dragon kiteshield'] }],
    rank: (name) => [name.startsWith('Dragon') ? 2 : 1], owned: () => false, price: (name) => prices[name] ?? null, budget,
  });

  it('earns the shortfall for a cheap piece but buys a dear one only from coins in hand', () => {
    expect(kit(22)).toEqual([{ slot: 'shield', name: 'Rune kiteshield', buy: true }]);
    expect(kit(100_000_000)).toEqual([{ slot: 'shield', name: 'Dragon kiteshield', buy: true }]);
  });

  it('the Gear page saves up for the same pieces', () => {
    const gePrices = new Map(gearData.items.filter((p) => prices[p.name]).map((p) => [p.id, prices[p.name]]));
    const shield = (coins: number) => {
      const a = adviseGear({ mode: 'members', levels: { attack: 60, strength: 60, defence: 60, hitpoints: 60 }, gePrices,
        gear: { equipment: [], inventory: [], coins, bankCoins: 0 } });
      return [...a.armour, ...a.goals].filter((g) => g.slot === 'shield').map((g) => g.item.name);
    };
    expect(shield(0)).toEqual(['Rune kiteshield']);
    expect(shield(100_000_000)).toEqual(['Dragon kiteshield']);
  });

  it('never advises a shield beside a two-handed weapon', () => {
    const live = new Map(Object.entries(fixture.prices).map(([name, p]) => [name.toLowerCase(), p.buy]));
    const gePrices = new Map(gearData.items.flatMap((p) => live.has(p.name.toLowerCase()) ? [[p.id, live.get(p.name.toLowerCase())!] as const] : []));
    const scimitar = gearData.items.find((p) => p.name === 'Rune scimitar')!;
    // The Contact! fight where the route first paired a dragon 2h sword with a kiteshield.
    const scarab = (combatFoesJson as unknown as { foes: Foe[] }).foes.find((f) => f.name === 'Giant Scarab')!;
    let twoHanded = 0;
    for (const mode of ['f2p', 'members'] as const) for (const lv of [40, 60, 80, 99]) for (const coins of [0, 1_000_000, 100_000_000]) {
      const a = adviseGear({ mode, levels: { attack: lv, strength: lv, defence: lv, hitpoints: lv }, gePrices, foes: [scarab],
        gear: { equipment: [{ id: scimitar.id, name: scimitar.name, slot: 'weapon' }], inventory: [], coins, bankCoins: 0 } });
      const kit = [...a.actions, ...a.armour, ...a.goals];
      if (kit.some((g) => g.slot === 'weapon' && g.item.twoHanded) && ++twoHanded) expect(kit.filter((g) => g.slot === 'shield'), `${mode} ${lv} ${coins}`).toEqual([]);
    }
    expect(twoHanded).toBeGreaterThan(0);
  });
});
