import { describe, expect, it } from 'vitest';
import { skills } from '../src/data';
import { f2pAdviceFor, f2pAdviceLabel, F2P_SKILL_ADVICE } from '../src/lib/f2pSkillAdvice';

describe('advisory F2P checkpoints', () => {
  it('covers every free skill and passive Hitpoints, without recommendations for members-only skills', () => {
    const free = [...skills.flatMap(skill => skill.levelSkills), 'hitpoints'];
    expect(new Set(Object.keys(F2P_SKILL_ADVICE))).toEqual(new Set(free));
    expect(f2pAdviceFor('slayer')).toBeNull();
    expect(f2pAdviceFor('invalid')).toBeNull();
    for (const id of free) {
      const row = f2pAdviceFor(id)!;
      if (row.target !== null) expect(row.target).toBeGreaterThanOrEqual(1);
      if (row.target !== null) expect(row.target).toBeLessThanOrEqual(99);
      expect(row.sources.every(url => url.startsWith('https://oldschool.runescape.wiki/w/'))).toBe(true);
      expect(row.comparison.length).toBeGreaterThan(0);
    }
  });

  it('does not turn an unread level into a reached milestone or turn passive skills into a grind', () => {
    const cooking = f2pAdviceFor('cooking')!;
    expect(cooking.target).toBe(68);
    expect(f2pAdviceLabel(cooking)).not.toContain('reached');
    expect(f2pAdviceLabel(cooking, 67)).not.toContain('reached');
    expect(f2pAdviceLabel(cooking, 68)).toContain('reached');
    expect(f2pAdviceLabel(cooking, NaN)).not.toContain('reached');
    for (const id of ['prayer', 'runecraft', 'hitpoints']) expect(f2pAdviceFor(id)?.target).toBeNull();
  });
  it('provides concise equipment guidance for every supported peaceful F2P skill', () => {
    for (const skill of ['cooking', 'fishing', 'woodcutting', 'mining', 'firemaking', 'smithing', 'crafting', 'runecraft', 'prayer']) {
      expect(f2pAdviceFor(skill)?.equipment).toBeTruthy();
      expect(f2pAdviceFor(skill)!.equipment!.length).toBeLessThan(180);
    }
  });

});
