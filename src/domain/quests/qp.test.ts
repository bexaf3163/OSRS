import { describe, expect, it } from 'vitest';
import type { StepStatus } from '../../types';
import { BASE_QP, maxQpFor, stepsFor } from '../../data';
import { emptyProgress, withStep } from '../persistence/progress';
import { questPoints } from './qp';

const f2p = stepsFor('f2p');
const withSteps = (s: Record<string, StepStatus>) => ({ ...emptyProgress(), steps: s });

describe('quest points', () => {
  it('at the start — only Learning the Ropes', () => {
    expect(BASE_QP).toBe(1);
    expect(questPoints(f2p, emptyProgress(), BASE_QP)).toBe(1);
  });

  it('F2P — 46 points, with membership — 73', () => {
    expect(maxQpFor('f2p')).toBe(46);
    expect(maxQpFor('members')).toBe(73);
    const all = Object.fromEntries(f2p.map((s) => [s.id, 'done' as const]));
    expect(questPoints(f2p, withSteps(all), BASE_QP)).toBe(46);
  });

  it('completed quests add their points, non-quests — nothing', () => {
    // Romeo & Juliet 5, Pirate's Treasure 2, Stronghold of Security (preparation) 0.
    expect(questPoints(f2p, withSteps({ 'S2-05': 'done', 'S2-09': 'done', 'S1-09': 'done' }), BASE_QP)).toBe(8);
  });

  it('a skipped quest gives no points', () => {
    const p = withSteps({ 'S3-05': 'skipped' });
    expect(questPoints(f2p, p, BASE_QP)).toBe(1);
  });

  it('an older save\'s steps returned to active after the V2 update keep their points (the review itself retired in 2.94.5)', () => {
    let p = withSteps({ 'S1-03': 'done', 'S1-04': 'done' });
    expect(questPoints(f2p, p, BASE_QP)).toBe(3);
    p = { ...withSteps({}), qpKept: ['S1-03', 'S1-04'] };
    expect(p.steps['S1-03']).toBeUndefined();
    expect(questPoints(f2p, p, BASE_QP)).toBe(3);
    // A repeated mark does not double the points.
    p = withStep(p, 'S1-03', 'done');
    expect(questPoints(f2p, p, BASE_QP)).toBe(3);
    expect(p.qpKept).toEqual(['S1-04']);
  });
});
