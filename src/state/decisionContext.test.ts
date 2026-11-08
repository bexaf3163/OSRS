import { describe, expect, it } from 'vitest';
import type { Step } from '../types';
import { decisionStep, roadFrom } from './decision';

const step = (id: string): Step => ({ id, stage: 1, type: 'quest', title: id, requires: [], doneWhen: 'Finished' });
const [a, b, c, other] = ['S1-01', 'S1-02', 'S2-01', 'S9-09'].map(step);

describe('the road ahead comes from the Decision, never from route order', () => {
  it('runs from a step through the rest of the committed window', () => {
    expect(roadFrom([a, b, c], b)).toEqual([b, c]);
  });

  it('a step outside the window is its own road', () => {
    expect(roadFrom([a, b, c], other)).toEqual([other]);
    expect(roadFrom([], a)).toEqual([a]);
  });

  it('finds no step for a VERIFY action or a step outside the authored steps', () => {
    expect(decisionStep(null, [a])).toBeNull();
  });
});
