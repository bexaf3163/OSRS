import { describe, expect, it } from 'vitest';
import { stockUpShopping } from '../src/lib/trainingStock';
import { budgetOf, exchangePlan, geListText, type RowContext } from '../src/lib/shoppingView';
import { buildPlayerState, coinsOf } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { nameKey } from '../src/lib/checklist';
import { trainingStockNeeds, type PathLeg, type TrainingMethod } from '../src/lib/trainingRouter';
import type { Step, StepItemRequirement } from '../src/types';
import type { PriceView, UnitPrice } from '../src/lib/funding/quotes';
import { xpForLevel } from '../src/lib/xp';
import { isReusable } from '../src/lib/shopping';
import { createReadinessEngine } from '../src/lib/readinessEngine';

const names = ['Iron arrow', 'Oak shortbow', 'Willow shortbow', 'Maple shortbow', 'Bronze axe', 'Steel axe', 'Mithril axe', 'Hammer', 'Copper ore'];
const item = (nameEn: string, amount: number): StepItemRequirement => ({ nameEn, amount, howToGet: '', wikiItemId: 1000 + names.indexOf(nameEn) });
const step = (): Step => ({ id: 'new-content', stage: 0, type: 'skill', title: 'New training', doneWhen: 'Target reached', requires: [],
  itemsRequired: [item('Iron arrow', 100)], goalItemsRequired: [item('Iron arrow', 10000)],
  stockItems: [item('Iron arrow', 1000), item('Oak shortbow', 1), item('Willow shortbow', 1), item('Maple shortbow', 1)] });
const quote = (price: number): UnitPrice => ({ price, basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: 10000, notes: [] });
const prices = (over: Partial<PriceView> = {}): PriceView => ({ status: 'live', at: Date.now(),
  buy: n => quote(n === 'Iron arrow' ? 2 : 40), sell: () => null, idOf: n => 1000 + names.indexOf(n), limitOf: () => undefined, ...over });
function state(cash = 2000, amounts: Record<string, number> = {}) {
  return buildPlayerState({ mode: 'f2p', connected: true, stats: { ranged: 1, woodcutting: 1 }, progress: emptyProgress(), questsDone: [],
    gear: { equipment: [], inventory: [], coins: cash, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(names.map(name => [nameKey(name), { name, carried: 0, noted: 0, bank: amounts[name] ?? 0 }])) } });
}
function run(s = state(), p = prices(), st = step()) {
  const ctx: RowContext = { state: s, onGe: () => true, detail: () => undefined, gePrice: l => p.buy(l.nameEn)?.price ?? null };
  return stockUpShopping([st], ctx, p);
}
const extras = (r: ReturnType<typeof run>) => r.stock.reduce((sum, row) => sum + (row.cost ?? 0), 0);

