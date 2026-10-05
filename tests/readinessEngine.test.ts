import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { emptyProgress, withStep } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { contextOf, readinessOf, fixChain, type ReadinessInput } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { buildPrepRoute } from '../src/lib/prepRoute';
import { planOneTrip } from '../src/lib/oneTrip';

const step = (id: string) => allSteps.find((s) => s.id === id)!;
const done = (ids: string[]) => ids.reduce((p, id) => withStep(p, id, 'done'), emptyProgress());
const input = (s: string, over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  step: step(s), steps: allSteps, progress: done(allSteps.slice(0, allSteps.findIndex((x) => x.id === s)).map((x) => x.id)), qp: 200, mode: 'members',
  stats: { crafting: 20, woodcutting: 40 }, owned: null, gear: null, ...over,
});

describe('the single readiness engine', () => {
  it('computes a step once and returns the same answer on repeated requests', () => {
    const ctx = contextOf(input('S9-01'));
    const e = createReadinessEngine(ctx);
    const a = e.readiness(step('S9-01'));
    const b = e.readiness(step('S9-01'));
    expect(b).toBe(a);
    e.prep(step('S9-01'));
    e.openTasks('S9-01');
    e.chain(step('S9-01'));
    expect(e.computed.readiness).toBe(1);
  });

  it('engine answers match the direct computation: readiness, prep route, chain, one trip', () => {
    for (const id of ['S1-03', 'S2-04', 'S9-01', 'S7-05', 'S8-02']) {
      const inp = input(id);
      const ctx = contextOf(inp);
      const e = createReadinessEngine(ctx);
      expect(e.readiness(step(id))).toEqual(readinessOf(step(id), ctx));
      expect(e.prep(step(id))).toEqual(buildPrepRoute(readinessOf(step(id), ctx), step(id)));
      expect(e.chain(step(id)).map((l) => l.step.id)).toEqual(fixChain(inp).map((l) => l.step.id));
      expect(e.trip(id)).toEqual(planOneTrip(ctx.steps, ctx.progress, id, ctx.state));
    }
  });

  it('the chain takes link readiness from the shared memory, not recomputing', () => {
    const ctx = contextOf(input('S1-05', { progress: emptyProgress() }));
    const e = createReadinessEngine(ctx);
    e.readiness(step('S1-05'));
    const before = e.computed.readiness;
    e.chain(step('S1-05'));
    e.chain(step('S1-05'));
    // Step S1-05 is already computed; chain links are computed once each, a repeated call adds nothing.
    const after = e.computed.readiness;
    e.chain(step('S1-05'));
    expect(e.computed.readiness).toBe(after);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('a new state snapshot — a new engine: old answers do not survive a level change', () => {
    const inp = input('S9-01', { stats: { crafting: 20, woodcutting: 40 } });
    const low = createReadinessEngine(contextOf(inp)).readiness(step('S9-01'));
    const high = createReadinessEngine({ ...contextOf(inp), state: buildPlayerState({ mode: 'members', stats: { crafting: 40, woodcutting: 40 }, progress: inp.progress, owned: null, gear: null, questsDone: null }) }).readiness(step('S9-01'));
    expect(low.status).toBe('MISSING_STATS');
    expect(high.problems).toEqual([]);
  });

  it('a quest counted in the game — the requirement is met, even if the step on the path is not marked yet', () => {
    const s = step('S8-02'); // Nature Spirit: Priest in Peril, The Restless Ghost
    const p = withStep(input('S8-02').progress, 'S8-01', null);
    const base = { ...input('S8-02', { progress: p }) };
    const ctx = contextOf(base);
    expect(readinessOf(s, ctx).problems.some((x) => x.kind === 'quest')).toBe(true);
    const withGame = { ...ctx, state: buildPlayerState({ mode: 'members', stats: null, progress: p, owned: null, gear: null, questsDone: ['Priest in Peril', 'The Restless Ghost'] }) };
    const q = readinessOf(s, withGame).requirements.find((x) => x.label === 'Priest in Peril')!;
    expect(q).toMatchObject({ state: 'OK', source: 'game' });
  });
});
