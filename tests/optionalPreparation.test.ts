import { describe, expect, it } from 'vitest';
import { stepsFor } from '../src/data';
import { stepOrRetired } from './fixtures/retiredSteps';
import { emptyProgress } from '../src/domain/persistence/progress';
import { buildPlayerState } from '../src/domain/player/playerState';
import { F2P_SKILL_ADVICE } from '../src/domain/training/f2pSkillAdvice';
import { pickTraining } from '../src/domain/training/methodPick';
import { followedGoals, GOAL_REACHED, methodToolNames, withTrainingMethod } from '../src/domain/training/methodStep';
import { stepUpgradeCategories } from '../src/domain/training/gearUpgradeRouter';
import { market } from './funding/market';
import { retiredStep } from './fixtures/retiredSteps';

const run = (id: string, levels: Record<string, number>) => {
  const base = stepOrRetired(id);
  const state = buildPlayerState({ mode: 'f2p', connected: true, stats: { hitpoints: 30, defence: 33, ...levels },
    progress: { ...emptyProgress(), levels }, questsDone: ['Dragon Slayer I'],
    gear: { equipment: [], inventory: [], coins: 10000, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(methodToolNames(base).map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 0 }])) },
  });
  const pick = pickTraining(base, state, 'f2p', 'chill', 'balanced', { prices: market() }).pick;
  return { base, pick, step: withTrainingMethod(base, pick) };
};

describe('practical optional F2P preparation', () => {
  it('uses the Skills F2P checkpoints and shared Skills guidance for every optional skill', () => {
    expect(followedGoals(retiredStep('S6-01')!)).toEqual([{ skill: 'fishing', target: F2P_SKILL_ADVICE.fishing!.target }, { skill: 'cooking', target: F2P_SKILL_ADVICE.cooking!.target }]);
    expect(followedGoals(retiredStep('S6-02')!)).toEqual(['mining', 'woodcutting', 'firemaking'].map(skill => ({ skill, target: F2P_SKILL_ADVICE[skill as 'mining']!.target })));
    expect(stepsFor('members').some(s => s.stage === 6)).toBe(false);
    expect(methodToolNames(retiredStep('S6-02')!)).toEqual(expect.arrayContaining(['Tinderbox', 'Logs', 'Oak logs', 'Willow logs', 'Maple logs', 'Yew logs']));
  });
  it('hands Fishing35 over to Cooking without keeping the rod or old fishing destination', () => {
    const { step } = run('S6-01', { fishing: 35, cooking: 30 });
    expect(step.followsMethod).toBe('cooking');
    expect(step.itemsRequired?.some(n => /fishing|net|harpoon|feather/i.test(n.nameEn))).toBe(false);
    expect(step.inGame?.npcNames ?? []).not.toContain('Fishing spot');
    // Equipment is the engine's kit for the selected method (2.86.1), never a fixed note carried over from the previous phase.
    expect(step.fields?.some(f => f.label === 'Equipment')).toBe(false);
  });
  it.each([
    [{ mining: 45, woodcutting: 35, firemaking: 1 }, 'woodcutting', /pickaxe/i],
    [{ mining: 45, woodcutting: 36, firemaking: 1 }, 'firemaking', /pickaxe|(?:^| )axe$/i],
  ] as const)('switches the gathering phase and replaces its equipment advice', (levels, skill, obsolete) => {
    const { step } = run('S6-02', levels);
    expect(step.followsMethod).toBe(skill);
    expect(step.itemsRequired?.some(n => obsolete.test(n.nameEn))).toBe(false);
    expect(step.fields?.some(f => f.label === 'Equipment')).toBe(false);
    expect(stepUpgradeCategories(step)).toEqual(skill === 'woodcutting' ? ['woodcutting'] : []);
    if (skill === 'firemaking') expect(step.itemsRequired?.some(n => n.nameEn === 'Tinderbox')).toBe(true);
  });
  it('releases all supplies only when the three gathering checkpoints are reached', () => {
    const { pick, step } = run('S6-02', { mining: 45, woodcutting: 36, firemaking: 50 });
    expect(pick).toBe(GOAL_REACHED);
    expect(step.itemsRequired).toEqual([]);
    expect(step.mapLocation).toBeUndefined();
  });
});
