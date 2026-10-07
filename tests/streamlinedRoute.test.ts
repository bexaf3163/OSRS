import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import goalsFile from '../src/data/goals.json';
import foeData from '../src/data/monsters.json';
import { aggregateShopping } from '../src/lib/shopping';
import { titleTargets } from '../src/lib/targets';
import { triggerText } from '../src/lib/triggers';
import { xpForLevel } from '../src/lib/xp';

// Stages 3 and 4 after the streamlining: damage first (Attack and Strength), no Defence grind before Dragon Slayer I, the Adamant scimitar alone, the food bought.

const step = (id: string) => stepById.get(id)!;
const text = (id: string) => JSON.stringify(step(id)).toLowerCase();
const skillsOf = (id: string) => (step(id).inGame!.completionTrigger!.levels ?? []).map((l) => `${l.skill}:${l.level}`);

describe('S3-06 and S3-07: money for the Adamant scimitar only', () => {
  it('the goal is 2,500 gp, and any one of 2,500 coins, 25 iron ore or the scimitar completes the step', () => {
    const s = step('S3-06');
    expect(s.moneyGoal).toBe(2_500);
    expect(s.inGame!.completionTrigger).toEqual({
      type: 'ITEM_OWNED', anyOf: true,
      items: [{ names: ['Coins'], count: 2500 }, { names: ['Iron ore'], count: 25 }, { names: ['Adamant scimitar'], count: 1 }],
    });
    expect(s.title).toMatch(/Adamant scimitar/);
    expect(text('S3-06')).not.toMatch(/30,000|adamant (platebody|platelegs|kiteshield|full helm)/);
    expect(triggerText(s.inGame!.completionTrigger!)).toBe('you will have any of 2,500 × Coins, 25 × Iron ore or Adamant scimitar (bag, equipped and bank together)');
  });

  it('the Exchange step buys the scimitar and nothing that needs Defence 30', () => {
    const s = step('S3-07');
    expect(s.itemsRequired!.map((i) => i.nameEn)).toEqual(['Adamant scimitar']);
    expect(s.inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Adamant scimitar'], count: 1 }] });
    expect(s.title).not.toMatch(/gear/i);
  });
});

describe('S3-08 and S4-03: Attack and Strength, no Defence', () => {
  it('S3-08 is Attack 30 and Strength 20 on the Stronghold of Security minotaurs, and nothing else', () => {
    const s = step('S3-08');
    expect(skillsOf('S3-08')).toEqual(['attack:30', 'strength:20']);
    expect(titleTargets(s.title)).toEqual([{ skill: 'attack', level: 30 }, { skill: 'strength', level: 20 }]);
    expect(s.foes).toEqual(['Minotaur']);
    expect(s.pacing).toMatchObject({ skill: 'attack', targetLevel: 30, actionName: 'minotaur|minotaurs', expPerAction: 40 });
    expect(s.pacing!.also).toBeUndefined();
    expect(s.pacing!.targetExp).toBe(xpForLevel(30));
    expect(s.mapLocation).toMatchObject({ x: 3081, y: 3420, plane: 0 });
    expect(s.where).toMatch(/Stronghold of Security/);
    expect(text('S3-08')).not.toMatch(/al kharid warrior|cow|defence 30/);
  });

  it('S4-03 is Attack 40 and Strength 35, with no rune armour that needs Defence 40', () => {
    const s = step('S4-03');
    expect(skillsOf('S4-03')).toEqual(['attack:40', 'strength:35']);
    expect(titleTargets(s.title)).toEqual([{ skill: 'attack', level: 40 }, { skill: 'strength', level: 35 }]);
    expect(s.pacing).toMatchObject({ skill: 'attack', targetLevel: 40 });
    expect(s.pacing!.also).toBeUndefined();
    expect((s.itemsRecommended ?? []).map((i) => i.nameEn)).toEqual(['Salmon']);
    expect(s.itemsRequired!.map((i) => i.nameEn)).toContain('Rune scimitar');
  });

  it('no step before Dragon Slayer I asks for a Defence level', () => {
    for (const s of allSteps.filter((x) => !x.membersOnly && x.id < 'S5-08')) {
      const defence = (s.inGame?.completionTrigger?.levels ?? []).filter((l) => l.skill === 'defence');
      expect(defence, s.id).toEqual([]);
      expect(s.targets?.some((t) => t.skill === 'defence') ?? false, s.id).toBe(false);
    }
  });

  it('the pace per kill is 4 x the hit points of the opponent in the monster data: a minotaur has 10, so 40 XP', () => {
    const hp = new Map((foeData as unknown as { foes: { name: string; hitpoints: number }[] }).foes.map((f) => [f.name, f.hitpoints]));
    expect(hp.get('Minotaur')).toBe(10);
    expect(step('S3-08').pacing!.expPerAction).toBe(4 * hp.get('Minotaur')!);
    expect(hp.has('Al Kharid warrior')).toBe(false);
  });
});

describe('S4-04: the food is bought, not fished on Karamja', () => {
  it('it is a purchase of 20 cooked Lobster, completed by owning them, with Barbarian Village fly fishing only as an option', () => {
    const s = step('S4-04');
    expect(s.type).toBe('gear');
    expect(s.itemsRequired).toHaveLength(1);
    expect(s.itemsRequired![0]).toMatchObject({ nameEn: 'Lobster', amount: 20 });
    expect(s.inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Lobster'], count: 20 }] });
    expect(s.mapLocation).toMatchObject({ x: 3164, y: 3487 });
    expect(s.resourceSpots!.map((p) => p.label)).toEqual(['Optional: fly fishing at Barbarian Village']);
    const body = [s.where, s.how, ...(s.fields ?? []).filter((f) => !/why not/i.test(f.label)).map((f) => f.text)].join(' ');
    expect(body).not.toMatch(/Musa Point|Lobster pot/i);
  });

  it('the lobsters are counted once in the shopping list: the voyage step takes them from S4-04', () => {
    const route = allSteps.filter((x) => !x.membersOnly && x.id <= 'S5-09');
    const list = aggregateShopping(route);
    const lobster = list.required.find((l) => l.nameEn === 'Lobster')!;
    expect(lobster.count).toBe(20);
    expect(step('S5-08').itemsRequired!.find((i) => i.nameEn === 'Lobster')!.howToGet).toMatch(/S4-04/);
  });

  it('the one Lobster pot the route needs is the Oracle one, bought at S4-05', () => {
    const owners = allSteps.filter((x) => !x.membersOnly && x.id <= 'S5-09' && x.itemsRequired?.some((i) => i.nameEn === 'Lobster pot')).map((x) => x.id);
    expect(owners).toEqual(['S4-05', 'S5-04']);
  });
});

describe('the stage goals follow the streamlined route', () => {
  const rows = Object.fromEntries((goalsFile as unknown as { rows: { id: string; values: { raw: string; min: number; max?: number }[] }[] }).rows.map((r) => [r.id, r.values]));

  it('Defence is 1 through stage 4, and 33 after Dragon Slayer I (18,650 XP from level 1)', () => {
    expect(rows.defence.slice(0, 5).map((v) => v.min)).toEqual([1, 1, 1, 1, 33]);
    expect(xpForLevel(33)).toBeLessThanOrEqual(18_650);
    expect(xpForLevel(34)).toBeGreaterThan(18_650);
    expect(rows.defence[5].min).toBeGreaterThan(rows.defence[4].min);
  });

  it('Attack stays 30 and 40, Strength is 20-25, then 35-40, then 40-44 with what Dragon Slayer I adds', () => {
    expect(rows.attack.map((v) => v.min).slice(2, 4)).toEqual([30, 40]);
    expect(rows.strength.slice(2, 5)).toMatchObject([{ min: 20, max: 25 }, { min: 35, max: 40 }, { min: 40, max: 44 }]);
    // Strength 35 plus the quest reward reaches the stage 5 goal (40), and 40 reaches 44.
    expect(xpForLevel(35) + 18_650).toBeGreaterThanOrEqual(xpForLevel(40));
    expect(xpForLevel(40) + 18_650).toBeGreaterThanOrEqual(xpForLevel(44));
  });

  it('Fishing and Cooking stay at 30 until the food is no longer fished', () => {
    for (const id of ['fishing', 'cooking']) expect(rows[id].slice(2, 5).map((v) => v.min), id).toEqual([30, 30, 30]);
  });

  it('no goal goes down from one stage to the next', () => {
    for (const [id, values] of Object.entries(rows)) {
      const mins = values.map((v) => v.min);
      expect(mins, id).toEqual([...mins].sort((a, b) => a - b));
    }
  });
});
