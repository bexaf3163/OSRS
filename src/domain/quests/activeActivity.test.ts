import { describe, expect, it } from 'vitest';
import { resolveActiveActivity } from './activeActivity';
import { emptyProgress } from '../persistence/progress';
import type { Step } from '../../types';

const step = (id: string, stage = 1): Step => ({ id, stage, type: 'skill', title: id, requires: [], doneWhen: 'Finished' });
const first = step('S1-01'), second = step('S1-02'), training = step('S0-04', 0);
const input = () => ({ steps: [first, second, training], progress: emptyProgress(), decided: first as Step | null });

describe('one guided activity for cross-page consumers', () => {
  it('uses the followed skill for both kit and purchasing even while the game still reports an old route step', () => {
    expect(resolveActiveActivity({ ...input(), training: { step: training, complete: false }, activeStepId: second.id }))
      .toEqual({ step: training, source: 'training', href: '#/' });
  });

  it('uses the game\'s unfinished step when it belongs to the Decision\'s objective', () => {
    expect(resolveActiveActivity({ ...input(), activeStepId: second.id, objectiveSteps: new Set([first.id, second.id]) })).toEqual({ step: second, source: 'game', href: '#/step/S1-02' });
  });

  it('never lets a leftover game step of another objective outrank the Decision (2.82.0 kept the old route order)', () => {
    expect(resolveActiveActivity({ ...input(), activeStepId: second.id, objectiveSteps: new Set([first.id]) })).toEqual({ step: first, source: 'decision', href: '#/step/S1-01' });
    expect(resolveActiveActivity({ ...input(), activeStepId: second.id })).toEqual({ step: first, source: 'decision', href: '#/step/S1-01' });
    // Without a Decision (offline, waiting for data) the game's step is still the honest context.
    expect(resolveActiveActivity({ ...input(), decided: null, activeStepId: second.id })).toEqual({ step: second, source: 'game', href: '#/step/S1-02' });
  });

  it('does not revive completed training from a stale synthetic game target', () => {
    expect(resolveActiveActivity({ ...input(), training: { step: training, complete: true }, activeStepId: training.id }))
      .toEqual({ step: first, source: 'decision', href: '#/step/S1-01' });
  });

  it('falls back from stale, completed and skipped game targets to the Decision without changing saved progress', () => {
    for (const closed of ['done', 'skipped'] as const) {
      const source = { ...input(), decided: second };
      source.progress.steps[first.id] = closed;
      const before = JSON.stringify(source.progress);
      expect(resolveActiveActivity({ ...source, activeStepId: first.id }).step).toBe(second);
      expect(JSON.stringify(source.progress)).toBe(before);
    }
    expect(resolveActiveActivity({ ...input(), activeStepId: 'unknown-step' }).step).toBe(first);
  });

  it('takes no route order as the objective: no Decision or a closed one is an honest empty state', () => {
    expect(resolveActiveActivity({ ...input(), decided: null })).toEqual({ step: null, source: 'none', href: '#/' });
    const source = input();
    source.progress.steps[first.id] = 'done';
    expect(resolveActiveActivity(source)).toEqual({ step: null, source: 'none', href: '#/' });
  });
});
