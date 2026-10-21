import { describe, expect, it } from 'vitest';
import { adoptStorageKey, loadAdopted, saveAdopted, withAdopted } from '../../src/lib/combatRoute/adopt';
import { evaluatePlans } from '../../src/lib/combatRoute/plans';
import { currentPhase, phaseDone, resolvePick, samePicks, withCombatPlan } from '../../src/lib/combatRoute/pick';
import { foodPicks, foodPlanApplied, stepResendKey, withFoodPlan } from '../../src/lib/foodPlan';
import { aggregateShopping } from '../../src/lib/shopping';
import { emptyProgress } from '../../src/lib/progress';
import { stepGuide, toInGameTarget } from '../../src/services/runeliteBridge';
import { allSteps } from '../../src/data';
import { market } from '../funding/market';
import { gearOf, HISTORICAL, planInput } from './fixture';
import type { Step } from '../../src/types';

const prices = market();
const report = (o: Parameters<typeof planInput>[0] = {}) => evaluatePlans({ ...planInput({ foodPrice: prices.buy('Salmon')!.price, ...o }), prices, restriction: 'LIFTED' })!;
const route = planInput().step;

const progress = (xp: number | null, bones: number | null) => ({
  xp: xp === null ? null : { attack: xp, strength: 2000, defence: 0 },
  held: (name: string) => (name === 'Big bones' ? bones : null),
});

describe('the phase a plan is in, by what the game shows', () => {
  const split = report().plans.find((p) => p.id === 'split')!;

  it('starts on the cows while Attack is short, then on the giants for the bones, and stays there until the step itself closes', () => {
    expect(currentPhase(split, progress(13363, 0))).toBe(0);
    expect(currentPhase(split, progress(37223, 0))).toBe(0);
    expect(currentPhase(split, progress(37224, 0))).toBe(1);
    expect(currentPhase(split, progress(40000, 49))).toBe(1);
    // Everything met: the last phase stays. A plan never closes the step: the route's own trigger does.
    expect(currentPhase(split, progress(40000, 50))).toBe(1);
  });

  it('unknown is not done: no XP from the game and no bank read keep the phase where it is', () => {
    expect(phaseDone(split.phases[0], progress(null, 0))).toBe(false);
    expect(phaseDone(split.phases[1], progress(40000, null))).toBe(false);
    expect(phaseDone(split.phases[1], progress(40000, 50))).toBe(true);
  });

  it('a plan is picked only when adopted, eligible and still there', () => {
    const rep = report();
    expect(resolvePick(rep, null, progress(13363, 0))).toBeNull();
    expect(resolvePick(rep, 'route', progress(13363, 0))).toBeNull();
    expect(resolvePick(rep, 'nonsense', progress(13363, 0))).toBeNull();
    expect(resolvePick(null, 'split', progress(13363, 0))).toBeNull();
    const pick = resolvePick(rep, 'split', progress(13363, 0))!;
    expect(pick).toMatchObject({ key: 'split', phase: 1, phases: 2, kind: 'train', foe: 'Cow', xpPerKill: 32 });
    // The conditions are gone (the bones are in hand): the route's own plan stands.
    expect(resolvePick(report({ items: { 'Big bones': [0, 50] } }), 'split', progress(13363, 50))).toBeNull();
    // Defence 1 build: an adopted Defence plan is not applied.
    expect(resolvePick(report({ keepDefenceOne: true }), 'defence-first:20', progress(13363, 0))).toBeNull();
  });

  it('the same pick is the same value, so nothing downstream recomputes for nothing', () => {
    const a = resolvePick(report(), 'split', progress(13363, 0))!;
    const b = resolvePick(report(), 'split', progress(13363, 0))!;
    expect(samePicks({ 'S4-03': a }, { 'S4-03': b })).toBe(true);
    expect(samePicks({ 'S4-03': a }, {})).toBe(false);
    expect(samePicks({ 'S4-03': a }, { 'S4-03': { ...b, phase: 2 } })).toBe(false);
  });
});

