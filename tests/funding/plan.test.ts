import { describe, expect, it } from 'vitest';
import { cancel, confirm, FUNDING_PLAN_KEY, isRunning, loadPlan, MAX_GAP_SECONDS, pause, planKey, resume, savePlan, startPlan, STALE_AFTER_MS, tick, viewOf, type FundingPlanState } from '../../src/lib/funding/plan';
import { methodById } from '../../src/lib/funding/methods';
import { market } from './market';
import { scenario } from './scenario';
import { fakeSnap } from './helpers';

const T0 = 1_792_000_000_000;
const COW_FIELD = { x: 3253, y: 3278, plane: 0 };
const LUMBRIDGE_BANK = { x: 3208, y: 3220, plane: 2 };

function cowPlan(): { plan: FundingPlanState; required: number } {
  const s = scenario(market(), { bagCoins: 400, bankCoins: 0 });
  const rec = s.assessment.recommendation!;
  expect(rec.id).toBe('earn:cows-cowhide');
  const plan = startPlan(s.assessment, rec, s.snap, methodById('cows-cowhide'), T0)!;
  return { plan, required: s.assessment.required };
}

/** What the game shows at a moment. The character is the plan's. */
const seen = (o: { pos?: { x: number; y: number; plane: number } | null; bag?: { name: string; count: number }[] | null; bagCoins?: number | null; bankCoins?: number | null; connected?: boolean; character?: string }) =>
  fakeSnap({ character: o.character ?? 'Tester', position: o.pos === undefined ? { x: 3093, y: 3495, plane: 0 } : o.pos, bag: o.bag === undefined ? [] : o.bag, bagCoins: o.bagCoins === undefined ? 400 : o.bagCoins, bankCoins: o.bankCoins === undefined ? 0 : o.bankCoins, connected: o.connected });

describe('starting a funding plan', () => {
  it('lists the steps of the cow method and starts at the way there, leaving the route step open', () => {
    const { plan } = cowPlan();
    expect(plan.subSteps.map((s) => s.id)).toEqual(['travel', 'perform', 'bank', 'sell', 'restock', 'resume']);
    expect(plan.active).toBe(0);
    expect(plan.status).toBe('ACTIVE');
    expect(plan.sourceStepId).toBe('S4-03');
    expect(plan.target).toMatchObject({ required: 825, gap: 425, liquidAtStart: 400 });
    expect(plan.character).toBe('Tester');
    expect(plan.version).toBe(1);
    // The plan has no way to say a route step is done: nothing in its state names a completion.
    expect(JSON.stringify(plan)).not.toMatch(/complete/i);
  });

  it('copies the route\'s reserve (the 50 Big bones) so the plan cannot be asked to sell it', () => {
    const { plan } = cowPlan();
    expect(plan.reserved).toContainEqual({ name: 'Big bones', qty: 50 });
  });

  it('is not started when nothing is short, when the character is unknown, or when the coins are unknown', () => {
    const covered = scenario(market(), { bagCoins: 5000, bankCoins: 0 });
    expect(startPlan(covered.assessment, { kind: 'EARN', id: 'earn:x', title: 'x', detail: '', closes: 1, confidence: 'HIGH', minutes: null }, covered.snap, undefined, T0)).toBeNull();
  });
});

