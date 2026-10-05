import { describe, expect, it } from 'vitest';
import { allSteps, items, allStages } from '../src/data';
import { emptyProgress, withOwnedManual, withStep } from '../src/lib/progress';
import { nearestBank, stepReadiness, type ReadinessInput } from '../src/lib/readiness';
import { validate } from '../scripts/validate';
import type { Progress, Step } from '../src/types';

const step = (id: string) => allSteps.find((s) => s.id === id)!;
const done = (ids: string[], p: Progress = emptyProgress()) => ids.reduce((acc, id) => withStep(acc, id, 'done'), p);
/** Everything before the step is closed — only its own requirements remain. */
const before = (id: string) => done(allSteps.slice(0, allSteps.findIndex((s) => s.id === id)).map((s) => s.id));
const input = (s: Step, over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  step: s, steps: allSteps, progress: before(s.id), qp: 200, mode: 'members', stats: null, owned: null, gear: null, ...over,
});
const owned = (items: Record<string, { carried?: number; bank?: number }>, bankSeen = true) => ({
  bankSeen,
  items: new Map(Object.entries(items).map(([n, v]) => [n.toLowerCase(), { name: n, carried: v.carried ?? 0, noted: 0, ...(v.bank !== undefined ? { bank: v.bank } : {}) }])),
});