describe('the step as an adopted plan has it', () => {
  const pick = (xp: number, bones: number) => resolvePick(report(), 'split', progress(xp, bones))!;

  it('no pick: the very same step', () => {
    expect(withCombatPlan(route, undefined)).toBe(route);
  });

  it("the route's identity is untouched: id, title, trigger, items; the plan cannot complete the step", () => {
    const s = withCombatPlan(route, pick(13363, 0));
    expect(s.id).toBe('S4-03');
    expect(s.title).toBe(route.title);
    expect(s.inGame?.completionTrigger).toEqual(route.inGame?.completionTrigger);
    expect(s.itemsRequired).toEqual(route.itemsRequired);
    expect(JSON.stringify(s)).not.toMatch(/"done"|"complete":/);
  });

  it('the first phase leads to the cows, with the cows\' pace line toward the same Attack target', () => {
    const s = withCombatPlan(route, pick(13363, 0));
    expect(s.foes).toEqual(['Cow']);
    expect(s.mapLocation).toMatchObject({ label: 'The cow field east of Lumbridge' });
    expect(s.inGame?.npcNames).toEqual(['Cow']);
    expect(s.inGame?.pathWaypoints).toBeUndefined();
    expect(s.inGame?.worldPoint).toBeUndefined();
    expect(s.pacing).toMatchObject({ skill: 'attack', targetLevel: 40, targetExp: 37224, actionName: 'cow|cows', expPerAction: 32 });
    expect(s.fields?.[0]).toMatchObject({ label: 'Your plan' });
    expect(s.fields?.[0].text).toMatch(/Cow: Attack to 40/);
    // One set of instructions (2.69): the plan's own lead, the route's text is kept folded as "the route as written", never beside it.
    expect(s.quickSteps?.[0]).toMatch(/^Fight the cows on Accurate until Attack 40 \(about \d+ kills\): The cow field east of Lumbridge\.$/);
    expect(s.quickSteps?.[1]).toMatch(/^Then: fight the Hill Giants until 50 Big bones are in the bank/);
    // The game labels the last part "Next: " itself, so the app's "Then: " joiner is not sent ("Next: Then: ..." in the card, live 2.72.1).
    const sent = stepGuide(s).steps ?? [];
    expect(sent.some((q) => q.startsWith('Then: '))).toBe(false);
    expect(sent[sent.length - 1]).toMatch(/^Fight the Hill Giants until 50 Big bones are in the bank/);
    expect(s.where).toMatch(/cow field/);
    expect(s.routeAsWritten).toEqual({ where: route.where, quickSteps: route.quickSteps, fields: route.fields });
    expect(s.fields!.every((f) => f.label === 'Your plan' || ['Dangerous', 'Attention', 'Combat', 'Armour'].includes(f.label))).toBe(true);
  });

  it('the second phase leads back to the giants, with no XP pace line (the item is the goal) and the bones to bank', () => {
    const s = withCombatPlan(route, pick(37224, 10));
    expect(s.foes).toEqual(['Hill Giant']);
    expect(s.inGame?.npcNames).toEqual(['Hill Giant']);
    expect(s.inGame?.pathWaypoints?.length).toBeGreaterThan(1);
    expect(s.mapLocation).toMatchObject({ label: route.mapLocation!.label });
    expect(s.pacing).toBeUndefined();
    expect(s.inGame?.highlightItems).toContain('Big bones');
    expect(s.inGame?.completionTrigger).toEqual(route.inGame?.completionTrigger);
  });

  it('Defence first: the pace line trains Defence on the cows, then the route comes back as it was written', () => {
    const rep = report();
    const first = withCombatPlan(route, resolvePick(rep, 'defence-first:20', progress(13363, 0))!);
    expect(first.pacing).toMatchObject({ skill: 'defence', targetLevel: 20, actionName: 'cow|cows', expPerAction: 32 });
    expect(first.pacing?.also).toBeUndefined();
    const second = withCombatPlan(route, resolvePick(rep, 'defence-first:20', { xp: { attack: 13363, strength: 2000, defence: 4470 }, held: () => 0 })!);
    expect(second.foes).toEqual(['Hill Giant']);
    expect(second.pacing).toMatchObject({ skill: 'attack', targetExp: 37224, actionName: 'giant|giants', expPerAction: 140 });
  });
});

