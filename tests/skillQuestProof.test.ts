import { describe, expect, it } from 'vitest';
import { guideFor } from '../src/data/skillGuideRegistry';
import { emptyProgress } from '../src/lib/progress';
import { questRewardDone } from '../src/lib/skillGuide';

const quest = guideFor('smithing').steps.find(s => s.reward?.quest === "The Knight's Sword")!;
const progress = (status?: 'done' | 'skipped') => ({ ...emptyProgress(), steps: status ? { [quest.reward!.routeStepId!]: status } : {} });

describe('skill quest reward proof', () => {
  it('a skipped route quest does not prove its reward when the game is unread', () => {
    expect(quest.reward?.routeStepId).toBeTruthy();
    expect(questRewardDone(quest, progress('skipped'), null)).toBe(false);
  });
  it('a known incomplete quest overrides a manual done mark', () => {
    expect(questRewardDone(quest, progress('done'), [])).toBe(false);
  });
  it('another completed quest does not validate the marked quest', () => {
    expect(questRewardDone(quest, progress('done'), ["Doric's Quest"])).toBe(false);
  });
  it('the actual completed quest works even if its route entry was skipped', () => {
    expect(questRewardDone(quest, progress('skipped'), ["The Knight's Sword"])).toBe(true);
  });
  it('manual done remains a fallback while quest data is unknown', () => {
    expect(questRewardDone(quest, progress('done'), null)).toBe(true);
  });
  it('live quest names retain the existing case-insensitive comparison', () => {
    expect(questRewardDone(quest, progress(), ["the knight's sword"])).toBe(true);
  });
  it('unknown facts and non-quest methods do not acquire a reward', () => {
    expect(questRewardDone(quest, progress(), null)).toBe(false);
    expect(questRewardDone({}, progress('done'), ["The Knight's Sword"])).toBe(false);
  });
});
