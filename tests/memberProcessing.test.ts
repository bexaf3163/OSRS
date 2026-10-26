import { describe, expect, it } from 'vitest';
import { PROCESSING, processRate } from '../src/lib/processingRates';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { personalize, trainingMethods, viewMethod } from '../src/lib/trainingRouter';
import type { PriceView } from '../src/lib/funding/quotes';

const method = (id: string) => trainingMethods.find((m) => m.id === id)!;
const state = (skill: string, level: number, mode: 'f2p' | 'members' = 'members', questsDone: string[] = ['Druidic Ritual']) => buildPlayerState({
  mode, stats: { [skill]: level }, progress: emptyProgress(), connected: true, questsDone, owned: null,
  gear: { equipment: [], inventory: [], coins: 10000, bankCoins: 0 },
});
const quote = (price: number) => ({ price, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] });

describe('Members recipes inherit the shared processing rules', () => {
  it('Fletching is closed on F2P and unknown levels never become a personalized pace', () => {
    expect(processRate(method('fl-shortbow'), 'fletching', state('fletching', 5, 'f2p'))).toBeNull();
    expect(processRate(method('fl-shortbow'), 'fletching', state('magic', 5))).toBeNull();
  });
  it('arrow shafts use the source steady Make-X pace and quantity per log, with one knife slot', () => {
    const r = processRate(method('fl-shaft'), 'fletching', state('fletching', 1))!;
    expect(r.xpPerAction).toBe(5);
    expect(r.xph[1]).toBeCloseTo((27 * 5 * 3600) / (27 * 3 * 0.6 + 3));
    expect(r.needs).toContainEqual({ type: 'item', name: 'Logs', count: 27 });
    expect(r.needs).toContainEqual({ type: 'item', name: 'Knife', count: 1 });
    expect(PROCESSING.recipes.find((r) => r.id === 'fl-shafts-logs')?.output?.qty).toBe(15);
  });
  it.each([
    ['fl-shortbow', 5, 'Shortbow (u)'], ['fl-shortbow', 10, 'Longbow (u)'],
    ['fl-oak-willow', 20, 'Oak shortbow (u)'], ['fl-oak-willow', 40, 'Willow longbow (u)'],
    ['fl-maple', 50, 'Maple shortbow (u)'], ['fl-maple', 55, 'Maple longbow (u)'],
    ['fl-yew', 65, 'Yew shortbow (u)'], ['fl-yew', 70, 'Yew longbow (u)'],
    ['fl-magic', 80, 'Magic shortbow (u)'], ['fl-magic', 85, 'Magic longbow (u)'],
  ])('selects the actual unlocked recipe for %s at %i', (id, level, product) => {
    const r = processRate(method(id), 'fletching', state('fletching', level), { objective: 'fastest' })!;
    expect(r.basis).toBe(product);
    expect(r.methodName).toBe(`Make ${product}`);
    expect(r.costPerHour).toBeNull();
    expect(r.needs?.some((n) => n.type === 'item' && /logs$/i.test(n.name))).toBe(true);
  });
  it('Herblore gates the actual quest, names a concrete potion and requires both ingredients', () => {
    const s = state('herblore', 3);
    const m = personalize([method('he-potions')], 'herblore', s)[0];
    expect(m.name).toBe('Make Attack potion(3)');
    expect(m.needs).toContainEqual({ type: 'quest', quest: 'Druidic Ritual' });
    expect(m.needs).toContainEqual({ type: 'item', name: 'Guam potion (unf)', count: 14 });
    expect(m.needs).toContainEqual({ type: 'item', name: 'Eye of newt', count: 14 });
    expect(viewMethod(m, state('herblore', 3, 'members', [])).status).toBe('LOCKED');
  });
  it('the high-potion bracket has a valid level60 fallback and never unlocks Super restore early', () => {
    const low = processRate(method('he-high'), 'herblore', state('herblore', 60))!;
    const high = processRate(method('he-high'), 'herblore', state('herblore', 63))!;
    expect(low.basis).toBe('Super strength(3)');
    expect(high.basis).toBe('Super restore(3)');
    expect(high.xpPerAction).toBe(142.5);
    // Full-dose-only ingredients need exact-form preparation support before they can be automatic defaults.
    expect(PROCESSING.recipes.some((r) => r.id === 'he-super-combat-potion')).toBe(false);
  });
  it('accounts for recipe ingredients and sale value; unknown inputs cannot produce fake free profit', () => {
    const p: PriceView = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined,
      buy: (n) => n === 'Guam potion (unf)' ? quote(20) : n === 'Eye of newt' ? quote(5) : null,
      sell: (n) => n === 'Attack potion(3)' ? quote(50) : null };
    const r = processRate(method('he-potions'), 'herblore', state('herblore', 3), { prices: p })!;
    expect(r.costPerHour).toBeCloseTo(25 * (3600 / (1.2 + 3 / 14) + 3600 / (1.2 + 15 / 14)) / 2);
    expect(r.lootPerHour).toBeGreaterThan(r.costPerHour!);
    const missing = processRate(method('he-potions'), 'herblore', state('herblore', 3), { prices: { ...p, buy: () => null } })!;
    expect(missing.costPerHour).toBeNull();
    expect(missing.lootPerHour).toBeUndefined();
  });
});