describe('step readiness', () => {
  it('levels: short — MISSING_STATS with "catch up"; enough — READY; unknown — not "no"', () => {
    const s = step('S9-01'); // Lost City: Crafting 31, Woodcutting 36
    const low = stepReadiness(input(s, { stats: { crafting: 28, woodcutting: 40 } }));
    expect(low.status).toBe('MISSING_STATS');
    expect(low.problems[0]).toMatchObject({ kind: 'skill', label: 'Crafting 31', state: 'MISSING', action: { kind: 'link', href: '#/skills/CR' } });
    expect(low.problems[0].detail).toContain('3 short');
    const ok = stepReadiness(input(s, { stats: { crafting: 31, woodcutting: 36 } }));
    expect(ok.problems).toEqual([]);
    expect(ok.requirements.filter((r) => r.kind === 'skill').map((r) => r.state)).toEqual(['OK', 'OK']);
    const unknown = stepReadiness(input(s));
    expect(unknown.status).toBe('UNKNOWN');
    expect(unknown.problems).toEqual([]);
    expect(unknown.unknown.filter((r) => r.kind === 'skill').map((r) => r.label)).toEqual(['Crafting 31', 'Woodcutting 36']);
  });

  it('the game level wins over the one entered in the profile', () => {
    const s = step('S9-01');
    let p = before(s.id);
    p = { ...p, levels: { ...p.levels, crafting: 40, woodcutting: 40 } };
    expect(stepReadiness(input(s, { progress: p })).problems).toEqual([]);
    const r = stepReadiness(input(s, { progress: p, stats: { crafting: 20, woodcutting: 40 } }));
    expect(r.status).toBe('MISSING_STATS');
    expect(r.problems[0].source).toBe('game');
  });

  it('a level "during the quest" does not stop you from starting: only preparation', () => {
    const r = stepReadiness(input(step('S7-05'), { stats: { agility: 20 } })); // The Grand Tree: Agility 25 during the quest
    expect(r.status).toBe('MINOR_PREP');
    expect(r.problems[0]).toMatchObject({ label: 'Agility 25', hard: false });
  });

  it('quest: not marked — MISSING_QUEST with a link to the quest step; marked — ok', () => {
    const s = step('S8-02'); // Nature Spirit: Priest in Peril, The Restless Ghost
    const p = withStep(before(s.id), 'S8-01', null);
    const r = stepReadiness(input(s, { progress: p }));
    expect(r.status).toBe('BLOCKED'); // S8-01 is also in requires
    expect(r.problems.map((x) => x.kind)).toEqual(['step', 'quest']);
    expect(r.problems[1]).toMatchObject({ label: 'Priest in Peril', action: { href: '#/step/S8-01' } });
    expect(stepReadiness(input(s)).problems).toEqual([]);
  });

  it('a quest without a step in requires: MISSING_QUEST', () => {
    const s = step('S9-05'); // Cook's Assistant — S1-03
    const p = withStep(before(s.id), 'S1-03', null);
    const r = stepReadiness(input(s, { progress: p, stats: { cooking: 15 } }));
    expect(r.status).toBe('MISSING_QUEST');
  });

  it('items: in the bag — ok; in the bank — "to the bank" with a goal that clears when the item is in the bag; none — to the shopping list', () => {
    const s = allSteps.find((x) => x.itemsRequired?.some((i) => !i.inStep && i.wikiItemId !== 995 && i.amount === 1))!;
    const it = s.itemsRequired!.filter((i) => !i.inStep && i.wikiItemId !== 995)[0];
    const others = Object.fromEntries(s.itemsRequired!.filter((i) => !i.inStep && i !== it).map((i) => [i.nameEn, { carried: 1000, bank: 0 }]));
    const gear = { equipment: [], inventory: [], coins: 100_000, bankCoins: 0 };
    const inBag = stepReadiness(input(s, { gear, owned: owned({ ...others, [it.nameEn]: { carried: 5, bank: 0 } }) }));
    expect(inBag.requirements.find((r) => r.label.startsWith(it.nameEn))?.state).toBe('OK');
    const inBank = stepReadiness(input(s, { gear, owned: owned({ ...others, [it.nameEn]: { carried: 0, bank: 5 } }) }));
    const row = inBank.problems.find((r) => r.label.startsWith(it.nameEn))!;
    expect(row.state).toBe('BANK');
    expect(row.action).toMatchObject({ kind: 'nav', target: { itemName: it.nameEn, stepId: s.id } });
    expect(inBank.status).toBe('MINOR_PREP');
    const none = stepReadiness(input(s, { gear, owned: owned({ ...others, [it.nameEn]: { carried: 0, bank: 0 } }) }));
    expect(none.status).toBe('MISSING_ITEM');
    expect(none.problems[0].action).toMatchObject({ href: '#/shopping' });
  });

  it('the bank is not open — the item is "not checked", not "no"; the manual "already have" mark counts', () => {
    const s = allSteps.find((x) => x.itemsRequired?.some((i) => !i.inStep && i.wikiItemId !== undefined && i.wikiItemId !== 995))!;
    const it = s.itemsRequired!.find((i) => !i.inStep && i.wikiItemId !== undefined && i.wikiItemId !== 995)!;
    const r = stepReadiness(input(s, { owned: owned({ [it.nameEn]: { carried: 0 } }, false) }));
    expect(r.requirements.find((x) => x.label.startsWith(it.nameEn))?.state).toBe('UNKNOWN');
    const p = withOwnedManual(before(s.id), `id:${it.wikiItemId}`, 999);
    expect(stepReadiness(input(s, { progress: p })).requirements.find((x) => x.label.startsWith(it.nameEn))).toMatchObject({ state: 'OK', source: 'manual' });
  });

  it('coins: enough with the bank — take; not enough — MISSING_MONEY; without the game — not checked', () => {
    const s = allSteps.find((x) => x.itemsRequired?.some((i) => i.wikiItemId === 995 && !i.inStep));
    if (!s) return;
    const need = Number(String(s.itemsRequired!.find((i) => i.wikiItemId === 995)!.amount).replace(/\D/g, ''));
    const other = s.itemsRequired!.filter((i) => !i.inStep && i.wikiItemId !== 995);
    const all = owned(Object.fromEntries(other.map((i) => [i.nameEn, { carried: 1000, bank: 0 }])));
    const coins = (bag: number, bank: number | null) => stepReadiness(input(s, { owned: all, gear: { equipment: [], inventory: [], coins: bag, bankCoins: bank } }));
    expect(coins(need, 0).status).toBe('READY');
    expect(coins(0, need).problems[0]).toMatchObject({ kind: 'coins', state: 'BANK' });
    expect(coins(0, 0).status).toBe('MISSING_MONEY');
    expect(coins(0, 0).problems[0].action).toMatchObject({ kind: 'link', href: expect.stringMatching(/^#\/step\/S(1-13|3-06)$/) });
    expect(coins(0, null).unknown[0]).toMatchObject({ kind: 'coins', state: 'UNKNOWN' });
  });

  it('a step-training with the goal already reached: no need to train again', () => {
    const s = step('S1-08'); // Woodcutting 15, Firemaking 15
    const r = stepReadiness(input(s, { stats: { woodcutting: 50, firemaking: 20 } }));
    expect(r.goalMet?.map((g) => g.skill)).toEqual(['Woodcutting', 'Firemaking']);
    expect(stepReadiness(input(s, { stats: { woodcutting: 50, firemaking: 10 } })).goalMet).toBeUndefined();
    // The level is unknown — we do not claim the goal is met.
    expect(stepReadiness(input(s, { stats: { woodcutting: 50 } })).goalMet).toBeUndefined();
  });

  it('the nearest bank to the step — from the place dictionary', () => {
    expect(nearestBank(step('S2-07'))?.label).toMatch(/Bank/);
  });

  it('check-data catches a mismatch of the requirements with the "Requirements" field and a quest not from the route', () => {
    const route = { steps: allSteps, stages: allStages, items };
    expect(validate(null, route).lines.some((l) => l.includes('✓ Step requirements'))).toBe(true);
    const broken = allSteps.map((s) => (s.id === 'S9-01' ? { ...s, requirements: [{ type: 'skill' as const, skill: 'crafting', min: 30 }] } : s));
    const r = validate(null, { ...route, steps: broken });
    expect(r.lines.join('\n')).toMatch(/Crafting 30" is not in the "Requirements" field|Woodcutting 36" from the "Requirements" field is not in requirements/);
    const ghost = allSteps.map((s) => (s.id === 'S9-04' ? { ...s, requirements: [...s.requirements!, { type: 'quest' as const, quest: 'Recipe for Disaster' }] } : s));
    expect(validate(null, { ...route, steps: ghost }).lines.join('\n')).toContain('is not from the route');
  });
});
