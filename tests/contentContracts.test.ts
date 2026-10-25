// Content contracts (hardening, 2.78.1): new or renamed content inherits the engines' rules with no production change. Every step here is synthetic and
// exists only in this test; the rules it meets are the production ones (prepPlan, readinessVerdict, the training ranking).

import { describe, expect, it } from 'vitest';
import { buildPrepPlan, type PrepPlan } from '../src/lib/prepPlan';
import { buildPlayerState } from '../src/lib/playerState';
import { planOneTrip } from '../src/lib/oneTrip';
import { readinessOf } from '../src/lib/readiness';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { readinessVerdict } from '../src/lib/readinessVerdict';
import { adviseTraining, trainingMethods } from '../src/lib/trainingRouter';
import { protectionsFor } from '../src/lib/funding/snapshot';
import { withTrainingMethod } from '../src/lib/methodStep';
import { withFoodPlan } from '../src/lib/foodPlan';
import type { Step } from '../src/types';

type Have = { carried?: number; noted?: number; bank?: number };
const owned = (items: Record<string, Have>, bankSeen = true): OwnedState => ({
  bankSeen,
  items: new Map(Object.entries(items).map(([name, h]) => [nameKey(name), { name, carried: h.carried ?? 0, noted: h.noted ?? 0, bank: bankSeen ? h.bank ?? 0 : undefined } as OwnedItem])),
});
const item = (nameEn: string, amount: number, extra: Record<string, unknown> = {}) => ({ nameEn, amount, howToGet: '', ...extra });
const step = (id: string, items: ReturnType<typeof item>[], extra: Record<string, unknown> = {}): Step =>
  ({ id, stage: 1, type: 'quest', title: 'A synthetic encounter', requires: [], itemsRequired: items, ...extra } as unknown as Step);
const stateOf = (o: OwnedState | null, equipment: { name: string; slot: string }[] = []) => buildPlayerState({
  mode: 'f2p', stats: null, progress: { levels: {} }, owned: o,
  gear: o ? { equipment: equipment.map((e, i) => ({ id: 9000 + i, ...e })), inventory: [], coins: 100, bankCoins: o.bankSeen ? 0 : null } as never : null, questsDone: null, connected: o !== null,
});
function planFor(s: Step, o: OwnedState | null, equipment: { name: string; slot: string }[] = []): PrepPlan {
  const st = stateOf(o, equipment);
  const progress = emptyProgress();
  return buildPrepPlan({ step: s, steps: [s], progress, state: st, trip: planOneTrip([s], progress, s.id, st), readiness: readinessOf(s, { steps: [s], progress, qp: 0, mode: 'f2p', state: st }), detail: () => undefined });
}
const isFood = (n: string) => ['trout', 'lobster'].includes(n.toLowerCase());
const verdict = (s: Step, o: OwnedState | null) => readinessVerdict({ plan: planFor(s, o), connected: o !== null, owned: o, isFood, now: 10_000_000_000 });
const lineOf = (p: PrepPlan, name: string) => p.lines.find((l) => l.name === name)!;

describe('a renamed step keeps its rules', () => {
  it('the same facts under another code give the same preparation and verdict', () => {
    const facts = [item('Anti-dragon shield', 1), item('Lobster', 10, { heals: 12 })];
    const o = owned({ 'Anti-dragon shield': { bank: 1 }, Lobster: { carried: 4, bank: 10 } });
    const a = planFor(step('S5-08', facts, { threats: ['Elvarg'] }), o);
    const b = planFor(step('S42-17', facts, { threats: ['Elvarg'] }), o);
    // Only the code itself may differ (the plan names the step it is for).
    const strip = (p: PrepPlan, id: string) => JSON.stringify(p).split(`"${id}"`).join('"<code>"');
    expect(strip(b, 'S42-17')).toBe(strip(a, 'S5-08'));
    expect(b.blockers.map((x) => x.label)).toEqual(a.blockers.map((x) => x.label));
  });
});

describe('a new encounter with a supported hazard gets its safety check', () => {
  const dragon = (id = 'S99-01') => step(id, [item('Anti-dragon shield', 1)], { threats: ['Elvarg'] });
  it('missing: a hard block with the opponent\'s own hit; in the bank: "in the bank"; carried: none', () => {
    const missing = planFor(dragon(), owned({ 'Anti-dragon shield': {} }));
    expect(missing.blockers.find((b) => b.label === 'No Anti-dragon shield with you')?.detail).toMatch(/dragonfire hits up to 70/);
    expect(planFor(dragon(), owned({ 'Anti-dragon shield': { bank: 1 } })).blockers[0]?.label).toBe('Anti-dragon shield is in the bank, not with you');
    expect(planFor(dragon(), owned({ 'Anti-dragon shield': { carried: 1 } })).blockers).toEqual([]);
  });
  it('a fight without the hazard gets no such rule, whatever its code', () => {
    expect(planFor(step('S5-08', [item('Anti-dragon shield', 1)]), owned({ 'Anti-dragon shield': {} })).safety).toEqual([]);
  });
  it('an unread bank is not "missing": no block is claimed', () => {
    expect(planFor(dragon(), owned({}, false)).blockers).toEqual([]);
  });
});

