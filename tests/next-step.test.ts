import { describe, expect, it } from 'vitest';
import type { GameMode, Progress, Step, StepStatus } from '../src/types';
import { BASE_QP, stepsFor } from '../src/data';
import { blockersOf, currentStage, nextStep } from '../src/lib/next-step';
import { emptyProgress } from '../src/lib/progress';
import { questPoints } from '../src/lib/qp';

const f2p = stepsFor('f2p');

function progressWith(statuses: Record<string, StepStatus>): Progress {
  return { ...emptyProgress(), steps: statuses };
}

function allBefore(id: string, status: StepStatus = 'done'): Record<string, StepStatus> {
  const out: Record<string, StepStatus> = {};
  for (const s of f2p) {
    if (s.id === id) break;
    out[s.id] = status;
  }
  return out;
}

const step = (over: Partial<Step> & { id: string }): Step => ({
  stage: 1, type: 'quest', title: over.id, doneWhen: '—', requires: [], ...over,
});

describe('«Что делать сейчас»', () => {
  it('в начале — первый шаг', () => {
    const p = emptyProgress();
    expect(nextStep(f2p, p, questPoints(f2p, p, BASE_QP))?.id).toBe('S1-01');
  });

  it('пропускает закрытые шаги', () => {
    const p = progressWith({ 'S1-01': 'done', 'S1-02': 'done' });
    expect(nextStep(f2p, p, questPoints(f2p, p, BASE_QP))?.id).toBe('S1-03');
  });

  it('не выбирает шаг с невыполненной зависимостью', () => {
    // Всё до S2-02 сделано, кроме S2-01 — а Imp Catcher ждёт закупок на бирже.
    const done = allBefore('S2-02');
    delete done['S2-01'];
    const p = progressWith(done);
    const qp = questPoints(f2p, p, BASE_QP);
    expect(nextStep(f2p, p, qp)?.id).toBe('S2-01');
    expect(blockersOf(f2p.find((s) => s.id === 'S2-02')!, p, qp)).toEqual({ steps: ['S2-01'] });
  });

  it('обходит заблокированный шаг и берёт следующий доступный', () => {
    const list = [step({ id: 'A', requires: ['C'] }), step({ id: 'B' }), step({ id: 'C' })];
    expect(nextStep(list, emptyProgress(), 0)?.id).toBe('B');
  });

  it('учитывает порог очков квестов', () => {
    const list = [step({ id: 'A', minQp: 5 }), step({ id: 'B', qp: 4 })];
    const p = emptyProgress();
    expect(nextStep(list, p, 1)?.id).toBe('B');
    expect(blockersOf(list[0], p, 1)).toEqual({ steps: [], qp: { need: 5, have: 1 } });
    const after = progressWith({ B: 'done' });
    expect(nextStep(list, after, questPoints(list, after, 1))?.id).toBe('A');
  });

  it('Below Ice Mountain (S3-04) ждёт 16 очков квестов', () => {
    const s = f2p.find((x) => x.id === 'S3-04')!;
    const p = emptyProgress();
    expect(blockersOf(s, p, 15)?.qp).toEqual({ need: 16, have: 15 });
    expect(blockersOf(s, p, 16)).toBeNull();
  });

  it('пропущенный шаг закрыт для зависимостей', () => {
    const list = [step({ id: 'A', optional: true }), step({ id: 'B', requires: ['A'] })];
    const p = progressWith({ A: 'skipped' });
    expect(blockersOf(list[1], p, 0)).toBeNull();
    expect(nextStep(list, p, 0)?.id).toBe('B');
  });

  it('когда всё закрыто — null; последний этап F2P — 6, Members — 9', () => {
    for (const [mode, last] of [['f2p', 6], ['members', 9]] as [GameMode, number][]) {
      const steps = stepsFor(mode);
      const p = progressWith(Object.fromEntries(steps.map((s) => [s.id, 'done' as const])));
      expect(nextStep(steps, p, questPoints(steps, p, BASE_QP))).toBeNull();
      expect(currentStage(steps, p)).toBe(last);
    }
  });

  it('текущий этап — этап первого незакрытого шага', () => {
    expect(currentStage(f2p, progressWith(allBefore('S3-01')))).toBe(3);
  });

  it.each(['f2p', 'members'] as GameMode[])('проход по плану (%s) всегда даёт следующий шаг — план без тупиков', (mode) => {
    const steps = stepsFor(mode);
    let p = emptyProgress();
    const order: string[] = [];
    for (;;) {
      const next = nextStep(steps, p, questPoints(steps, p, BASE_QP));
      if (!next) break;
      order.push(next.id);
      p = progressWith({ ...p.steps, [next.id]: 'done' });
    }
    expect(order).toHaveLength(steps.length);
  });
});
