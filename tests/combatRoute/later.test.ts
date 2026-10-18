import { describe, expect, it } from 'vitest';
import { defenceXpOf, laterDefence } from '../../src/lib/combatRoute/later';
import { allSteps, stepById } from '../../src/data';

describe('the Defence XP the route gives later', () => {
  it('reads the stated amounts, and leaves out a reward the player chooses', () => {
    expect(defenceXpOf('2 QP, 18,650 XP each in Defence and Strength, the right to wear the Rune platebody')).toBe(18650);
    expect(defenceXpOf('2 QP, 3,000 Crafting XP, 2,000 Defence XP, 2,000 Hitpoints XP')).toBe(2000);
    expect(defenceXpOf("Daero's training (choose: 35,000 XP in Attack and Defence plus 20,000 in Strength and Hitpoints, or the other way round)")).toBe(0);
    expect(defenceXpOf('1 QP, 500 Strength XP')).toBe(0);
    expect(defenceXpOf(undefined)).toBe(0);
  });

  it('after the Hill Giants step: Dragon Slayer I (S5-09) first, then Nature Spirit, in route order', () => {
    const later = laterDefence(allSteps, 'S4-03');
    expect(later[0]).toMatchObject({ stepId: 'S5-09', xp: 18650 });
    expect(later.map((l) => l.stepId)).toContain('S8-02');
    expect(later.map((l) => l.stepId)).not.toContain('S9-04');
    const order = later.map((l) => allSteps.findIndex((s) => s.id === l.stepId));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('a step already closed gives nothing more, and one behind the current step is not ahead', () => {
    expect(laterDefence(allSteps, 'S4-03', (id) => id === 'S5-09').some((l) => l.stepId === 'S5-09')).toBe(false);
    expect(laterDefence(allSteps, 'S4-03', () => true)).toEqual([]);
    expect(laterDefence(allSteps, 'S5-09').some((l) => l.stepId === 'S5-09')).toBe(false);
    expect(laterDefence(allSteps, 'nonsense')).toEqual([]);
  });

  it("the route's own words still carry the number the plans rely on", () => {
    expect(stepById.get('S5-09')?.reward).toMatch(/18,650 XP each in Defence/);
  });
});
