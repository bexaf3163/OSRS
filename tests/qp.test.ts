import { describe, expect, it } from 'vitest';
import type { StepStatus } from '../src/types';
import { BASE_QP, maxQpFor, stagesFor, stepById, stepsFor } from '../src/data';
import { emptyProgress, withReactivated, withStep } from '../src/lib/progress';
import { questPoints, reachableQuestPoints, stageQuestPoints } from '../src/lib/qp';

const f2p = stepsFor('f2p');
const withSteps = (s: Record<string, StepStatus>) => ({ ...emptyProgress(), steps: s });
const qpOf = (id: string) => stepById.get(id)?.qp ?? 0;

describe('quest points', () => {
  it('at the start — only Learning the Ropes', () => {
    expect(BASE_QP).toBe(1);
    expect(questPoints(f2p, emptyProgress(), BASE_QP)).toBe(1);
  });

  it('F2P — 46 points, with membership — 69', () => {
    expect(maxQpFor('f2p')).toBe(46);
    expect(maxQpFor('members')).toBe(69);
    const all = Object.fromEntries(f2p.map((s) => [s.id, 'done' as const]));
    expect(questPoints(f2p, withSteps(all), BASE_QP)).toBe(46);
  });

  it('completed quests add their points, non-quests — nothing', () => {
    // Romeo & Juliet 5, Pirate's Treasure 2, Stronghold of Security (preparation) 0.
    expect(questPoints(f2p, withSteps({ 'S2-05': 'done', 'S2-09': 'done', 'S1-09': 'done' }), BASE_QP)).toBe(8);
  });

  it('a skipped quest gives no points and lowers the maximum', () => {
    const p = withSteps({ 'S3-05': 'skipped' });
    expect(questPoints(f2p, p, BASE_QP)).toBe(1);
    expect(reachableQuestPoints(f2p, p, BASE_QP)).toBe(45);
  });

  it('points by the end of the F2P stages', () => {
    expect(stagesFor('f2p').map((st) => stageQuestPoints(f2p, st.id, BASE_QP))).toEqual([6, 32, 41, 44, 46, 46]);
  });

  it('skipping Shield of Arrav lowers the goal of stages 3–6 by 1', () => {
    const p = withSteps({ 'S3-05': 'skipped' });
    expect(stageQuestPoints(f2p, 2, BASE_QP, p)).toBe(32);
    expect(stageQuestPoints(f2p, 3, BASE_QP, p)).toBe(40);
    expect(stageQuestPoints(f2p, 6, BASE_QP, p)).toBe(45);
  });

  it('returning a step to active after V2 Review does not take points away', () => {
    let p = withSteps({ 'S1-03': 'done', 'S1-04': 'done' });
    expect(questPoints(f2p, p, BASE_QP)).toBe(3);
    p = withReactivated(p, ['S1-03', 'S1-04'], qpOf);
    expect(p.steps['S1-03']).toBeUndefined();
    expect(questPoints(f2p, p, BASE_QP)).toBe(3);
    // A repeated mark does not double the points.
    p = withStep(p, 'S1-03', 'done');
    expect(questPoints(f2p, p, BASE_QP)).toBe(3);
    expect(p.qpKept).toEqual(['S1-04']);
  });
});