describe('the whole app reads the same step: food, shopping, arrow, game', () => {
  const rep = report();
  const adopted = withCombatPlan(route, resolvePick(rep, 'split', progress(13363, 0))!);
  const live = { stats: HISTORICAL.stats as Partial<Record<string, number>>, xp: HISTORICAL.xp as Partial<Record<string, number>>, gear: gearOf(HISTORICAL.worn), owned: planInput().owned, combatLog: null };

  it('the food plan is counted for the opponent in hand: a few pieces for the cows, hundreds for the giants', () => {
    const base = foodPicks([route], emptyProgress(), live)['S4-03'];
    const cows = foodPicks([adopted], emptyProgress(), live)['S4-03'];
    expect(base.total).toBeGreaterThan(300);
    expect(cows.total).toBeLessThan(40);
    const planned = withFoodPlan(adopted, cows);
    expect(planned.itemsRequired!.find((i) => i.nameEn === 'Salmon')?.totalAmount ?? 0).toBeLessThan(40);
  });

  it('the game gets the step again once the food plan settles, not when its figures move (live, 2.72.1: the game kept the route’s 25 Salmon)', () => {
    const cows = foodPicks([adopted], emptyProgress(), live)['S4-03'];
    expect(foodPlanApplied(adopted)).toBe(false);
    const planned = withFoodPlan(adopted, cows);
    expect(foodPlanApplied(planned)).toBe(true);
    expect(stepResendKey(planned)).not.toBe(stepResendKey(adopted));
    // A few kills later the figures follow the XP: the same key, so no resend.
    const later = withFoodPlan(adopted, { ...cows, trip: Math.max(1, cows.trip - 1), total: Math.max(1, cows.total - 3) });
    expect(stepResendKey(later)).toBe(stepResendKey(planned));
    // A step without food has nothing to wait for.
    expect(foodPlanApplied({ itemsRequired: [{ nameEn: 'Hammer', amount: 1 }] } as never)).toBe(true);
  });

  it('the shopping list buys what the plan needs, not what the route would', () => {
    const list = (s: Step) => aggregateShopping([s], { wholeGoal: true }).required.find((l) => l.nameEn === 'Salmon')?.count ?? 0;
    const cows = foodPicks([adopted], emptyProgress(), live)['S4-03'];
    const baseNeed = list(withFoodPlan(route, foodPicks([route], emptyProgress(), live)['S4-03']));
    const planNeed = list(withFoodPlan(adopted, cows));
    expect(baseNeed).toBeGreaterThan(300);
    expect(planNeed).toBeLessThan(40);
  });

  it('the arrow and the game get the cows: the place, the NPC, the pace line and the unchanged completion trigger', () => {
    const payload = toInGameTarget(adopted)!;
    expect(payload.stepId).toBe('S4-03');
    expect(payload.worldPoint).toMatchObject({ label: 'The cow field east of Lumbridge' });
    expect(payload.npcNames).toEqual(['Cow']);
    expect(payload.goal).toBe('Cows: Attack 40');
    expect(payload.pacing).toMatchObject({ actionName: 'cow|cows', expPerAction: 32, targetExp: 37224 });
    expect(payload.completionTrigger).toEqual(toInGameTarget(route)!.completionTrigger);
  });

  it('a step the player did not adopt a plan for is the same object as in the data', () => {
    const others = allSteps.filter((s) => s.id !== 'S4-03');
    for (const s of others) expect(withCombatPlan(s, undefined)).toBe(s);
  });
});

describe('what is saved: the choice, never the numbers', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
  };

  it('is kept per profile and character with who chose it; the route chosen by the player is kept, null goes back to the recommendation', () => {
    const { m, s } = store();
    const key = adoptStorageKey('main', 'Funding Test');
    expect(adoptStorageKey('main', 'Other')).not.toBe(key);
    expect(adoptStorageKey('alt', 'Funding Test')).not.toBe(key);
    const map = withAdopted({}, 'S4-03', 'split', 1000);
    saveAdopted(s, key, map);
    expect(loadAdopted(s, key)).toEqual({ 'S4-03': { key: 'split', at: 1000, by: 'player' } });
    // The guide's own choice is written as such.
    expect(withAdopted({}, 'S4-03', 'split', 1000, 'auto')).toEqual({ 'S4-03': { key: 'split', at: 1000, by: 'auto' } });
    // The same choice again is the same map: nothing is written.
    expect(withAdopted(map, 'S4-03', 'split', 5000)).toBe(map);
    // The route as written, chosen by the player, is a choice like any other: the guide must not replace it.
    const route = withAdopted(map, 'S4-03', 'route', 2000);
    expect(route).toEqual({ 'S4-03': { key: 'route', at: 2000, by: 'player' } });
    const back = withAdopted(route, 'S4-03', null, 3000);
    expect(back).toEqual({});
    saveAdopted(s, key, back);
    expect(m.has(key)).toBe(false);
    // Nothing to remove: the same map.
    expect(withAdopted(back, 'S4-03', null, 3000)).toBe(back);
  });

  it('damaged or foreign data is ignored, an older save still loads', () => {
    const { m, s } = store();
    const key = adoptStorageKey('main', 'X');
    m.set(key, '{{');
    expect(loadAdopted(s, key)).toEqual({});
    m.set(key, '[1,2]');
    expect(loadAdopted(s, key)).toEqual({});
    m.set(key, JSON.stringify({ 'S4-03': { key: 'split', at: 5 }, bad: { key: 7, at: 1 }, worse: 'x', long: { key: 'x'.repeat(80), at: 1 } }));
    // An entry from before 2.69 has no "by": it was made with a button, so it is the player's.
    expect(loadAdopted(s, key)).toEqual({ 'S4-03': { key: 'split', at: 5, by: 'player' } });
    m.set(key, JSON.stringify({ 'S4-03': { key: 'split', at: 5, by: 'auto' }, 'S3-08': { key: 'defence-first:10', at: 6, by: 'nonsense' } }));
    expect(loadAdopted(s, key)).toEqual({ 'S4-03': { key: 'split', at: 5, by: 'auto' }, 'S3-08': { key: 'defence-first:10', at: 6, by: 'player' } });
  });
});
