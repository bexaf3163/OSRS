import { describe, expect, it } from 'vitest';
import { stepById } from '../../data';
import { parseQuestInstruction, questManualProof, stepAtQuestCursor, validatedQuestCursor } from './questCursor';

describe('shared validated quest cursor', () => {
  it('rejects malformed, peeking and nonexistent authored stages or lines', () => {
    const step = stepById.get('S3-04')!, cursor = { stepId: step.id, stageAt: 40, lineIndex: 0, peeking: false };
    expect(validatedQuestCursor(step, cursor)).toEqual(cursor);
    for (const changed of [{ ...cursor, peeking: true }, { ...cursor, stageAt: 999 }, { ...cursor, lineIndex: 999 }, { ...cursor, stepId: 'S3-01' }]) {
      expect(validatedQuestCursor(step, changed)).toBeNull();
      expect(stepAtQuestCursor(step, changed)).toBe(step);
    }
    expect(parseQuestInstruction({ ...cursor, lineIndex: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
  });
  it('does not repurchase consumed quest ingredients after a real stage transition', () => {
    const step = stepById.get('S3-04')!;
    const scoped = stepAtQuestCursor(step, { stepId: step.id, stageAt: 40, lineIndex: 0, peeking: false });
    expect(step.itemsRequired!.some(item => item.nameEn === 'Beer')).toBe(true);
    expect(scoped.itemsRequired).toEqual([]);
    expect(scoped.id).toBe(step.id);
    expect(scoped.questStages).toBe(step.questStages);
    expect(step.itemsRequired!.some(item => item.nameEn === 'Beer')).toBe(true);
  });
  it('gives confirmed entry food the entry amount as a recommendation and drops it on the following line', () => {
    const step = stepById.get('S9-01')!;
    const entering = stepAtQuestCursor(step, { stepId: step.id, stageAt: 2, lineIndex: 0, peeking: false });
    // Guide food is never a requirement on its own (owner rule 2026-11-08); the entry amount is the suggestion.
    expect(entering.itemsRecommended?.find(item => item.nameEn === 'Tuna')?.amount).toBe(4);
    expect(entering.itemsRequired?.some(item => item.nameEn === 'Tuna')).toBe(false);
    const inside = stepAtQuestCursor(step, { stepId: step.id, stageAt: 2, lineIndex: 2, peeking: false });
    expect(inside.itemsRequired?.some(item => item.nameEn === 'Tuna')).toBe(false);
    expect(inside.itemsRecommended?.find(item => item.nameEn === 'Tuna')?.amount).toBe(step.itemsRecommended?.find(item => item.nameEn === 'Tuna')?.amount);
    expect(step.itemsRequired?.some(item => item.nameEn === 'Tuna')).toBe(false);
  });
  it('retires only declared encounters strictly before an observed authored cursor', () => {
    const step = stepById.get('S3-04')!;
    const at = (stageAt: number) => stepAtQuestCursor(step, { stepId: step.id, stageAt, lineIndex: 0, peeking: false });
    expect(at(35).threats).toContain('Ancient Guardian');
    expect(at(40).threats).not.toContain('Ancient Guardian');
    expect(step.threats).toContain('Ancient Guardian');
    for (const candidate of [{ ...step, threats: [...step.threats!, 'New unclassified foe'] },
      { ...step, questStages: { ...step.questStages!, encounters: [{ foe: 'Ancient Guardian', throughLine: 'absent' }] } }]) {
      expect(stepAtQuestCursor(candidate, { stepId: step.id, stageAt: 40, lineIndex: 0, peeking: false }).threats)
        .toContain(candidate.threats!.at(-1));
    }
  });
  it('distinguishes two fights within one quest variable without accepting display peeks as proof', () => {
    const step = stepById.get('S5-03')!;
    const at = (lineIndex: number, peeking = false) => stepAtQuestCursor(step, { stepId: step.id, stageAt: 0, lineIndex, peeking });
    expect(at(14).threats).toEqual(step.threats);
    expect(at(15).threats).toEqual(['Lesser demon']);
    expect(at(16).threats).toEqual(['Lesser demon']);
    expect(at(17).threats).toEqual([]);
    expect(at(17, true)).toBe(step);
  });
  it('accepts exact live partner proof on either final branch, never a later stage number or a certificate half', () => {
    const step = stepById.get('S3-05')!, certificate = { id: 769, name: 'Certificate', count: 1 };
    const at = (stageAt: number, lineIndex: number, peeking = false) => ({ stepId: step.id, stageAt, lineIndex, peeking });
    for (const cursor of [at(3, 14), at(9, 4)]) expect(questManualProof(step, 'partner', cursor, [certificate])).toBe(true);
    for (const cursor of [at(9, 3), at(3, 13), at(9, 4, true), at(99, 0)]) expect(questManualProof(step, 'partner', cursor, [certificate])).toBe(false);
    for (const inventory of [null, [], [{ ...certificate, id: 11173 }], [{ ...certificate, count: 0 }], [{ ...certificate, noted: true }]]) {
      expect(questManualProof(step, 'partner', at(9, 4), inventory)).toBe(false);
    }
    expect(questManualProof(step, 'another prerequisite', at(9, 4), [certificate])).toBe(false);
  });
});
