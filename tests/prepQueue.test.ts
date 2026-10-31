import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { emptyProgress, withStep } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { contextOf, type ReadinessInput } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { decideAuto, RENAV_GAP_MS, buildQueue, type AutoInput, type PrepQueue } from '../src/lib/prepQueue';
import type { RequirementStatus, StepReadiness } from '../src/lib/readiness';
import { buildPrepRoute, emptyPrep, navKeyOf, reconcile, staleArrows, startDetour, type PrepState } from '../src/lib/prepRoute';
import { preflightItems, type OwnedState } from '../src/lib/checklist';

const step = (id: string) => allSteps.find((s) => s.id === id)!;
const done = (ids: string[]) => ids.reduce((p, id) => withStep(p, id, 'done'), emptyProgress());
const before = (id: string) => done(allSteps.slice(0, allSteps.findIndex((x) => x.id === id)).map((x) => x.id));

/** A step with items that are taken along — for the "bank", "purchase" scenarios. */
const itemStep = allSteps.find((s) => preflightItems(s).some((i) => i.id !== 995 && i.count === 1))!;
const needed = preflightItems(itemStep).find((i) => i.id !== 995 && i.count === 1)!;
const others = Object.fromEntries(preflightItems(itemStep).filter((i) => i !== needed).map((i) => [i.nameEn.toLowerCase(), { name: i.nameEn, carried: 1000, noted: 0, bank: 0 }]));

function engineFor(over: Partial<ReadinessInput> & { item?: { carried: number; bank?: number } | null; bankSeen?: boolean } = {}) {
  const owned: OwnedState | null = over.item === null ? null : {
    bankSeen: over.bankSeen ?? true,
    items: new Map([...Object.entries(others), [needed.nameEn.toLowerCase(), { name: needed.nameEn, carried: over.item?.carried ?? 0, noted: 0, ...(over.item?.bank !== undefined ? { bank: over.item.bank } : { bank: 0 }) }]]),
  };
  // A confirmed-empty generic tool means every usable tracked tier was checked, not just bronze.
  for (const name of needed.alt ?? []) owned?.items.set(name.toLowerCase(), { name, carried: 0, noted: 0, ...(owned.bankSeen ? { bank: 0 } : {}) });
  const input: ReadinessInput = {
    step: itemStep, steps: allSteps, progress: before(itemStep.id), qp: 200, mode: 'members', stats: { attack: 99 }, owned,
    gear: { equipment: [], inventory: [], coins: 1_000_000, bankCoins: 0 }, ...over,
  };
  const ctx = contextOf(input);
  return createReadinessEngine({ ...ctx, state: buildPlayerState({ mode: 'members', stats: input.stats, progress: input.progress, owned, gear: input.gear, questsDone: null, connected: true }) });
}

const base = (queue: PrepQueue | null, over: Partial<AutoInput> = {}): AutoInput => ({
  queue, stepId: itemStep.id, prep: emptyPrep(), enabled: true, online: true, navActive: false, announce: 'full', now: 1_000_000,
  recent: new Map(), declined: new Set(), ...over,
});

describe('unknown required facts never complete preparation or invent a detour', () => {
  it.each(['skill', 'quest', 'item', 'coins', 'qp', 'mode', 'step'] as const)('%s remains unverified without navigation or purchases', kind => {
    const p: RequirementStatus = { kind, label: 'Future requirement', state: 'UNKNOWN', hard: true };
    const r: StepReadiness = { stepId: itemStep.id, status: 'UNKNOWN', requirements: [p], problems: [], unknown: [p] };
    const route = buildPrepRoute(r, itemStep);
    expect(route.ready).toBe(false);
    expect(route.tasks).toEqual([]);
    const e = engineFor({ item: { carried: 0, bank: 1 } });
    const q = buildQueue(route, { state: e.ctx.state, mode: 'f2p', style: 'chill' });
    expect(decideAuto(base(q))).toBeNull();
    const started = decideAuto(base(e.queue(itemStep, 'chill')));
    if (started?.kind !== 'start') throw new Error('bank fixture did not start');
    expect(decideAuto(base(q, { prep: started.state }))).toBeNull();
    expect(started.state.stack).toHaveLength(1);
    const optional = { ...p, hard: false };
    expect(buildPrepRoute({ ...r, requirements: [optional], unknown: [optional] }, itemStep).ready).toBe(true);
  });
});

