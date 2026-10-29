import { describe, expect, it } from 'vitest';
import { combatUpgrades, combatRate } from '../src/lib/combatRates';
import { buildPlayerState } from '../src/lib/playerState';
import { gearData, trainingWeapons } from '../src/services/gearAdvisor';
import { trainingMethods, toolUpgrade, adviseTraining, methodNeeds } from '../src/lib/trainingRouter';
import { emptyProgress } from '../src/lib/progress';
import type { PriceView } from '../src/lib/funding/quotes';
import { STYLE_GEAR } from '../src/lib/styleGear';

const method = trainingMethods.find((m) => m.id === 'me-frog')!;
const quote = (price: number) => ({ price, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] });
const prices: PriceView = {
  status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, sell: () => null,
  buy: (n) => n === 'Rune scimitar' ? quote(12000) : n === 'Salmon' ? quote(40) : null,
};
const state = (attack = 40) => buildPlayerState({
  mode: 'f2p', stats: { attack, strength: 30, defence: 10, hitpoints: 30 }, progress: emptyProgress(), questsDone: [], connected: true,
  gear: { equipment: [{ id: 1329, name: 'Mithril scimitar', slot: 'weapon' }], inventory: [], coins: 100, bankCoins: 0 },
  owned: { bankSeen: true, items: new Map(gearData.items.filter((p) => p.slot === 'weapon').map((p) => [p.name.toLowerCase(), { name: p.name, carried: 0, noted: 0, bank: 0 }])) },
});

describe('combat purchases use Gear eligibility and the same fight estimate', () => {
  it('estimates a usable weapon against the selected trainer and preserves the original state', () => {
    const s = state();
    const before = structuredClone(s.equipment);
    const upgrades = combatUpgrades(method, 'attack', s, { prices, objective: 'fastest' });
    const rune = upgrades.find((u) => u.tool === 'Rune scimitar');
    expect(rune).toBeDefined();
    expect(rune?.xph[0]).toBeGreaterThan(combatRate(method, 'attack', s, { prices, objective: 'fastest' })!.xph[0]);
    expect(rune?.costPerHour).not.toBeNull();
    expect(s.equipment).toEqual(before);
  });
  it('never offers a weapon whose requirement is unmet, a members weapon on F2P, or an unverified item', () => {
    expect(combatUpgrades(method, 'attack', state(30), { prices }).some((u) => u.tool === 'Rune scimitar')).toBe(false);
    const weapons = trainingWeapons({ attack: 99, strength: 99, defence: 99 }, 'f2p');
    expect(weapons.length).toBeGreaterThan(0);
    expect(weapons.every((p) => !p.members && !p.reqUnverified)).toBe(true);
  });
  it('does not suggest buying owned or untracked stock, or make comparisons with unread equipment', () => {
    const owned = state();
    owned.owned!.items.get('rune scimitar')!.bank = 1;
    expect(combatUpgrades(method, 'attack', owned, { prices })).toEqual([]);
    owned.owned!.items.delete('rune scimitar');
    expect(combatUpgrades(method, 'attack', owned, { prices }).some((u) => u.tool === 'Rune scimitar')).toBe(false);
    expect(combatUpgrades(method, 'attack', { ...state(), equipmentKnown: false }, { prices })).toEqual([]);
  });
  it('uses the existing compact suggestion and discloses a known cash shortfall', () => {
    const a = adviseTraining({ skill: 'attack', target: 60, mode: 'f2p', style: 'efficient', priority: 'fastest', state: state(), prices, methods: [method] });
    expect(a.upgrade?.tool).toBeDefined();
    expect(a.upgrade?.short).toBe(100);
    expect(a.reason).toContain('you have 100');
  });
});

