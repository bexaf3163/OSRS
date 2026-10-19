// A plan started from the Money section (2.71): one earning method toward the goal the player chose - more coins, the step's shortfall, or an open
// session - with the coin card's sub-steps and detection. A goal larger than one trip is reached trip by trip; the coin card's own plan goes round again
// too when a sale leaves it short. The route step is never touched: the plan only names the step to go back to.

import { describe, expect, it } from 'vitest';
import { moneyList } from '../../src/lib/funding/browse';
import { methodById } from '../../src/lib/funding/methods';
import {
  cancel, coinsMade, confirm, goalBlocker, loadPlan, pause, planKey, resume, savePlan, startMethodPlan, startPlan, tick, viewOf, type FundingPlanState,
} from '../../src/lib/funding/plan';
import { fundingHintPayload } from '../../src/lib/fundingHint';
import { market } from './market';
import { scenario } from './scenario';
import { fakeSnap } from './helpers';

const T0 = 1_792_000_000_000;
const COW_FIELD = { x: 3253, y: 3278, plane: 0 };
const LUMBRIDGE_BANK = { x: 3208, y: 3220, plane: 2 };
const GE_POS = { x: 3165, y: 3490, plane: 0 };

function cows() {
  const s = scenario(market(), { bagCoins: 400, bankCoins: 0 });
  const e = moneyList(s.base, s.assessment).evals.find((x) => x.method.id === 'cows-cowhide')!;
  expect(e.eligible).toBe(true);
  return { s, e };
}

/** What the game shows at a moment, for the plan's character. */
const seen = (o: { pos?: { x: number; y: number; plane: number } | null; bag?: { name: string; count: number }[] | null; bagCoins?: number | null; bankCoins?: number | null; character?: string | null }) =>
  fakeSnap({
    character: o.character === undefined ? 'Tester' : o.character, position: o.pos === undefined ? GE_POS : o.pos, bag: o.bag === undefined ? [] : o.bag,
    bagCoins: o.bagCoins === undefined ? 400 : o.bagCoins, bankCoins: o.bankCoins === undefined ? 0 : o.bankCoins,
  });

/** One trip of the cow method: the way there, the hides, the bank; the plan then stands at the sale. */
function trip(p: FundingPlanState, at: number): FundingPlanState {
  const qty = p.subSteps.find((s) => s.id === 'perform')!.goal!.qty;
  let q = tick(p, seen({ pos: COW_FIELD }), at + 1000);
  q = tick(q, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: qty }] }), at + 2000);
  q = tick(q, seen({ pos: LUMBRIDGE_BANK, bag: [] }), at + 3000);
  expect(q.subSteps[q.active].id).toBe('sell');
  return q;
}

describe('"Earn N more coins"', () => {
  it('the target is the coins at the start plus N; the plan is the trip (no restock, nothing to go back to buy); it names the step to return to', () => {
    const { s, e } = cows();
    const plan = startMethodPlan(e, { kind: 'amount', coins: 2000 }, 'S4-03', s.snap, T0)!;
    expect(plan.target).toEqual({ required: 2400, gap: 2000, liquidAtStart: 400, completeAtStart: true });
    expect(plan.subSteps.map((x) => x.id)).toEqual(['travel', 'perform', 'bank', 'sell']);
    expect(plan.loop).toEqual({ from: 0, to: 3 });
    expect(plan).toMatchObject({ trips: 1, kind: 'EARN', methodId: 'cows-cowhide', sourceStepId: 'S4-03', goal: { kind: 'amount', coins: 2000 }, status: 'ACTIVE' });
    expect(plan.openEnded).toBeUndefined();
  });

  it('a trip that leaves the coins short starts the next trip at the way there; the plan ends when the coins are in hand', () => {
    const { s, e } = cows();
    let p = trip(startMethodPlan(e, { kind: 'amount', coins: 2000 }, 'S4-03', s.snap, T0)!, T0);
    expect(viewOf(p, seen({ bagCoins: 1000 })).progress).toBe('1,400 gp to go');
    p = confirm(p, 'sell', seen({ bagCoins: 1000 }), T0 + 4000);
    expect(p).toMatchObject({ status: 'ACTIVE', active: 0, trips: 2 });
    expect(p.subSteps.every((x) => !x.done)).toBe(true);
    // Unsold hides in the bag are not coins: nothing ends.
    p = tick(p, seen({ pos: COW_FIELD, bag: [{ name: 'Cowhide', count: 27 }], bagCoins: 1000 }), T0 + 5000);
    expect(p.status).toBe('ACTIVE');
    p = tick(p, seen({ bagCoins: 2400 }), T0 + 6000);
    expect(p.status).toBe('DONE');
  });
});