describe('moving through the steps only on what the game shows', () => {
  it('arriving finishes the travel and only the travel', () => {
    const { plan } = cowPlan();
    const after = tick(plan, seen({ pos: COW_FIELD }), T0 + 5000);
    expect(after.subSteps[0]).toMatchObject({ id: 'travel', done: true, doneBy: 'observed' });
    expect(after.subSteps[1].done).toBe(false);
    expect(after.active).toBe(1);
  });

  it('the work is done when the hides are in the bag, not when the player has arrived or the loot is only valued', () => {
    const { plan } = cowPlan();
    let p = tick(plan, seen({ pos: COW_FIELD }), T0 + 5000);
    p = tick(p, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: 5 }] }), T0 + 10_000);
    expect(p.active).toBe(1);
    const goal = p.subSteps[1].goal!;
    expect(goal.item).toBe('Cowhide');
    p = tick(p, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: goal.qty }] }), T0 + 15_000);
    expect(p.subSteps[1].done).toBe(true);
    expect(p.active).toBe(2);
  });

  it('the bank step needs the player at the bank and the hides out of the bag: a walk with full pockets is not banking', () => {
    const { plan } = cowPlan();
    const goal = plan.subSteps[1].goal!;
    let p = tick(plan, seen({ pos: COW_FIELD }), T0 + 1000);
    p = tick(p, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: goal.qty }] }), T0 + 2000);
    p = tick(p, seen({ pos: LUMBRIDGE_BANK, bag: [{ name: 'Cowhide', count: goal.qty }] }), T0 + 3000);
    expect(p.active).toBe(2);
    p = tick(p, seen({ pos: COW_FIELD, bag: [] }), T0 + 4000);
    expect(p.active).toBe(2);
    p = tick(p, seen({ pos: LUMBRIDGE_BANK, bag: [] }), T0 + 5000);
    expect(p.subSteps[2].done).toBe(true);
    expect(p.active).toBe(3);
  });

  it('the sale is taken as made when the coins rise by most of what it should bring, and the plan ends when the coins are enough', () => {
    const { plan, required } = cowPlan();
    let p = plan;
    const goal = plan.subSteps[1].goal!;
    p = tick(p, seen({ pos: COW_FIELD }), T0 + 1000);
    p = tick(p, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: goal.qty }] }), T0 + 2000);
    p = tick(p, seen({ pos: LUMBRIDGE_BANK, bag: [] }), T0 + 3000);
    expect(p.active).toBe(3);
    // A few coins are not a sale.
    p = tick(p, seen({ pos: LUMBRIDGE_BANK, bag: [], bagCoins: 460 }), T0 + 4000);
    expect(p.active).toBe(3);
    // The coins rise by the sale and the plan has what it came for.
    p = tick(p, seen({ pos: LUMBRIDGE_BANK, bag: [], bagCoins: required + 100 }), T0 + 5000);
    expect(p.subSteps[3].done).toBe(true);
    expect(p.status).toBe('DONE');
    expect(p.sourceStepId).toBe('S4-03');
  });

  it('a step the game cannot show waits for the player, and confirming it moves on', () => {
    const { plan } = cowPlan();
    const goal = plan.subSteps[1].goal!;
    let p = tick(plan, seen({ pos: COW_FIELD }), T0 + 1000);
    p = tick(p, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: goal.qty }] }), T0 + 2000);
    p = confirm(p, 'bank', seen({ pos: COW_FIELD }), T0 + 3000);
    expect(p.subSteps[2]).toMatchObject({ id: 'bank', done: true, doneBy: 'manual' });
    expect(p.active).toBe(3);
    expect(viewOf(p, seen({})).needsConfirm).toBe(true);
  });

  it('an unknown bag proves nothing: the work step does not finish on a bag the game did not report', () => {
    const { plan } = cowPlan();
    let p = tick(plan, seen({ pos: COW_FIELD }), T0 + 1000);
    p = tick(p, seen({ pos: COW_FIELD, bag: null }), T0 + 2000);
    expect(p.active).toBe(1);
  });
});

describe('pause, reconnect and other characters', () => {
  it('only work is counted: a gap between reports longer than a minute is a pause, not work', () => {
    const { plan } = cowPlan();
    let p = tick(plan, seen({ pos: COW_FIELD }), T0 + 1000);
    p = tick(p, seen({ pos: COW_FIELD }), T0 + 11_000);
    expect(p.workSeconds).toBeCloseTo(10, 5);
    p = tick(p, seen({ pos: COW_FIELD }), T0 + 11_000 + (MAX_GAP_SECONDS + 15) * 1000);
    expect(p.workSeconds).toBeCloseTo(10, 5);
  });

  it('a paused plan does not move; resuming starts from what the game shows then, so what changed meanwhile is not progress', () => {
    const { plan } = cowPlan();
    const goal = plan.subSteps[1].goal!;
    let p = tick(plan, seen({ pos: COW_FIELD }), T0 + 1000);
    p = pause(p, T0 + 2000);
    expect(p.status).toBe('PAUSED');
    expect(isRunning(p)).toBe(true);
    const during = tick(p, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: goal.qty }] }), T0 + 3000);
    expect(during).toBe(p);
    const back = resume(p, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: 3 }] }), T0 + 600_000);
    expect(back.status).toBe('ACTIVE');
    expect(back.lastTickAt).toBe(T0 + 600_000);
    expect(back.baseline.bag.cowhide).toBe(3);
    expect(back.workSeconds).toBe(p.workSeconds);
  });

  it('a lost connection changes nothing; another character\'s report is ignored', () => {
    const { plan } = cowPlan();
    expect(tick(plan, seen({ pos: COW_FIELD, connected: false }), T0 + 1000)).toBe(plan);
    expect(tick(plan, seen({ pos: COW_FIELD, character: 'Someone Else' }), T0 + 1000)).toBe(plan);
  });

  it('cancelling ends it for good', () => {
    const { plan } = cowPlan();
    const c = cancel(plan, T0 + 1000);
    expect(c.status).toBe('CANCELLED');
    expect(isRunning(c)).toBe(false);
    expect(tick(c, seen({ pos: COW_FIELD }), T0 + 2000)).toBe(c);
    expect(cancel(c, T0 + 3000)).toBe(c);
  });

  it('the same report twice changes nothing more than the clock', () => {
    const { plan } = cowPlan();
    const a = tick(plan, seen({ pos: COW_FIELD }), T0 + 1000);
    const b = tick(a, seen({ pos: COW_FIELD }), T0 + 1000);
    expect(b.subSteps).toEqual(a.subSteps);
    expect(b.active).toBe(a.active);
  });
});