describe('upgrade value includes consumable costs', () => {
  it('counts getting the upgrade before recommending a short training detour', () => {
    const m = { ...method, xph: [1000, 1000] as [number, number], costPerHour: 0,
      upgrades: [{ tool: 'Test weapon', price: 1, xph: [2000, 2000] as [number, number], costPerHour: 0 }] };
    expect(toolUpgrade(m, 600, 'fastest', null)?.hours).toBeCloseTo(0.3);
    expect(toolUpgrade(m, 600, 'fastest', null, 0.25)).toBeNull();
    expect(toolUpgrade(m, 2000, 'fastest', null, 0.25)?.hours).toBeCloseTo(0.75);
  });
  it('cost-only savings must also pay for acquisition time when coins have a known time value', () => {
    const m = { ...method, xph: [1000, 1000] as [number, number], costPerHour: 100,
      upgrades: [{ tool: 'Rune-saving staff', price: 10, xph: [1000, 1000] as [number, number], costPerHour: 0 }] };
    expect(toolUpgrade(m, 1000, 'balanced', 100)?.coinsSaved).toBe(90);
    expect(toolUpgrade(m, 1000, 'balanced', 100, 0.25)).toBeNull();
  });
  const m = { ...method, xph: [1000, 1000] as [number, number], costPerHour: 1000,
    upgrades: [{ tool: 'Synthetic slower-cost upgrade', price: 1, xph: [2000, 2000] as [number, number], costPerHour: 100000 }] };
  it('does not sell a time improvement as economical when supplies erase its benefit', () => {
    expect(toolUpgrade(m, 10000, 'balanced', 100)).toBeNull();
    expect(toolUpgrade(m, 10000, 'fastest', 100)?.tool).toBeDefined();
  });
  it('does not treat an unknown consumable cost as free', () => {
    expect(toolUpgrade({ ...m, costPerHour: null }, 10000, 'balanced', 100)).toBeNull();
    expect(toolUpgrade({ ...m, upgrades: [{ ...m.upgrades[0], costPerHour: null }] }, 10000, 'balanced', 100)).toBeNull();
  });
});

describe('bow and elemental staff comparisons share the existing style models', () => {
  const market: PriceView = { ...prices, buy: (n) => / rune$/.test(n) ? quote(5) : n === 'Bronze arrow' ? quote(1) : n === 'Maple shortbow' ? quote(1000) : n === 'Staff of air' ? quote(1500) : prices.buy(n) };
  const styled = (skill: 'magic' | 'ranged', weapon: string) => {
    const s = state();
    s.levels[skill] = { known: true, value: skill === 'magic' ? 13 : 30, source: 'game' };
    s.equipment = { weapon, ...(skill === 'ranged' ? { ammo: 'Bronze arrow' } : {}) };
    s.equipmentItems = [{ name: weapon, count: 1 }, ...(skill === 'ranged' ? [{ name: 'Bronze arrow', count: 100 }] : [])];
    for (const o of STYLE_GEAR[skill].weapon) for (const name of o.names) s.owned!.items.set(name.toLowerCase(), { name, carried: 0, noted: 0, bank: 0 });
    return s;
  };
  it('plans the unlocked standard bow without a duplicate discretionary upgrade or premature next tier', () => {
    const m = trainingMethods.find((x) => x.id === 'ra-frog')!;
    const s = styled('ranged', 'Shortbow');
    const before = combatRate(m, 'ranged', s, { prices: market })!;
    const maple = combatUpgrades(m, 'ranged', s, { prices: market }).find((u) => u.tool === 'Maple shortbow');
    expect(before.xph[0]).toBeGreaterThan(0);
    expect(methodNeeds(m, s, market)).toContainEqual({ type: 'item', name: 'Maple shortbow', equip: true });
    expect(maple).toBeUndefined();
    s.levels.ranged = { known: true, value: 29, source: 'game' };
    expect(combatUpgrades(m, 'ranged', s, { prices: market }).some((u) => u.tool === 'Maple shortbow')).toBe(false);
    s.mode = 'members';
    s.equipment.weapon = 'Unmodelled members bow';
    expect(combatUpgrades(m, 'ranged', s, { prices: market })).toEqual([]);
  });
  it('shows actual rune savings from a staff without claiming that identical Magic bonuses speed combat', () => {
    const m = trainingMethods.find((x) => x.id === 'ma-strike')!;
    const s = styled('magic', 'Magic staff');
    const before = combatRate(m, 'magic', s, { prices: market })!;
    const air = combatUpgrades(m, 'magic', s, { prices: market }).find((u) => u.tool === 'Staff of air');
    expect(air).toBeDefined();
    expect(air?.xph).toEqual(before.xph);
    expect(air?.costPerHour).toBeCloseTo(before.costPerHour! / 2);
    const withUpgrade = { ...m, xph: before.xph, costPerHour: before.costPerHour, upgrades: [air!] };
    const pick = toolUpgrade(withUpgrade, 100000, 'balanced', null);
    expect(pick?.hours).toBe(0);
    expect(pick?.coinsSaved).toBeGreaterThan(0);
    expect(toolUpgrade(withUpgrade, 100000, 'fastest', 100)).toBeNull();
    const advice = adviseTraining({ skill: 'magic', target: 50, state: s, mode: 'f2p', style: 'efficient', priority: 'balanced', prices: market, methods: [m] });
    expect(advice.reason).toMatch(/gp after its price/);
    expect(advice.reason).not.toMatch(/saves ≈ (?:0|1) min/);
    expect(s.equipment.weapon).toBe('Magic staff');
    s.equipment.weapon = 'Unmodelled powered staff';
    expect(combatUpgrades(m, 'magic', s, { prices: market })).toEqual([]);
  });
});
