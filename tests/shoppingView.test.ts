// The Shopping screen's model (lib/shoppingView.ts): what to obtain before going on, each row with what to do, and the empty states kept apart.
// Fixtures are built by hand from the route's own items (S3-08's Salmon, S4-05's tools) and a player state the game could send.

import { describe, expect, it } from 'vitest';
import { budgetOf, budgetSum, emptyStateOf, exchangePlan, geListText, ownershipOf, scopeList, scopeSteps, shopRows, supplyReserve, syncLine, type ShopRow } from '../src/lib/shoppingView';
import { aggregateShopping, type ShoppingLine } from '../src/lib/shopping';
import { buildPlayerState } from '../src/lib/playerState';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { emptyProgress } from '../src/lib/progress';
import { allSteps, itemById } from '../src/data';
import type { Step, StepItemRequirement } from '../src/types';

const item = (nameEn: string, amount: number | string, extra: Partial<StepItemRequirement> = {}): StepItemRequirement => ({ nameEn, amount, howToGet: '', ...extra });
const step = (id: string, items: StepItemRequirement[], rec: StepItemRequirement[] = []): Step =>
  ({ id, stage: 1, type: 'skill', title: id, itemsRequired: items, ...(rec.length ? { itemsRecommended: rec } : {}) }) as unknown as Step;

function owned(items: Record<string, [number, number | null]>, bankSeen = true): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const [n, [carried, bank]] of Object.entries(items)) map.set(nameKey(n), { name: n, carried, noted: 0, ...(bank === null ? {} : { bank }) });
  return { bankSeen, items: map };
}
function state(o: OwnedState | null, extra: { manual?: Record<string, number>; coins?: number; bankCoins?: number | null; worn?: string[] } = {}) {
  return buildPlayerState({
    mode: 'f2p', stats: null, owned: o, questsDone: null, connected: o !== null,
    progress: { levels: {}, ownedManual: Object.fromEntries(Object.entries(extra.manual ?? {}).map(([k, count]) => [k, { count }])) },
    gear: o ? { equipment: (extra.worn ?? []).map((name, i) => ({ id: 9000 + i, name, slot: 'weapon' })), inventory: [], coins: extra.coins ?? 0, bankCoins: extra.bankCoins === undefined ? 0 : extra.bankCoins } as never : null,
  });
}
const SALMON = { wikiItemId: 329, heals: 9, anyOf: ['Trout', 'Tuna', 'Lobster'] };
const ctx = (s: ReturnType<typeof state>, over: Partial<Parameters<typeof shopRows>[1]> = {}) => ({
  state: s, onGe: (l: ShoppingLine) => l.id !== undefined, detail: (id: number) => itemById.get(id), gePrice: (l: ShoppingLine) => (l.nameEn === 'Salmon' ? 33 : l.nameEn === 'Hammer' ? 20 : 100), ...over,
});
const rowsOf = (steps: Step[], s: ReturnType<typeof state>, over = {}) => {
  const { list, trip } = scopeList(steps);
  return shopRows(list, { ...ctx(s, over), trip });
};
const byName = (rows: ShopRow[], n: string) => rows.find((r) => r.name === n)!;