describe('shared optional bank stocking', () => {
  it('exposes the refill reserve even when current supplies are already owned, without creating a GE trip', () => {
    const r = run(state(2000, { 'Iron arrow': 100 }));
    expect(r.refillReserve).toBe(200);
    expect(r.stock).toEqual([]);
    expect(exchangePlan(r.rows).items).toEqual([]);
  });
  it('keeps an unavailable refill price unknown rather than treating it as zero', () => {
    expect(run(state(), prices({ buy: () => null })).refillReserve).toBeNull();
    expect(run(state(), prices({ status: 'offline' })).refillReserve).toBeNull();
  });
  it('buys the next two useful reusable items before a larger ammunition reserve, keeping a refill funded', () => {
    const s = state(), r = run(s);
    expect(r.stock.filter(row => row.reusable).map(row => row.name)).toEqual(['Oak shortbow', 'Willow shortbow']);
    expect(r.stock.find(row => row.name === 'Iron arrow')?.qty).toBeGreaterThan(100);
    const budget = budgetOf(r.rows, r.list.coins, coinsOf(s));
    expect(budget.required).toBe(200);
    expect(budget.shortfall).toBe(0);
    expect(budget.optional).toBe(extras(r));
    expect(2000 - budget.required - extras(r)).toBeGreaterThanOrEqual(200);
    expect(r.stock.every(row => row.optional && row.bankStock)).toBe(true);
    expect(s.owned?.items.get('oak shortbow')?.bank).toBe(0);
  });
  it('combines the physical GE order and clipboard quantity instead of double-counting owned ammunition', () => {
    const r = run(state(2000, { 'Iron arrow': 20 }));
    const extra = r.stock.find(row => row.name === 'Iron arrow')!.qty;
    const plan = exchangePlan(r.rows);
    expect(plan.items.filter(i => i.name === 'Iron arrow')).toHaveLength(1);
    expect(plan.items.find(i => i.name === 'Iron arrow')?.count).toBe(100 + extra);
    const text = geListText('GE', r.rows, 0)!;
    expect(text.match(/Iron arrow x/g)).toHaveLength(1);
    expect(text).toContain(`Iron arrow x${80 + extra}`);
    expect(text).toContain('optional bank stock');
  });
  it('keeps a poor account on the affordable current kit without creating a funding deficit for extras', () => {
    const r = run(state(250));
    expect(r.stock).toEqual([]);
    expect(budgetOf(r.rows, 0, { bag: 250, bank: 0 }).shortfall).toBe(0);
    expect(r.list.required.find(i => i.nameEn === 'Iron arrow')?.count).toBe(100);
  });
  it('does not create a shopping trip when the current kit is already owned, even if future tiers are absent', () => {
    expect(run(state(2000, { 'Iron arrow': 100 })).stock).toEqual([]);
  });
  it.each(['unread bank', 'remembered bank', 'unknown coins', 'offline'] as const)('declines optional spending with %s', kind => {
    const s = state();
    if (kind === 'unread bank') { s.bankSeen = false; s.owned!.bankSeen = false; }
    if (kind === 'remembered bank') s.owned!.bankSavedAt = Date.now();
    if (kind === 'unknown coins') s.coins.bank = { known: false };
    if (kind === 'offline') s.connected = false;
    expect(run(s).stock).toEqual([]);
  });
  it.each(['stale', 'baked', 'spike', 'unpriced'] as const)('does not use %s prices to spend optional money', kind => {
    const p = prices({ buy: n => kind === 'unpriced' ? null : { ...quote(n === 'Iron arrow' ? 2 : 40),
      ...(kind === 'stale' ? { ageMinutes: 90 } : kind === 'baked' ? { basis: 'baked' as const } : { confidence: 'LOW' as const }) } });
    expect(run(state(), p).stock).toEqual([]);
  });
  it('does not rebuy owned future gear and respects the current GE quantity limit', () => {
    const r = run(state(2000, { 'Oak shortbow': 1 }), prices({ limitOf: n => n === 'Iron arrow' ? 300 : 1 }));
    expect(r.stock.some(row => row.name === 'Oak shortbow')).toBe(false);
    expect(r.stock.find(row => row.name === 'Iron arrow')?.qty).toBe(200);
  });
  it('supports new declarative processing inputs/tools without a skill-ID exception', () => {
    const st = { ...step(), itemsRequired: [item('Copper ore', 10)], stockItems: [item('Copper ore', 200), item('Hammer', 1)] };
    const r = run(state(), prices(), st);
    expect(r.stock.map(row => row.name)).toContain('Hammer');
    expect(r.stock.find(row => row.name === 'Copper ore')?.qty).toBeGreaterThanOrEqual(10);
  });
  it('treats style weapons as reusable and ammunition as consumed, using the existing registries', () => {
    expect(isReusable('Oak shortbow')).toBe(true);
    expect(isReusable('Staff of air')).toBe(true);
    expect(isReusable('Iron arrow')).toBe(false);
  });
  it('counts the same followed step once when both the active route and Skills supply it', () => {
    const s = state(), p = prices(), st = step();
    const ctx: RowContext = { state: s, onGe: () => true, detail: () => undefined, gePrice: l => p.buy(l.nameEn)?.price ?? null };
    expect(stockUpShopping([st, st], ctx, p)).toEqual(stockUpShopping([st], ctx, p));
  });
  it('does not turn optional future stock into readiness, completion or an independent preparation task', () => {
    const st = step(), s = state(2000, { 'Iron arrow': 100 });
    s.owned!.items.get('iron arrow')!.carried = 100;
    s.owned!.items.get('iron arrow')!.bank = 0;
    const engine = createReadinessEngine({ steps: [st], state: s, progress: emptyProgress(), qp: 0, mode: 'f2p', prices: prices() });
    expect(engine.prep(st).ready).toBe(true);
    expect(engine.prep(st).tasks).toEqual([]);
  });
  it('does not rebuy a future tool already banked below its use level', () => {
    const st = { ...step(), stockItems: [item('Steel axe', 1)] };
    expect(run(state(2000, { 'Steel axe': 1 }), prices(), st).stock).toEqual([]);
  });
});

describe('forecast uses the existing staged methods', () => {
  const method: TrainingMethod = { id: 'new-gathering-content', skills: ['woodcutting'], from: 1, to: null, name: 'A new resource', members: false,
    needs: [], xpa: null, act: null, url: '', xpTotal: null, effort: 'low', risk: 'none', cost: 'free', kind: 'method', where: '', xph: [100, 100] };
  const path: PathLeg[] = ['Bronze axe', 'Steel axe', 'Mithril axe', 'Maple shortbow'].map((name, index) => ({ method,
    fromLevel: index + 1, toLevel: index + 2, needs: [{ type: 'item', name, count: 1 }] }));
  it('does not invent consumable quantities and limits stock forecasts to three selected stages', () => {
    // Declarative named tool requirements come from each selected phase, not a hardcoded skill list.
    const planned = path.map(leg => ({ ...leg, method: { ...leg.method, needs: leg.needs! } }));
    const needs = trainingStockNeeds(planned, 'woodcutting', state(), xpForLevel(1), prices());
    expect(needs?.map(n => n.type === 'item' ? n.name : '')).toEqual(['Bronze axe', 'Steel axe', 'Mithril axe']);
  });
});