describe('quantities are physical', () => {
  it('noted food cannot be eaten: it must be unnoted at a bank, and the step is not ready', () => {
    const s = step('S99-02', [item('Lobster', 10, { heals: 12 })]);
    const p = planFor(s, owned({ Lobster: { noted: 10 } }));
    expect(lineOf(p, 'Lobster').unnote).toBe(10);
    expect(verdict(s, owned({ Lobster: { noted: 10 } })).level).not.toBe('READY');
  });
  it('a worn tool is counted once, not again as carried', () => {
    const s = step('S99-03', [item('Bronze pickaxe', 2)]);
    const p = planFor(s, owned({ 'Bronze pickaxe': { carried: 1 } }), [{ name: 'Bronze pickaxe', slot: 'weapon' }]);
    expect(lineOf(p, 'Bronze pickaxe').where).not.toBe('EQUIPPED');
    expect(verdict(s, owned({ 'Bronze pickaxe': { carried: 1 } })).level).not.toBe('READY');
  });
  it('banked supplies are withdrawn, never bought again', () => {
    const p = planFor(step('S99-04', [item('Lobster', 10, { heals: 12 })]), owned({ Lobster: { bank: 25 } }));
    expect(lineOf(p, 'Lobster').action?.kind).toBe('TAKE');
    expect(p.now.some((l) => l.action?.kind === 'BUY')).toBe(false);
  });
});

describe('missing facts never read as ready', () => {
  it('an item with the bank unread and not in the bag is unknown, and the verdict is not a confident Ready', () => {
    const s = step('S99-05', [item('Lobster', 10, { heals: 12 })]);
    expect(lineOf(planFor(s, owned({}, false)), 'Lobster').where).toBe('UNKNOWN');
    expect(verdict(s, owned({}, false)).level).not.toBe('READY');
  });
  it('without the game nothing is ready', () => {
    expect(verdict(step('S99-06', [item('Lobster', 10, { heals: 12 })]), null).level).not.toBe('READY');
  });
});

describe('account mode removes what the account cannot use', () => {
  it('a free account is never recommended a members training method, in any free skill', () => {
    const skills = [...new Set(trainingMethods.filter((m) => !m.members).flatMap((m) => m.skills))];
    for (const skill of skills) for (const level of [1, 30, 60, 90]) {
      const state = buildPlayerState({ mode: 'f2p', stats: null, progress: { ...emptyProgress(), levels: { [skill]: level } }, owned: null, gear: null, questsDone: null, connected: false });
      const best = adviseTraining({ skill, target: Math.min(99, level + 5), state, mode: 'f2p', style: 'chill', priority: 'balanced' }).best;
      expect(best?.method.members ?? false, `${skill} ${level}: ${best?.method.id}`).toBe(false);
    }
  });
});

describe('changing an adopted plan changes what is prepared and kept', () => {
  // The store composes every step the same way (store.tsx: withFoodPlan(withTrainingMethod(withCombatPlan(...)))) and the reserves and the
  // preparation read that one composed step: a change of plan reaches both with no second list to keep in step.
  const fishing = step('S99-07', [], { followsMethod: 'fishing', inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'fishing', level: 50 }] } } });
  const o = owned({ 'Small fishing net': { bank: 1 }, 'Fly fishing rod': { bank: 1 }, Feather: { bank: 500 } });
  it('another training method: its tools are kept and prepared, the old method tools are not', () => {
    const net = withTrainingMethod(fishing, 'fi-shrimp');
    const fly = withTrainingMethod(fishing, 'fi-fly');
    expect(protectionsFor([net]).has('small fishing net')).toBe(true);
    expect(protectionsFor([net]).has('fly fishing rod')).toBe(false);
    expect(protectionsFor([fly]).has('fly fishing rod')).toBe(true);
    expect(protectionsFor([fly]).has('small fishing net')).toBe(false);
    expect(planFor(fly, o).lines.map((l) => l.name)).toEqual(expect.arrayContaining(['Fly fishing rod']));
    expect(planFor(fly, o).lines.some((l) => l.name === 'Small fishing net')).toBe(false);
  });
  it('another food plan: the bag takes the trip, the reserve keeps the whole goal, and no food leaves nothing kept', () => {
    const fight = step('S99-08', [item('Lobster', 10, { heals: 12 })]);
    const planned = withFoodPlan(fight, { trip: 6, total: 40, hpPerKill: 2 });
    expect(planFor(planned, owned({ Lobster: { bank: 60 } })).lines.find((l) => l.name === 'Lobster')?.count).toBe(6);
    expect(protectionsFor([planned]).get('lobster')?.qty).toBe(40);
    expect(protectionsFor([withFoodPlan(fight, { trip: 0, total: 0, hpPerKill: 0 })]).has('lobster')).toBe(false);
  });
});