describe('what each row says to do', () => {
  it('partly owned food: the rest is bought, the bank stock is named, the cost is for what is missing only', () => {
    const rows = rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(owned({ Salmon: [0, 13] })));
    const r = byName(rows, 'Salmon');
    expect(r).toMatchObject({ channel: 'ge', qty: 7, cost: 7 * 33 });
    expect(r.action).toBe('Buy at the Grand Exchange · 13 more in the bank');
  });

  it('enough in the bank, not in the bag: take from the bank, not buy', () => {
    const r = byName(rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(owned({ Salmon: [5, 40] }))), 'Salmon');
    expect(r).toMatchObject({ channel: 'bank', qty: 15, action: 'Take 15 from the bank', cost: null });
  });

  it('food of another kind counts by healing, and an unread bank is not "none"', () => {
    // 30 Trout heal 210 = 23 Salmon: the 20 asked for are covered.
    expect(byName(rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(owned({ Trout: [30, 0], Salmon: [0, 0] }))), 'Salmon').channel).toBe('have');
    const unread = byName(rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(owned({ Salmon: [3, null] }, false))), 'Salmon');
    expect(unread).toMatchObject({ channel: 'unknown', qty: 17, action: 'If you do not have it: the Grand Exchange' });
    // An empty bank that was read is a real zero: buy.
    expect(byName(rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(owned({ Salmon: [0, 0] }))), 'Salmon').channel).toBe('ge');
  });

  it('what is worn counts as owned (the old list read no equipment)', () => {
    const rows = rowsOf([step('A', [item('Adamant scimitar', 1, { wikiItemId: 1331 })])], state(owned({}), { worn: ['Adamant scimitar'] }));
    expect(byName(rows, 'Adamant scimitar')).toMatchObject({ channel: 'have', action: 'Worn' });
  });

  it('obtained during a step: on the way, never a purchase; an item without an id is never an exchange item', () => {
    const rows = rowsOf([step('A', [item('Maze key', 1, { inStep: true }), item('Odd thing', 1)])], state(owned({})));
    expect(byName(rows, 'Maze key')).toMatchObject({ channel: 'along', action: 'You get it during A' });
    expect(byName(rows, 'Odd thing')).toMatchObject({ tradeable: false });
    expect(byName(rows, 'Odd thing').channel).not.toBe('ge');
  });

  it('a hand mark settles an item the game did not report', () => {
    const rows = rowsOf([step('A', [item('Hammer', 1, { wikiItemId: 2347 })])], state(owned({}, false), { manual: { 'id:2347': 1 } }));
    expect(byName(rows, 'Hammer').channel).toBe('have');
  });

  it("a shop is chosen only when its stock covers the batch: 742 Salmon go to the exchange, not to a 20-piece shop", () => {
    const rows = rowsOf([step('A', [item('Salmon', 742, SALMON)])], state(owned({ Salmon: [0, 0] }), {}), { gePrice: () => 40 });
    expect(byName(rows, 'Salmon').channel).toBe('ge');
  });

  // T12: one batch above the exchange's four-hour limit is several rounds of buying, said on the row; an unknown limit says nothing.
  it('a batch above the four-hour buy limit says how many rounds it takes', () => {
    const at = (geLimit?: () => number | undefined) => byName(rowsOf([step('A', [item('Salmon', 742, SALMON)])], state(owned({ Salmon: [0, 0] }), {}), { gePrice: () => 40, ...(geLimit ? { geLimit } : {}) }), 'Salmon').action;
    expect(at(() => 300)).toMatch(/^Buy at the Grand Exchange \(at most 300 every 4 hours: 3 rounds\)/);
    expect(at(() => 10000)).not.toMatch(/every 4 hours/);
    expect(at(() => undefined)).not.toMatch(/every 4 hours/);
    expect(at()).not.toMatch(/every 4 hours/);
  });
});

describe('quantities across steps', () => {
  it('a tool or something worn is one for every step; food is summed step after step', () => {
    const list = aggregateShopping([
      step('A', [item('Hammer', 1, { wikiItemId: 2347 }), item('Iron chainbody', 1, { wikiItemId: 1101 }), item('Trout', 5, { wikiItemId: 333, heals: 7 })]),
      step('B', [item('Hammer', 1, { wikiItemId: 2347 }), item('Iron chainbody', 1, { wikiItemId: 1101 }), item('Trout', 10, { wikiItemId: 333, heals: 7 })]),
    ]);
    const n = (name: string) => list.required.find((l) => l.nameEn === name)!.count;
    expect(n('Hammer')).toBe(1);
    expect(n('Iron chainbody')).toBe(1);
    expect(n('Trout')).toBe(15);
  });

  it('alternatives are one need, not two: anyOf is carried on the line and never summed into the count', () => {
    const list = aggregateShopping([step('A', [item('Salmon', 20, SALMON)])]);
    expect(list.required).toHaveLength(1);
    expect(list.required[0]).toMatchObject({ count: 20, heals: 9 });
    expect(list.required[0].anyOf).toEqual(['Trout', 'Tuna', 'Lobster']);
  });

  it('the next trip is the current step and the next open ones, the same window as the step\'s preparation', () => {
    const p = emptyProgress();
    const ids = scopeSteps('trip', allSteps, p, 'S1-01', { from: 1, to: 1, openOnly: true }).map((s) => s.id);
    expect(ids[0]).toBe('S1-01');
    expect(ids.length).toBe(4);
    expect(scopeSteps('step', allSteps, p, 'S1-01', { from: 1, to: 1, openOnly: true }).map((s) => s.id)).toEqual(['S1-01']);
    expect(scopeSteps('trip', allSteps, p, null, { from: 1, to: 1, openOnly: true })).toEqual([]);
  });

  it('a long training step buys the whole goal but takes one bag from the bank', () => {
    const s = step('A', [item('Salmon', 26, { ...SALMON, totalAmount: 400 })]);
    const r = byName(rowsOf([s], state(owned({ Salmon: [0, 500] }))), 'Salmon');
    expect(r).toMatchObject({ channel: 'bank', qty: 26, required: 400 });
    const short = byName(rowsOf([s], state(owned({ Salmon: [0, 100] }))), 'Salmon');
    expect(short).toMatchObject({ channel: 'ge', qty: 300 });
  });
});

