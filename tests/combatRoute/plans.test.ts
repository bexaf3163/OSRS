import { describe, expect, it } from 'vitest';
import { combatPlanView } from '../../src/lib/combatPlan';
import { evaluatePlans, gainOver, KEEP_MARGIN, MIN_GAIN } from '../../src/lib/combatRoute/plans';
import { bankTrip, spotsOf, termsFor, TRAINER_SPOTS } from '../../src/lib/combatRoute/spots';
import { netEach } from '../../src/lib/funding/ge';
import { allSteps, stepById } from '../../src/data';
import { market } from '../funding/market';
import { HISTORICAL, gearOf, ownedOf, planInput } from './fixture';

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
    // The loot's pickups and extra bank trips are the plan's own work on top of the fight the food plan times.
    expect(route.minutes.mid - (route.phases[0].loot?.minutes.mid ?? 0)).toBeCloseTo(view.primary.totalMinutes.mid, 6);
  });

  it('no winner is preselected: each plan is estimated the same way and the best by the conservative time is offered', () => {
    const r = evaluatePlans(withMarket())!;
    const eligible = r.plans.filter((p) => p.eligible);
    const route = r.plans[0];
    const chosen = r.plans.find((p) => p.key === r.recommended)!;
    expect(eligible.length).toBe(r.plans.length);
    expect(chosen.score).toBeLessThanOrEqual(route.score);
    // It is offered because it clearly beats the route, not because it is a different plan.
    if (chosen.id !== 'route') expect(gainOver(route, chosen)).toBeGreaterThanOrEqual(MIN_GAIN);
    expect(r.reason.length).toBeGreaterThan(20);
  });

  it("the trainer's part is a few dozen pieces, the giants' is hundreds: food is counted for the whole objective, per plan", () => {
    const r = evaluatePlans(withMarket())!;
    const split = r.plans.find((p) => p.id === 'split')!;
    const route = r.plans[0];
    expect(split.phases[0].foe.name).not.toBe('Hill Giant');
    expect(split.phases[0].food.mid).toBeLessThan(route.food.mid / 3);
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

  it('loot is income only with its work: the pickups and the extra bank trips are in the plan, the coins are after the exchange tax', () => {
    const d = evaluatePlans(withMarket())!.plans.find((p) => p.key === 'defence-first:20')!;
    const cows = d.phases[0];
    expect(cows.loot).toMatchObject({ name: 'Cowhide', qty: cows.kills });
    expect(cows.loot!.net).toBe(cows.kills * netEach(prices.sell('Cowhide')!.price, 'Cowhide'));
    expect(cows.loot!.minutes.mid).toBeGreaterThan(cows.kills * 1.2 / 60);
    expect(cows.text).toMatch(/banking the Cowhides/);
    expect(d.income.lines.find((l) => l.name === 'Cowhide')).toMatchObject({ counted: true, net: cows.loot!.net });
  });

  it('a restricted account does not plan to sell what it cannot sell', () => {
    for (const state of ['LIFTED', 'UNKNOWN'] as const) expect(evaluatePlans(withMarket({}, state))!.plans.find((p) => p.key === 'defence-first:20')!.phases[0].loot).toBeTruthy();
    const restricted = evaluatePlans(withMarket({}, 'RESTRICTED'))!.plans.find((p) => p.key === 'defence-first:20')!;
    expect(restricted.phases[0].loot).toBeUndefined();
    expect(restricted.income.lines.find((l) => l.name === 'Cowhide')).toMatchObject({ counted: false, net: 0 });
  });

  it('a drop not worth its pickups stays on the floor: nothing is counted for it', () => {
    const cheap = market({ 'Big bones': { high: 2, low: 1, avgHigh: 2, avgLow: 1 } });
    const r = evaluatePlans({ ...planInput({ foodPrice: 33 }), prices: cheap, restriction: 'LIFTED' })!;
    const route = r.plans[0];
    expect(route.phases[0].loot).toBeUndefined();
    const bones = route.income.lines.find((l) => l.name === 'Big bones')!;
    expect(bones).toMatchObject({ counted: false, net: 0 });
    expect(route.net).toBe(-route.foodCost!);
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
    // The best the adopted plan is held against: Defence plans that only help before the reward ahead are not it (worthEarly in plans.ts).
    const best = [...base.plans].filter((p) => p.eligible && p.id !== 'defence-first').sort((a, b) => a.score - b.score)[0];
    // A plan within KEEP_MARGIN of the best stays once adopted; one further behind gives way.
    const close = base.plans.filter((p) => p.key !== best.key && p.eligible && p.score - best.score <= best.effort * (KEEP_MARGIN - 1));
    const far = base.plans.filter((p) => p.eligible && p.score - best.score > best.effort * (KEEP_MARGIN - 1));
    expect(close.length).toBeGreaterThan(0);
    for (const p of close) expect(evaluatePlans(withMarket({ adopted: p.key }))!.recommended).toBe(p.key);
    for (const p of far) expect(evaluatePlans(withMarket({ adopted: p.key }))!.recommended).not.toBe(p.key);
    const route = evaluatePlans(withMarket({ adopted: 'route' }))!;
    expect(route.plans.find(p => p.key === 'route')?.eligible).toBe(true); // A player's explicit route choice remains available.
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
  it('every trainer has a spot the route knows: its own step, a place a step used to give, or a wiki spawn by a route step', () => {
    const spots = spotsOf(allSteps, true);
    for (const t of TRAINER_SPOTS) {
      const s = spots.get(t.foe)!;
      expect(s, t.foe).toBeTruthy();
      expect(s.place.label.length, t.foe).toBeGreaterThan(3);
      expect(s.npcNames.length, t.foe).toBeGreaterThan(0);
      expect(s.where.length, t.foe).toBeGreaterThan(20);
      if (t.fromStep) expect(allSteps.find((x) => x.id === s.stepId)?.foes?.[0], t.foe).toBe(t.foe);
      else if (!t.formerStep) {
        // The route still passes by: a step's place or stop within 30 tiles (the builder's reach), so a changed route cannot strand a spot.
        const near = allSteps.flatMap((x) => [x.mapLocation, ...(x.inGame?.pathWaypoints ?? [])]).filter((p): p is NonNullable<typeof p> => !!p && p.plane === s.place.plane)
          .some((p) => Math.max(Math.abs(p.x - s.place.x), Math.abs(p.y - s.place.y)) <= 30);
        expect(near, t.foe).toBe(true);
      }
      // Every spot has a bank trip it can be timed with.
      expect(bankTrip(s)!.minutes[0], t.foe).toBeGreaterThan(0);
    }
    expect(spotsOf(planInput().steps, true).get('Hill Giant')!.waypoints!.length).toBeGreaterThan(1);
  });

  it('a spot that needs a quest is offered only once the quest is done', () => {
    const live = { step: stepById.get('S4-03')!, steps: allSteps, ctx: { stats: { attack: 30, strength: 30, defence: 20, hitpoints: 35 }, gear: gearOf(HISTORICAL.worn) } as never, owned: ownedOf({}), foodPrice: 33 };
    expect(evaluatePlans(live)!.plans.some((p) => p.key === 'xp-only:Brutus')).toBe(false);
    expect(evaluatePlans({ ...live, done: (id) => id === 'S4-02' })!.plans.some((p) => p.key === 'xp-only:Brutus')).toBe(true);
  });

  it("a special attack is kept above: Brutus's charge with a low health is not offered, and the dodge is said when it is", () => {
    const at = (hitpoints: number) => evaluatePlans({ step: stepById.get('S4-03')!, steps: allSteps, ctx: { stats: { attack: 30, strength: 30, defence: 20, hitpoints }, gear: gearOf(HISTORICAL.worn) } as never, owned: ownedOf({}), foodPrice: 33, done: () => true })!;
    expect(at(20).plans.some((p) => p.key === 'xp-only:Brutus')).toBe(false);
    const ok = at(35).plans.find((p) => p.key === 'xp-only:Brutus')!;
    expect(ok.risks.join(' ')).toMatch(/special attack: it hits up to 19/);
  });

  it('the monks heal for the asking: no food, and the healing time is in the plan', () => {
    const r = evaluatePlans({ step: stepById.get('S4-03')!, steps: allSteps, ctx: { stats: HISTORICAL.stats, xp: HISTORICAL.xp, gear: gearOf(HISTORICAL.worn) } as never, owned: ownedOf({}), foodPrice: 33 })!;
    const monks = r.plans.find((p) => p.key === 'xp-only:Monk')!;
    expect(monks.phases.at(-1)!.food.mid).toBe(0);
    expect(monks.phases.at(-1)!.spot.where).toMatch(/ask to be healed/);
  });

  it('the live route (S4-03 is Giant frogs since 2.74.2) still compares the Hill Giants, from the spot that step used to give', () => {
    const live = spotsOf(allSteps, true).get('Hill Giant')!;
    expect(live.waypoints?.[0].label).toMatch(/trapdoor/);
    const r = evaluatePlans({ step: stepById.get('S4-03')!, steps: allSteps, ctx: { stats: HISTORICAL.stats, gear: gearOf(HISTORICAL.worn) } as never, owned: ownedOf({}), foodPrice: 33 })!;
    expect(r.compared).toEqual(expect.arrayContaining(['Giant frog', 'Cow', 'Minotaur (level 12)', 'Hill Giant', 'Barbarian (level 10)', 'Al Kharid warrior', 'Monk']));
    // Frogs are the wiki's 20-40 method, and the model agrees for this character.
    expect(r.recommended).toBe('route');
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
    const route = r.plans[0];
    const defence = r.plans.filter((p) => p.id === 'defence-first');
    // A Defence plan under the middle-estimate margin a working route must be beaten by is never the one recommended.
    for (const d of defence) if ((route.minutes.mid - d.minutes.mid) / route.minutes.mid < MIN_GAIN) expect(r.recommended).not.toBe(d.key);
    expect(r.recommended).not.toMatch(/^defence-first/);
    expect(defence[0].notes.join(' ')).toContain('18,650 Defence XP');
  });

  it('with no Defence reward left ahead the faster XP-only alternative is still considered', () => {
    const r = evaluatePlans({ ...withMarket(noSplit), done: closed })!;
    expect(r.plans.every((p) => p.notes.length === 0)).toBe(true);
    expect(r.plans.filter((p) => p.id === 'xp-only').length).toBeGreaterThan(3);
    expect(r.recommended).toBe([...r.plans].filter((p) => p.eligible).sort((a, b) => a.score - b.score)[0].key);
  });

  it('the player can still adopt it: an adopted Defence plan stays, and a route that is not safe does not hold it back', () => {
    expect(evaluatePlans(withMarket({ ...noSplit, adopted: 'defence-first:20' }))!.plans.find(p => p.key === 'defence-first:20')!.eligible).toBe(true);
    const weak = evaluatePlans(withMarket({ stats: { ...HISTORICAL.stats, hitpoints: 8 } }))!;
    expect(weak.reason).not.toMatch(/route as written stays/);
  });
});

describe('who may use a spot is explicit', () => {
  it('a free account is offered no members spot; facts (bank trips, drops) are kept for every spot', () => {
    const free = spotsOf(allSteps, false);
    const all = spotsOf(allSteps, true);
    for (const [foe] of free) expect(all.has(foe)).toBe(true);
    for (const t of TRAINER_SPOTS.filter((x) => x.members)) expect(free.has(t.foe), `${t.foe} is members only`).toBe(false);
    // Every spot that a plan may offer has its terms, members ones included.
    const terms = termsFor(allSteps);
    for (const [foe] of all) expect(terms[foe], foe).toBeDefined();
  });
});
