import { describe, expect, it } from 'vitest';
import { allSteps } from '../../data';
import { buildPlayerState } from '../player/playerState';
import { questCatalogue, questEvidence, questExecutionSteps, questSkillTargets, remainingQuestSteps } from './catalogue';
import type { QuestFact } from './catalogue';
import { createQuestModel } from './questModel';
import type { QuestModelAdapters } from './questModel';
import type { CandidateAction, PlanningSnapshot } from './contracts';
import { decide, observedProjection, projectSuccess } from './decision';
import { noTime } from './cost';
import { forecastProcurement } from './procurement';
import { createTacticalResolver } from './tactical';
import { emptyProgress } from '../persistence/progress';
import { fakePrices } from '../../../tests/funding/helpers';

const snapshot = (): PlanningSnapshot => ({ scope: { characterId: 'fixture', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 },
  player: buildPlayerState({ mode: 'f2p', progress: { levels: { mining: 1 } }, stats: null, gear: null, owned: null, questsDone: null }),
  xp: { mining: { known: true, value: 0, source: 'profile' } }, quests: {}, questPoints: { known: true, value: 0, source: 'game' }, manual: {} });
const adapters = (): QuestModelAdapters => ({ prepare: () => ({ action: null, minutes: noTime(), capabilities: {}, resources: [] }), work: () => ({ ...noTime(), typical: 5, slow: 5 }),
  travel: () => noTime(), training: () => ({ ...noTime(), typical: 10, slow: 10 }), remainingPreparation: () => noTime() });
const goal = (id: string, skills = {}): QuestFact => ({ id, stepIds: [id], members: false, requirements: { skills, questPoints: 0, quests: [], text: '' },
  rewards: { questPoints: 1, xp: {} }, length: 'Short', source: { url: 'fixture://quest', revision: 1, retrievedAt: '2026-11-06' } });

