import { describe, expect, it } from 'vitest';
import { combatPlanView } from '../../src/lib/combatPlan';
import { evaluatePlans, KEEP_MARGIN, MIN_GAIN } from '../../src/lib/combatRoute/plans';
import { spotsOf, TRAINERS } from '../../src/lib/combatRoute/spots';
import { allSteps } from '../../src/data';
import { market } from '../funding/market';
import { HISTORICAL, planInput } from './fixture';

const prices = market();
const withMarket = (o: Parameters<typeof planInput>[0] = {}, restriction: 'LIFTED' | 'RESTRICTED' | 'UNKNOWN' = 'LIFTED') =>
  ({ ...planInput({ foodPrice: prices.buy('Salmon')!.price, ...o }), prices, restriction });

const KEYS = ['route', 'split', 'item-first', 'defence-first:10', 'defence-first:20', 'defence-first:30'];

describe('Hill Giants with the reported character: the plans side by side', () => {
  it('compares the route, the split and Defence first, against the opponents the route already knows', () => {
    const r = evaluatePlans(withMarket())!;
    expect(r.plans.map((p) => p.key)).toEqual(KEYS);
    expect(r.objective).toBe('Attack to 40, 50 Big bones');
    expect(r.compared).toEqual(expect.arrayContaining(['Hill Giant', 'Cow', 'Minotaur (level 12)']));
    // The level 27 Minotaurs are not at the spot the route sends the player to.
    expect(r.compared).not.toContain('Minotaur (level 27)');
  });

  it("the route's own plan is the existing combat model's answer, not a second one", () => {
    const inp = withMarket();
    const r = evaluatePlans(inp)!;
    const route = r.plans[0];
    const view = combatPlanView(inp.step, { ...inp.ctx, owned: inp.owned })!;
    expect(route.phases[0].kills).toBe(view.primary.kills);
    expect(route.food.mid).toBeCloseTo(view.primary.food.mid, 6);
    expect(route.minutes.mid).toBeCloseTo(view.primary.totalMinutes.mid, 6);
  });

  it('no winner is preselected: each plan is estimated the same way and the best by the conservative time is offered', () => {
    const r = evaluatePlans(withMarket())!;
    const eligible = r.plans.filter((p) => p.eligible);
    const route = r.plans[0];
    const chosen = r.plans.find((p) => p.key === r.recommended)!;
    expect(eligible.length).toBe(r.plans.length);
    expect(chosen.score).toBeLessThanOrEqual(route.score);
    // It is offered because it clearly beats the route, not because it is a different plan.
    if (chosen.id !== 'route') expect((route.score - chosen.score) / route.score).toBeGreaterThanOrEqual(MIN_GAIN);
    expect(r.reason.length).toBeGreaterThan(20);
  });

  it("the food of the cows part is a few pieces, the giants' is hundreds: food is counted for the whole objective, per plan", () => {
    const r = evaluatePlans(withMarket())!;
    const split = r.plans.find((p) => p.id === 'split')!;
    const route = r.plans[0];
    expect(split.phases[0].foe.name).toBe('Cow');
    expect(split.phases[0].food.mid).toBeLessThan(40);
    expect(route.food.mid).toBeGreaterThan(300);
    expect(split.foodCost!).toBeLessThan(route.foodCost! / 2);
  });
});

describe('what the drops bring, and what is never counted', () => {
  it('the 50 Big bones the step asks for are reserved: only the kills beyond them are sold', () => {
    const r = evaluatePlans(withMarket())!;
    const route = r.plans[0];
    const bones = route.income.lines.find((l) => l.name === 'Big bones')!;
    expect(bones.qty).toBe(route.phases[0].kills - 50);
    const split = r.plans.find((p) => p.id === 'split')!;
    // Fifty kills for fifty bones: every one is the reserve, nothing is income.
    expect(split.income.lines.some((l) => l.name === 'Big bones')).toBe(false);
  });

  it('cowhides are income only once the account may sell them; unknown is not counted either', () => {
    const lifted = evaluatePlans(withMarket({}, 'LIFTED'))!.plans.find((p) => p.id === 'split')!;
    expect(lifted.income.net).toBeGreaterThan(0);
    for (const state of ['RESTRICTED', 'UNKNOWN'] as const) {
      const s = evaluatePlans(withMarket({}, state))!.plans.find((p) => p.id === 'split')!;
      const hides = s.income.lines.find((l) => l.name === 'Cowhide')!;
      expect(hides.counted).toBe(false);
      expect(s.income.net).toBe(0);
      expect(hides.note).toMatch(/cannot sell|not known/);
    }
  });

  it("income is the exchange's sell side after the 2% tax", () => {
    const split = evaluatePlans(withMarket())!.plans.find((p) => p.id === 'split')!;
    const hides = split.income.lines.find((l) => l.name === 'Cowhide')!;
    const unit = prices.sell('Cowhide')!.price;
    expect(hides.net).toBe(hides.qty * (unit - Math.floor(unit * 0.02)));
  });

  it('without prices no income is counted and the food has no cost: nothing is invented', () => {
    const r = evaluatePlans({ ...planInput({ foodPrice: null }) })!;
    for (const p of r.plans) {
      expect(p.income.net).toBe(0);
      expect(p.foodCost).toBeNull();
      expect(p.net).toBeNull();
    }
  });
});

