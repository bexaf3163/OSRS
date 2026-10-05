import { describe, expect, it } from 'vitest';
import { planOneTrip, tripWindow, LOOK_AHEAD } from '../src/lib/oneTrip';
import { buildPlayerState } from '../src/lib/playerState';
import { buildPrepRoute, emptyPrep, MAX_DETOUR_DEPTH, openTaskIds, parsePrep, reconcile, startDetour, type DetourFrame } from '../src/lib/prepRoute';
import { stepReadiness, type StepReadiness } from '../src/lib/readiness';
import { allSteps } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import type { Step } from '../src/types';

const item = (nameEn: string, amount: string | number, extra: Record<string, unknown> = {}) => ({ nameEn, amount, howToGet: '', ...extra });
const mk = (id: string, items: ReturnType<typeof item>[]): Step => ({ id, stage: 1, type: 'combat', title: id, requires: [], itemsRequired: items } as unknown as Step);

function owned(items: Record<string, Partial<OwnedItem>>, bankSeen: boolean): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const [name, o] of Object.entries(items)) map.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
  return { bankSeen, items: map };
}
const st = (o: OwnedState | null, coins: { bag: number; bank: number | null } | null = null) =>
  buildPlayerState({
    mode: 'f2p', stats: null, progress: { levels: {} }, owned: o,
    gear: coins ? { equipment: [], inventory: [], coins: coins.bag, bankCoins: coins.bank } : null, questsDone: null,
  });

describe('one trip: the window and the reserve', () => {
  const steps = [
    mk('A1', [item('Lobster', 20), item('Hammer', 1)]),
    mk('A2', [item('Lobster', 20), item('Hammer', 1), item('Silk', 1)]),
    mk('A3', [item('Energy potion', 3)]),
    mk('A4', [item('Coins', 2000)]),
    mk('A5', [item('Rope', 1)]),
  ];

  it('the window — the current step and the next three unclosed ones', () => {
    expect(tripWindow(steps, emptyProgress(), 'A1').map((s) => s.id)).toEqual(['A1', 'A2', 'A3', 'A4']);
    const p = { ...emptyProgress(), steps: { A2: 'done' as const } };
    expect(tripWindow(steps, p, 'A1').map((s) => s.id)).toEqual(['A1', 'A3', 'A4', 'A5']);
    expect(tripWindow(steps, emptyProgress(), 'none')).toEqual([]);
    expect(LOOK_AHEAD).toBe(3);
  });

  it('food adds up, a tool is taken once, what is owned is assigned to the nearest steps', () => {
    const plan = planOneTrip(steps, emptyProgress(), 'A1', st(owned({ Lobster: { carried: 13 }, Hammer: { carried: 1 } }, true)));
    const lobster = plan.lines.find((l) => l.line.nameEn === 'Lobster')!;
    expect(lobster.line.count).toBe(40);
    expect(lobster.toGet).toBe(27);
    expect(lobster.allocation).toEqual([{ stepId: 'A1', need: 20, covered: 13 }, { stepId: 'A2', need: 20, covered: 0 }]);
    expect(lobster.urgency).toBe('NOW');
    const hammer = plan.lines.find((l) => l.line.nameEn === 'Hammer')!;
    expect(hammer.line.count).toBe(1);
    expect(hammer.status).toBe('HAVE');
  });

  it('later does not mean now: Silk is needed by the second step — SOON, the Energy potion by the third — SOON, not NOW', () => {
    const plan = planOneTrip(steps, emptyProgress(), 'A1', st(owned({ Lobster: { carried: 40 }, Hammer: { carried: 1 }, Silk: { carried: 0, bank: 0 }, 'Energy potion': { carried: 0, bank: 0 } }, true)));
    expect(plan.now).toEqual([]);
    expect(plan.soon.map((l) => l.line.nameEn).sort()).toEqual(['Energy potion', 'Silk']);
  });

  it('an item in the bank — BANK ("collect it"), not a purchase; the bank was not opened — UNKNOWN, not "no"', () => {
    const inBank = planOneTrip(steps, emptyProgress(), 'A1', st(owned({ Lobster: { carried: 0, bank: 40 }, Hammer: { carried: 0, bank: 1 } }, true)));
    expect(inBank.lines.find((l) => l.line.nameEn === 'Lobster')).toMatchObject({ status: 'BANK', toGet: 0 });
    const unk = planOneTrip(steps, emptyProgress(), 'A1', st(owned({ Lobster: { carried: 5 } }, false)));
    const l = unk.lines.find((x) => x.line.nameEn === 'Lobster')!;
    expect(l.status).toBe('UNKNOWN');
    expect(l.toGet).toBeNull();
    expect(planOneTrip(steps, emptyProgress(), 'A1', st(null)).lines.every((x) => x.status === 'UNKNOWN')).toBe(true);
    // The unknown is not in the "take" lists: we ask not to look for what we do not know.
    const none = planOneTrip(steps, emptyProgress(), 'A1', st(null));
    expect(none.now).toEqual([]);
    expect(none.unknown.length).toBe(none.lines.length);
  });

  it('coins: bag and bank are known — we count the shortfall; not known — unknown', () => {
    expect(planOneTrip(steps, emptyProgress(), 'A1', st(owned({}, true), { bag: 850, bank: 300 })).coins).toEqual({ need: 2000, have: 1150, missing: 850 });
    expect(planOneTrip(steps, emptyProgress(), 'A1', st(owned({}, true), { bag: 850, bank: null })).coins).toEqual({ need: 2000, have: null, missing: null });
    // Coins in the bag that already cover the need settle it even with the bank not opened.
    expect(planOneTrip(steps, emptyProgress(), 'A1', st(owned({}, true), { bag: 2500, bank: null })).coins).toEqual({ need: 2000, have: 2500, missing: 0 });
  });

  it('on the real route the window is computed without crashes and without duplicate rows', () => {
    for (const s of allSteps) {
      const plan = planOneTrip(allSteps, emptyProgress(), s.id, st(null));
      const keys = plan.lines.map((l) => l.line.key);
      expect(new Set(keys).size, s.id).toBe(keys.length);
      for (const l of plan.lines) expect(l.allocation.every((a) => a.covered <= a.need)).toBe(true);
    }
  });
});

