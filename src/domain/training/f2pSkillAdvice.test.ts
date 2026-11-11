import { describe, expect, it } from 'vitest';
import { skills } from '../../data';
import { f2pAdviceFor, f2pAdviceLabel, F2P_SKILL_ADVICE } from './f2pSkillAdvice';

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
      // One reason why it stops there; the rate is the engine's, on the training card, never a copied figure here.
      expect(row.reason.length).toBeGreaterThan(0);
      expect(row.reason).not.toMatch(/XP\/h|\d{2},\d{3}/);
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

});
