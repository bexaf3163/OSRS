import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { adviseTraining, preparationNeeds, questTrainingStep, trainingMethods, type TrainingAdvice } from '../src/lib/trainingRouter';
import { trackedTraining } from '../src/lib/trackedTraining';
import { toInGameTarget } from '../src/services/runeliteBridge';
import type { SkillName } from '../src/lib/skillGuide';
import { qa } from '../scripts/qa';

const stateFor = (skill: string, level: number, tool?: string) => buildPlayerState({
  connected: true, player: 'Non-combat test', mode: 'f2p', progress: emptyProgress(),
  stats: { [skill]: level, attack: 1, strength: 1, defence: 1, hitpoints: 10 },
  questsDone: allSteps.flatMap(s => s.inGame?.completionTrigger?.questName ?? []),
  gear: { equipment: [], inventory: tool ? [{ id: 0, name: tool, count: 1 }] : [], coins: 100000, bankCoins: 0 },
  owned: { bankSeen: true, items: new Map(tool ? [[tool.toLowerCase(), { name: tool, carried: 1, noted: 0, bank: 0 }]] : []) },
});

describe('non-combat skills inherit the common staged lifecycle', () => {
  it.each([
    ['woodcutting', 'wc-oak', 'Mithril axe'], ['mining', 'mi-iron', 'Mithril pickaxe'],
  ])('%s preparation names the owned modelled tool, carried without its Attack requirement', (skill, id, tool) => {
    const state = stateFor(skill, 21, tool), before = structuredClone(state);
    const advice = adviseTraining({ skill, target: 30, mode: 'f2p', state, style: 'chill', priority: 'balanced', methods: trainingMethods.filter(m => m.id === id) });
    expect(advice.best?.method.selectedTool).toBe(tool);
    expect(advice.upgrade).toBeNull();
    expect(preparationNeeds(advice, state)).toContainEqual({ type: 'item', name: tool, count: 1 });
    const plan = trackedTraining({ skill: skill as SkillName, mode: 'fast', target: 30 }, state, 'f2p', 'chill', 'balanced')!;
    expect(plan.step.itemsRequired).toContainEqual(expect.objectContaining({ nameEn: tool, amount: 1 }));
    expect(plan.step.itemsRequired?.find(item => item.nameEn === tool)?.equip).not.toBe(true);
    expect(state).toEqual(before);
  });

  const stages: [SkillName, number[], number][] = [
    ['mining', [1, 15, 41], 45], ['woodcutting', [1, 15, 30], 36],
    ['fishing', [1, 20, 30], 35], ['cooking', [1, 20, 30, 35], 68],
    ['firemaking', [1, 15, 30, 45], 50], ['crafting', [1, 9, 20, 30], 31],
    ['smithing', [29, 33], 40], ['runecraft', [1, 9, 14], 20], ['prayer', [1, 7], 9],
  ];
  for (const [skill, levels, target] of stages) it.each(levels)(`${skill} level %i keeps a real prepared step at each declared unlock`, level => {
    const state = stateFor(skill, level, skill === 'woodcutting' ? 'Mithril axe' : skill === 'mining' ? 'Mithril pickaxe' : undefined);
    const before = structuredClone(state);
    const plan = trackedTraining({ skill, mode: 'fast', target }, state, 'f2p', 'chill', 'balanced')!;
    expect(plan.target).toBe(target);
    expect(plan.complete).toBe(false);
    expect(plan.step.id).toMatch(/^S0-\d{2}$/);
    expect(plan.step.followsMethod).toBe(skill);
    expect(plan.step.quickSteps?.length).toBeGreaterThan(0);
    const wire = toInGameTarget(plan.step)!;
    expect(wire.stepId).toBe(plan.step.id);
    expect(wire.goal).toBeTruthy();
    expect(state).toEqual(before);
  });

  it('a declared reward checkpoint uses the actual quest guide without awarding XP or inferring completion', () => {
    const state = stateFor('smithing', 1);
    state.quests = { known: true, value: [], source: 'game' };
    const progress = emptyProgress();
    const advice = adviseTraining({ skill: 'smithing', target: 29, mode: 'f2p', state, style: 'chill', priority: 'balanced' });
    const before = structuredClone({ state, progress });
    expect(questTrainingStep(advice, state, allSteps, progress)?.id).toBe('S2-07');
    expect(questTrainingStep(advice, { ...state, quests: { known: false } }, allSteps, progress)?.id).toBe('S2-07');
    expect({ state, progress }).toEqual(before);
    expect(questTrainingStep(advice, state, allSteps, { ...progress, steps: { 'S2-07': 'skipped' } })).toBeNull();
    expect(questTrainingStep(advice, { ...state, quests: { known: true, value: ["The Knight's Sword"], source: 'game' } }, allSteps, progress)).toBeNull();
    expect(questTrainingStep({ ...advice, target: 10 }, state, allSteps, progress)).toBeNull();
    expect(questTrainingStep(advice, state, [], progress)).toBeNull();
    expect(questTrainingStep({ ...advice, level: 29 }, state, allSteps, progress)).toBeNull();
    expect(questTrainingStep({ ...advice, quests: advice.quests.map(method => ({ ...method, xpTotal: 10 })) }, state, allSteps, progress)).toBeNull();
    expect(questTrainingStep({ ...advice, quests: advice.quests.map(method => ({ ...method, members: true })) }, state, allSteps, progress)).toBeNull();
  });
  it('future quest content inherits validation and the same shortcut rule', () => {
    const state = stateFor('crafting', 1);
    state.quests = { known: true, value: [], source: 'game' };
    const step = { ...stepById.get('S2-07')!, id: 'S99-01', inGame: { completionTrigger: { type: 'QUEST_COMPLETED' as const, questName: 'Future training quest' } } };
    const method = { ...trainingMethods.find(m => m.id === 'sm-knight')!, id: 'future-quest', skills: ['crafting'], questGuide: { name: 'Future training quest', stepId: step.id } };
    const advice = { skill: 'crafting', level: 1, target: 29, xpLeft: 12000, quests: [method] } as TrainingAdvice;
    expect(questTrainingStep(advice, state, [step], emptyProgress())).toBe(step);
    expect(questTrainingStep({ ...advice, quests: [{ ...method, questGuide: { ...method.questGuide, name: 'Different quest' } }] }, state, [step], emptyProgress())).toBeNull();
    const raw = { ...method, skill: 'crafting', xph: undefined, xpa: undefined, xpTotal: method.xpTotal ?? undefined };
    const input = { steps: [step], gear: { items: [] }, questStages: { quests: {} }, training: { methods: [raw] } };
    expect(qa(input).filter(i => i.rule === 'training-quest-guide')).toEqual([]);
    expect(qa({ ...input, steps: [] }).some(i => i.rule === 'training-quest-guide')).toBe(true);
  });
});
