import { describe, expect, it } from 'vitest';
import { allocateFoodStock, heldFood } from '../src/lib/foodAdvice';
import { buildPlayerState } from '../src/lib/playerState';
import { evaluate } from '../src/lib/requirements';
import { evaluatePreflight, nameKey, preflightItems, type OwnedState } from '../src/lib/checklist';
import { ownershipOf, shopRows } from '../src/lib/shoppingView';
import { ownedFood } from '../src/lib/combatPlan';
import { readinessOf } from '../src/lib/readiness';
import { aggregateShopping, holdingFor } from '../src/lib/shopping';
import { planOneTrip } from '../src/lib/oneTrip';
import { emptyProgress } from '../src/lib/progress';
import type { Step } from '../src/types';

const food = { nameEn: 'Salmon', heals: 9, anyOf: ['Trout', 'Tuna', 'Cooked meat', 'Shrimps'] };
function snapshot(stock: Record<string, [number, number | null]>, hp = 24, bankSeen = true) {
  const owned: OwnedState = { bankSeen, items: new Map([food.nameEn, ...food.anyOf].map(name => {
    const [carried, bank] = stock[name] ?? [0, bankSeen ? 0 : null];
    return [nameKey(name), { name, carried, noted: 0, ...(bank !== null ? { bank } : {}) }];
  })) };
  return buildPlayerState({ mode: 'f2p', stats: { hitpoints: hp } as never, progress: emptyProgress(), owned, gear: null, questsDone: null });
}
const step = (count = 20): Step => ({ id: 'food-stock-test', stage: 1, type: 'skill', title: 'Training', requires: [], doneWhen: 'Test supplies ready',
  itemsRequired: [{ ...food, amount: count, howToGet: 'Grand Exchange' }] } as Step);