describe('the preparation route and detours', () => {
  const readinessOf = (step: Step, s: ReturnType<typeof st>, stats: Record<string, number> | null = null): StepReadiness =>
    stepReadiness({
      step, steps: [step], progress: emptyProgress(), qp: 0, mode: 'f2p', stats, owned: s.owned,
      gear: null,
    });

  it('ready — no preparation; short — one main item, no more than two after it, the rest collapsed', () => {
    const step = { ...mk('P1', [item('Lobster', 20), item('Hammer', 1), item('Rope', 2)]), requirements: [{ type: 'skill', skill: 'ranged', min: 20 }] } as unknown as Step;
    const ready = buildPrepRoute(readinessOf(step, st(owned({ Lobster: { carried: 20 }, Hammer: { carried: 1 }, Rope: { carried: 2 } }, true)), { ranged: 30 }), step);
    expect(ready.ready).toBe(true);
    expect(ready.primary).toBeNull();
    const need = buildPrepRoute(readinessOf(step, st(owned({ Lobster: { bank: 20 }, Hammer: { carried: 0, bank: 0 }, Rope: { carried: 0, bank: 0 } }, true)), { ranged: 17 }), step);
    expect(need.ready).toBe(false);
    expect(need.primary).not.toBeNull();
    expect(need.next.length).toBeLessThanOrEqual(2);
    expect(need.tasks.map((t) => t.kind)).toEqual(expect.arrayContaining(['bank', 'buy', 'stat']));
    expect(need.returnTo).toBe('P1');
    // Shopping and the bank — one task each, not a row per item.
    expect(need.tasks.filter((t) => t.kind === 'buy')).toHaveLength(1);
    expect(need.tasks.filter((t) => t.kind === 'bank')).toHaveLength(1);
    // Order: the mandatory by priority, levels after items.
    const order = need.tasks.map((t) => t.priority);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('the data disappeared (no connection, a reload) — the task stays open; it is done only by data', () => {
    const step = { ...mk('P3', []), requirements: [{ type: 'skill', skill: 'ranged', min: 20 }] } as unknown as Step;
    const open = (stats: Record<string, number> | null) => openTaskIds(readinessOf(step, st(null), stats), step);
    expect(open({ ranged: 17 }).has('stat:ranged 20')).toBe(true);
    expect(open(null).has('stat:ranged 20')).toBe(true);
    expect(open({ ranged: 20 }).has('stat:ranged 20')).toBe(false);
  });

  it('the bank was not opened — we do not ask to look for what we do not know: no preparation', () => {
    const step = mk('P2', [item('Lobster', 20)]);
    const r = buildPrepRoute(readinessOf(step, st(owned({}, false))), step);
    expect(r.ready).toBe(true);
    expect(r.tasks).toEqual([]);
  });

  const frame = (stepId: string, detourId: string): DetourFrame => ({ sourceStepId: stepId, detourId, reason: 'test', startedAt: 1, returnCondition: 'done' });

  it('detours: the return to the source step, a repeat and a cycle are forbidden, the depth is no more than three', () => {
    let s = emptyPrep();
    const a = startDetour(s, frame('S4-05', 'bank'));
    expect(a.ok).toBe(true);
    s = a.state;
    expect(startDetour(s, frame('S4-05', 'bank'))).toMatchObject({ ok: false, reason: 'CYCLE' });
    s = (startDetour(s, frame('S4-05', 'stat:ranged 20')) as { state: typeof s }).state;
    s = (startDetour(s, frame('S4-05', 'buy')) as { state: typeof s }).state;
    expect(s.stack).toHaveLength(MAX_DETOUR_DEPTH);
    expect(startDetour(s, frame('S4-05', 'money'))).toMatchObject({ ok: false, reason: 'DEPTH' });
    // The top one is done — it is removed, we return to the source step; the rest stays.
    const open = (ids: string[]) => () => new Set(ids);
    const r1 = reconcile(s, open(['bank', 'stat:ranged 20']));
    expect(r1.state.stack.map((f) => f.detourId)).toEqual(['bank', 'stat:ranged 20']);
    expect(r1.state.done).toContain('S4-05:buy');
    expect(r1.returnTo).toBe('S4-05');
    // All done — the stack is empty, the return to the step.
    const r2 = reconcile(s, open([]));
    expect(r2.state.stack).toEqual([]);
    expect(r2.returnTo).toBe('S4-05');
    // What is done is not offered a second time.
    expect(startDetour(r2.state, frame('S4-05', 'bank'))).toMatchObject({ ok: false, reason: 'DONE_BEFORE' });
    // The readiness of the step is unknown — the detour stays.
    expect(reconcile(s, () => null).state.stack).toHaveLength(3);
  });

  it('storage: garbage — an empty state, and a normal record survives a restart', () => {
    expect(parsePrep(null)).toEqual(emptyPrep());
    expect(parsePrep('{{{')).toEqual(emptyPrep());
    expect(parsePrep(JSON.stringify({ stack: [1, null, { x: 1 }], done: [5, 'a'] }))).toEqual({ stack: [], done: ['a'] });
    const s = startDetour(emptyPrep(), frame('S1-01', 'bank')).state;
    expect(parsePrep(JSON.stringify(s))).toEqual(s);
  });
});