describe('source-aware quest model', () => {
  it('shares a costed physical tool across macro forecasts while the current executable action still requires its real acquisition', () => {
    const observed = snapshot(), facts = [goal('first'), goal('second')], progress = emptyProgress(), prices = fakePrices({ Hammer: { buy: 100 } });
    facts[0].rewards.coins = 100;
    observed.player = buildPlayerState({ mode: 'f2p', connected: true, player: 'Fixture', stats: { mining: 1 }, progress, questsDone: [],
      gear: { equipment: [], inventory: [], coins: 300, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map([['hammer', { name: 'Hammer', carried: 0, noted: 0, bank: 0 }]]) } });
    observed.quests = Object.fromEntries(facts.map(q => [q.id, { state: 'NOT_STARTED' as const, source: 'game' }]));
    const steps = facts.map(q => ({ ...allSteps[0], id: q.id, requires: [], itemsRequired: [{ nameEn: 'Hammer', amount: 1, howToGet: '' }] }));
    const tactical = createTacticalResolver({ snapshot: observed, progress, prices, window: steps, ironman: false, earn: () => null });
    const shared = adapters();
    shared.prepare = (step, quest, snapshot, projection) => {
      const forecast = forecastProcurement({ snapshot, projection, steps: [step], prices, ironman: false, detail: () => undefined });
      return { action: tactical.resolve(step, quest.id).action, minutes: noTime(), capabilities: {}, resources: forecast?.purchase ? [forecast.purchase] : null };
    };
    const model = createQuestModel(observed, facts, steps, shared), start = observedProjection(observed);
    const first = model.evaluate('first', start)!;
    expect(first.activeAction).toMatchObject({ kind: 'BUY', expectedEffects: [] });
    const after = projectSuccess(start, first.effects);
    expect(after.resources?.items.hammer).toEqual({ floor: 1, complete: true });
    expect(after.resources?.gp.floor).toBe(300); //100purchase first, then100quest reward.
    const second = model.evaluate('second', after)!;
    expect(projectSuccess(after, second.effects).resources?.gp.floor).toBe(300); // No second tool purchase.
    expect(tactical.resolve(steps[1], 'second').action?.kind).toBe('BUY'); // Conditional ownership never becomes current readiness.
    expect(observed.player.owned?.items.get('hammer')?.bank).toBe(0);
  });
  it.each([null, undefined])('does not retain starting resources when a macro flow is unmodelled or omitted (%s)', resources => {
    const observed = snapshot(), quest = goal('unknown flow'), shared = adapters();
    quest.rewards.coins = 100;
    observed.quests = { [quest.id]: { state: 'NOT_STARTED', source: 'game' } };
    // The typed contract requires a flow; an older/untyped adapter still fails closed at runtime.
    shared.prepare = () => ({ action: null, minutes: null, capabilities: {}, resources }) as ReturnType<QuestModelAdapters['prepare']>;
    const start = observedProjection(observed);
    const evaluation = createQuestModel(observed, [quest], [{ ...allSteps[0], id: quest.id }], shared).evaluate(quest.id, start)!;
    expect(evaluation.effects).toContainEqual({ kind: 'resources-unknown', source: quest.source.url, afterSuccessOnly: true });
    expect(projectSuccess(start, evaluation.effects).resources?.gp).toEqual({ floor: 100, complete: false });
    expect(observed.player.coins.bag.known).toBe(false);
  });
  it('removes false global ordering while retaining Dragon Slayer intra-quest IDs and order', () => {
    const steps = questExecutionSteps(allSteps);
    expect(steps.find(s => s.id === 'S2-12')!.requires).toEqual([]); // Goblin Diplomacy does not require Prince Ali.
    expect(steps.find(s => s.id === 'S2-07')!.requires).toEqual([]); // Buying in an old shopping row is not a quest prerequisite.
    expect(steps.find(s => s.id === 'S2-07')!.requirements).toContainEqual({ type: 'skill', skill: 'mining', min: 10, when: 'during', boostable: true });
    expect(steps.find(s => s.id === 'S3-04')!.requirements).toContainEqual({ type: 'skill', skill: 'mining', min: 10, when: 'during', boostable: true });
    const dragon = questCatalogue.find(q => q.id === 'Dragon Slayer I')!;
    dragon.stepIds.slice(1).forEach((id, index) => expect(steps.find(s => s.id === id)!.requires).toEqual([dragon.stepIds[index]]));
    expect(allSteps.find(s => s.id === 'S2-12')!.requires).toContain('S2-10'); // Input remains intact for history/migration.
  });

  it('does not infer unstarted status from absence in completed names or invent a stage from manual route marks', () => {
    const facts = questEvidence(questCatalogue, null, [], null);
    expect(Object.values(facts).every(q => q.state === 'UNKNOWN')).toBe(true);
    const observed = snapshot();
    observed.quests = { "Doric's Quest": { state: 'IN_PROGRESS', source: 'game' } };
    const model = createQuestModel(observed, questCatalogue, allSteps, adapters());
    const evaluation = model.evaluate("Doric's Quest", observedProjection(observed))!;
    expect(evaluation.activeAction.kind).toBe('VERIFY');
    expect(evaluation.effects).toEqual([]);
    // No stage is invented: the evidence stays stageless. The check points the game at the quest's only step, where the plugin reads the stage.
    expect(observed.quests["Doric's Quest"]).not.toHaveProperty('stepId');
    expect(evaluation.activeAction.stepId).toBe('S3-01');
  });

  it('maps only the active non-peeking validated cursor to an in-progress quest', () => {
    const observation = { player: 'fixture', sessionId: 'login', revision: 1, states: { "Doric's Quest": 'IN_PROGRESS' as const } };
    const facts = questEvidence(questCatalogue, observation, [], { stepId: 'S3-01', stageAt: 1, lineIndex: 2, peeking: false });
    expect(facts["Doric's Quest"].stepId).toBe('S3-01');
    expect(questEvidence(questCatalogue, observation, [], { stepId: 'S3-01', stageAt: 1, lineIndex: 2, peeking: true })["Doric's Quest"].stepId).toBeUndefined();
  });

  it('never starts a skill-gated quest if its tactical adapter failed to provide prerequisite training', () => {
    const observed = snapshot(), q = goal('mining quest', { mining: 10 });
    observed.quests = { [q.id]: { state: 'NOT_STARTED', source: 'game' } };
    const step = { ...allSteps[0], id: q.id };
    const model = createQuestModel(observed, [q], [step], adapters());
    expect(model.evaluate(q.id, observedProjection(observed))?.activeAction.kind).toBe('VERIFY');
  });
  it('fails closed when a later authored quest part or the reported cursor is unavailable', () => {
    const observed = snapshot(), q = { ...goal('multipart'), stepIds: ['first', 'missing'] };
    observed.quests = { [q.id]: { state: 'NOT_STARTED', source: 'game' } };
    const model = createQuestModel(observed, [q], [{ ...allSteps[0], id: 'first' }], adapters());
    expect(model.evaluate(q.id, observedProjection(observed))?.activeAction.kind).toBe('VERIFY');
    observed.quests = { [q.id]: { state: 'IN_PROGRESS', stepId: 'invalid-cursor', source: 'game' } };
    expect(createQuestModel(observed, [q], [{ ...allSteps[0], id: 'first' }], adapters()).evaluate(q.id, observedProjection(observed))?.activeAction.kind).toBe('VERIFY');
  });
  it('keeps resource branches separate and carries only costed physical effects into lookahead', () => {
    const observed = snapshot(), q = goal('resources'), start = observedProjection(observed);
    observed.quests = { [q.id]: { state: 'NOT_STARTED', source: 'game' } };
    const shared = adapters();
    shared.prepare = (_step, _goal, _snapshot, p) => ({ action: null, capabilities: {},
      minutes: { ...noTime(), typical: p.resources?.items.bucket?.floor ? 0 : 5, slow: 5 },
      resources: [{ items: [{ name: 'Bucket', delta: 1 }], gp: 0, source: 'Synthetic quest reward' }] });
    const model = createQuestModel(observed, [q], [{ ...allSteps[0], id: q.id }], shared);
    const first = model.evaluate(q.id, start)!;
    const stocked = projectSuccess(start, [{ kind: 'resources', change: { items: [{ name: 'Bucket', delta: 1 }], gp: 0, source: 'Synthetic purchase' }, afterSuccessOnly: true }]);
    expect(model.evaluate(q.id, stocked)?.cost.prepare?.typical).toBe(0);
    expect(first.cost.prepare?.typical).toBe(5);
    expect(model.evaluate(q.id, start)).toBe(first);
    expect(projectSuccess(start, first.effects).resources?.items.bucket.floor).toBe(1);
  });

  it('cannot use a quest reward to pay its own prerequisite costs or change current liquid GP', () => {
    const observed = snapshot(), quest = goal('cash'), shared = adapters();
    quest.rewards.coins = 600;
    observed.quests = { cash: { state: 'NOT_STARTED', source: 'game' } };
    shared.prepare = () => ({ action: null, minutes: noTime(), capabilities: {}, resources: [{ items: [], gp: -10, source: 'Required fee before reward' }] });
    const model = createQuestModel(observed, [quest], [{ ...allSteps[0], id: quest.id }], shared);
    const start = observedProjection(observed), result = model.evaluate(quest.id, start)!;
    expect(projectSuccess(start, result.effects).invalidResources).toBe(true);
    const funded = { ...start, resources: { ...start.resources!, gp: { floor: 10, complete: true } } };
    expect(projectSuccess(funded, result.effects).resources?.gp.floor).toBe(600);
    expect(observed.player.coins.bag.known).toBe(false);
    expect(start.resources?.gp.floor).toBe(0);
  });
  it('compares quest XP savings without inventing durations for identical, source-backed unmeasured work', () => {
    const observed = snapshot(), trainingQuest = goal('a-mining', { mining: 10 }), reward = goal('z-reward');
    reward.rewards.xp = { mining: 1300 };
    observed.quests = Object.fromEntries([trainingQuest, reward].map(q => [q.id, { state: 'NOT_STARTED', source: 'game' }]));
    const shared = adapters();
    shared.work = () => null;
    shared.sharedUnmeasuredWork = () => 'Synthetic fixed conversations; no variable fight or recovery';
    shared.training = (_skill, _target, p) => {
      const minutes = Math.max(0, 1300 - (p.xp.mining ?? 0)) / 100;
      return { fast: minutes, typical: minutes, slow: minutes, source: 'Synthetic shared training model' };
    };
    shared.prepare = (step, q, _s, p) => ({ minutes: noTime(), capabilities: {}, resources: [], action: q.id === trainingQuest.id && (p.xp.mining ?? 0) < 1300 ? {
      id: 'train-mining', kind: 'TRAIN', goalId: q.id, stepId: step.id, title: 'Train Mining', feasibility: 'READY', prerequisites: [],
      completionEvidence: [{ source: 'fixture', snapshotRevision: 1, predicate: 'Mining 10 observed' }], expectedEffects: [],
      time: null, gpCost: null, sourceIds: ['fixture'], reasons: ['Prepare the quest'] } : null });
    const facts = [trainingQuest, reward], steps = facts.map(q => ({ ...allSteps[0], id: q.id }));
    const decision = decide(observed, createQuestModel(observed, facts, steps, shared))!;
    expect(decision.objectiveId).toBe(reward.id);
    expect(decision.estimatedRemaining).toBeNull();
    expect(decision.why).toContain('Comparable known costs exclude shared unmeasured work; total remaining time is unknown');
    expect(decision.alternatives[0]).toMatchObject({ minutes: null, comparisonReason: expect.stringContaining('identical unmeasured work') });
    expect(observed.xp.mining).toMatchObject({ value: 0 });
    const unshared = decide(observed, createQuestModel(observed, facts, steps, { ...shared, sharedUnmeasuredWork: undefined }))!;
    expect(unshared.estimatedRemaining).toBeNull();
    expect(unshared.why.join(' ')).not.toContain('exclude shared unmeasured work');
  });
  it('does not let a during-quest recommendation erase a hard requirement of the same skill', () => {
    const observed = snapshot(), q = goal('mining quest', { mining: 10 });
    observed.quests = { [q.id]: { state: 'NOT_STARTED', source: 'game' } };
    const step = { ...allSteps[0], id: q.id, requirements: [{ type: 'skill' as const, skill: 'mining', min: 10 },
      { type: 'skill' as const, skill: 'mining', min: 15, when: 'during' as const }] };
    expect(createQuestModel(observed, [q], [step], adapters()).evaluate(q.id, observedProjection(observed))?.activeAction.kind).toBe('VERIFY');
  });

  it('delegates an executable skill gap to the shared adapter and counts shared training only once in the future horizon', () => {
    const observed = snapshot(), quests = [goal('a', { mining: 10 }), goal('b', { mining: 10 })];
    observed.quests = Object.fromEntries(quests.map(q => [q.id, { state: 'NOT_STARTED', source: 'game' }]));
    const calls: string[] = [], shared = adapters();
    shared.prepare = (_step, q) => {
      const action: CandidateAction = { id: `${q.id}:train:mining`, goalId: q.id, kind: 'TRAIN', title: 'Mining to 10', feasibility: 'READY', prerequisites: [],
        completionEvidence: [{ source: 'game', snapshotRevision: 1, predicate: 'Mining >= 10' }],
        expectedEffects: [], time: noTime(), gpCost: null, sourceIds: ['fixture'], reasons: ['Quest prerequisite'] };
      return { action, minutes: noTime(), capabilities: {}, resources: [] };
    };
    shared.training = skill => { calls.push(skill); return { ...noTime(), typical: 10, slow: 10 }; };
    const model = createQuestModel(observed, quests, quests.map(q => ({ ...allSteps[0], id: q.id })), shared);
    const projection = observedProjection(observed);
    expect(model.evaluate('a', projection)?.activeAction.kind).toBe('TRAIN');
    calls.length = 0;
    expect(model.remaining(projection)?.typical).toBe(20); // two 5-minute quests + one 10-minute training gap
    expect(calls).toEqual(['mining']);
    const afterFirst = projectSuccess(projection, model.evaluate('a', projection)!.effects);
    expect(model.remaining(afterFirst)?.typical).toBe(5); // The first quest's prerequisite training is already in its own cost.
    expect(afterFirst.xp.mining).toBeUndefined();
    expect(afterFirst.xpBounds?.mining.min).toBe(1154);
    expect(observed.xp.mining).toMatchObject({ value: 0 });
    expect(model.remaining({ ...projection, xp: { mining: 1300 } })?.typical).toBe(10);
    expect(observed.player.levels.mining).toEqual({ known: true, value: 1, source: 'profile' });
  });

  it('includes one joint remaining procurement estimate and refuses to call unknown procurement free', () => {
    const observed = snapshot(), quests = [goal('a'), goal('b')], shared = adapters();
    const steps = quests.map(q => ({ ...allSteps[0], id: q.id }));
    let allocations = 0;
    shared.remainingPreparation = goals => { allocations++; expect(goals.map(q => q.id)).toEqual(['a', 'b']); return { ...noTime(), typical: 7, slow: 7 }; };
    expect(createQuestModel(observed, quests, steps, shared).remaining(observedProjection(observed))?.typical).toBe(17);
    expect(allocations).toBe(1);
    shared.remainingPreparation = () => null;
    expect(createQuestModel(observed, quests, steps, shared).remaining(observedProjection(observed))).toBeNull();
  });

  it('keeps partner help explicit without blocking an independent quest', () => {
    const observed = snapshot(), partner = goal('partner'), independent = goal('independent');
    partner.requirements.manual = ['partner'];
    const quests = [partner, independent];
    observed.quests = Object.fromEntries(quests.map(q => [q.id, { state: 'NOT_STARTED', source: 'game' }]));
    const model = createQuestModel(observed, quests, quests.map(q => ({ ...allSteps[0], id: q.id })), adapters());
    expect(model.evaluate(partner.id, observedProjection(observed))?.activeAction).toMatchObject({ kind: 'MANUAL_WAIT', title: 'Confirm the partner for partner' });
    expect(decide(observed, model)?.objectiveId).toBe(independent.id);
    observed.manual = { 'partner:partner': true };
    expect(createQuestModel(observed, quests, quests.map(q => ({ ...allSteps[0], id: q.id })), adapters())
      .evaluate(partner.id, observedProjection(observed))?.activeAction.kind).toBe('QUEST');
  });

  it('does not block the final certificate turn-in on partner help already proven by the live bag', () => {
    const observed = snapshot(), partner = questCatalogue.find(quest => quest.id === 'Shield of Arrav')!;
    const steps = questExecutionSteps(allSteps);
    observed.quests = { [partner.id]: { state: 'IN_PROGRESS', source: 'game', stepId: 'S3-05' } };
    observed.instruction = { stepId: 'S3-05', stageAt: 3, lineIndex: 14, peeking: false };
    observed.player = { ...observed.player, connected: true };
    observed.combat = { stats: {}, gear: { equipment: [], inventory: [{ id: 769, name: 'Certificate', count: 1 }], coins: 0, bankCoins: null } };
    const evaluate = () => createQuestModel(observed, [partner], steps, adapters()).evaluate(partner.id, observedProjection(observed))?.activeAction.kind;
    expect(evaluate()).toBe('QUEST');
    observed.player = { ...observed.player, connected: false };
    expect(evaluate()).toBe('MANUAL_WAIT');
    observed.player = { ...observed.player, connected: true };
    observed.combat.gear!.inventory = [];
    expect(evaluate()).toBe('MANUAL_WAIT');
    expect(observed.manual).toEqual({});
  });

  it('requires proof for unmodelled mechanics and combat regeneration', () => {
    const observed = snapshot(), quest = goal('fight'), step = { ...allSteps[0], id: quest.id }, shared = adapters();
    observed.quests = { [quest.id]: { state: 'NOT_STARTED', source: 'game' } };
    quest.requirements.capabilities = ['combat', 'regeneration'];
    const evaluate = () => createQuestModel(observed, [quest], [step], shared).evaluate(quest.id, observedProjection(observed));
    expect(evaluate()?.activeAction.kind).toBe('VERIFY');
    shared.prepare = () => ({ action: null, minutes: noTime(), capabilities: { combat: 'met', regeneration: 'met' }, resources: [] });
    expect(evaluate()?.activeAction.kind).toBe('QUEST');
    quest.requirements.unparsed = 'An unsupported mechanic';
    expect(evaluate()?.activeAction.kind).toBe('VERIFY');
  });

  it('costs the selected strategy, and only game stage evidence can remove an earlier part', () => {
    const quest = goal('strategy'), observed = snapshot(), shared = adapters();
    quest.stepIds = ['part-1', 'part-2'];
    const steps = [{ ...allSteps[0], id: 'part-1', requirements: [{ type: 'skill' as const, skill: 'mining', min: 10, when: 'during' as const }] },
      { ...allSteps[0], id: 'part-2', requirements: [] }];
    const map = new Map(steps.map(step => [step.id, step]));
    expect(questSkillTargets(quest, remainingQuestSteps(quest, map))).toEqual({ mining: 10 });
    observed.quests = { [quest.id]: { state: 'NOT_STARTED', source: 'game' } };
    expect(createQuestModel(observed, [quest], steps, shared).remaining(observedProjection(observed))?.typical).toBe(15);
    observed.quests = { [quest.id]: { state: 'IN_PROGRESS', stepId: 'part-2', source: 'game' } };
    expect(createQuestModel(observed, [quest], steps, shared).remaining(observedProjection(observed))?.typical).toBe(5);
    expect(questSkillTargets(quest, remainingQuestSteps(quest, map, observed.quests[quest.id]))).toEqual({});
  });
  it('keeps the requested goal locked while executing its real quest prerequisite', () => {
    const observed = snapshot(), first = goal('prerequisite'), selected = goal('selected'), unrelated = goal('unrelated');
    selected.requirements.quests = [first.id];
    const quests = [selected, first, unrelated];
    observed.quests = Object.fromEntries(quests.map(q => [q.id, { state: 'NOT_STARTED', source: 'game' }]));
    const model = createQuestModel(observed, quests, quests.map(q => ({ ...allSteps[0], id: q.id })), adapters());
    const decision = decide(observed, model, { lockedObjectiveId: selected.id });
    expect(decision).toMatchObject({ objectiveId: first.id, requestedObjectiveId: selected.id });
    expect(decision?.why.join(' ')).toContain('selected goal');
    expect(decision?.alternatives.some(a => a.id === unrelated.id)).toBe(false);
  });
  it('builds quest points for a locked quest instead of treating a QP threshold as a dead end', () => {
    const observed = snapshot(), selected = goal('selected'), first = goal('points');
    selected.requirements.questPoints = 1;
    observed.quests = { selected: { state: 'NOT_STARTED', source: 'game' }, points: { state: 'NOT_STARTED', source: 'game' } };
    const quests = [selected, first], model = createQuestModel(observed, quests, quests.map(q => ({ ...allSteps[0], id: q.id })), adapters());
    expect(decide(observed, model, { lockedObjectiveId: selected.id })).toMatchObject({ objectiveId: first.id, requestedObjectiveId: selected.id });
    const projection = projectSuccess(observedProjection(observed), model.evaluate(first.id, observedProjection(observed))!.effects);
    expect(model.prerequisitesFor?.(selected.id, projection)).toEqual([selected.id]);
    expect(observed.questPoints).toMatchObject({ value: 0 });
  });
});
