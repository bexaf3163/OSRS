// Potion doses (2.73.0): one shared count for the step's readiness, the trip, Shopping, the coin plan and the game. A "Strength potion(4)" is four doses,
// every size counts toward a need, doses are not bag slots, and a shortfall is bought as a package of potions, never as "another full potion" per dose.

import { describe, expect, it } from 'vitest';
import { carryOf, doseKind, dosePackage, heldUnits, needUnits, shortText, takeFromBank } from '../src/lib/doses';
import { shopRows, scopeList, geListText, type ShopRow } from '../src/lib/shoppingView';
import { aggregateShopping, holdingFor, type ShoppingLine } from '../src/lib/shopping';
import { buildPlayerState } from '../src/lib/playerState';
import { evaluate } from '../src/lib/requirements';
import { evaluatePreflight, preflightItems, nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { planOneTrip } from '../src/lib/oneTrip';
import { emptyProgress } from '../src/lib/progress';
import { itemById } from '../src/data';
import type { Step, StepItemRequirement } from '../src/types';

const item = (nameEn: string, amount: number, extra: Partial<StepItemRequirement> = {}): StepItemRequirement => ({ nameEn, amount, howToGet: '', ...extra });
const step = (id: string, items: StepItemRequirement[], rec: StepItemRequirement[] = []): Step =>
  ({ id, stage: 1, type: 'skill', title: id, itemsRequired: items, ...(rec.length ? { itemsRecommended: rec } : {}) }) as unknown as Step;

/** What the game reports: every size of a potion once one is asked about (ItemCounts.report). [bag, bank]; bank null = not opened. */
function owned(items: Record<string, [number, number | null]>, bankSeen = true): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const [n, [carried, bank]] of Object.entries(items)) map.set(nameKey(n), { name: n, carried, noted: 0, ...(bank === null ? {} : { bank }) });
  return { bankSeen, items: map };
}
const strength = (sizes: Partial<Record<1 | 2 | 3 | 4, [number, number | null]>>, bankSeen = true) =>
  owned(Object.fromEntries([1, 2, 3, 4].map((d) => [`Strength potion(${d})`, sizes[d as 1 | 2 | 3 | 4] ?? [0, bankSeen ? 0 : null]])), bankSeen);
const state = (o: OwnedState | null) => buildPlayerState({ mode: 'f2p', stats: null, owned: o, questsDone: null, connected: o !== null, progress: { levels: {} }, gear: null });

const POTION = { wikiItemId: 113 };
const PRICES: Record<string, number> = { 'Strength potion(1)': 90, 'Strength potion(2)': 110, 'Strength potion(3)': 140, 'Strength potion(4)': 160 };
const price = (n: string) => PRICES[n] ?? null;
const rowsOf = (steps: Step[], o: OwnedState | null): ShopRow[] => {
  const { list, trip } = scopeList(steps);
  return shopRows(list, {
    state: state(o), onGe: (l: ShoppingLine) => l.id !== undefined, detail: (id: number) => itemById.get(id), trip,
    gePrice: (l: ShoppingLine) => price(l.nameEn), priceOf: price,
  });
};
const potionRow = (rows: ShopRow[]) => rows.find((r) => r.unit === 'dose')!;
const ONE_FOUR = [step('A', [item('Strength potion(4)', 1, POTION)])];

describe('what is a potion', () => {
  it('a name with a dose count is a potion; charges are not doses', () => {
    expect(doseKind('Strength potion(4)')).toEqual({ base: 'Strength potion', per: 4 });
    expect(doseKind('Antipoison(1)')).toEqual({ base: 'Antipoison', per: 1 });
    expect(doseKind('Amulet of glory(4)')).toBeNull();
    expect(doseKind('Games necklace(8)')).toBeNull();
    expect(needUnits('Strength potion(4)', 4)).toBe(16);
    expect(needUnits('Lobster', 4)).toBe(4);
  });
});

describe('the spec case: the plan needs 4 doses', () => {
  it('a (3) and a (1) are enough: no dose short, but 2 slots unless poured together', () => {
    const h = heldUnits(state(strength({ 3: [1, 0], 1: [1, 0] })), 'Strength potion(4)');
    expect(h).toMatchObject({ unit: 'dose', total: 4, bag: 4, presence: 'PRESENT', source: 'game' });
    const carry = carryOf(h.sizes!, 4, 'strength potion');
    expect(carry).toMatchObject({ potions: 2, fewest: 1 });
    expect(carry.combine).toContain('(3) + (1)');
    expect(carry.combine).toContain('1 slot instead of 2');

    const r = potionRow(rowsOf(ONE_FOUR, strength({ 3: [1, 0], 1: [1, 0] })));
    expect(r).toMatchObject({ channel: 'have', qty: 0, required: 4 });
    expect(r.carry?.combine).toContain('pour them together');
    expect(evaluate({ type: 'item', name: 'Strength potion(4)', count: 1 }, state(strength({ 3: [1, 0], 1: [1, 0] })))).toMatchObject({ state: 'OK', have: 4, need: 4 });
  });

  it('only 3 doses: 1 dose short, bought as one small potion, never as another full requirement', () => {
    const rows = rowsOf(ONE_FOUR, strength({ 3: [0, 1] }));
    const r = potionRow(rows);
    expect(r).toMatchObject({ channel: 'ge', qty: 1, required: 4 });
    // The cheapest potion that holds the last dose: a (1) at 90, not a (4) at 160.
    expect(r.package?.lines).toEqual([{ name: 'Strength potion(1)', size: 1, count: 1, unit: 90 }]);
    expect(r.cost).toBe(90);
    expect(r.action).toBe('Buy 1 × Strength potion(1) at the Grand Exchange · 3 doses more in the bank');
    expect(r.package?.alternative).toContain('Strength potion(4) ≈ 160 gp (3 spare)');
    expect(evaluate({ type: 'item', name: 'Strength potion(4)', count: 1 }, state(strength({ 3: [0, 1] })))).toMatchObject({ state: 'PARTIAL', have: 3, missing: 1 });
    expect(shortText('Strength potion(4)', 1)).toBe('1 dose short: a Strength potion(1), or another (4) with 3 spare');
    expect(geListText('GE', rows, 0)).toBe('GE\nStrength potion(1) x1');
  });

  it('when the small potion is dearer than a full one, the full one is the package and its spares are said', () => {
    const pack = dosePackage('Strength potion(4)', 1, (n) => ({ 'Strength potion(1)': 200, 'Strength potion(2)': 210, 'Strength potion(3)': 220, 'Strength potion(4)': 160 } as Record<string, number>)[n] ?? null)!;
    expect(pack.lines).toEqual([{ name: 'Strength potion(4)', size: 4, count: 1, unit: 160 }]);
    expect(pack.spare).toBe(3);
  });

  it('a large shortfall is whole potions of the named size plus one for the rest', () => {
    const pack = dosePackage('Strength potion(4)', 14, price)!;
    expect(pack.lines).toEqual([
      { name: 'Strength potion(4)', size: 4, count: 3, unit: 160 },
      { name: 'Strength potion(2)', size: 2, count: 1, unit: 110 },
    ]);
    expect(pack).toMatchObject({ doses: 14, spare: 0, cost: 3 * 160 + 110 });
    expect(dosePackage('Strength potion(4)', 0, price)).toBeNull();
  });
});

