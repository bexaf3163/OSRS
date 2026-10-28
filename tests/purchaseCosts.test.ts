import { describe, expect, it } from 'vitest';
import { allSteps, itemById } from '../src/data';
import { buildPlayerState } from '../src/lib/playerState';
import { nameKey, type OwnedState } from '../src/lib/checklist';
import { emptyProgress } from '../src/lib/progress';
import { planOneTrip } from '../src/lib/oneTrip';
import { readinessOf } from '../src/lib/readiness';
import { buildPrepPlan } from '../src/lib/prepPlan';
import { scopeList, shopRows, budgetOf } from '../src/lib/shoppingView';
import { buildNeed } from '../src/lib/funding/need';
import { market } from './funding/market';
import { planSources } from '../src/lib/sourceRouter';
import { purchaseCost } from '../src/lib/purchaseCost';
import { prepareFor, stopText, type TravelInput } from '../src/lib/travel';
import type { Step } from '../src/types';

// Use S8-06 supplies, with a smaller batch within the recorded shop stock.
// Exclude free spawns to exercise the shop branch rather than free acquisition.
const original = allSteps.find(s => s.id === 'S8-06')!;
const step: Step = { ...original, itemsRequired: original.itemsRequired!.filter(i => ['Pot', 'Bucket'].includes(i.nameEn)).map(i => ({ ...i, amount: i.nameEn === 'Pot' ? 5 : 3 })), itemsRecommended: [] };
const shopDetail = (id: number) => { const d = itemById.get(id); return d ? { ...d, freeSpawns: [] } : undefined; };
const position = { x: 3315, y: 3180, plane: 0 };
function fixture(bankCoins: number | null = 0, banked = false) {
  const owned: OwnedState = { bankSeen: true, items: new Map(['Pot', 'Bucket'].map(name => [nameKey(name), { name, carried: 0, noted: 0, bank: banked ? 9 : 0 }])) };
  const state = buildPlayerState({ mode: 'f2p', connected: true, position, stats: null, progress: { levels: {} }, questsDone: [], owned,
    gear: { equipment: [], inventory: [], coins: 0, bankCoins } });
  const progress = emptyProgress();
  const trip = planOneTrip([step], progress, step.id, state);
  const prep = buildPrepPlan({ step, steps: [step], progress, state, trip, detail: shopDetail,
    readiness: readinessOf(step, { steps: [step], progress, qp: 0, mode: 'f2p', state }) });
  return { state, prep };
}

describe('shared acquisition costs', () => {
  it('prices the missing pots and buckets plus one shared gate allowance', () => {
    const { state, prep } = fixture();
    const { list, trip } = scopeList([step]);
    const rows = shopRows(list, { state, trip, detail: shopDetail, onGe: () => true, gePrice: () => 100 });
    expect(rows.map(r => [r.name, r.unitPrice, r.cost]).sort()).toEqual([['Bucket', 2, 6], ['Pot', 1, 5]]);
    expect(budgetOf(rows, 0, { bag: 0, bank: 0 }).required).toBe(21);
    expect(prep.coins).toMatchObject({ need: 10, missing: 10 });
    const need = buildNeed({ step, prep, prices: market(), owned: state.owned, manual: {} });
    expect(need.minimum.cost).toBe(11);
    expect(need.fees.now).toBe(10);
    expect(need.fees.window).toBe(10);
    // An optional purchase sharing the same gate cannot charge it again.
    expect(budgetOf([...rows, { ...rows[0], optional: true }], 0, { bag: 0, bank: 0 }).optional).toBe(rows[0].cost);
  });

  it('does not turn unread bank coins into a confirmed access shortfall', () => {
    expect(fixture(null).prep.coins).toMatchObject({ need: 10, have: null, missing: null });
    expect(fixture(null).prep.lines.some(line => line.action?.kind === 'EARN')).toBe(false);
    expect(fixture(0, true).prep.coins.need).toBe(0);
  });

  it('includes the declared Karamja return fare once and keeps unknown prices unknown', () => {
    const { state } = fixture();
    const source = planSources({ name: 'Bucket', need: 9, detail: itemById.get(1925), kinds: ['shop'] },
      { ...state, position: { known: true, value: { x: 2905, y: 3147, plane: 0 }, source: 'game' } }).primary!;
    expect(source).toMatchObject({ price: 2, fee: { coins: 60 } });
    expect(purchaseCost(source, 9)).toBe(78);
    expect(purchaseCost({ price: null, fee: source.fee }, 9)).toBeNull();
  });

  it('keeps multi-stop transport labels consistent with the deduplicated total', () => {
    const fee = { key: 'gate', coins: 10, label: 'gate allowance' };
    const input: TravelInput = { from: position, to: { x: 3350, y: 3200, plane: 0 }, levels: {}, carried: [], bankSeen: true,
      sourceOf: name => ({ kind: 'shop', where: name, point: { ...position, x: name === 'Pot' ? 3320 : 3340 }, price: name === 'Pot' ? 1 : 2, fee }) };
    const missing = ['Pot', 'Bucket'].map(name => ({ name, need: 9, have: 0, bank: 0 }));
    const result = prepareFor(missing, input);
    if (!('prep' in result)) throw new Error('Expected a purchasable preparation');
    expect(result.prep.cost).toBe(37);
    expect(result.prep.stops.map(stopText)).toEqual(expect.arrayContaining([expect.stringContaining('~19 gp'), expect.stringContaining('~18 gp')]));
    const unknown = prepareFor(missing, { ...input, sourceOf: () => ({ kind: 'shop', where: 'Shop', point: position, price: null, fee }) });
    expect('prep' in unknown && unknown.prep.cost).toBeNull();
    const banked = prepareFor(missing.map(m => ({ ...m, bank: 9 })), input);
    expect('prep' in banked && banked.prep.cost).toBe(0);
  });
});
