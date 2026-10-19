// Shop access (2.73.0): a shop is recommended only when the player may walk in. A guild door, a quest, a members shop and the Wilderness are checked
// against the player's state; what cannot be confirmed is offered as "if …" beside a verified way, never as the place to go.

import { describe, expect, it } from 'vitest';
import { accessSuffix, shopAccess, spawnAccess, type AccessContext } from '../src/lib/shopAccess';
import { planSources } from '../src/lib/sourceRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { scopeList, shopRows, timingOf, budgetOf, budgetSum, type ShopRow } from '../src/lib/shoppingView';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { allSteps, itemById } from '../src/data';
import type { ShoppingLine } from '../src/lib/shopping';
import type { WikiItemDetail } from '../src/types';

const ctx = (over: Partial<AccessContext> = {}): AccessContext => ({ mode: 'f2p', quests: { known: false }, qp: null, level: () => null, ...over });
const state = (o: { quests?: string[]; levels?: Record<string, number>; owned?: OwnedState | null; position?: { x: number; y: number; plane: number } } = {}) => buildPlayerState({
  mode: 'f2p', stats: (o.levels ?? null) as never, owned: o.owned ?? null, questsDone: o.quests ?? null, connected: true,
  progress: { levels: {} }, gear: null, position: o.position ?? null,
});

describe('who may walk in', () => {
  it("the Champions' Guild shops need 32 quest points: unknown is conditional, too few is blocked", () => {
    expect(shopAccess("Scavvo's Rune Store.", "Champions' Guild", ctx())).toMatchObject({ state: 'conditional', requirement: '32 quest points' });
    expect(shopAccess("Scavvo's Rune Store.", "Champions' Guild", ctx({ qp: 20 }))).toMatchObject({ state: 'blocked', note: 'needs 32 quest points, you have 20' });
    expect(shopAccess("Valaine's Shop of Champions.", "1st floor of Champions' Guild", ctx({ qp: 32 })).state).toBe('open');
    expect(accessSuffix(shopAccess("Scavvo's Rune Store.", "Champions' Guild", ctx()))).toBe(' (if you have 32 quest points)');
  });

  it('the Mining Guild shops need Mining 60; Oziach needs Dragon Slayer I', () => {
    expect(shopAccess("Yarsul's Prodigious Pickaxes", 'Mining Guild', ctx()).state).toBe('conditional');
    expect(shopAccess("Yarsul's Prodigious Pickaxes", 'Mining Guild', ctx({ level: () => 45 })).state).toBe('blocked');
    expect(shopAccess("Hendor's Awesome Ores", 'Mining Guild', ctx({ level: () => 60 })).state).toBe('open');
    expect(shopAccess('Oziach (shop)', 'Edgeville', ctx({ quests: { known: true, value: [], source: 'game' } })).state).toBe('blocked');
    expect(shopAccess('Oziach (shop)', 'Edgeville', ctx({ quests: { known: true, value: ['Dragon Slayer I'], source: 'game' } })).state).toBe('open');
    expect(accessSuffix(shopAccess('Oziach (shop)', 'Edgeville', ctx()))).toBe(' (once Dragon Slayer I is done)');
  });

  it('the Wilderness is never a shopping trip; a members shop is closed to a free account; an unknown shop is not checked', () => {
    expect(shopAccess('Bandit Duty Free', 'Wilderness Bandit Camp', ctx()).state).toBe('blocked');
    expect(shopAccess('Silk merchant', '', ctx()).state).toBe('blocked');
    expect(shopAccess('The Sheared Ram', 'Lumbridge', ctx()).state).toBe('unverified');
    expect(shopAccess('Lumbridge General Store', 'Lumbridge', ctx()).state).toBe('open');
    expect(shopAccess('Karamja General Store', 'Musa Point (Karamja)', ctx())).toMatchObject({ state: 'open', fare: 60 });
  });
});

describe('the router never sends the player where they cannot go', () => {
  const detail = (id: number) => itemById.get(id) as WikiItemDetail;

  it('a hammer is never "free" from the Wilderness bandit shop', () => {
    const plan = planSources({ name: 'Hammer', need: 1, detail: detail(2347), kinds: ['shop'] }, state());
    const labels = [plan.primary, ...plan.alternatives].map((o) => o?.label ?? '');
    expect(labels.some((l) => /Bandit/.test(l))).toBe(false);
  });

  it('the Anti-dragon shield is not bought from Oziach before Dragon Slayer I', () => {
    const before = planSources({ name: 'Anti-dragon shield', need: 1, detail: detail(1540) }, state({ quests: ['Cook\'s Assistant'] }));
    expect([before.primary, ...before.alternatives].some((o) => o?.label.startsWith('Oziach'))).toBe(false);
    // Quests not reported yet: Oziach is at most an "if", never the place to go.
    const unknown = planSources({ name: 'Anti-dragon shield', need: 1, detail: detail(1540) }, state());
    expect(unknown.primary === null || unknown.primary.access === undefined || unknown.primary.access === 'open').toBe(true);
    expect(unknown.alternatives.find((o) => o.label.startsWith('Oziach'))?.label).toContain('(once Dragon Slayer I is done)');
  });

  it("a guild shop with unknown quest points comes after the exchange, labelled with its condition", () => {
    const plan = planSources({ name: 'Rune sword', need: 1, detail: detail(1289), gePrice: 20_000 }, state({ position: { x: 3190, y: 3360, plane: 0 } }));
    expect(plan.primary?.kind).toBe('ge');
    const guild = plan.alternatives.find((o) => o.kind === 'shop');
    expect(guild?.label).toContain('(if you have 32 quest points)');
    expect(guild?.access).toBe('conditional');
  });

  it('Silk is bought in Al Kharid, toll included', () => {
    const plan = planSources({ name: 'Silk', need: 1, detail: detail(950), kinds: ['shop'] }, state());
    expect(plan.primary).toMatchObject({ kind: 'shop', label: 'Silk trader — Al Kharid', price: 12, access: 'open' });
    const free = planSources({ name: 'Silk', need: 1, detail: detail(950), kinds: ['shop'] }, state({ quests: ['Prince Ali Rescue'] }));
    expect(free.primary?.price).toBe(2);
  });
});