describe('every source, no double counting, unknown is not none', () => {
  it('the bag, banknotes and the bank add up in doses', () => {
    const o = strength({ 4: [1, 2], 2: [0, 3] });
    o.items.get(nameKey('Strength potion(3)'))!.noted = 2;
    const h = heldUnits(state(o), 'Strength potion(4)');
    expect(h).toMatchObject({ bag: 4, noted: 6, bank: 8 + 6, total: 4 + 6 + 14 });
  });

  it('an unopened bank leaves the total unknown unless the bag already covers the need', () => {
    const r = potionRow(rowsOf(ONE_FOUR, strength({ 3: [1, null] }, false)));
    expect(r.channel).toBe('unknown');
    expect(r.qty).toBe(1);
    expect(potionRow(rowsOf(ONE_FOUR, strength({ 4: [1, null] }, false))).channel).toBe('have');
    expect(evaluate({ type: 'item', name: 'Strength potion(4)', count: 1 }, state(strength({ 3: [1, null] }, false))).state).toBe('UNKNOWN');
  });

  it('a size the game did not report is "not counted", not "none" (an older plugin reports the named size only)', () => {
    const onlyFour = owned({ 'Strength potion(4)': [0, 0] });
    const h = heldUnits(state(onlyFour), 'Strength potion(4)');
    expect(h.presence).toBe('UNKNOWN');
    expect(h.total).toBeNull();
  });

  it('a drunk dose is recounted at once: a (4) that became a (3) is one dose less everywhere', () => {
    const before = heldUnits(state(strength({ 4: [2, 0] })), 'Strength potion(4)').total;
    const after = heldUnits(state(strength({ 4: [1, 0], 3: [1, 0] })), 'Strength potion(4)').total;
    expect([before, after]).toEqual([8, 7]);
  });

  it('a manual mark made before doses were counted is read as potions of the named size', () => {
    const s = buildPlayerState({ mode: 'f2p', stats: null, owned: null, questsDone: null, connected: false, progress: { levels: {}, ownedManual: { 'id:113': { count: 2 } } }, gear: null });
    expect(heldUnits(s, 'Strength potion(4)', 'dose:strength potion', ['id:113']).total).toBe(8);
  });
});

describe('one result on every screen', () => {
  it('the list merges sizes into one dose line: a (4) of one step and a (3) of another are 7 doses', () => {
    const list = aggregateShopping([step('A', [item('Strength potion(4)', 1, POTION)]), step('B', [item('Strength potion(3)', 1, { wikiItemId: 115 })])]);
    expect(list.required).toHaveLength(1);
    expect(list.required[0]).toMatchObject({ key: 'dose:strength potion', count: 7, dose: { base: 'Strength potion', per: 4 } });
  });

  it('the trip, the departure check and the coin plan count the same doses', () => {
    const o = strength({ 3: [1, 0], 1: [0, 1] });
    const steps = [step('A', [item('Strength potion(4)', 1, POTION)])];
    const trip = planOneTrip(steps, emptyProgress(), 'A', state(o));
    expect(trip.lines[0]).toMatchObject({ status: 'BANK', toGet: 0 });
    expect(trip.lines[0].held.total).toBe(4);
    const pre = evaluatePreflight(preflightItems(steps[0]), o);
    expect(pre.rows[0]).toMatchObject({ have: 3, inBank: 1, state: 'MISSING_FROM_BAG' });
    const hold = holdingFor(aggregateShopping(steps).required[0], o);
    expect(hold).toMatchObject({ required: 4, owned: 4, buy: 0, status: 'SUFFICIENT' });
  });

  it('the bank withdrawal names the exact potions, largest first', () => {
    expect(takeFromBank('Strength potion', [
      { size: 4, bag: 0, noted: 0, bank: 2 }, { size: 3, bag: 0, noted: 0, bank: 1 }, { size: 2, bag: 0, noted: 0, bank: 0 }, { size: 1, bag: 0, noted: 0, bank: 5 },
    ], 10)).toEqual([{ name: 'Strength potion(4)', count: 2 }, { name: 'Strength potion(3)', count: 1 }]);
  });
});
