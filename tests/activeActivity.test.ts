import { describe, expect, it } from 'vitest';
import { resolveActiveActivity } from '../src/lib/activeActivity';
import { emptyProgress } from '../src/lib/progress';
import type { Step } from '../src/types';

const step = (id: string, stage = 1): Step => ({ id, stage, type: 'skill', title: id, requires: [], doneWhen: 'Finished' });
const first = step('S1-01'), second = step('S1-02'), training = step('S0-04', 0);
const input = () => ({ steps: [first, second, training], progress: emptyProgress(), qp: 0, dependencies: () => undefined });

describe('one guided activity for cross-page consumers', () => {
  it('uses the followed skill for both kit and purchasing even while the game still reports an old route step', () => {
    expect(resolveActiveActivity({ ...input(), training: { step: training, complete: false }, activeStepId: second.id }))
      .toEqual({ step: training, source: 'training', href: '#/' });
  });
  it('uses an explicitly active unfinished route step before the next default step', () => {
    expect(resolveActiveActivity({ ...input(), activeStepId: second.id })).toEqual({ step: second, source: 'game', href: '#/step/S1-02' });
  });
  it('does not revive completed training from a stale synthetic game target', () => {
    expect(resolveActiveActivity({ ...input(), training: { step: training, complete: true }, activeStepId: training.id }).step).toBe(first);
  });
  it('falls back from stale, completed and skipped game targets without changing saved progress', () => {
    for (const closed of ['done', 'skipped'] as const) {
      const source = input();
      source.progress.steps[first.id] = closed;
      const before = JSON.stringify(source.progress);
      expect(resolveActiveActivity({ ...source, activeStepId: first.id }).step).toBe(second);
      expect(JSON.stringify(source.progress)).toBe(before);
    }
    expect(resolveActiveActivity({ ...input(), activeStepId: 'unknown-step' }).step).toBe(first);
  });
  it('has an honest empty state when the route is finished instead of selecting a leftover synthetic step', () => {
    const source = input();
    source.progress.steps = { [first.id]: 'done', [second.id]: 'done' };
    expect(resolveActiveActivity(source)).toEqual({ step: null, source: 'none', href: '#/' });
  });
});
