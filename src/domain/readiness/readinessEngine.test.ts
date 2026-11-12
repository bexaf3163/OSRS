import type { Step } from '../../types';
import { describe, expect, it } from 'vitest';
import { allSteps } from '../../data';
import { emptyProgress, withStep } from '../persistence/progress';
import { buildPlayerState } from '../player/playerState';
import { contextOf, readinessOf, fixChain, type ReadinessInput } from './readiness';
import { createReadinessEngine } from './readinessEngine';
import { buildPrepRoute } from '../prep/prepRoute';
import { planOneTrip } from '../prep/oneTrip';
import { stepOrRetired } from '../../../tests/fixtures/retiredSteps';

const step = (id: string): Step => stepOrRetired(id);
const done = (ids: string[]) => ids.reduce((p, id) => withStep(p, id, 'done'), emptyProgress());
const input = (s: string, over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  step: step(s), steps: allSteps, progress: done(allSteps.slice(0, allSteps.findIndex((x) => x.id === s)).map((x) => x.id)), qp: 200, mode: 'members',
  stats: { crafting: 20, woodcutting: 40 }, owned: null, gear: null, ...over,
});

describe('the single readiness engine', () => {
  it('looks ahead along the planner\'s window, never the guide\'s next steps', () => {
    const ctx = contextOf({ ...input('S1-03'), progress: emptyProgress() });
    const guided = createReadinessEngine(ctx);
    expect(guided.road(step('S1-03')).map((s) => s.id)).toEqual(['S1-03']);
    expect(guided.trip('S1-03').stepIds).toEqual(['S1-03']);
    const planned = createReadinessEngine({ ...ctx, window: [step('S1-03'), step('S3-01'), step('S2-09')] });
    expect(planned.road(step('S1-03')).map((s) => s.id)).toEqual(['S1-03', 'S3-01', 'S2-09']);
    expect(planned.trip('S1-03').stepIds).toEqual(['S1-03', 'S3-01', 'S2-09']);
    // A step the planner has not committed to is prepared for alone.
    expect(planned.road(step('S1-04')).map((s) => s.id)).toEqual(['S1-04']);
  });

  it('keeps candidate and phase caches separate even when their historical step IDs match', () => {
    const first = { ...step('S1-03'), id: 'S0-01', requires: [], itemsRequired: [{ nameEn: 'Bucket', amount: 1, howToGet: '' }] };
    const second = { ...first, itemsRequired: [{ nameEn: 'Pot', amount: 2, howToGet: '' }] };
    const ctx = contextOf({ ...input('S1-03'), steps: [first, second] });
    const engine = createReadinessEngine(ctx);
    const one = engine.readiness(first), two = engine.readiness(second);
    expect(two).not.toBe(one);
    expect(engine.readiness(first)).toBe(one);
    expect(engine.plan(first, { ahead: 0 }).lines.map(line => line.name)).toContain('Bucket');
    expect(engine.plan(second, { ahead: 0 }).lines.map(line => [line.name, line.count])).toEqual([['Pot', 2]]);
    expect(engine.trip(second, 0).lines.map(line => line.line.nameEn)).toEqual(['Pot']);
    expect(engine.queue(second, 'balanced')).not.toBe(engine.queue(first, 'balanced'));
    const external = { ...second, itemsRequired: [{ nameEn: 'Rope', amount: 1, howToGet: '' }] };
    expect(engine.plan(external, { ahead: 0 }).lines.map(line => line.name)).toEqual(['Rope']);
    expect(engine.ctx.steps).toEqual([first, second]);
  });
  it('shares the validated execution projection across readiness, preparation and UI consumers', () => {
    const ctx = contextOf(input('S3-04', { stats: { mining: 10 } }));
    const engine = createReadinessEngine({ ...ctx, questInstruction: { stepId: 'S3-04', stageAt: 40, lineIndex: 0, peeking: false } });
    const execution = engine.ctx.steps.find(step => step.id === 'S3-04')!;
    expect(execution.threats).toEqual([]);
    expect(execution.itemsRequired).toEqual([]);
    expect(engine.plan(step('S3-04')).lines.some(line => ['Beer', 'Bread', 'Cooked meat', 'Knife'].includes(line.name))).toBe(false);
    expect(engine.readiness(execution)).toBe(engine.readiness(step('S3-04')));
    expect(step('S3-04').threats).toContain('Ancient Guardian');
  });

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
      // The planner's window is supplied as the whole list, so the direct one-trip computation walks the same road.
      const e = createReadinessEngine({ ...ctx, window: ctx.steps });
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
    expect(readinessOf(s, ctx).unknown.some((x) => x.kind === 'quest')).toBe(true);
    const withGame = { ...ctx, state: buildPlayerState({ mode: 'members', stats: null, progress: p, owned: null, gear: null, questsDone: ['Priest in Peril', 'The Restless Ghost'] }) };
    const q = readinessOf(s, withGame).requirements.find((x) => x.label === 'Priest in Peril')!;
    expect(q).toMatchObject({ state: 'OK', source: 'game' });
  });
});
