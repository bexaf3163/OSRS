import { describe, expect, it } from 'vitest';
import type { StepStatus } from '../src/types';
import { BASE_QP, MAX_QP, goals, stages, steps } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { questPoints, reachableQuestPoints, stageQuestPoints } from '../src/lib/qp';

const withSteps = (s: Record<string, StepStatus>) => ({ ...emptyProgress(), steps: s });

describe('очки квестов', () => {
  it('в начале — только Learning the Ropes', () => {
    expect(BASE_QP).toBe(1);
    expect(questPoints(steps, emptyProgress(), BASE_QP)).toBe(1);
  });

  it('всего 46', () => {
    expect(MAX_QP).toBe(46);
    const all = Object.fromEntries(steps.map((s) => [s.id, 'done' as const]));
    expect(questPoints(steps, withSteps(all), BASE_QP)).toBe(46);
  });

  it('сделанные квесты добавляют свои очки, не-квесты — ничего', () => {
    // Romeo & Juliet 5, Pirate's Treasure 2, Stronghold (подготовка) 0.
    expect(questPoints(steps, withSteps({ 'S2-04': 'done', 'S2-05': 'done', 'S2-02': 'done' }), BASE_QP)).toBe(8);
  });

  it('пропущенный квест очков не даёт и снижает максимум', () => {
    const p = withSteps({ 'S3-07': 'skipped' });
    expect(questPoints(steps, p, BASE_QP)).toBe(1);
    expect(reachableQuestPoints(steps, p, BASE_QP)).toBe(45);
  });

  it('очки к концу этапов совпадают со строкой «Очки квестов» в целях', () => {
    const row = goals.rows.find((r) => r.id === 'qp')!;
    for (const st of stages) expect(stageQuestPoints(steps, st.id, BASE_QP)).toBe(row.values[st.id - 1].min);
  });

  it('пропуск Shield of Arrav снижает цель этапов 3–6 на 1', () => {
    const p = withSteps({ 'S3-07': 'skipped' });
    expect(stageQuestPoints(steps, 2, BASE_QP, p)).toBe(28);
    expect(stageQuestPoints(steps, 3, BASE_QP, p)).toBe(40);
    expect(stageQuestPoints(steps, 6, BASE_QP, p)).toBe(45);
  });
});
