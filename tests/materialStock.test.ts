import { describe, expect, it } from 'vitest';
import { allocateMaterialStock, materialTake } from '../src/lib/materialStock';
import { buildPlayerState } from '../src/lib/playerState';
import { evaluatePreflight, nameKey, preflightItems, type OwnedItem } from '../src/lib/checklist';
import { emptyProgress } from '../src/lib/progress';
import { planOneTrip } from '../src/lib/oneTrip';
import { buildPrepPlan } from '../src/lib/prepPlan';
import { readinessOf } from '../src/lib/readiness';
import { bankWithdrawalsOf } from '../src/lib/prepEnvelope';
import { scopeList, shopRows } from '../src/lib/shoppingView';
import { buildNeed } from '../src/lib/funding/need';
import { transportSources } from '../src/lib/liveTransport';
import { itemById } from '../src/data';
import { market } from './funding/market';
import type { Step } from '../src/types';

const demand = (nameEn: string, count: number, anyOf: string[] = [], key = nameEn) => ({ key, nameEn, count, anyOf });
function state(rows: Record<string, Partial<OwnedItem>>, manual: Record<string, number> = {}, bankSeen = true) {
  return buildPlayerState({ mode: 'f2p', connected: true, stats: {}, position: { x: 3315, y: 3180, plane: 0 }, questsDone: [],
    progress: { levels: {}, ownedManual: Object.fromEntries(Object.entries(manual).map(([key, count]) => [key, { count }])) },
    gear: { equipment: [], inventory: [], coins: 1000, bankCoins: bankSeen ? 0 : null },
    owned: { bankSeen, items: new Map(Object.entries(rows).map(([name, row]) => [nameKey(name), { name, carried: 0, noted: 0, ...row }])) } });
}
const meat: Step = { id: 'meat', stage: 1, type: 'skill', title: 'Cook raw meat', requires: [], doneWhen: 'Starter bag ready',
  mapLocation: { x: 3081, y: 3420, plane: 0, label: 'Cooking fire' },
  itemsRequired: [{ nameEn: 'Raw beef', amount: 26, wikiItemId: 2132, anyOf: ['Raw chicken'], howToGet: '' }] } as Step;
function models(s: ReturnType<typeof state>, step = meat) {
  const steps = [step];
  const progress = emptyProgress();
  const readiness = readinessOf(step, { steps, progress, qp: 0, mode: 'f2p', state: s });
  const prep = buildPrepPlan({ step, steps, progress, state: s, trip: planOneTrip(steps, progress, step.id, s), readiness, detail: id => itemById.get(id) });
  const { list, trip } = scopeList(steps);
  const rows = shopRows(list, { state: s, trip, detail: id => itemById.get(id), onGe: () => true, gePrice: () => 100 });
  const funding = buildNeed({ step, prep, prices: market(), owned: s.owned, manual: s.manual });
  return { readiness, prep, rows, funding };
}