describe('the preparation auto-queue', () => {
  it('an item in the bank: the queue starts a detour by itself and sets the arrow to the bank', () => {
    const e = engineFor({ item: { carried: 0, bank: 5 } });
    const q = e.queue(itemStep, 'chill');
    expect(q.ready).toBe(false);
    expect(q.tasks[0]).toMatchObject({ kind: 'bank', guide: { kind: 'nav' } });
    const d = decideAuto(base(q));
    expect(d?.kind).toBe('start');
    if (d?.kind !== 'start') throw new Error('no decision');
    expect(d.frame).toMatchObject({ sourceStepId: itemStep.id, detourId: 'bank' });
    expect(d.state.stack).toHaveLength(1);
  });

  it('there is no item at all: the arrow to the Grand Exchange for this item', () => {
    const e = engineFor({ item: { carried: 0, bank: 0 } });
    const q = e.queue(itemStep, 'chill');
    const buy = q.tasks.find((t) => t.kind === 'buy')!;
    expect(buy.guide).toMatchObject({ kind: 'nav', target: { itemName: needed.nameEn } });
    const d = decideAuto(base(q));
    expect(d?.kind).toBe('start');
  });

  it('turned off, no connection or the arrow is already set — it does not interfere', () => {
    const q = engineFor({ item: { carried: 0, bank: 5 } }).queue(itemStep, 'chill');
    expect(decideAuto(base(q, { enabled: false }))).toBeNull();
    expect(decideAuto(base(q, { online: false }))).toBeNull();
    expect(decideAuto(base(q, { navActive: true }))).toBeNull();
    expect(decideAuto(base(null))).toBeNull();
  });

  it('the step is ready — no queue', () => {
    const e = engineFor({ item: { carried: 10, bank: 0 } });
    const q = e.queue(itemStep, 'chill');
    expect(q.ready).toBe(true);
    expect(decideAuto(base(q))).toBeNull();
  });

  it('no data ("not checked") — silent: the unknown does not start detours', () => {
    const e = engineFor({ item: null, stats: null, gear: null });
    const q = e.queue(itemStep, 'chill');
    expect(decideAuto(base(q, { online: false }))).toBeNull();
    // Even with "online" the unchecked is not "short": there are no tasks.
    expect(q.tasks.length).toBe(0);
  });

  it('the player\'s refusal: the same is not offered again in this session', () => {
    const q = engineFor({ item: { carried: 0, bank: 5 } }).queue(itemStep, 'chill');
    expect(decideAuto(base(q, { declined: new Set([`${itemStep.id}:bank`]) }))).toBeNull();
  });

  it('the player removed the arrow (pause) — the queue is silent', () => {
    const q = engineFor({ item: { carried: 0, bank: 5 } }).queue(itemStep, 'chill');
    const started = startDetour(emptyPrep(), { sourceStepId: itemStep.id, detourId: 'bank', reason: 'x', startedAt: 1, returnCondition: 'y' });
    if (!started.ok) throw new Error('did not start');
    const paused: PrepState = { ...started.state, stack: started.state.stack.map((f) => ({ ...f, paused: true })) };
    expect(decideAuto(base(q, { prep: paused }))).toBeNull();
  });

  it('while a skill plan leads the game the quest route waits: no purchase arrow, and an arrow a detour set itself is taken down', () => {
    // The live report (2.78.2): Defence tracked on the frogs, and the game said "Buy Anti-dragon shield" for the next quest step.
    const q = engineFor({ item: { carried: 0, bank: 0 } }).queue(itemStep, 'chill');
    expect(decideAuto(base(q, { routeWaits: true }))).toBeNull();
    const started = startDetour(emptyPrep(), { sourceStepId: itemStep.id, detourId: 'buy', reason: 'x', startedAt: 1, returnCondition: 'y' });
    if (!started.ok) throw new Error('did not start');
    const target = q.tasks.find((t) => t.kind === 'buy')!.guide as { kind: 'nav'; target: { x: number; y: number; plane: number; label: string; itemName?: string } };
    const own = { ...started.state, stack: started.state.stack.map((f) => ({ ...f, nav: navKeyOf(target.target) })) };
    expect(decideAuto(base(q, { routeWaits: true, prep: own, navActive: true, standing: target.target }))?.kind).toBe('release');
    // The player's own arrow (somewhere else) stays.
    expect(decideAuto(base(q, { routeWaits: true, prep: own, navActive: true, standing: { x: 1, y: 2 } }))).toBeNull();
  });

  it('a detour is running, the plugin removed the arrow, the task is open — we set it again, but no more than once a minute', () => {
    const q = engineFor({ item: { carried: 0, bank: 5 } }).queue(itemStep, 'chill');
    const started = startDetour(emptyPrep(), { sourceStepId: itemStep.id, detourId: 'bank', reason: 'x', startedAt: 1, returnCondition: 'y' });
    if (!started.ok) throw new Error('did not start');
    const first = decideAuto(base(q, { prep: started.state }));
    expect(first?.kind).toBe('renav');
    if (first?.kind !== 'renav') throw new Error('no decision');
    const recent = new Map([[first.key, 1_000_000]]);
    expect(decideAuto(base(q, { prep: started.state, recent, now: 1_000_000 + 1000 }))).toBeNull();
    expect(decideAuto(base(q, { prep: started.state, recent, now: 1_000_000 + RENAV_GAP_MS + 1 }))?.kind).toBe('renav');
    // While the arrow is set, we do nothing.
    expect(decideAuto(base(q, { prep: started.state, navActive: true }))).toBeNull();
  });

  it('the queue goes on by itself: took from the bank — the detour is removed, the next task starts', () => {
    // First the item is in the bank; after "took" the task is closed, the detour is removed, the queue is empty — the preparation is ready.
    const e1 = engineFor({ item: { carried: 0, bank: 5 } });
    const q1 = e1.queue(itemStep, 'chill');
    const d = decideAuto(base(q1));
    if (d?.kind !== 'start') throw new Error('no start');
    const e2 = engineFor({ item: { carried: 5, bank: 0 } });
    const res = reconcile(d.state, (id) => e2.openTasks(id));
    expect(res.state.stack).toEqual([]);
    expect(res.returnTo).toBe(itemStep.id);
    expect(decideAuto(base(e2.queue(itemStep, 'chill'), { prep: res.state }))).toBeNull();
  });

  it('the calm style is silent about tasks without a place, the efficient one reports "next"', () => {
    // A step blocked by a level: the task has no place if the method has no point in the dictionary.
    const s = step('S9-01');
    const input: ReadinessInput = { step: s, steps: allSteps, progress: before(s.id), qp: 200, mode: 'members', stats: { crafting: 5, woodcutting: 40 }, owned: null, gear: null };
    const ctx = contextOf(input);
    const e = createReadinessEngine({ ...ctx, state: buildPlayerState({ mode: 'members', stats: input.stats, progress: input.progress, owned: null, gear: null, questsDone: null, connected: true }) });
    const q = e.queue(s, 'chill');
    expect(q.tasks[0]).toMatchObject({ kind: 'stat' });
    const quiet = decideAuto({ ...base(q, { stepId: s.id }), announce: 'quiet' });
    const full = decideAuto({ ...base(q, { stepId: s.id }), announce: 'full' });
    if (q.tasks[0].guide) {
      expect(quiet?.kind).toBe('start');
    } else {
      expect(quiet).toBeNull();
      expect(full?.kind).toBe('announce');
    }
  });

  it('the queue does not step on without data: buildQueue does not invent places', () => {
    const e = engineFor({ item: { carried: 0, bank: 0 } });
    const route = e.prep(itemStep);
    const q = buildQueue(route, { state: e.ctx.state, mode: 'members', style: 'chill' });
    for (const t of q.tasks) if (t.guide) expect(t.guide.kind).toBe('nav');
  });
});