describe('the budget', () => {
  it('cannot replace a missing GE quote with a fixed NPC price or a baked item value', () => {
    const rows = rowsOf([step('A', [item('Hammer', 1, { wikiItemId: 2347 })])], state(owned({ Hammer: [0, 0] })), {
      gePrice: () => null, priceLabel: () => 'Price unavailable', detail: () => ({ ...itemById.get(2347)!, freeSpawns: [], dropSources: [] }),
    });
    expect(rows[0]).toMatchObject({ channel: 'ge', cost: null, unitPrice: null, priceLabel: 'Price unavailable' });
    const budget = budgetOf(rows, 0, { bag: 10000, bank: 0 });
    expect(budget).toMatchObject({ required: 0, unpriced: 1, shortfall: null });
    expect(budgetSum(budget)).toBeNull();
    expect(supplyReserve(rows)).toEqual({ amount: 0, complete: false });
  });
  it('keeps cached package prices labelled and unknown ownership out of a confirmed reserve', () => {
    const rows = rowsOf([step('A', [item('Strength potion(4)', 1, { wikiItemId: 113 })])], state(owned({ 'Strength potion(4)': [0, 0], 'Strength potion(3)': [0, 0], 'Strength potion(2)': [0, 0], 'Strength potion(1)': [0, 0] })), { gePrice: () => 100, priceOf: () => 100, priceLabel: () => 'Cached GE estimate' });
    expect(rows[0]).toMatchObject({ channel: 'ge', cost: 100, priceLabel: 'Cached GE estimate' });
    expect(supplyReserve(rows)).toEqual({ amount: 100, complete: true });
    const unchecked = rows.map(r => ({ ...r, channel: 'unknown' as const }));
    expect(supplyReserve(unchecked)).toEqual({ amount: 0, complete: false });
    expect(budgetOf(unchecked, 0, { bag: 10000, bank: 0 }).shortfall).toBeNull();
  });
  const rows = rowsOf([step('A', [item('Salmon', 20, SALMON)], [item('Strength potion(4)', 1, { wikiItemId: 113 })])], state(owned({ Salmon: [0, 0], 'Strength potion(4)': [0, 0], 'Strength potion(3)': [0, 0], 'Strength potion(2)': [0, 0], 'Strength potion(1)': [0, 0] })));

  it('required and optional costs are apart; the shortfall needs both bag and bank coins', () => {
    const b = budgetOf(rows, 50, { bag: 100, bank: 200 });
    expect(b.required).toBe(20 * 33);
    expect(b.optional).toBeGreaterThan(0);
    expect(b.funds).toBe(300);
    expect(b.shortfall).toBe(20 * 33 + 50 - 300);
    // The bank coins are not known and the bag does not cover it: the shortfall is not known, not zero.
    expect(budgetOf(rows, 50, { bag: 100, bank: null }).shortfall).toBeNull();
    expect(budgetOf(rows, 0, { bag: 5000, bank: null }).shortfall).toBe(0);
  });

  it('rows that cannot be checked are counted apart, at most, never as purchases', () => {
    const unknown = rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(owned({ Salmon: [0, null] }, false)));
    const b = budgetOf(unknown, 0, { bag: 0, bank: null });
    expect(b.required).toBe(0);
    expect(b.unknownRows).toBe(1);
    expect(b.unknownMax).toBe(20 * 33);
  });
});

describe('the exchange list for the clipboard', () => {
  it('exchange purchases only; the unconfirmed ones apart; no bank withdrawals, no shop, quest or optional items', () => {
    const rows = rowsOf([
      step('A', [item('Salmon', 20, SALMON), item('Lobster', 5, { wikiItemId: 379, heals: 12 }), item('Maze key', 1, { inStep: true }), item('Tinderbox', 1, { wikiItemId: 590 })], [item('Hammer', 1, { wikiItemId: 2347 })]),
    ], state(owned({ Salmon: [0, 0], Lobster: [0, 10], Tinderbox: [0, null] }, true)));
    const text = geListText('Grand Exchange: the next trip', rows, 0)!;
    // The 5 Lobsters beyond the Lobster line cover 6 Salmon: 14 are left to buy.
    expect(text).toContain('Salmon x14');
    expect(text).not.toContain('Lobster');
    expect(text).not.toContain('Maze key');
    expect(text).not.toContain('Hammer');
  });

  it('nothing to buy: no list at all, so no copy button', () => {
    expect(geListText('x', rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(owned({ Salmon: [20, 0] }))), 0)).toBeNull();
  });
});

