import { describe, expect, it } from 'vitest';
import type { StepStatus } from '../src/types';
import { BASE_QP, maxQpFor, stagesFor, stepById, stepsFor } from '../src/data';
import { emptyProgress, withReactivated, withStep } from '../src/lib/progress';
import { questPoints, reachableQuestPoints, stageQuestPoints } from '../src/lib/qp';

const f2p = stepsFor('f2p');
const withSteps = (s: Record<string, StepStatus>) => ({ ...emptyProgress(), steps: s });
const qpOf = (id: string) => stepById.get(id)?.qp ?? 0;

describe('очки квестов', () => {
  it('в начале — только Learning the Ropes', () => {
    expect(BASE_QP).toBe(1);
    expect(questPoints(f2p, emptyProgress(), BASE_QP)).toBe(1);
  });

  it('F2P — 46 очков, с подпиской — 69', () => {
    expect(maxQpFor('f2p')).toBe(46);
    expect(maxQpFor('members')).toBe(69);
    const all = Object.fromEntries(f2p.map((s) => [s.id, 'done' as const]));
    expect(questPoints(f2p, withSteps(all), BASE_QP)).toBe(46);
  });

  it('сделанные квесты добавляют свои очки, не-квесты — ничего', () => {
    // Romeo & Juliet 5, Pirate's Treasure 2, Stronghold of Security (подготовка) 0.
    expect(questPoints(f2p, withSteps({ 'S2-05': 'done', 'S2-09': 'done', 'S1-09': 'done' }), BASE_QP)).toBe(8);
  });

  it('пропущенный квест очков не даёт и снижает максимум', () => {
    const p = withSteps({ 'S3-05': 'skipped' });
    expect(questPoints(f2p, p, BASE_QP)).toBe(1);
    expect(reachableQuestPoints(f2p, p, BASE_QP)).toBe(45);
  });

  it('очки к концу этапов F2P', () => {
    expect(stagesFor('f2p').map((st) => stageQuestPoints(f2p, st.id, BASE_QP))).toEqual([6, 32, 41, 44, 46, 46]);
  });

  it('пропуск Shield of Arrav снижает цель этапов 3–6 на 1', () => {
    const p = withSteps({ 'S3-05': 'skipped' });
    expect(stageQuestPoints(f2p, 2, BASE_QP, p)).toBe(32);
    expect(stageQuestPoints(f2p, 3, BASE_QP, p)).toBe(40);
    expect(stageQuestPoints(f2p, 6, BASE_QP, p)).toBe(45);
  });

  it('возврат шага в активные после V2 Review не отнимает очки', () => {
    let p = withSteps({ 'S1-03': 'done', 'S1-04': 'done' });
    expect(questPoints(f2p, p, BASE_QP)).toBe(3);
    p = withReactivated(p, ['S1-03', 'S1-04'], qpOf);
    expect(p.steps['S1-03']).toBeUndefined();
    expect(questPoints(f2p, p, BASE_QP)).toBe(3);
    // Повторная отметка не удваивает очки.
    p = withStep(p, 'S1-03', 'done');
    expect(questPoints(f2p, p, BASE_QP)).toBe(3);
    expect(p.qpKept).toEqual(['S1-04']);
  });
});
