import { describe, expect, it } from 'vitest';
import { requirementCost } from '../src/lib/funding/need';
import { buildPlayerState } from '../src/lib/playerState';
import { adviseTraining, type TrainingMethod } from '../src/lib/trainingRouter';
import { emptyProgress } from '../src/lib/progress';
import type { PriceView } from '../src/lib/funding/quotes';

const prices = (buy: Record<string, number>): PriceView => ({
  status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, sell: () => null,
  buy: (name) => name in buy ? { price: buy[name], basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: null, notes: [] } : null,
});
const state = (stock: Record<string, number>, bankSeen = true) => buildPlayerState({
  mode: 'f2p', stats: { mining: 41 }, progress: emptyProgress(), connected: true, questsDone: [],
  gear: { inventory: [], equipment: [], coins: 1100, bankCoins: bankSeen ? 0 : null },
  owned: { bankSeen, items: new Map(Object.entries(stock).map(([name, bank]) => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: bankSeen ? bank : undefined }])) },
});

describe('optional upgrades leave money for the known next-trip kit', () => {
  it('prices only the missing quantity, reusing owned alternatives and the cheapest known quote', () => {
    expect(requirementCost([{ type: 'alternative', requiredCount: 10, alternatives: [{ name: 'Salmon' }, { name: 'Trout' }] }],
      state({ Salmon: 2, Trout: 3 }), prices({ Salmon: 20, Trout: 10 }))).toBe(50);
  });
  it('never treats unchecked stock or a missing quote as a zero reserve', () => {
    const needs = [{ type: 'item' as const, name: 'Salmon', count: 10 }];
    expect(requirementCost(needs, state({ Salmon: 0 }, false), prices({ Salmon: 20 }))).toBeNull();
    expect(requirementCost(needs, state({ Salmon: 0 }), prices({}))).toBeNull();
    expect(requirementCost(needs, state({ Salmon: 10 }), null)).toBe(0);
  });
  it('does not reuse the same stock twice or treat a fee as spendable kit money', () => {
    expect(requirementCost([
      { type: 'item', name: 'Salmon', count: 10 },
      { type: 'alternative', requiredCount: 10, alternatives: [{ name: 'Salmon' }] },
    ], state({ Salmon: 10 }), prices({ Salmon: 20 }))).toBeNull();
    expect(requirementCost([{ type: 'money', amount: 1000 }], state({}), prices({}))).toBeNull();
  });
  it('prices missing potion doses as actual packages, rather than treating each dose as a full potion', () => {
    // Funding keeps one full named bottle plus its cheapest tail: five missing doses -> one (4) and one (3).
    expect(requirementCost([{ type: 'item', name: 'Strength potion(4)', count: 2 }],
      state({ 'Strength potion(4)': 0, 'Strength potion(3)': 1, 'Strength potion(2)': 0, 'Strength potion(1)': 0 }),
      prices({ 'Strength potion(4)': 40, 'Strength potion(3)': 20 }))).toBe(60);
  });
  const method: TrainingMethod = {
    id: 'synthetic-budget-method', kind: 'method', name: 'Test mining', skills: ['mining'], from: 1, to: null,
    needs: [{ type: 'tool', skill: 'mining' }, { type: 'item', name: 'Salmon', count: 10 }],
    xph: [1000, 1000], xpa: null, act: null, xpTotal: null, url: '', effort: 'low', cost: 'free', risk: 'none', where: 'Test place', members: false,
    upgrades: [{ tool: 'Rune pickaxe', price: 1000, xph: [2000, 2000], costPerHour: 0 }],
  };
  const advice = (stock: Record<string, number>, market: PriceView) => adviseTraining({
    skill: 'mining', target: 50, state: state(stock), mode: 'f2p', style: 'efficient', priority: 'fastest', methods: [method], prices: market,
  });
  it('discloses a shortage after the kit even when raw cash covers the upgrade', () => {
    const a = advice({ 'Iron pickaxe': 1, Salmon: 0 }, prices({ Salmon: 20 }));
    expect(a.upgrade).toMatchObject({ tool: 'Rune pickaxe', kitCost: 200, afterKit: 900 });
    expect(a.reason).toContain('only 900 gp after the kit');
  });
  it('does not reserve a second tool or buy supplies already in the bank', () => {
    const a = advice({ 'Iron pickaxe': 1, Salmon: 10 }, prices({ Salmon: 20 }));
    expect(a.upgrade?.kitCost).toBe(0);
    expect(a.upgrade?.afterKit).toBeUndefined();
  });
  it('states when a reserve cannot be checked instead of implying affordability', () => {
    const a = advice({ 'Iron pickaxe': 1, Salmon: 0 }, prices({}));
    expect(a.upgrade?.kitCost).toBeNull();
    expect(a.reason).toContain('check kit stock and prices before buying');
  });
});
