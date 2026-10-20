import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/lib/funding/evaluate';
import { methodById } from '../../src/lib/funding/methods';
import { confirm, startMethodPlan, tick, type FundingPlanState } from '../../src/lib/funding/plan';
import { ctxOf, fakePrices, fakeSnap } from './helpers';

const now = 1_792_000_000_000;
const steel = methodById('smelt-steel-bars')!;
const prices = fakePrices({ 'Iron ore': { buy: 77, volume: 300000 }, Coal: { buy: 141, volume: 1000000 }, 'Steel bar': { sell: 522, volume: 300000 }, Hammer: { buy: 10 } });
const snap = (cash = 1200) => fakeSnap({ levels: { smithing: 40 }, bagCoins: cash, bankCoins: 0 });

describe('executable funding preparation', () => {
  it('uses an affordable batch rather than an unaffordable full inventory', () => {
    // Three bars cost 1,077; four cost 1,436. Capacity is nine, but cash is only 1,200.
    const e = evaluate(steel, ctxOf({ prices, snap: snap(), cash: 1200 }));
    expect(e.eligible).toBe(true);
    expect(e.unitsPerTrip).toBe(9);
    expect(e.preparation).toMatchObject({ units: 3, inputs: [{ name: 'Iron ore', qty: 3, owned: 0, missing: 3 }, { name: 'Coal', qty: 6, owned: 0, missing: 6 }] });
    const p = startMethodPlan(e, { kind: 'open' }, 'S4-03', snap(), now)!;
    expect(p.subSteps.find(s => s.id === 'perform')?.goal).toEqual({ item: 'Steel bar', qty: 3 });
    expect(p.subSteps.find(s => s.id === 'prepare')?.text).toContain('3 Iron ore');
  });

  it('keeps tool procurement and consumed inputs as separate required actions', () => {
    // Synthetic processing method: exercise a tool+inputs combination without changing game data.
    const method = { ...steel, requirements: [...steel.requirements, { kind: 'item' as const, role: 'tool' as const, any: [{ name: 'Hammer', id: 2347 }] }] };
    const e = evaluate(method, ctxOf({ prices, snap: snap(), cash: 1200 }));
    const p = startMethodPlan(e, { kind: 'open' }, 'S4-03', snap(), now)!;
    expect(p.subSteps.slice(0, 3).map(s => s.id)).toEqual(['prepare-tool', 'prepare', 'travel']);
    expect(p.subSteps[0].text).toContain('Hammer');
    expect(p.subSteps[0].text).not.toMatch(/pickaxe|axe/);
    expect(p.subSteps[1].text).toContain('6 Coal');
    expect(p.loop?.from).toBe(1); // Buy the tool once; prepare consumed inputs each trip.
  });

  it('refreshes consumed input ownership before repeating a trip', () => {
    const owned = fakeSnap({ levels: { smithing: 40 }, items: { 'Iron ore': 9, Coal: 18 }, bagCoins: 0, bankCoins: 0 });
    const e = evaluate(steel, ctxOf({ prices, snap: owned, cash: 0 }));
    let p = startMethodPlan(e, { kind: 'open' }, 'S4-03', owned, now)!;
    expect(p.subSteps[0].text).toContain('use what you own');
    // Complete one trip manually so this test concerns the loop, not location/loot detection.
    while (p.trips === 1) p = confirm(p, p.subSteps[p.active].id, snap(1000), now + 1000);
    expect(p.subSteps[p.active].id).toBe('prepare');
    expect(p.subSteps[p.active].text).toContain('buy 9');
    expect(p.subSteps[p.active].text).toContain('buy 18');
    expect(p.subSteps[p.active].place?.label).toBe('Grand Exchange');
  });
});

describe('observed sale proceeds', () => {
  const sale = (): FundingPlanState => {
    const e = evaluate(steel, ctxOf({ prices, snap: snap(5000), cash: 5000 }));
    const p = startMethodPlan(e, { kind: 'open' }, 'S4-03', snap(5000), now)!;
    const active = p.subSteps.findIndex(s => s.id === 'sell');
    return { ...p, active, baseline: { bagCoins: 5000, totalCoins: 5000, bag: {} }, subSteps: p.subSteps.map((s, i) => ({ ...s, done: i < active })) };
  };
  it('counts collection directly to the bank', () => {
    const p = sale();
    const after = tick(p, fakeSnap({ bagCoins: 5000, bankCoins: 2000 }), now + 1000);
    expect(after.trips).toBe(2); // Observed sale completed the first open-ended trip.
  });
  it('does not count a transfer of existing money or a newly discovered bank balance', () => {
    const p = sale();
    const shifted = { ...p, baseline: { bagCoins: 1000, totalCoins: 5000, bag: {} } };
    expect(tick(shifted, snap(5000), now + 1000).subSteps[p.active].done).toBe(false);
    const unknown = { ...p, baseline: { bagCoins: 1000, totalCoins: null, bag: {} } };
    expect(tick(unknown, fakeSnap({ bagCoins: 1000, bankCoins: 10000 }), now + 1000).subSteps[p.active].done).toBe(false);
    const legacy = { ...p, baseline: { bagCoins: 1000, bag: {} } };
    expect(tick(legacy, snap(10000), now + 1000).subSteps[p.active].done).toBe(false);
  });
});
