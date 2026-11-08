import { describe, expect, it } from 'vitest';
import type { Step } from '../../types';
import type { QuestFact } from './catalogue';
import type { CommittedDecision, PlanningSnapshot } from './contracts';
import { buildPlayerState } from '../player/playerState';
import { planningWindow } from './window';
import { observedProjection } from './decision';
import { forecastProcurement } from './procurement';
import { fakePrices } from '../../../tests/funding/helpers';

const step = (id: string, amount = 1, type: Step['type'] = 'quest'): Step => ({ id, type, stage: 0, title: id, requires: [], doneWhen: 'Observed',
  itemsRequired: [{ nameEn: 'Bucket', amount, howToGet: '' }] });
const quest = (id: string, stepIds: string[]): QuestFact => ({ id, stepIds, members: false, requirements: { skills: {}, quests: [], questPoints: 0, text: '' },
  rewards: { xp: {}, questPoints: 1 }, length: null, source: { revision: 1, retrievedAt: 'fixture', url: 'fixture://source' } });
function fixture() {
  const snapshot: PlanningSnapshot = { scope: { characterId: 'fixture', gameSessionId: 'login', mode: 'f2p', snapshotRevision: 1 },
    xp: {}, manual: {}, questPoints: { known: true, value: 0, source: 'game' },
    quests: { chosen: { state: 'NOT_STARTED', source: 'game' }, next: { state: 'NOT_STARTED', source: 'game' }, unrelated: { state: 'NOT_STARTED', source: 'game' } },
    player: buildPlayerState({ mode: 'f2p', connected: true, progress: { levels: {} }, stats: {}, questsDone: [],
      gear: { equipment: [], inventory: [], coins: 1000, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map([['bucket', { name: 'Bucket', carried: 0, noted: 0, bank: 0 }]]) } }) };
  const steps = [step('unrelated'), step('A1'), step('A2'), step('A3'), step('B1')];
  const decision: CommittedDecision = { ...snapshot.scope, revision: 1, objectiveId: 'chosen', followingObjectiveId: 'next', confidence: 'LOW',
    activeAction: { id: 'chosen:QUEST:A1', goalId: 'chosen', stepId: 'A1', kind: 'QUEST', title: 'Current', feasibility: 'READY', prerequisites: [],
      expectedEffects: [], completionEvidence: [], sourceIds: ['fixture'], reasons: [], time: null, gpCost: null },
    alternatives: [], expectedNext: { effects: [], evidenceRequired: [] }, why: [], estimatedRemaining: null };
  return { snapshot, decision, current: steps[1], steps, catalogue: [quest('unrelated', ['unrelated']), quest('next', ['B1']), quest('chosen', ['A1', 'A2', 'A3'])] };
}

describe('committed physical reservation window', () => {
  it('uses the validated current quest cursor and selected second horizon, not catalogue or old global route order', () => {
    const input = fixture();
    input.snapshot.quests = { ...input.snapshot.quests, chosen: { state: 'IN_PROGRESS', stepId: 'A2', source: 'game' } };
    input.current = input.steps[2];
    input.decision.activeAction = { ...input.decision.activeAction, stepId: 'A2' };
    expect(planningWindow(input).map(step => step.id)).toEqual(['A2', 'A3', 'B1']);
  });
  it('reserves a training detour kit before the quest it prepares and does not skip straight to a different objective', () => {
    const input = fixture();
    input.current = step('training', 2, 'skill');
    input.decision.activeAction = { ...input.decision.activeAction, kind: 'TRAIN', stepId: 'training' };
    expect(planningWindow(input).map(step => step.id)).toEqual(['training', 'A1', 'A2']);
  });
  it('keeps distinct funding and parent kits even when they share a historical ID, allocating both through real Shopping', () => {
    const input = fixture();
    input.current = step('A1', 2, 'prep');
    input.decision.activeAction = { ...input.decision.activeAction, kind: 'EARN' };
    const steps = planningWindow(input);
    expect(steps.map(step => [step.id, step.type])).toEqual([['A1', 'prep'], ['A1', 'quest'], ['A2', 'quest']]);
    const procurement = forecastProcurement({ ...input, projection: observedProjection(input.snapshot), steps,
      prices: fakePrices({ Bucket: { buy: 10 } }), ironman: false, detail: () => undefined });
    expect(procurement?.requiredGp).toBe(40); //2 funding +1 parent +1 next part, each once.
  });
  it('refuses stale ownership scopes and a current kit from a different action', () => {
    const input = fixture();
    for (const scope of [{ ...input.decision, characterId: 'other' }, { ...input.decision, mode: 'members' as const },
      { ...input.decision, gameSessionId: 'other' }, { ...input.decision, snapshotRevision: 2 }]) {
      expect(planningWindow({ ...input, decision: scope })).toEqual([]);
    }
    expect(planningWindow({ ...input, current: step('wrong') })).toEqual([]);
  });
  it('does not invent successors when content or future quest evidence is missing', () => {
    const input = fixture();
    expect(planningWindow({ ...input, steps: input.steps.filter(step => step.id !== 'A2') }).map(step => step.id)).toEqual(['A1']);
    input.snapshot.quests = { ...input.snapshot.quests, chosen: { state: 'IN_PROGRESS', stepId: 'A3', source: 'game' }, next: { state: 'UNKNOWN', source: 'unread' } };
    input.current = input.steps[3];
    input.decision.activeAction = { ...input.decision.activeAction, stepId: 'A3' };
    expect(planningWindow(input).map(step => step.id)).toEqual(['A3']);
    input.snapshot.quests = { ...input.snapshot.quests, chosen: { state: 'IN_PROGRESS', stepId: 'A2', source: 'game' } };
    expect(planningWindow(input)).toEqual([]); // A stale stage is not a new current action.
  });
});