describe('interchangeable physical materials', () => {
  it('13 beef plus 13 chicken is one ready bag in every consumer', () => {
    const m = models(state({ 'Raw beef': { carried: 13, bank: 0 }, 'Raw chicken': { carried: 13, bank: 0 } }));
    expect(m.readiness.requirements.find(r => r.item === 'Raw beef')?.state).toBe('OK');
    expect(m.prep.lines[0]).toMatchObject({ where: 'INVENTORY', have: { bag: 26 }, toGet: 0 });
    expect(m.rows[0]).toMatchObject({ channel: 'have', qty: 0 });
    expect(m.funding.minimum.cost).toBe(0);
    expect(m.funding.objective.cost).toBe(0);
  });

  it('withdraws the actual alternative and preserves notes as unusable until a bank visit', () => {
    const m = models(state({ 'Raw beef': { bank: 0 }, 'Raw chicken': { carried: 3, noted: 10, bank: 13 } }));
    expect(m.prep.lines[0]).toMatchObject({ where: 'BANK', have: { bag: 3, noted: 10, bank: 13 } });
    expect(m.prep.lines[0].action?.label).toContain('10 Raw chicken, 13 Raw chicken');
    expect(m.prep.lines[0].action?.nav?.itemName).toBe('Raw chicken');
    expect(bankWithdrawalsOf(m.prep).map(i => [i.itemName, i.quantity])).toEqual([['Raw chicken', 23]]);
    expect(m.readiness.requirements.find(r => r.item === 'Raw beef')?.detail).toContain('Raw chicken');
    expect(m.rows[0].action).toContain('Raw chicken');
    expect(m.funding.minimum.cost).toBe(0);
  });

  it('an unread alternative bank is UNKNOWN, while a sufficient known bag is proof', () => {
    const unseen = models(state({ 'Raw beef': { bank: 0 }, 'Raw chicken': {} }));
    expect(unseen.readiness.requirements.find(r => r.item === 'Raw beef')?.state).toBe('UNKNOWN');
    expect(unseen.prep.lines[0].where).toBe('UNKNOWN');
    expect(unseen.rows[0].channel).toBe('unknown');
    expect(unseen.funding.minimum.lines).toHaveLength(0);
    const enough = models(state({ 'Raw beef': { carried: 26, bank: 0 }, 'Raw chicken': {} }));
    expect(enough.prep.lines[0].where).toBe('INVENTORY');
    expect(enough.rows[0].channel).toBe('have');
  });

  it('keeps manual proof and never treats an unconfirmed alternative as absent', () => {
    const s = state({}, { 'id:2132': 26 }, false);
    const m = models(s);
    expect(m.readiness.requirements.find(r => r.item === 'Raw beef')?.state).toBe('OK');
    expect(m.prep.lines[0].where).toBe('BANK');
    expect(m.prep.lines[0].action?.kind).toBe('TAKE');
    expect(m.rows[0].channel).toBe('have');
    const short = allocateMaterialStock(state({}, { mark: 10 }, false), [{ ...demand('Raw beef', 26, ['Raw chicken']), manualKey: 'mark' }]).get('Raw beef')!;
    expect(short.bank).toBeNull();
    expect(short.source).not.toBe('manual');
    const seen = models(state({ 'Raw beef': {}, 'Raw chicken': { carried: 26, bank: 0 } }, { 'id:2132': 26 }, false));
    expect(seen.prep.lines[0].where).toBe('INVENTORY');
    const banked = models(state({ 'Raw beef': {}, 'Raw chicken': { bank: 26 } }, { 'id:2132': 26 }));
    expect(bankWithdrawalsOf(banked.prep)).toEqual([expect.objectContaining({ itemName: 'Raw chicken', quantity: 26 })]);
  });

  it('reserves another primary demand and spends a shared alternative only once without mutating input', () => {
    const s = state({ A: { bank: 0 }, B: { bank: 0 }, C: { carried: 10, bank: 0 } });
    const lines = [demand('A', 6, ['C']), demand('B', 6, ['C']), demand('C', 4)];
    const stock = allocateMaterialStock(s, lines);
    expect(stock.get('A')?.total).toBe(6);
    expect(stock.get('B')?.total).toBe(0);
    expect(s.owned!.items.get('c')!.carried).toBe(10);
    const step: Step = { ...meat, itemsRequired: lines.map(l => ({ nameEn: l.nameEn, amount: l.count, anyOf: l.anyOf, howToGet: '' })) };
    const m = models(s, step);
    expect(m.prep.lines.find(l => l.name === 'B')).toMatchObject({ where: 'MISSING', toGet: 6 });
    expect(m.rows.find(l => l.name === 'B')?.qty).toBe(6);
    const preflight = evaluatePreflight(preflightItems(step), s.owned!);
    expect(preflight.rows.find(l => l.item.nameEn === 'B')?.state).toBe('NOT_FOUND_IN_BANK');
    const banked = models(state({ A: { bank: 0 }, B: { bank: 0 }, C: { bank: 10 } }), step);
    expect(bankWithdrawalsOf(banked.prep)).toEqual([expect.objectContaining({ itemName: 'C', quantity: 10 })]);
  });

  it('deduplicates repeated alternative names and names only the required physical withdrawals', () => {
    const stock = allocateMaterialStock(state({ A: { carried: 2, bank: 0 }, B: { bank: 20 } }), [demand('A', 6, ['B', 'b', 'A'])]).get('A')!;
    expect(stock.total).toBe(22);
    expect(materialTake(stock, 6)).toEqual([{ name: 'B', count: 4, noted: false }]);
  });

  it('excludes tool tiers, equipment, food and potion doses from this piece ledger', () => {
    const s = state({});
    expect(allocateMaterialStock(s, [
      demand('Bronze pickaxe', 1, ['Rune pickaxe']), { ...demand('Staff', 1, ['Staff of air']), equip: true },
      { ...demand('Trout', 10, ['Salmon']), heals: 7 }, demand('Strength potion(4)', 1, ['Strength potion(3)']),
    ]).size).toBe(0);
  });
});

it('counts distinct physical arrow stacks rather than one canonical stack', () => {
  const s = state({ 'Mithril arrow': { bank: 0 }, 'Steel arrow': { bank: 4 }, 'Adamant arrow': { bank: 4 } });
  const step: Step = { ...meat, itemsRequired: [{ nameEn: 'Mithril arrow', amount: 8, anyOf: ['Steel arrow', 'Adamant arrow'], howToGet: '' }] };
  expect(models(s, step).prep.slots.adding).toBe(2);
});

it('does not subtract owned stock twice from a confirmed remaining acquisition', () => {
  const s = state({ Silk: { bank: 6 } });
  const step: Step = { ...meat, id: 'silk', itemsRequired: [{ nameEn: 'Silk', amount: 9, wikiItemId: 950, howToGet: '' }] };
  const m = models(s, step);
  expect(m.prep.lines[0]).toMatchObject({ where: 'MISSING', toGet: 3, action: { purchase: { source: 'shop' }, price: 2 } });
  expect(m.rows[0]).toMatchObject({ channel: 'shop', qty: 3, unitPrice: 2, cost: 6 });
  expect(m.funding.minimum.cost).toBe(6);
  expect(transportSources(s, () => 100)('Silk', 3)).toMatchObject({ kind: 'shop', price: 2 });
});
