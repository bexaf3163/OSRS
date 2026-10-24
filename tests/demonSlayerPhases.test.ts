// T06/T07: Demon Slayer has three bank-to-bank phases. Before Traiborn the 25 bones are a later need, not a blocker for the drain; at the
// stone circle only Silverlight and food matter.
import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { currentLoadoutStep, loadoutPhase } from '../src/lib/loadoutPhase';
import type { QuestInstruction } from '../src/services/runeliteBridge';

const step = stepById.get('S3-03')!;
const at = (k: string): QuestInstruction => {
  const stage = step.questStages!.stages.find(s => s.do.some(d => d.k === k))!;
  return { stepId: 'S3-03', stageAt: stage.at, lineIndex: stage.do.findIndex(d => d.k === k), peeking: false } as QuestInstruction;
};
const required = (k: string) => (currentLoadoutStep(step, at(k)).itemsRequired ?? []).map(i => i.nameEn);

describe('Demon Slayer loadouts', () => {
  it('each phase starts at a canonical line', () => {
    expect(loadoutPhase(step, at('useFilledBucketOnDrain'))?.id).toBe('keys');
    expect(loadoutPhase(step, at('talkToTraiborn'))?.id).toBe('bones');
    expect(loadoutPhase(step, at('killDelrithStep'))?.id).toBe('fight');
  });

  it('the drain phase needs the bucket and not yet the 25 bones; Traiborn needs the bones; the fight needs neither', () => {
    expect(required('useFilledBucketOnDrain')).toEqual(expect.arrayContaining(['Bucket of water']));
    expect(required('useFilledBucketOnDrain')).not.toContain('Bones');
    expect(required('talkToTraiborn')).toContain('Bones');
    expect(required('talkToTraiborn')).not.toContain('Bucket of water');
    expect(required('killDelrithStep')).not.toEqual(expect.arrayContaining(['Bones']));
  });

  it('Shopping and the watch list keep the whole quest', () => {
    expect((step.itemsRequired ?? []).map(i => i.nameEn)).toEqual(expect.arrayContaining(['Bones', 'Bucket of water', 'Coins']));
  });
});
