// Costs in the fight plans' ranking (hardening, 2.78.1): the food a plan eats is a cost even when it is owned, banked coins credit at most half the
// time (the cowhide baseline is rough), and the player's objective decides whether coins trade against time at all.

import { describe, expect, it } from 'vitest';
import { evaluatePlans, planNetPerHour, planWhy, type PlanReport } from '../../src/lib/combatRoute/plans';
import { selectPlan } from '../../src/lib/combatRoute/selection';
import { COIN_SHARE_CAP } from '../../src/lib/lootValue';
import type { MethodPriority } from '../../src/lib/playStyle';
import { market } from '../funding/market';
import { planInput, type Over } from './fixture';
import { doseValue } from '../../src/lib/doses';
import { supplyPrice } from '../../src/lib/sourceRouter';

const prices = market();
const report = (o: Over, objective?: MethodPriority): PlanReport =>
  evaluatePlans({ ...planInput({ foodPrice: prices.buy('Salmon')!.price, ...o }), prices, restriction: 'UNKNOWN', ...(objective ? { objective } : {}) })!;
const banked = { items: { 'Big bones': [0, 50] as [number, number] } };

describe('what a plan costs is ranked, not only shown', () => {
  it('charges consumed owned potions once across phases, preserving spare stock', () => {
    const items = { ...banked.items, ...Object.fromEntries([1, 2, 3, 4].map(size => [`Strength potion(${size})`, [0, size === 4 ? 100 : 0] as [number, number]])) };
    const r = report({ items }, 'profit');
    for (const p of r.plans) {
      const used = p.phases.reduce((n, ph) => n + (ph.strengthDosesUsed ?? 0), 0);
      expect(used).toBeGreaterThan(0);
      expect(used).toBeLessThan(400);
      expect(p.potionCost).toBe(doseValue('Strength potion(4)', used, name => supplyPrice(name, prices, 'f2p')));
      expect(p.potionCost!).toBeGreaterThan(0);
      expect(p.totalCost).toBe(p.foodCost! + p.potionCost!);
      expect(p.net).toBe(p.income.net - p.totalCost!);
    }
  });
  it('money ranks accessible plans by positive income after food and explains the actual objective', () => {
    const r = report(banked, 'profit');
    const selected = r.plans.find(p => p.key === r.recommended)!;
    const positive = r.plans.filter(p => p.eligible && (planNetPerHour(p) ?? 0) > 0);
    expect(positive.length).toBeGreaterThan(0);
    expect(planNetPerHour(selected)).toBe(Math.max(...positive.map(p => planNetPerHour(p)!)));
    expect(r.reason).toMatch(/gp\/hour after food/);
    expect(planWhy(r, r.recommended, 'auto')).toBe(r.reason);
    expect(r.reason).toContain('potions and needed armour');
    expect(selected.phases.some(p => p.kind !== 'armour' && p.loot)).toBe(true);
  });

  it('money does not need a cowhide baseline to value known bones, and no-price costs stay unknown', () => {
    const board = { ...prices, sell: (name: string) => name === 'Cowhide' ? null : prices.sell(name) };
    const r = evaluatePlans({ ...planInput(banked), prices: board, foodPrice: prices.buy('Salmon')!.price, objective: 'profit' })!;
    expect(r.plans.some(p => p.phases.some(ph => ph.loot?.name === 'Big bones'))).toBe(true);
    const unread = evaluatePlans({ ...planInput(banked), prices: board, foodPrice: null, objective: 'profit' })!;
    const consuming = unread.plans.filter(p => p.food.mid > 0);
    expect(consuming.length).toBeGreaterThan(0);
    expect(consuming.every(p => planNetPerHour(p) === null)).toBe(true);
    for (const p of unread.plans.filter(p => p.food.mid === 0)) expect(p.foodCost).toBe(0);
  });

  it('the food eaten counts against a plan: with the bones already banked, the giants\' 400+ salmon lose to the cows\' hides on balance', () => {
    const r = report(banked, 'balanced');
    const pick = selectPlan(r, undefined, { inProgress: false });
    const chosen = r.plans.find((p) => p.key === pick.key)!;
    const route = r.plans.find((p) => p.id === 'route')!;
    expect(chosen.id).not.toBe('route');
    // The chosen plan eats less and nets more; the route is still faster.
    expect(chosen.food.mid).toBeLessThan(route.food.mid);
    expect(chosen.net!).toBeGreaterThan(route.net!);
    expect(chosen.minutes.mid).toBeGreaterThan(route.minutes.mid);
  });

  it('on the fastest objective time alone ranks: the faster plan stays, and the costs are still shown', () => {
    const r = report(banked, 'fastest');
    const pick = selectPlan(r, undefined, { inProgress: false });
    const chosen = r.plans.find((p) => p.key === pick.key)!;
    const fastest = [...r.plans].filter((p) => p.eligible).sort((a, b) => a.minutes.high - b.minutes.high)[0];
    expect(chosen.minutes.high).toBeLessThanOrEqual(fastest.minutes.high * 1.06);
    expect(chosen.foodCost).not.toBeNull();
    // No loot is picked up for its price.
    expect(r.plans.every((p) => p.income.lines.every((l) => !l.counted || l.name === 'Big bones'))).toBe(true);
  });

  it('banked coins never credit more than half of a plan\'s time; an unknown food price counts no coins at all', () => {
    const r = report({}, 'balanced');
    for (const p of r.plans) expect(p.effort - p.score + p.phases.reduce((n, x) => n + x.kills, 0) * 0.05).toBeLessThanOrEqual(COIN_SHARE_CAP * p.effort + 1e-6);
    const unknown = evaluatePlans({ ...planInput({ foodPrice: null }), prices, restriction: 'UNKNOWN', objective: 'balanced' })!;
    for (const p of unknown.plans) expect(p.score).toBeCloseTo(p.effort + p.phases.reduce((n, x) => n + x.kills, 0) * 0.05, 6);
  });
});
