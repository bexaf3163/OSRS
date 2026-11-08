import { describe, expect, it } from 'vitest';
import { allSteps } from '../../data';
import { emptyProgress, normalizeProgress } from '../persistence/progress';
import { questCatalogue } from './catalogue';
import { manualMarks, manualTaskKey } from './snapshot';

describe("the owner's word for a manual quest requirement", () => {
  const quest = questCatalogue.find(q => q.requirements.manual?.length)!;
  const key = quest.requirements.manual![0];

  it('survives saving as a task tick and becomes the planner mark; untouched stays unconfirmed', () => {
    const known = { stepIds: new Set(allSteps.map(s => s.id)), levelIds: new Set<string>() };
    const saved = { ...emptyProgress(), tasksDone: { [manualTaskKey(quest, key)]: true as const } };
    const restored = normalizeProgress(JSON.parse(JSON.stringify(saved)), known)!.progress;
    expect(manualMarks(questCatalogue, restored.tasksDone)).toEqual({ [`${quest.id}:${key}`]: true });
    expect(manualMarks(questCatalogue, undefined)).toEqual({});
  });
});
