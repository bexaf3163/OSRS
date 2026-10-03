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

describe('единый движок готовности', () => {
  it('считает шаг один раз и отдаёт тот же ответ при повторных запросах', () => {
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

  it('ответы движка совпадают с прямым расчётом: готовность, маршрут подготовки, цепочка, одна ходка', () => {
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

  it('цепочка берёт готовность звеньев из общей памяти, а не считает заново', () => {
    const ctx = contextOf(input('S1-05', { progress: emptyProgress() }));
    const e = createReadinessEngine(ctx);
    e.readiness(step('S1-05'));
    const before = e.computed.readiness;
    e.chain(step('S1-05'));
    e.chain(step('S1-05'));
    // Шаг S1-05 уже посчитан; звенья цепочки считаются по одному разу, повторный вызов ничего не добавляет.
    const after = e.computed.readiness;
    e.chain(step('S1-05'));
    expect(e.computed.readiness).toBe(after);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('новый снимок состояния — новый движок: старые ответы не переживают смену уровней', () => {
    const inp = input('S9-01', { stats: { crafting: 20, woodcutting: 40 } });
    const low = createReadinessEngine(contextOf(inp)).readiness(step('S9-01'));
    const high = createReadinessEngine({ ...contextOf(inp), state: buildPlayerState({ mode: 'members', stats: { crafting: 40, woodcutting: 40 }, progress: inp.progress, owned: null, gear: null, questsDone: null }) }).readiness(step('S9-01'));
    expect(low.status).toBe('MISSING_STATS');
    expect(high.problems).toEqual([]);
  });

  it('квест засчитан в игре — требование выполнено, даже если шаг на пути ещё не отмечен', () => {
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