describe('the item goal and what is already held', () => {
  it('fifty Big bones already in the bank: the split has nothing to collect, so there is no split', () => {
    const r = evaluatePlans(withMarket({ items: { 'Big bones': [0, 50] } }))!;
    expect(r.plans.some((p) => p.id === 'split')).toBe(false);
    expect(r.objective).toBe('Attack to 40, 50 Big bones');
  });

  it('some are held: only the rest is collected', () => {
    const r = evaluatePlans(withMarket({ items: { 'Big bones': [0, 30] } }))!;
    const split = r.plans.find((p) => p.id === 'split')!;
    expect(split.phases[1].kills).toBe(20);
    expect(split.phases[1].item).toEqual({ name: 'Big bones', count: 50 });
  });

  it('a bank that was not read is unknown, not empty: the whole count is planned and the plan says why it may be too much', () => {
    const r = evaluatePlans(withMarket({ bankSeen: false }))!;
    for (const p of r.plans) expect(p.risks.some((x) => /bank has not been read/.test(x))).toBe(true);
    expect(r.plans.find((p) => p.id === 'split')!.phases[1].kills).toBe(50);
  });
});

describe('Defence, and the build that keeps it at 1', () => {
  it('with no preference Defence first is one of the plans, trained on the cows', () => {
    const r = evaluatePlans(withMarket())!;
    const d = r.plans.find((p) => p.key === 'defence-first:20')!;
    expect(d.eligible).toBe(true);
    expect(d.phases[0]).toMatchObject({ kind: 'defence', foe: expect.objectContaining({ name: 'Cow' }) });
    // The rest of the plan is fought with the Defence it gave: less food than the route for the same goal.
    expect(d.phases[1].food.mid).toBeLessThan(r.plans[0].food.mid);
  });

  it('an explicit Defence 1 build: the Defence plans are not offered and never recommended', () => {
    const r = evaluatePlans(withMarket({ keepDefenceOne: true }))!;
    const defence = r.plans.filter((p) => p.id === 'defence-first');
    expect(defence.length).toBe(3);
    for (const p of defence) {
      expect(p.eligible).toBe(false);
      expect(p.blockers).toContain('Your build keeps Defence at 1');
    }
    expect(r.recommended.startsWith('defence-first')).toBe(false);
  });

  it('Defence levels the player already has are not offered again', () => {
    const r = evaluatePlans(withMarket({ stats: { ...HISTORICAL.stats, defence: 25 }, xp: { ...HISTORICAL.xp, defence: 8740 } }))!;
    expect(r.plans.map((p) => p.key)).not.toContain('defence-first:10');
    expect(r.plans.map((p) => p.key)).not.toContain('defence-first:20');
    expect(r.plans.map((p) => p.key)).toContain('defence-first:30');
  });
});

describe('choosing, with a steady hand', () => {
  it('a strong character keeps the route: nothing is offered when nothing is clearly better', () => {
    const r = evaluatePlans(withMarket({
      stats: { attack: 38, strength: 60, defence: 45, hitpoints: 60 }, xp: { attack: 33000, strength: 273742, defence: 61512, hitpoints: 400000 },
    }))!;
    expect(r.recommended).toBe('route');
    expect(r.reason).toMatch(/route as written/);
  });

  it("the plan the player adopted stays while it is not clearly beaten, and the route's own can be chosen back", () => {
    const base = evaluatePlans(withMarket())!;
    const kept = evaluatePlans(withMarket({ adopted: 'split' }))!;
    const selected = base.plans.find((p) => p.key === 'split')!;
    const best = Math.min(...base.plans.map((p) => p.score));
    expect(selected.score).toBeLessThanOrEqual(best * KEEP_MARGIN);
    expect(kept.recommended).toBe('split');
    const changed = evaluatePlans(withMarket({ adopted: 'route' }))!;
    expect(changed.recommended).toBe('item-first'); // The route is now more than KEEP_MARGIN behind the new candidate.
    expect(changed.plans.find(p => p.key === 'route')?.eligible).toBe(true); // A player's explicit route choice remains available.
  });

  it('a plan that is no longer there (its conditions are gone) is not kept', () => {
    const r = evaluatePlans(withMarket({ adopted: 'split', items: { 'Big bones': [0, 50] } }))!;
    expect(r.plans.some((p) => p.key === 'split')).toBe(false);
    expect(r.recommended).not.toBe('split');
  });

  it('a fight that could take half your health at once is not offered, and the route says so when it is the one', () => {
    const r = evaluatePlans(withMarket({ stats: { ...HISTORICAL.stats, hitpoints: 8 } }))!;
    const route = r.plans[0];
    expect(route.eligible).toBe(false);
    expect(route.blockers[0]).toMatch(/more than half of your 8 health/);
    expect(r.reason).toMatch(/No plan could be recommended|faster|slower|same time/);
  });
});

