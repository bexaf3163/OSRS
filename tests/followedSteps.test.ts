import { describe, expect, it } from 'vitest';
import { followedSteps } from '../src/state/decision';
import { questCatalogue } from '../src/domain/planning/catalogue';
import type { CommittedDecision } from '../src/domain/planning/contracts';

// Which game step may outrank the planner (owner report 2026-11-08: a step left from the old route order stayed on the HUD).
const quest = (id: string) => questCatalogue.find(q => q.id === id)!;
const decision = { objectiveId: "Doric's Quest", activeAction: { stepId: quest("Doric's Quest").stepIds[0] } } as unknown as CommittedDecision;
const other = quest('The Corsair Curse').stepIds[0];
const states = (state: string) => ({ player: 'P', sessionId: 's', revision: 1, states: { 'The Corsair Curse': state } }) as never;

describe('the game step versus the planner', () => {
  it('keeps the objective\'s own steps, and a game step whose quest has started or whose guide is open in the game', () => {
    expect(followedSteps(decision, null, states('NOT_STARTED'), null)).toEqual(new Set(quest("Doric's Quest").stepIds));
    expect(followedSteps(decision, other, states('IN_PROGRESS'), null).has(other)).toBe(true);
    expect(followedSteps(decision, other, states('NOT_STARTED'), { stepId: other, stageAt: 1, lineIndex: 0, peeking: true } as never).has(other)).toBe(true);
  });

  it('drops a stale training step when the game reports quest states; an open quest step may be the player choice', () => {
    expect(followedSteps(decision, other, states('NOT_STARTED'), null).has(other)).toBe(true);
    expect(followedSteps(decision, 'S0-04', states('NOT_STARTED'), null).has('S0-04')).toBe(false);
  });

  it('keeps the game step when the plugin reports no quest states at all (unknown is not "not started")', () => {
    expect(followedSteps(decision, other, null, null).has(other)).toBe(true);
  });
});