describe('the six states are told apart', () => {
  const base = { error: false, scope: 'trip' as const, current: 'A', connected: true, hasSnapshot: false, loaded: true };
  const have = rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(owned({ Salmon: [20, 0] })));
  const unknown = rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(null));

  it('error, no plan, nothing asked, everything owned', () => {
    expect(emptyStateOf({ ...base, error: true, rows: have })).toBe('error');
    expect(emptyStateOf({ ...base, current: null, rows: [] })).toBe('no-plan');
    expect(emptyStateOf({ ...base, rows: [] })).toBe('no-requirements');
    expect(emptyStateOf({ ...base, rows: have })).toBe('all-owned');
    // A range needs no current step.
    expect(emptyStateOf({ ...base, scope: 'range', current: null, rows: [] })).toBe('no-requirements');
  });

  it('offline and not loaded are not "everything owned" and not "nothing to buy"', () => {
    expect(emptyStateOf({ ...base, connected: false, loaded: false, rows: unknown })).toBe('offline');
    expect(emptyStateOf({ ...base, connected: false, loaded: false, hasSnapshot: true, rows: unknown })).toBeNull();
    expect(emptyStateOf({ ...base, loaded: false, rows: unknown })).toBe('not-loaded');
    expect(emptyStateOf({ ...base, rows: rowsOf([step('A', [item('Salmon', 20, SALMON)])], state(owned({ Salmon: [0, 0] }))) })).toBeNull();
  });

  it('the sync line says what the connection can do, and no more', () => {
    const now = 10 * 60_000;
    expect(syncLine({ connected: false, loaded: false, bankSeen: false })).toBe('Offline — ownership not confirmed. Connect RuneLite to check your bag and bank.');
    expect(syncLine({ connected: false, loaded: true, bankSeen: true, bankSavedAt: 0, now })).toBe('Offline — using last-known quantities (bank last checked 10 min ago).');
    expect(syncLine({ connected: true, loaded: false, bankSeen: false })).toBe('Waiting for your character: log in to the game in RuneLite.');
    expect(syncLine({ connected: true, loaded: true, bankSeen: false })).toBe('Bag checked. Open your bank in RuneLite to refresh.');
    expect(syncLine({ connected: true, loaded: true, bankSeen: true, bankSavedAt: 0, now })).toBe('Bank last checked 10 min ago. Open your bank in RuneLite to refresh.');
    expect(syncLine({ connected: true, loaded: true, bankSeen: true })).toBe('Bag and bank checked in this session.');
  });
});

describe('ownership by the shared player state', () => {
  it('alternatives add only to a known amount: an unknown item stays unknown', () => {
    const s = state(owned({ Salmon: [0, null], Trout: [9, null] }, false));
    const o = ownershipOf(s, { nameEn: 'Salmon', key: 'id:329', anyOf: ['Trout'], heals: 9 });
    expect(o.total).toBeNull();
    expect(o.withYou).toBe(7);
  });
});

describe('one stack, one use', () => {
  it('Lobsters a step asks for are not counted again as the Salmon of another line', () => {
    const rows = rowsOf([step('A', [item('Salmon', 20, SALMON), item('Lobster', 5, { wikiItemId: 379, heals: 12 })])], state(owned({ Salmon: [0, 0], Lobster: [0, 10] })));
    // 10 Lobsters: 5 are the Lobster line's, the other 5 heal 60 = 6 Salmon.
    expect(byName(rows, 'Lobster')).toMatchObject({ channel: 'bank', qty: 5 });
    expect(byName(rows, 'Salmon')).toMatchObject({ channel: 'ge', qty: 14 });
  });
});

describe('what the game is asked to count does not depend on the count (2.72.2: a row flickered)', () => {
  it('a row found in the bank stays counted: the watch list is the same before and after, only the exchange list changes', () => {
    const steps = [step('A', [item('Unfired bowl', 1, { wikiItemId: 1791 }), item('Salmon', 20, SALMON)])];
    // Not counted yet: the bowl is "not confirmed" and listed at the exchange.
    const before = exchangePlan(rowsOf(steps, state(owned({ Salmon: [0, 0] }))));
    expect(byName(rowsOf(steps, state(owned({ Salmon: [0, 0] }))), 'Unfired bowl').channel).toBe('unknown');
    // Counted: one is in the bank, so it leaves the exchange list.
    const after = exchangePlan(rowsOf(steps, state(owned({ Salmon: [0, 0], 'Unfired bowl': [0, 1] }))));
    expect(before.items.map((i) => i.name)).toContain('Unfired bowl');
    expect(after.items.map((i) => i.name)).not.toContain('Unfired bowl');
    // …but the game keeps counting it, so it never falls back to "not confirmed".
    expect(after.watch).toEqual(before.watch);
    expect(after.watch).toEqual(expect.arrayContaining(['Unfired bowl', 'Salmon']));
  });
});