describe('the next trip: what the step needs now, apart from advance purchases', () => {
  const ids = ['S4-03', 'S4-04', 'S4-05', 'S5-01'];
  const steps = allSteps.filter((s) => ids.includes(s.id));
  function owned(items: Record<string, [number, number]>): OwnedState {
    const map = new Map<string, OwnedItem>();
    for (const [n, [carried, bank]] of Object.entries(items)) map.set(nameKey(n), { name: n, carried, noted: 0, bank });
    return { bankSeen: true, items: map };
  }
  const o = owned({
    'Adamant scimitar': [1, 0], Salmon: [25, 0], Lobster: [0, 0], 'Steel nails': [0, 0], Plank: [0, 0], Hammer: [0, 1], 'Unfired bowl': [0, 0],
    "Wizard's mind bomb": [0, 0], Silk: [0, 0], 'Lobster pot': [0, 0],
  });
  const s = buildPlayerState({ mode: 'f2p', stats: null, owned: o, questsDone: null, connected: true, progress: { levels: {} }, gear: { equipment: [], inventory: [], coins: 1827, bankCoins: 0 } as never });
  const { list, trip } = scopeList(steps);
  const rows = shopRows(list, { state: s, onGe: (l: ShoppingLine) => l.id !== undefined, detail: (id) => itemById.get(id), trip, gePrice: () => 100, qp: null });
  const now = new Set(['S4-03']);
  const isAhead = (r: ShopRow) => timingOf(r, now) === 'ahead';

  it('S4-03 needs nothing to buy: the lobsters and the dragon materials are for S4-04 and S4-05', () => {
    const nowRows = rows.filter((r) => !r.optional && !isAhead(r));
    expect(nowRows.filter((r) => r.channel === 'ge' || r.channel === 'shop')).toEqual([]);
    expect(rows.find((r) => r.name === 'Lobster')).toBeDefined();
    expect(isAhead(rows.find((r) => r.name === 'Lobster')!)).toBe(true);
  });

  it('the coins the steps pay out are named with their step, and the sum reconciles', () => {
    expect(list.coinLines).toEqual([{ stepId: 'S4-05', amount: 2000, why: 'For buying the ship Lady Lumbridge.' }]);
    const total = budgetOf(rows, list.coins, { bag: 1827, bank: 0 });
    const text = budgetSum(total, list.coinLines)!;
    expect(text).toContain('2,000 gp the steps pay out (S4-05: buying the ship Lady Lumbridge)');
    expect(total.shortfall).toBe(total.required + 2000 - 1827);
    expect(text).toContain(`you have 1,827 gp, so ${total.shortfall!.toLocaleString('en-US')} gp short`);
  });
});

describe('a free item is free only where the player may stand', () => {
  it("the Crafting Guild's hammer needs Crafting 40; Crandor needs Dragon Slayer I under way; the Wilderness edges are out", () => {
    expect(spawnAccess('Crafting Guild', ctx()).state).toBe('conditional');
    expect(spawnAccess('Crafting Guild', ctx({ level: () => 12 }))).toMatchObject({ state: 'blocked' });
    expect(spawnAccess('Crafting Guild - 1st floor', ctx({ level: () => 40 })).state).toBe('open');
    expect(spawnAccess('Crandor - crashed ship at the south-eastern coast. 3 require Telekinetic Grab.', ctx()).state).toBe('blocked');
    expect(spawnAccess('Crandor and Karamja Dungeon', ctx())).toMatchObject({ state: 'conditional', requirement: 'started Dragon Slayer I' });
    expect(spawnAccess('Frozen Waste Plateau - south of the gate', ctx()).state).toBe('blocked');
    expect(spawnAccess('Lumbridge Castle kitchen', ctx()).state).toBe('open');
    expect(spawnAccess('Port Khazard (members only)', ctx()).state).toBe('blocked');
  });

  it('a Crafting 1 player is not sent to the Crafting Guild for a free hammer', () => {
    const s = state({ levels: { crafting: 1 }, position: { x: 2933, y: 3285, plane: 0 } });
    const plan = planSources({ name: 'Hammer', need: 1, detail: itemById.get(2347) as WikiItemDetail, kinds: ['shop', 'free'] }, s);
    expect([plan.primary, ...plan.alternatives].some((o) => o?.label.includes('Crafting Guild'))).toBe(false);
    expect(plan.primary?.access ?? 'open').toBe('open');
  });
});
