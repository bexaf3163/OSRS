import { describe, expect, it } from 'vitest';
import { stepsFor } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { gearQuestEvidence } from '../src/lib/gearAdvice';

const steps = stepsFor('members');
const prince = steps.find(s => s.title === 'Prince Ali Rescue')!;
const dragon = steps.find(s => s.inGame?.completionTrigger?.type === 'QUEST_COMPLETED' && s.inGame.completionTrigger.questName === 'Dragon Slayer I')!;
const marked = (id: string, status: 'done' | 'skipped') => ({ ...emptyProgress(), steps: { [id]: status } });

describe('Gear uses quest completion evidence', () => {
  it('skipping Prince Ali Rescue does not waive the toll', () => {
    expect(gearQuestEvidence(steps, marked(prince.id, 'skipped'), null).freeToll).toBe(false);
  });
  it('live incomplete overrides a manual Prince Ali Rescue mark', () => {
    const proof = gearQuestEvidence(steps, marked(prince.id, 'done'), []);
    expect(proof.freeToll).toBe(false);
    expect(proof.questsDone.has('Prince Ali Rescue')).toBe(false);
  });
  it('a live completed quest unlocks the toll without a route mark', () => {
    const proof = gearQuestEvidence(steps, emptyProgress(), ['Prince Ali Rescue']);
    expect(proof.freeToll).toBe(true);
    expect(proof.questsDone.has('Prince Ali Rescue')).toBe(true);
  });
  it('Dragon Slayer gear access follows live evidence rather than a stale done mark', () => {
    expect(gearQuestEvidence(steps, marked(dragon.id, 'done'), []).questsDone.has('Dragon Slayer I')).toBe(false);
    expect(gearQuestEvidence(steps, emptyProgress(), ['Dragon Slayer I']).questsDone.has('Dragon Slayer I')).toBe(true);
  });
  it('an explicit manual completion remains usable while game quests are unread', () => {
    expect(gearQuestEvidence(steps, marked(prince.id, 'done'), null).freeToll).toBe(true);
    expect(gearQuestEvidence(steps, marked(dragon.id, 'done'), null).questsDone.has('Dragon Slayer I')).toBe(true);
  });
  it('live names are canonicalized for route quest consumers', () => {
    const proof = gearQuestEvidence(steps, emptyProgress(), ['prince ali rescue', 'dragon slayer i']);
    expect(proof.freeToll).toBe(true);
    expect(proof.questsDone.has('Dragon Slayer I')).toBe(true);
  });
  it('a partial quest milestone is never inferred as full quest completion', () => {
    const partial = steps.find(s => s.title.startsWith('Fairytale II') && s.inGame?.completionTrigger?.type === 'VARBIT_CHANGED')!;
    expect(partial).toBeTruthy();
    const proof = gearQuestEvidence(steps, marked(partial.id, 'done'), null);
    expect(proof.questsDone.has('Fairytale II - Cure a Queen')).toBe(false);
  });
});