describe('an arrow the queue set for a task that has since changed (the live check: a stale "buy a lobster pot" after the method changed)', () => {
  const frameFor = (q: PrepQueue, over: Partial<PrepState['stack'][number]> = {}): PrepState => {
    const started = startDetour(emptyPrep(), { sourceStepId: itemStep.id, detourId: q.tasks[0].id, reason: 'x', startedAt: 1, returnCondition: 'y', ...over });
    if (!started.ok) throw new Error('did not start');
    return started.state;
  };
  const guide = (q: PrepQueue) => {
    const g = q.tasks[0].guide;
    if (g?.kind !== 'nav') throw new Error('no arrow');
    return g.target;
  };

  it('a detour remembers the arrow it set', () => {
    const q = engineFor({ item: { carried: 0, bank: 5 } }).queue(itemStep, 'chill');
    const d = decideAuto(base(q));
    if (d?.kind !== 'start') throw new Error('no start');
    expect(d.frame.nav).toBe(navKeyOf(guide(q)));
  });

  it('the task now leads elsewhere while its own arrow stands: the arrow is moved', () => {
    const q = engineFor({ item: { carried: 0, bank: 5 } }).queue(itemStep, 'chill');
    const target = guide(q);
    const old = { x: target.x + 40, y: target.y, itemName: 'Lobster pot' };
    const prep = frameFor(q, { nav: navKeyOf(old) });
    const d = decideAuto(base(q, { prep, navActive: true, standing: old }));
    expect(d?.kind).toBe('retarget');
    if (d?.kind !== 'retarget') throw new Error('no decision');
    expect(d.frame).toBe(prep.stack[0]);
    // The same arrow and the same task: nothing to do.
    expect(decideAuto(base(q, { prep: frameFor(q, { nav: navKeyOf(target) }), navActive: true, standing: target }))).toBeNull();
  });

  it('an arrow the player or another tool set is never taken over', () => {
    const q = engineFor({ item: { carried: 0, bank: 5 } }).queue(itemStep, 'chill');
    const target = guide(q);
    const mine = { x: target.x + 40, y: target.y, itemName: 'Lobster pot' };
    const theirs = { x: 3100, y: 3100, itemName: null };
    const prep = frameFor(q, { nav: navKeyOf(mine) });
    expect(decideAuto(base(q, { prep, navActive: true, standing: theirs }))).toBeNull();
    // A frame from an older version has no memory of its arrow: also left alone.
    expect(decideAuto(base(q, { prep: frameFor(q), navActive: true, standing: mine }))).toBeNull();
  });

  it('a detour that went away without its task being done leaves its arrow to be taken down; a done one does not', () => {
    const q = engineFor({ item: { carried: 0, bank: 5 } }).queue(itemStep, 'chill');
    const target = guide(q);
    const before = frameFor(q, { nav: navKeyOf(target) });
    const gone: PrepState = { stack: [], done: [] };
    expect(staleArrows(before, gone, target)).toBe(true);
    // The plugin cleared the arrow (the item was taken): nothing stands.
    expect(staleArrows(before, gone, null)).toBe(false);
    // Another arrow is standing: not this detour's.
    expect(staleArrows(before, gone, { x: 1, y: 2, itemName: null })).toBe(false);
    // The detour is still there.
    expect(staleArrows(before, before, target)).toBe(false);
  });
});