describe('shared declared combat food stock', () => {
  it('counts weak food by healing across readiness, departure, Shopping, funding and one-trip preparation', () => {
    const s = snapshot({ Trout: [20, 0] });
    const r = step();
    const line = aggregateShopping([r]).required[0];
    expect(heldFood(s, food).total).toBe(15);
    expect(evaluate({ type: 'item', name: 'Salmon', count: 20, food }, s)).toMatchObject({ state: 'PARTIAL', have: 15, missing: 5 });
    expect(evaluatePreflight(preflightItems(r), s.owned!).rows[0]).toMatchObject({ have: 15, state: 'NOT_FOUND_IN_BANK' });
    expect(ownershipOf(s, line)).toMatchObject({ total: 15, withYou: 15 });
    expect(holdingFor(line, s.owned)).toMatchObject({ owned: 15, buy: 5 });
    expect(planOneTrip([r], emptyProgress(), r.id, s).lines[0]).toMatchObject({ status: 'GET', toGet: 5 });
  });

  it('adds mixed healing before rounding and ignores duplicate aliases', () => {
    const s = snapshot({ Shrimps: [2, 0], 'Cooked meat': [1, 0] });
    expect(heldFood(s, { ...food, anyOf: ['Shrimps', 'shrimps', 'Cooked meat', 'Salmon'] })).toMatchObject({ bag: 1, total: 1 });
  });

  it('caps both foods at the real Hitpoints level', () => {
    const s = snapshot({ Tuna: [23, 0] }, 10);
    expect(heldFood(s, food, undefined, 10).total).toBe(23);
    expect(ownershipOf(s, { ...food, key: 'salmon' }).total).toBe(23);
    expect(ownedFood(step(25), s.owned, new Map(), 10)?.equivalent).toBe(23);
    expect(evaluatePreflight(preflightItems(step(25)), s.owned!, { hitpoints: 10 }).ready).toBe(false);
  });

  it('allocates a shared alternative stack once and never mutates the game snapshot', () => {
    const s = snapshot({ Trout: [9, 0] });
    s.owned!.items.set('lobster', { name: 'Lobster', carried: 0, noted: 0, bank: 0 });
    const r = { ...step(7), itemsRequired: [
      { ...food, amount: 7, howToGet: 'Grand Exchange' },
      { nameEn: 'Lobster', heals: 12, anyOf: ['Trout'], amount: 1, howToGet: 'Grand Exchange' },
    ] };
    const plan = planOneTrip([r], emptyProgress(), r.id, s);
    expect(plan.lines.find(l => l.line.nameEn === 'Salmon')).toMatchObject({ status: 'HAVE' });
    expect(plan.lines.find(l => l.line.nameEn === 'Lobster')).toMatchObject({ status: 'GET', toGet: 1 });
    const rows = shopRows(aggregateShopping([r]), { state: s, onGe: () => true, detail: () => undefined, gePrice: () => 10 });
    expect(rows.find(l => l.name === 'Salmon')?.channel).toBe('have');
    expect(rows.find(l => l.name === 'Lobster')).toMatchObject({ channel: 'ge', qty: 1 });
    expect(evaluatePreflight(preflightItems(r), s.owned!).ready).toBe(false);
    expect(readinessOf(r, { steps: [r], progress: emptyProgress(), mode: 'f2p', qp: 0, state: s }).status).toBe('MISSING_ITEM');
    expect(s.owned!.items.get('trout')?.carried).toBe(9);
  });

  it('keeps the original manual ownership key in the departure allocation', () => {
    const s = snapshot({});
    s.owned = null;
    s.manual['name:salmon'] = 20;
    expect(readinessOf(step(), { steps: [step()], progress: emptyProgress(), mode: 'f2p', qp: 0, state: s }).status).toBe('READY');
    const twoNeeds = { ...step(), itemsRequired: [...step().itemsRequired!, ...step().itemsRequired!] };
    expect(readinessOf(twoNeeds, { steps: [twoNeeds], progress: emptyProgress(), mode: 'f2p', qp: 0, state: s }).status).toBe('MISSING_ITEM');
    expect(s.manual['name:salmon']).toBe(20);
  });

  it('keeps optional food separate from the same required food and from exact quest ingredients', () => {
    const s = snapshot({ Trout: [2, 0] });
    const allocated = allocateFoodStock(s, [{ ...food, key: 'required', count: 1 },
      { ...food, key: 'optional', count: 1, reservedCount: 0 }], 24, new Map([['salmon', 1]]));
    expect(allocated.get('required')?.total).toBe(1);
    expect(allocated.get('optional')?.total).toBe(0);

    const exact = { ...step(), itemsRequired: [{ nameEn: 'Trout', amount: 2, howToGet: 'Quest' }],
      itemsRecommended: [{ ...food, amount: 1, howToGet: 'Grand Exchange' }] };
    const ingredientRows = shopRows(aggregateShopping([exact]), { state: s, onGe: () => true, detail: () => undefined, gePrice: () => 10 });
    expect(ingredientRows.find(row => row.optional)).toMatchObject({ channel: 'ge', qty: 1 });
  });

  it('leaves an unreported accepted bank row unknown without discarding confirmed stock', () => {
    const s = snapshot({ Salmon: [0, 25] });
    s.owned!.items.delete('trout');
    expect(heldFood(s, food)).toMatchObject({ total: 25, bank: null, bankLower: 25 });
    expect(evaluate({ type: 'item', name: 'Salmon', count: 20, food }, s).state).toBe('BANK');
    expect(evaluate({ type: 'item', name: 'Salmon', count: 30, food }, s).state).toBe('UNKNOWN');
    expect(ownershipOf(s, { ...food, key: 'salmon' })).toMatchObject({ total: null, lowerBound: 25 });
    const line = aggregateShopping([step()]).required[0];
    expect(holdingFor(line, s.owned)).toMatchObject({ status: 'SUFFICIENT', buy: 0 });
    expect(shopRows(aggregateShopping([step()]), { state: s, onGe: () => true, detail: () => undefined, gePrice: () => 10 })[0]).toMatchObject({ channel: 'bank', qty: 20 });
  });

  it('reserves the physical alternatives required by another line', () => {
    const s = snapshot({ Trout: [0, 20] });
    expect(heldFood(s, food, undefined, 24, new Map([['trout', 10]]))).toMatchObject({ total: 7, bank: 7 });
  });

  it('never turns a quest ingredient into interchangeable combat food', () => {
    const s = snapshot({ Trout: [20, 0] });
    expect(evaluate({ type: 'item', name: 'Salmon', count: 1 }, s).state).toBe('MISSING');
    const ingredient = { ...step(1), itemsRequired: [{ nameEn: 'Salmon', amount: 1, howToGet: 'Grand Exchange' }] };
    const merged = aggregateShopping([step(), ingredient]).required[0];
    expect(merged.heals).toBeUndefined();
    expect(merged.anyOf).toEqual([]);
    expect(holdingFor(merged, s.owned)).toMatchObject({ owned: 0, buy: 21 });
  });
});
