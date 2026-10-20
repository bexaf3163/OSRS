// The plan in effect without a press (2.69): the guide selects the recommended plan, keeps the player's own choice, waits for a bank trip before moving a
// plan in the middle of a trip, and gives way at once when a plan is gone or unsafe. The representative states of the owner's request, as fixtures.

import { describe, expect, it } from 'vitest';
import { evaluatePlans, planWhy, type PlanReport } from '../../src/lib/combatRoute/plans';
import { resolvePick, withCombatPlan } from '../../src/lib/combatRoute/pick';
import { selectPlan } from '../../src/lib/combatRoute/selection';
import type { Adopted } from '../../src/lib/combatRoute/adopt';
import { foodPicks, withFoodPlan } from '../../src/lib/foodPlan';
import { emptyProgress } from '../../src/lib/progress';
import { stepGuide, toInGameTarget } from '../../src/services/runeliteBridge';
import { allSteps, stepById } from '../../src/data';
import { stepGoals } from '../../src/lib/combatEstimate';
import { levelForXp } from '../../src/lib/xp';
import { market } from '../funding/market';
import { gearOf, HISTORICAL, planInput, type Over } from './fixture';
import type { Step } from '../../src/types';

const prices = market();
const report = (o: Over = {}): PlanReport => evaluatePlans({ ...planInput({ foodPrice: prices.buy('Salmon')!.price, ...o }), prices, restriction: 'LIFTED' })!;
const idle = { inProgress: false };
const busy = { inProgress: true };
const auto = (key: string): Adopted => ({ key, at: 1, by: 'auto' });
const mine = (key: string): Adopted => ({ key, at: 1, by: 'player' });
const STRONG: Over = { stats: { attack: 38, strength: 60, defence: 45, hitpoints: 60 }, xp: { attack: 33000, strength: 273742, defence: 61512, hitpoints: 400000 } };
const route = stepById.get('S4-03') as Step;

describe('a sensible plan is in effect without a press', () => {
  it('the reported character: the combined-objective recommendation applies at once, said in one sentence', () => {
    const r = report();
    const sel = selectPlan(r, undefined, idle);
    expect(sel).toEqual({ key: 'item-first', source: 'auto', recommended: 'item-first' });
    expect(planWhy(r, sel.key, sel.source)).toMatch(/^Recommended for your levels and kit: .*fewer pieces of food .* than the route as written\.$/);
  });

  it('better equipment and enough supplies: the route as written stays, and nothing is said about it', () => {
    const r = report(STRONG);
    expect(selectPlan(r, undefined, idle)).toEqual({ key: 'route', source: 'auto', recommended: 'route' });
  });

  it('bank not read: still a plan, the whole bones count is planned and the risk is stated, never a guess that the bank is empty', () => {
    const r = report({ bankSeen: false });
    const sel = selectPlan(r, undefined, idle);
    expect(sel.key).toBe('item-first');
    const plan = r.plans.find((p) => p.key === 'item-first')!;
    expect(plan.phases[0].item).toEqual({ name: 'Big bones', count: 50 });
    expect(plan.risks.join(' ')).toMatch(/bank has not been read/);
  });

  it('the bones already banked: collection is omitted and the XP-only alternative applies', () => {
    const r = report({ items: { 'Big bones': [0, 50] } });
    expect(r.plans.some((p) => p.key === 'split')).toBe(false);
    expect(selectPlan(r, undefined, idle).key).toBe('xp-only');
  });
});

describe('the player\'s own choice', () => {
  it('stays while it is a safe plan for the step; a clearly better recommendation is offered, not applied', () => {
    const r = report({ adopted: 'route' });
    const sel = selectPlan(r, mine('route'), idle);
    expect(sel.key).toBe('route');
    expect(sel.source).toBe('player');
    expect(sel.offer).toBe('item-first');
  });

  it('a chosen alternative within reach of the best is kept without an offer', () => {
    const r = report({ adopted: 'item-first' });
    const sel = selectPlan(r, mine('item-first'), idle);
    expect(sel).toMatchObject({ key: 'item-first', source: 'player' });
    expect(sel.offer).toBeUndefined();
  });

  it('a choice that is no longer possible (the bones are in hand) gives way to the recommendation', () => {
    const r = report({ items: { 'Big bones': [0, 50] }, adopted: 'split' });
    expect(selectPlan(r, mine('split'), idle)).toMatchObject({ key: 'xp-only', source: 'auto' });
  });

  it('a Defence 1 build never gets a Defence plan, even one chosen earlier', () => {
    const r = report({ keepDefenceOne: true, adopted: 'defence-first:20' });
    expect(selectPlan(r, mine('defence-first:20'), idle).key).not.toMatch(/^defence-first/);
  });
});

describe('an older save and a trip in progress', () => {
  it('an older save had the route by default (no entry): the recommendation replaces it', () => {
    expect(selectPlan(report(), undefined, idle)).toMatchObject({ key: 'item-first', source: 'auto' });
  });

  it('in the middle of a trip the route stays and the better plan waits for the next bank trip; after it, the plan applies', () => {
    const r = report();
    expect(selectPlan(r, undefined, busy)).toEqual({ key: 'route', source: 'auto', recommended: 'item-first', pending: 'item-first' });
    expect(selectPlan(r, undefined, idle).key).toBe('item-first');
  });

  it('a plan the guide chose stays while it is not clearly beaten, even when the numbers move a little', () => {
    const r = report({ adopted: 'split' });
    expect(selectPlan(r, auto('split'), idle)).toEqual({ key: 'split', source: 'auto', recommended: 'split' });
  });

  it('a plan that is gone or unsafe gives way at once, even mid-trip: safety does not wait for the bank', () => {
    const weak = report({ stats: { ...HISTORICAL.stats, hitpoints: 8 }, adopted: 'split' });
    const sel = selectPlan(weak, auto('split'), busy);
    const inUse = weak.plans.find((p) => p.key === sel.key);
    expect(sel.pending).toBeUndefined();
    expect(inUse?.key === 'route' || inUse?.eligible).toBe(true);
  });
});

