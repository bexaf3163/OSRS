import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { isOutOfStage, scopeReadiness, stageScope } from '../src/lib/stageScope';
import type { RequirementStatus, StepReadiness } from '../src/lib/readiness';

const mountain = stepById.get('S3-04')!;
const at = (stageAt: number) => ({ stepId: 'S3-04', stageAt, lineIndex: 0, peeking: false });

describe('what a quest stage still asks for (Below Ice Mountain, real data)', () => {
  const NAMES = ['Beer', 'Cooked meat', 'Bread', 'Knife', 'Bronze pickaxe', 'Trout'];
  const hidden = (stage: number) => {
    const scope = stageScope(mountain, at(stage));
    return scope ? NAMES.filter((n) => isOutOfStage(scope, n)) : [];
  };

  it('the data: stages 15, 20, 30 and 35 list what they need (the fight kit from the walk to the entrance on), the others say "nothing", the first has no list', () => {
    const lists = Object.fromEntries(mountain.questStages!.stages.map((s) => [s.at, s.items?.map((i) => i.name)]));
    expect(lists[15]).toEqual(['Cooked meat', 'Bread', 'Knife', 'Beer']);
    expect(lists[20]).toEqual(['Bronze pickaxe', 'Trout']);
    expect(lists[30]).toEqual(['Bronze pickaxe', 'Trout']);
    expect(lists[35]).toEqual(['Bronze pickaxe', 'Trout']);
    expect(lists[40]).toEqual([]);
    expect(lists[0]).toBeUndefined();
  });

  it('what an earlier stage used is out later, what a later stage lists is not', () => {
    for (const stage of [20, 30, 35]) expect(hidden(stage), `${stage}`).toEqual(['Beer', 'Cooked meat', 'Bread', 'Knife']);
  });

  it('past the last stage that asks for anything, every item of the quest is out', () => {
    expect(hidden(40)).toEqual(NAMES);
  });

  it('while an item can still be needed nothing is hidden (stages 10 and 15)', () => {
    expect(hidden(15)).toEqual([]);
    expect(hidden(10)).toEqual([]);
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