describe('what the game measured', () => {
  it('measured kills calibrate the plan of the opponent they were measured on', () => {
    const formula = evaluatePlans(withMarket())!;
    const measured = evaluatePlans(withMarket({ fights: [{ name: 'Hill Giant', combat: 28, kills: 40, seconds: 40 * 120, damage: 40 * 40 }] }))!;
    expect(formula.plans[0].basis).toBe('formula');
    expect(measured.plans[0].basis).toBe('calibrated');
    // Two minutes a kill instead of one: the route's plan is slower than the formulas said.
    expect(measured.plans[0].minutes.mid).toBeGreaterThan(formula.plans[0].minutes.mid * 1.2);
    expect(measured.recommended).not.toBe('route');
  });
});

describe('nothing honest to say', () => {
  it('no gear from the game, no levels, no food, or no opponent: no plans', () => {
    const base = planInput();
    expect(evaluatePlans({ ...base, ctx: { ...base.ctx, gear: null } })).toBeNull();
    expect(evaluatePlans({ ...base, ctx: { ...base.ctx, stats: null } })).toBeNull();
    expect(evaluatePlans({ ...base, ctx: { ...base.ctx, stats: { attack: 30 } } })).toBeNull();
    expect(evaluatePlans({ ...planInput({ stepId: 'S1-03' }) })).toBeNull();
    // An item the gear data does not know: the model does not guess.
    expect(evaluatePlans({ ...base, ctx: { ...base.ctx, gear: { equipment: [{ id: 999999, name: 'Mystery blade', slot: 'weapon' }], inventory: [], coins: 0, bankCoins: 0 } as never } })).toBeNull();
  });
});

describe('where the plans can lead', () => {
  it('every trainer has a spot from a route step that already sends the player there, with a way in', () => {
    const spots = spotsOf(allSteps);
    for (const foe of TRAINERS) {
      const s = spots.get(foe)!;
      expect(s, foe).toBeTruthy();
      expect(allSteps.find((x) => x.id === s.stepId)?.foes?.[0]).toBe(foe);
      expect(s.place.label.length).toBeGreaterThan(3);
      expect(s.npcNames.length).toBeGreaterThan(0);
    }
    expect(spots.get('Hill Giant')!.waypoints!.length).toBeGreaterThan(1);
  });
});

describe('Defence the route gives later (Dragon Slayer I)', () => {
  const noSplit = { items: { 'Big bones': [0, 50] } as Record<string, [number, number]> };
  const closed = () => true;

  it('every Defence plan says what the reward ahead gives, with no training', () => {
    const r = evaluatePlans(withMarket())!;
    for (const p of r.plans.filter((x) => x.id === 'defence-first')) expect(p.notes[0]).toMatch(/S5-09 \(Triumph at Oziach\) gives 18,650 Defence XP.*about Defence 3\d with no training/);
    expect(r.plans[0].notes).toEqual([]);
  });

  it('a Defence plan that barely beats the original route does not displace the faster XP-only alternative', () => {
    const r = evaluatePlans(withMarket(noSplit))!;
    const d20 = r.plans.find((p) => p.key === 'defence-first:20')!;
    const route = r.plans[0];
    // It does look better at the slow end ...
    expect((route.score - d20.score) / route.score).toBeGreaterThanOrEqual(MIN_GAIN);
    // ... but by the middle estimate it is under the margin a route that works must be beaten by.
    expect((route.minutes.mid - d20.minutes.mid) / route.minutes.mid).toBeLessThan(MIN_GAIN);
    expect(r.recommended).toBe('xp-only');
    expect(r.plans.find(p => p.key === 'xp-only')!.score).toBeLessThan(d20.score);
    expect(d20.notes.join(' ')).toContain('18,650 Defence XP');
  });

  it('with no Defence reward left ahead the faster XP-only alternative is still considered', () => {
    const r = evaluatePlans({ ...withMarket(noSplit), done: closed })!;
    expect(r.plans.every((p) => p.notes.length === 0)).toBe(true);
    expect(r.recommended).toBe('xp-only');
  });

  it('the player can still adopt it: an adopted Defence plan stays, and a route that is not safe does not hold it back', () => {
    expect(evaluatePlans(withMarket({ ...noSplit, adopted: 'defence-first:20' }))!.plans.find(p => p.key === 'defence-first:20')!.eligible).toBe(true);
    const weak = evaluatePlans(withMarket({ stats: { ...HISTORICAL.stats, hitpoints: 8 } }))!;
    expect(weak.reason).not.toMatch(/route as written stays/);
  });
});