describe('one plan for every screen and the game', () => {
  it('the selected plan leads the step, the food, the shopping and the game payload', () => {
    const r = report();
    const sel = selectPlan(r, undefined, idle);
    const pick = resolvePick(r, sel.key, { xp: HISTORICAL.xp, held: () => 0 }, sel.source, planWhy(r, sel.key, sel.source))!;
    const step = withCombatPlan(route, pick);
    // The item phase names the training style so the XP credit is executable; the next phase trains only what remains.
    expect(step.combatPlan).toEqual({ key: 'item-first', phase: 1, source: 'auto', now: 'Collect 50 Big bones from Hill Giants on Accurate', next: expect.stringMatching(/^Fight the cows on Accurate/) });
    expect(stepGuide(step).plan).toEqual({ now: step.combatPlan!.now, next: step.combatPlan!.next });
    expect(step.fields?.[0]).toMatchObject({ label: 'Plan' });
    expect(step.quickSteps?.[0]).toMatch(/^Fight the Hill Giants on Accurate/);
    const payload = toInGameTarget(step)!;
    expect(payload.npcNames).toEqual(['Hill Giant']);
    expect(payload.goal).toBe('Hill Giants: 50 Big bones');
    // Food models the fifty collection kills rather than the entire Attack goal on giants.
    const live = { stats: HISTORICAL.stats, xp: HISTORICAL.xp, gear: gearOf(HISTORICAL.worn), owned: null, combatLog: null };
    const collection = foodPicks([step], emptyProgress(), live)[route.id];
    const giants = foodPicks([route], emptyProgress(), live)[route.id];
    expect(collection && giants).toBeTruthy();
    expect(withFoodPlan(step, collection).itemsRequired?.find((i) => i.heals)?.totalAmount).toBeLessThan(withFoodPlan(route, giants).itemsRequired!.find((i) => i.heals)!.totalAmount as number);
  });

  it('an item phase goes to the game as a short action, not the whole sentence', () => {
    const r = report();
    const plan = r.plans.find((p) => p.eligible && p.phases.some((ph) => ph.kind === 'item'))!;
    expect(plan).toBeTruthy();
    const goals = stepGoals(route);
    const xp = Object.fromEntries(goals.map((g) => [g.skill, g.exp]));
    const pick = resolvePick(r, plan.key, { xp, held: () => 0 }, 'player')!;
    expect(pick.kind).toBe('item');
    const guide = stepGuide(withCombatPlan(route, pick));
    expect(guide.plan?.now).toBe(`Collect ${pick.item!.count} ${pick.item!.name} from Hill Giants`);
    expect(guide.plan?.now?.length).toBeLessThan(60);
  });

  it('every plan offered for Attack 40 and 50 Big bones still reaches both: no plan drops part of a combined objective', () => {
    const r = report();
    const goals = stepGoals(route);
    for (const p of r.plans) {
      const xp = new Map<string, number>();
      for (const ph of p.phases) for (const g of ph.goals) xp.set(g.skill, Math.max(xp.get(g.skill) ?? 0, g.exp));
      for (const g of goals) expect(xp.get(g.skill) ?? 0, `${p.key} ${g.skill}`).toBeGreaterThanOrEqual(g.exp);
      const bones = p.phases.some((ph) => ph.kind === 'route' || (ph.kind === 'item' && ph.item?.name === 'Big bones' && ph.item.count === 50));
      expect(bones, p.key).toBe(true);
      expect(levelForXp(xp.get('attack') ?? 0)).toBeGreaterThanOrEqual(40);
    }
  });

  it('the step keeps its identity under any plan: id, title, completion trigger and items are the route\'s', () => {
    const r = report();
    for (const p of r.plans.filter((x) => x.eligible && x.id !== 'route')) {
      const s = withCombatPlan(route, resolvePick(r, p.key, { xp: HISTORICAL.xp, held: () => 0 }, 'auto', planWhy(r, p.key, 'auto'))!);
      expect([s.id, s.title]).toEqual([route.id, route.title]);
      expect(s.inGame?.completionTrigger).toEqual(route.inGame?.completionTrigger);
      expect(s.itemsRequired).toEqual(route.itemsRequired);
    }
  });

  it('the Minotaurs step (S3-08) is selected the same way: the route as written unless another plan is clearly better', () => {
    const s308 = allSteps.find((s) => s.id === 'S3-08')!;
    const r = evaluatePlans({ ...planInput({ stepId: 'S3-08', stats: { attack: 22, strength: 16, defence: 1, hitpoints: 22 }, xp: { attack: 5624, strength: 2746, defence: 0, hitpoints: 2400 }, worn: ['Mithril scimitar'] }), prices, restriction: 'LIFTED' });
    expect(r).not.toBeNull();
    const sel = selectPlan(r!, undefined, idle);
    expect(r!.plans.find((p) => p.key === sel.key)?.eligible || sel.key === 'route').toBe(true);
    expect(s308.id).toBe('S3-08');
  });
});
