import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { isOutOfStage, scopeReadiness, stageScope } from '../src/lib/stageScope';
import type { RequirementStatus, StepReadiness } from '../src/lib/readiness';

const mountain = stepById.get('S3-04')!;
const at = (stageAt: number) => ({ stepId: 'S3-04', stageAt, lineIndex: 0, peeking: false });

describe('what a quest stage still asks for (Below Ice Mountain, real data)', () => {
  it('the data: the stages with their own list are 10 and 15, the later ones are empty', () => {
    const lists = Object.fromEntries(mountain.questStages!.stages.map((s) => [s.at, s.items?.map((i) => i.name)]));
    expect(lists[15]).toEqual(['Cooked meat', 'Bread', 'Knife']);
    expect(lists[35]).toEqual([]);
    expect(lists[0]).toBeUndefined();
  });

  it('past the last stage that asks for anything, every item of the quest is out', () => {
    for (const stage of [20, 30, 35, 40]) {
      const scope = stageScope(mountain, at(stage))!;
      for (const name of ['Beer', 'Cooked meat', 'Bread', 'Knife']) expect(isOutOfStage(scope, name), `${stage} ${name}`).toBe(true);
    }
  });

  it('while an item can still be needed nothing is hidden: the ale is bought inside stage 15 and no stage lists it', () => {
    expect(stageScope(mountain, at(15))).toBeNull();
    expect(stageScope(mountain, at(10))).toBeNull();
  });

  it('is unknown without a confirmed line, for another step, an unknown stage and a stage without a list', () => {
    expect(stageScope(mountain, null)).toBeNull();
    expect(stageScope(mountain, { ...at(35), stepId: 'S2-10' })).toBeNull();
    expect(stageScope(mountain, at(999))).toBeNull();
    expect(stageScope(mountain, at(0))).toBeNull();
    expect(stageScope(stepById.get('S1-01')!, { stepId: 'S1-01', stageAt: 0, lineIndex: 0, peeking: false })).toBeNull();
  });

  it('an item that an earlier stage listed and a later one still lists is not out', () => {
    const step = {
      ...mountain,
      itemsRequired: [{ nameEn: 'Rope' }, { nameEn: 'Key' }],
      questStages: {
        ...mountain.questStages!,
        stages: [
          { at: 1, do: [], items: [{ name: 'Rope' }, { name: 'Key' }] },
          { at: 2, do: [], items: [] },
          { at: 3, do: [], items: [{ name: 'Rope' }] },
        ],
      },
    } as never;
    const scope = stageScope(step, { stepId: 'S3-04', stageAt: 2, lineIndex: 0, peeking: false })!;
    expect(isOutOfStage(scope, 'Key')).toBe(true);
    expect(isOutOfStage(scope, 'Rope')).toBe(false);
  });
});

describe('readiness without the items the stage no longer asks for', () => {
  const req = (item: string, state: RequirementStatus['state'] = 'MISSING'): RequirementStatus => ({ kind: 'item', label: `${item} ×1`, item, state, hard: true });
  const base = (problems: RequirementStatus[], unknown: RequirementStatus[], status: StepReadiness['status']): StepReadiness =>
    ({ stepId: 'S3-04', status, requirements: [...problems, ...unknown], problems, unknown });
  const scope = stageScope(mountain, at(35))!;

  it('four missing quest items at the last stage leave a ready step', () => {
    const r = base(['Beer', 'Cooked meat', 'Bread', 'Knife'].map((n) => req(n)), [], 'MISSING_ITEM');
    const s = scopeReadiness(r, scope);
    expect(s.status).toBe('READY');
    expect(s.problems).toHaveLength(0);
    expect(s.requirements).toHaveLength(0);
  });

  it('unchecked items leave "not everything is checked", not a false ready', () => {
    const s = scopeReadiness(base([], ['Beer', 'Bread'].map((n) => req(n, 'UNKNOWN')), 'UNKNOWN'), scope);
    expect(s.status).toBe('READY');
    const mixed = scopeReadiness(base([], [req('Beer', 'UNKNOWN'), req('Pickaxe', 'UNKNOWN')], 'UNKNOWN'), scope);
    expect(mixed.status).toBe('UNKNOWN');
    expect(mixed.unknown.map((x) => x.item)).toEqual(['Pickaxe']);
  });

  it('a real problem outside the quest list is kept, and the status stays', () => {
    const level: RequirementStatus = { kind: 'skill', label: 'Mining 10', state: 'MISSING', hard: true, stat: { skill: 'mining', min: 10 } };
    const r = base([req('Beer'), level], [], 'MISSING_STATS');
    const s = scopeReadiness(r, scope);
    expect(s.problems).toEqual([level]);
    expect(s.status).toBe('MISSING_STATS');
  });

  it('is the same object when nothing is dropped or there is no scope', () => {
    const r = base([req('Pickaxe')], [], 'MISSING_ITEM');
    expect(scopeReadiness(r, scope)).toBe(r);
    expect(scopeReadiness(r, null)).toBe(r);
  });
});
