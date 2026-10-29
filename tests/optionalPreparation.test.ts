import { describe, expect, it } from 'vitest';
import { stepById, stepsFor } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { F2P_SKILL_ADVICE } from '../src/lib/f2pSkillAdvice';
import { pickMethods } from '../src/lib/methodPick';
import { followedGoals, GOAL_REACHED, methodToolNames, withTrainingMethod } from '../src/lib/methodStep';
import { stepUpgradeCategories } from '../src/services/gearUpgradeRouter';
import { market } from './funding/market';

const run = (id: string, levels: Record<string, number>) => {
  const base = stepById.get(id)!;
  const state = buildPlayerState({ mode: 'f2p', connected: true, stats: { hitpoints: 30, defence: 33, ...levels },
    progress: { ...emptyProgress(), levels }, questsDone: ['Dragon Slayer I'],
    gear: { equipment: [], inventory: [], coins: 10000, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(methodToolNames(base).map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 0 }])) },
  });
  const pick = pickMethods([base], state, 'f2p', 'chill', 'balanced', { prices: market() })[id];
  return { base, pick, step: withTrainingMethod(base, pick) };
};

describe('practical optional F2P preparation', () => {
  it('uses modest checkpoints and shared Skills guidance instead of forced 50/60 grinds', () => {
    expect(followedGoals(stepById.get('S6-02')!)).toEqual([{ skill: 'fishing', target: F2P_SKILL_ADVICE.fishing!.target }, { skill: 'cooking', target: 35 }]);
    expect(followedGoals(stepById.get('S6-03')!)).toEqual(['mining', 'woodcutting', 'firemaking'].map(skill => ({ skill, target: F2P_SKILL_ADVICE[skill as 'mining']!.target })));
    expect(stepsFor('members').some(s => s.stage === 6)).toBe(false);
    expect(methodToolNames(stepById.get('S6-03')!)).toEqual(expect.arrayContaining(['Tinderbox', 'Logs', 'Oak logs', 'Willow logs', 'Maple logs', 'Yew logs']));
  });
  it('hands Fishing35 over to Cooking without keeping the rod or old fishing destination', () => {
    const { step } = run('S6-02', { fishing: 35, cooking: 30 });
    expect(step.followsMethod).toBe('cooking');
    expect(step.itemsRequired?.some(n => /fishing|net|harpoon|feather/i.test(n.nameEn))).toBe(false);
    expect(step.inGame?.npcNames ?? []).not.toContain('Fishing spot');
    expect(step.fields?.find(f => f.label === 'Equipment')?.text).toBe(F2P_SKILL_ADVICE.cooking!.equipment);
  });
  it.each([
    [{ mining: 45, woodcutting: 35, firemaking: 1 }, 'woodcutting', /pickaxe/i],
    [{ mining: 45, woodcutting: 36, firemaking: 1 }, 'firemaking', /pickaxe|(?:^| )axe$/i],
  ] as const)('switches the gathering phase and replaces its equipment advice', (levels, skill, obsolete) => {
    const { step } = run('S6-03', levels);
    expect(step.followsMethod).toBe(skill);
    expect(step.itemsRequired?.some(n => obsolete.test(n.nameEn))).toBe(false);
    expect(step.fields?.filter(f => f.label === 'Equipment')).toEqual([{ label: 'Equipment', text: F2P_SKILL_ADVICE[skill]!.equipment }]);
    expect(stepUpgradeCategories(step)).toEqual(skill === 'woodcutting' ? ['woodcutting'] : []);
    if (skill === 'firemaking') expect(step.itemsRequired?.some(n => n.nameEn === 'Tinderbox')).toBe(true);
  });
  it('releases all supplies only when the three gathering checkpoints are reached', () => {
    const { pick, step } = run('S6-03', { mining: 45, woodcutting: 36, firemaking: 50 });
    expect(pick).toBe(GOAL_REACHED);
    expect(step.itemsRequired).toEqual([]);
    expect(step.mapLocation).toBeUndefined();
  });
  it('keeps a Bond optional rather than creating a mandatory shopping shortfall', () => {
    const step = stepById.get('S6-05')!;
    expect(step.optional).toBe(true);
    expect(step.itemsRequired ?? []).toEqual([]);
    expect(step.itemsRecommended ?? []).toEqual([]);
    expect(step.wikiUrl).toContain('Old_school_bond');
    expect(step.mapLocation).toBeUndefined();
  });
});