describe('what the app and the game both show', () => {
  it('one short action, a count, the place, and the position in the list', () => {
    const { plan } = cowPlan();
    let p = tick(plan, seen({ pos: COW_FIELD }), T0 + 1000);
    const goal = p.subSteps[1].goal!;
    const v = viewOf(p, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: 7 }] }));
    expect(v).toMatchObject({ kind: 'perform', progress: `7 / ${goal.qty} Cowhide`, stepIndex: 2, stepCount: 6, sourceStepId: 'S4-03', status: 'ACTIVE' });
    expect(v.target).toMatchObject({ label: 'Lumbridge cow field' });
    // The count never shows more than the goal.
    expect(viewOf(p, seen({ bag: [{ name: 'Cowhide', count: 999 }] })).progress).toBe(`${goal.qty} / ${goal.qty} Cowhide`);
    // An unknown bag shows no count rather than 0.
    expect(viewOf(p, seen({ bag: null })).progress).toBe(`0 / ${goal.qty} Cowhide`);
    p = confirm(p, 'bank', seen({}), T0 + 2000);
    expect(viewOf(p, seen({ bagCoins: 500 })).progress).toBe('325 gp to go');
  });

  it('loot that has not been sold is labelled an estimate', () => {
    const { plan } = cowPlan();
    const p = confirm(plan, 'perform', seen({ pos: COW_FIELD }), T0 + 1000);
    expect(viewOf(p, seen({})).estimated).toBe(true);
  });
});

describe('saving the plan', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
  };

  it('round-trips for the same character and survives a restart', () => {
    const { plan } = cowPlan();
    const s = store();
    const key = planKey('p1', 'Tester');
    expect(key.startsWith(FUNDING_PLAN_KEY)).toBe(true);
    savePlan(s, key, plan);
    const back = loadPlan(s, key, 'Tester', T0 + 1000)!;
    expect(back.id).toBe(plan.id);
    expect(back.subSteps).toEqual(plan.subSteps);
    expect(back.sourceStepId).toBe('S4-03');
  });

  it('is not given to another character, and each character has their own key', () => {
    const { plan } = cowPlan();
    const s = store();
    savePlan(s, planKey('p1', 'Tester'), plan);
    expect(planKey('p1', 'Tester')).not.toBe(planKey('p1', 'Someone Else'));
    expect(loadPlan(s, planKey('p1', 'Tester'), 'Someone Else', T0)).toBeNull();
    expect(loadPlan(s, planKey('p1', 'Tester'), null, T0)).toBeNull();
  });

  it('a finished, cancelled, damaged or stale plan is not loaded, and a finished one is removed', () => {
    const { plan } = cowPlan();
    const s = store();
    const key = planKey('p1', 'Tester');
    savePlan(s, key, cancel(plan, T0));
    expect(s.raw.has(key)).toBe(false);
    s.setItem(key, '{not json');
    expect(loadPlan(s, key, 'Tester', T0)).toBeNull();
    s.setItem(key, JSON.stringify({ ...plan, subSteps: [] }));
    expect(loadPlan(s, key, 'Tester', T0)).toBeNull();
    s.setItem(key, JSON.stringify({ ...plan, v: 2 }));
    expect(loadPlan(s, key, 'Tester', T0)).toBeNull();
    s.setItem(key, JSON.stringify(plan));
    expect(loadPlan(s, key, 'Tester', T0 + STALE_AFTER_MS + 1)).toBeNull();
    expect(loadPlan(s, key, 'Tester', T0 + 1000)).not.toBeNull();
  });

  it('a stored active index out of range is brought back inside the list', () => {
    const { plan } = cowPlan();
    const s = store();
    const key = planKey('p1', 'Tester');
    s.setItem(key, JSON.stringify({ ...plan, active: 99 }));
    expect(loadPlan(s, key, 'Tester', T0)!.active).toBe(plan.subSteps.length - 1);
  });

  it('a missing store is harmless', () => {
    const { plan } = cowPlan();
    expect(() => savePlan(undefined, 'k', plan)).not.toThrow();
    expect(loadPlan(undefined, 'k', 'Tester', T0)).toBeNull();
  });
});