describe('an open session', () => {
  it('never ends by itself: each sale starts the next trip, and the coins made are counted against the start', () => {
    const { s, e } = cows();
    let p = startMethodPlan(e, { kind: 'open' }, 'S4-03', s.snap, T0)!;
    expect(p.openEnded).toBe(true);
    expect(p.subSteps.map((x) => x.id)).toEqual(['travel', 'perform', 'bank', 'sell']);
    p = trip(p, T0);
    expect(viewOf(p, seen({ bagCoins: 400 })).progress).toBe('No coins made yet');
    expect(viewOf(p, seen({ bagCoins: 1500 })).progress).toBe('1,100 gp made so far');
    expect(coinsMade(p, seen({ bagCoins: 1500 }))).toBe(1100);
    // A bank that is not read cannot be compared with a start that had it.
    expect(coinsMade(p, seen({ bagCoins: 1500, bankCoins: null }))).toBeNull();
    p = confirm(p, 'sell', seen({ bagCoins: 1500 }), T0 + 4000);
    expect(p).toMatchObject({ status: 'ACTIVE', active: 0, trips: 2 });
    expect(tick(p, seen({ bagCoins: 1_000_000 }), T0 + 5000).status).toBe('ACTIVE');
    expect(cancel(p, T0 + 6000).status).toBe('CANCELLED');
  });

  it('starts with the coins unknown (nothing is counted then), and the game line says what to do now', () => {
    const { e } = cows();
    const snap = seen({ bagCoins: null, bankCoins: null });
    expect(goalBlocker({ kind: 'open' }, snap)).toBeNull();
    const p = startMethodPlan(e, { kind: 'open' }, 'S4-03', snap, T0)!;
    expect(p.target.liquidAtStart).toBeNull();
    const view = viewOf(p, snap);
    const hint = fundingHintPayload(p, view, 'Tester')!;
    expect(hint.action).toBe(view.action);
    expect(hint.brief).toBe('Go to the cow field north of Lumbridge.');
    expect(hint).toMatchObject({ stepIndex: 1, stepCount: 4, status: 'ACTIVE' });
  });
});

describe('the step\'s shortfall', () => {
  it('the same trips, then the supplies and the way back; it ends when the coins cover the step', () => {
    const { s, e } = cows();
    const gap = s.assessment.gap!;
    let p = startMethodPlan(e, { kind: 'shortfall', stepId: 'S4-03', coins: gap }, 'S4-03', s.snap, T0)!;
    expect(p.subSteps.map((x) => x.id)).toEqual(['travel', 'perform', 'bank', 'sell', 'restock', 'resume']);
    expect(p.target.required).toBe(s.assessment.required);
    p = trip(p, T0);
    p = tick(p, seen({ bagCoins: s.assessment.required }), T0 + 4000);
    expect(p.status).toBe('DONE');
  });
});

describe('what cannot start, and why', () => {
  it('no character, coins unknown for an amount, no amount, an unread bank for an amount; an ineligible method never', () => {
    const { s, e } = cows();
    expect(goalBlocker({ kind: 'open' }, seen({ character: null }))).toMatch(/Log in|Connect RuneLite/);
    expect(startMethodPlan(e, { kind: 'open' }, 'S4-03', seen({ character: null }), T0)).toBeNull();
    expect(goalBlocker({ kind: 'amount', coins: 1000 }, seen({ bagCoins: null, bankCoins: null }))).toBe('Your coins are not known yet.');
    expect(goalBlocker({ kind: 'amount', coins: 0 }, s.snap)).toBe('Choose how many coins.');
    expect(goalBlocker({ kind: 'amount', coins: 1000 }, seen({ bankCoins: null }))).toMatch(/Open your bank/);
    expect(startMethodPlan(e, { kind: 'amount', coins: 1000 }, 'S4-03', seen({ bankCoins: null }), T0)).toBeNull();
    expect(startMethodPlan({ ...e, eligible: false }, { kind: 'open' }, 'S4-03', s.snap, T0)).toBeNull();
  });
});

describe('the coin card\'s own plan (2.71)', () => {
  function cardPlan() {
    const s = scenario(market(), { bagCoins: 400, bankCoins: 0 });
    const rec = s.assessment.recommendation!;
    return { s, plan: startPlan(s.assessment, rec, s.snap, methodById('cows-cowhide'), T0)! };
  }

  it('goes round again when a sale leaves it short, instead of sending the player to buy with too few coins', () => {
    const { plan } = cardPlan();
    expect(plan.loop).toEqual({ from: 0, to: 3 });
    const p = confirm(trip(plan, T0), 'sell', seen({ bagCoins: 500 }), T0 + 4000);
    expect(p).toMatchObject({ status: 'ACTIVE', active: 0, trips: 2 });
  });

  it('with the coins unknown after the sale it goes on to the restock as before, rather than round again on a guess', () => {
    const { plan } = cardPlan();
    const p = confirm(trip(plan, T0), 'sell', seen({ bagCoins: null, bankCoins: null }), T0 + 4000);
    expect(p.subSteps[p.active].id).toBe('restock');
    expect(p.trips).toBe(1);
  });
});

describe('pause, resume, save', () => {
  it('a Money plan pauses, resumes and survives a restart with its goal and its trips', () => {
    const { s, e } = cows();
    let p = startMethodPlan(e, { kind: 'amount', coins: 2000 }, 'S4-03', s.snap, T0)!;
    p = confirm(trip(p, T0), 'sell', seen({ bagCoins: 1000 }), T0 + 4000);
    p = pause(p, T0 + 5000);
    expect(p.status).toBe('PAUSED');
    p = resume(p, seen({}), T0 + 6000);
    expect(p.status).toBe('ACTIVE');
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    const key = planKey('p1', 'Tester');
    savePlan(store, key, p);
    const back = loadPlan(store, key, 'Tester', T0 + 7000)!;
    expect(back).toMatchObject({ goal: { kind: 'amount', coins: 2000 }, loop: { from: 0, to: 3 }, trips: 2, sourceStepId: 'S4-03' });
  });
});
