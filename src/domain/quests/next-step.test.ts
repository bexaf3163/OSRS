import { describe, expect, it } from 'vitest';
import type { GameMode, Progress, Step, StepStatus } from '../../types';
import { BASE_QP, stepsFor } from '../../data';
import { blockersOf, currentStage, isClosed, questDependencyFacts, dependencyFacts } from './next-step';
import { emptyProgress } from '../persistence/progress';
import { questPoints } from './qp';

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

describe('"What to do now"', () => {
  it('at the start — the first step', () => {
    const p = emptyProgress();
    expect(blockersOf(f2p.find((s) => s.id === 'S1-01')!, p, questPoints(f2p, p, BASE_QP))).toBeNull();
  });

  it('skips closed steps', () => {
    const p = progressWith({ 'S1-01': 'done', 'S1-02': 'done' });
    expect(blockersOf(f2p.find((s) => s.id === 'S1-03')!, p, questPoints(f2p, p, BASE_QP))).toBeNull();
  });

  it('does not pick a step with an unmet dependency', () => {
    // Everything before S2-02 is done except S2-01 — and Imp Catcher waits for the Grand Exchange shopping.
    const done = allBefore('S2-02');
    delete done['S2-01'];
    const p = progressWith(done);
    const qp = questPoints(f2p, p, BASE_QP);
    expect(blockersOf(f2p.find((s) => s.id === 'S2-01')!, p, qp)).toBeNull();
    expect(blockersOf(f2p.find((s) => s.id === 'S2-02')!, p, qp)).toEqual({ steps: ['S2-01'] });
  });

  it('bypasses a blocked step and takes the next available one', () => {
    const list = [step({ id: 'A', requires: ['C'] }), step({ id: 'B' }), step({ id: 'C' })];
    expect(blockersOf(list.find((s) => s.id === 'B')!, emptyProgress(), 0)).toBeNull();
  });

  it('takes the quest points threshold into account', () => {
    const list = [step({ id: 'A', minQp: 5 }), step({ id: 'B', qp: 4 })];
    const p = emptyProgress();
    expect(blockersOf(list.find((s) => s.id === 'B')!, p, 1)).toBeNull();
    expect(blockersOf(list[0], p, 1)).toEqual({ steps: [], qp: { need: 5, have: 1 } });
    const after = progressWith({ B: 'done' });
    expect(blockersOf(list.find((s) => s.id === 'A')!, after, questPoints(list, after, 1))).toBeNull();
  });

  it('Below Ice Mountain (S3-04) waits for 16 quest points', () => {
    const s = f2p.find((x) => x.id === 'S3-04')!;
    const p = emptyProgress();
    expect(blockersOf(s, p, 15)?.qp).toEqual({ need: 16, have: 15 });
    expect(blockersOf(s, p, 16)).toBeNull();
  });

  it('a skipped step closes the queue but cannot satisfy a hard dependency', () => {
    const list = [step({ id: 'A', optional: true }), step({ id: 'B', requires: ['A'] })];
    const p = progressWith({ A: 'skipped' });
    expect(blockersOf(list[1], p, 0)).toEqual({ steps: ['A'] });
    expect(list.some((s) => !isClosed(p, s.id) && !blockersOf(s, p, 0))).toBe(false);
    // A is already closed (skipped), so the old openAfter preview kept it skipped rather than marking it done.
    expect(list.some((s) => s.id !== 'A' && !isClosed(p, s.id) && !blockersOf(s, p, 0))).toBe(false);
    expect(blockersOf(step({ id: 'C', softRequires: ['A'] }), p, 0)).toBeNull();
  });

  it('uses known quest completion ahead of manual marks, but keeps an offline done fallback', () => {
    const list = [step({ id: 'A', inGame: { completionTrigger: { type: 'QUEST_COMPLETED', questName: 'Test Quest' } } }), step({ id: 'B', requires: ['A'] })];
    const marked = progressWith({ A: 'done' });
    expect(blockersOf(list[1], marked, 0, questDependencyFacts(list, []))).toEqual({ steps: ['A'] });
    expect(blockersOf(list[1], marked, 0, questDependencyFacts(list, null))).toBeNull();
    expect(blockersOf(list[1], progressWith({ A: 'skipped' }), 0, questDependencyFacts(list, ['Test Quest']))).toBeNull();
  });

  it('completion preview skips blocked destinations and never changes saved progress', () => {
    const list = [step({ id: 'A' }), step({ id: 'B', requires: ['A'], minQp: 10 }), step({ id: 'C', requires: ['A'] })];
    const p = emptyProgress();
    expect(blockersOf(list.find((s) => s.id === 'C')!, { ...p, steps: { ...p.steps, ['A']: 'done' as const } }, 2)).toBeNull();
    expect(p.steps).toEqual({});
    expect(blockersOf(list.find((s) => s.id === 'B')!, { ...p, steps: { ...p.steps, ['A']: 'done' as const } }, 10)).toBeNull();
  });

  it('a partial quest milestone cannot be inferred from a completed quest list', () => {
    const partial = step({ id: 'P', inGame: { completionTrigger: { type: 'VARBIT_CHANGED', varbitId: 1, targetValue: 10 } } });
    expect(questDependencyFacts([partial], [])('P')).toBeUndefined();
  });

  it('only complete known level evidence can satisfy a skipped pure training producer', () => {
    const a = step({ id: 'A', type: 'skill', inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'agility', level: 25 }, { skill: 'prayer', level: 43 }] } } });
    const b = step({ id: 'B', requires: ['A'] });
    const list = [a, b];
    const p = progressWith({ A: 'skipped' });
    for (const levels of [{ agility: 25 }, { agility: 25, prayer: 42 }, { agility: 25, prayer: NaN }]) {
      const fact = dependencyFacts(list, null, skill => (levels as Record<string, number>)[skill]);
      expect(fact('A')).toBeUndefined();
      expect(blockersOf(b, p, 0, fact)?.steps).toEqual(['A']);
    }
    const fact = dependencyFacts(list, null, skill => ({ agility: 25, prayer: 43 } as Record<string, number>)[skill]);
    expect(blockersOf(list.find((s) => s.id === 'B')!, p, 0, fact)).toBeNull();
    expect(blockersOf(list.find((s) => s.id === 'B')!, { ...p, steps: { ...p.steps, ['A']: 'done' as const } }, 0, fact)).toBeNull();
    expect(p.steps.A).toBe('skipped');
  });

  it('levels do not prove item-bearing training, carryover, partial quest milestones or real quest completion', () => {
    const training = step({ id: 'T', type: 'skill', inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'attack', level: 40 }], items: [{ names: ['Big bones'], count: 50 }] } } });
    const carrying: Step = { ...training, id: 'C', inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'attack', level: 40 }] } }, carryover: [{ item: 'Big bones', count: 50, forStep: 'B', where: 'bank', why: 'Retain the required objective.' }] };
    const partial = step({ id: 'P', inGame: { completionTrigger: { type: 'VARBIT_CHANGED', varbitId: 1, targetValue: 40 } } });
    const quest = step({ id: 'Q', inGame: { completionTrigger: { type: 'QUEST_COMPLETED', questName: 'Test Quest' } } });
    const fact = dependencyFacts([training, carrying, partial, quest], [], () => 99);
    expect(fact('T')).toBeUndefined(); expect(fact('C')).toBeUndefined(); expect(fact('P')).toBeUndefined();
    expect(fact('Q')).toBe(false);
  });

  it('when everything is closed — null; the last F2P stage is 6, Members — 9', () => {
    for (const [mode, last] of [['f2p', 6], ['members', 9]] as [GameMode, number][]) {
      const steps = stepsFor(mode);
      const p = progressWith(Object.fromEntries(steps.map((s) => [s.id, 'done' as const])));
      expect(steps.some((s) => !isClosed(p, s.id) && !blockersOf(s, p, questPoints(steps, p, BASE_QP)))).toBe(false);
      expect(currentStage(steps, p)).toBe(last);
    }
  });

  it('the current stage — the stage of the first unclosed step', () => {
    expect(currentStage(f2p, progressWith(allBefore('S3-01')))).toBe(3);
  });

  it.each(['f2p', 'members'] as GameMode[])('walking the plan (%s) always gives the next step — a plan without dead ends', (mode) => {
    const steps = stepsFor(mode);
    let p = emptyProgress();
    const order: string[] = [];
    for (;;) {
      // The first open, unblocked authored step: a data check that the authored order has no dead end, not a selector.
      const qp = questPoints(steps, p, BASE_QP);
      const next = steps.find((s) => !isClosed(p, s.id) && !blockersOf(s, p, qp));
      if (!next) break;
      order.push(next.id);
      p = progressWith({ ...p.steps, [next.id]: 'done' });
    }
    expect(order).toHaveLength(steps.length);
  });
});

describe('S27: one decision authority', () => {
  it('the retired linear selectors stay retired: the committed Decision picks the current step', async () => {
    const mod = await import('./next-step');
    expect(['nextStep', 'openAfter'].filter(name => name in mod)).toEqual([]);
  });
});
