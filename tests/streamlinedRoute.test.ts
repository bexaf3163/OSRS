import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { stepFoes } from '../src/domain/combat/gearAdvisor';
import { aggregateShopping } from '../src/domain/prep/shopping';
import { titleTargets } from '../src/data/targets';
import { triggerText } from '../src/domain/quests/triggers';
import { xpForLevel } from '../src/domain/player/xp';
import { RETIRED_STEPS, normalizeProgress } from '../src/domain/persistence/progress';

// Stages 3 and 4 after the streamlining: damage first (Attack and Strength), no Defence grind before Dragon Slayer I, the Adamant scimitar alone, the food bought.

const step = (id: string) => stepById.get(id)!;
const text = (id: string) => JSON.stringify(step(id)).toLowerCase();
const skillsOf = (id: string) => (step(id).inGame!.completionTrigger!.levels ?? []).map((l) => `${l.skill}:${l.level}`);

describe('S3-06 and S3-07: money for the Adamant scimitar only', () => {
  it('the goal is 2,500 gp of coins: ore or the scimitar in the bag is not cash', () => {
    const s = step('S3-06');
    expect(s.moneyGoal).toBe(2_500);
    expect(s.inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Coins'], count: 2500 }] });
    expect(s.title).toMatch(/Adamant scimitar/);
    expect(text('S3-06')).not.toMatch(/30,000|adamant (platebody|platelegs|kiteshield|full helm)/);
    expect(triggerText(s.inGame!.completionTrigger!)).toBe('you will have 2,500 × Coins (bag, equipped and bank together)');
  });

  it('the Exchange step buys the scimitar and nothing that needs Defence 30', () => {
    const s = step('S3-07');
    expect(s.itemsRequired!.map((i) => i.nameEn)).toEqual(['Adamant scimitar']);
    expect(s.inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Adamant scimitar'], count: 1 }] });
    expect(s.title).not.toMatch(/gear/i);
  });
});

describe('S3-08 and S4-03: Attack and Strength, no Defence', () => {
  // 2.55.1 (the owner's combat brief): Strength first on Aggressive, then Attack on Accurate; each skill paced to its own goal.
  it('S3-08 is Strength 20, then Attack 30, on the Stronghold of Security minotaurs, and nothing else', () => {
    const s = step('S3-08');
    expect(skillsOf('S3-08')).toEqual(['strength:20', 'attack:30']);
    expect(titleTargets(s.title)).toEqual([{ skill: 'strength', level: 20 }, { skill: 'attack', level: 30 }]);
    expect(s.foes).toEqual(['Minotaur']);
    expect(s.pacing).toMatchObject({ skill: 'strength', also: ['attack'], targetLevel: 20, actionName: 'minotaur|minotaurs', expPerAction: 40 });
    expect(s.pacing!.targetExp).toBe(xpForLevel(20));
    expect(s.pacing!.goals).toEqual({ attack: { level: 30, exp: xpForLevel(30) } });
    expect(s.mapLocation).toMatchObject({ x: 3081, y: 3420, plane: 0 });
    expect(s.where).toMatch(/Stronghold of Security/);
    expect(text('S3-08')).not.toMatch(/al kharid warrior|cow|defence 30/);
  });

  it('S4-03 is Attack 40 alone (it unlocks the Rune scimitar), with no Strength gate and no rune armour that needs Defence 40', () => {
    const s = step('S4-03');
    expect(skillsOf('S4-03')).toEqual(['attack:40']);
    expect(titleTargets(s.title)).toEqual([{ skill: 'attack', level: 40 }]);
    expect(s.doneWhen).not.toMatch(/Strength 35/);
    expect(s.pacing).toMatchObject({ skill: 'attack', targetLevel: 40 });
    expect(s.pacing!.also).toBeUndefined();
    // 2.55.1 (the combat brief): the food is part of the kit, the Strength potions and the amulet are advice.
    expect((s.itemsRecommended ?? []).map((i) => i.nameEn)).toEqual(['Strength potion(4)', 'Amulet of strength']);
    // The weapon that can be wielded before Attack 40; the Rune scimitar is not part of this step.
    expect(s.itemsRequired!.map((i) => i.nameEn)).toEqual(['Adamant scimitar', 'Salmon']);
  });

  it('no step before Dragon Slayer I asks for a Defence level', () => {
    for (const s of allSteps.filter((x) => !x.membersOnly && x.id < 'S5-08')) {
      const defence = (s.inGame?.completionTrigger?.levels ?? []).filter((l) => l.skill === 'defence');
      expect(defence, s.id).toEqual([]);
      expect(s.targets?.some((t) => t.skill === 'defence') ?? false, s.id).toBe(false);
    }
  });

  it('the pace per kill is 4 x the hit points of the opponent in the monster data: a minotaur has 10, so 40 XP', () => {
    const hp = { get: (name: string) => stepFoes({ foes: [name] })[0]?.hitpoints };
    expect(hp.get('Minotaur')).toBe(10);
    expect(step('S3-08').pacing!.expPerAction).toBe(4 * hp.get('Minotaur')!);
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
    expect(s.resourceSpots).toBeUndefined();
    const body = [s.where, s.how, ...(s.fields ?? []).filter((f) => !/why not/i.test(f.label)).map((f) => f.text)].join(' ');
    expect(body).not.toMatch(/Musa Point|Lobster pot|feather|fly fishing|fishing rod/i);
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

describe('S3-09 and S2-13 are out of the route', () => {
  it('neither step exists, and no step requires or names them', () => {
    expect(stepById.has('S3-09')).toBe(false);
    expect(stepById.has('S2-13')).toBe(false);
    for (const s of allSteps) {
      expect(s.requires, s.id).not.toContain('S3-09');
      expect(JSON.stringify(s), s.id).not.toMatch(/S3-09|S2-13/);
    }
    expect(RETIRED_STEPS).toEqual(['S1-11', 'S2-13', 'S3-09']);
  });

  it('a save that still holds them loads without them', () => {
    const known = { stepIds: new Set(allSteps.map((s) => s.id)), levelIds: new Set<string>() };
    const n = normalizeProgress({ version: 3, steps: { 'S3-09': 'done', 'S2-13': 'done', 'S3-08': 'done' } }, known)!;
    expect(Object.keys(n.progress.steps)).toEqual(['S3-08']);
  });

  it('the fly fishing kit is no longer on the big shopping list: it was for S2-13 only', () => {
    const names = step('S2-01').itemsRequired!.map((i) => i.nameEn);
    expect(names).not.toContain('Fly fishing rod');
    expect(names).not.toContain('Feather');
    expect(JSON.stringify(step('S2-01').inGame!.completionTrigger)).not.toMatch(/Feather|Fly fishing/);
  });

  it('the food that was to be fished is bought: Salmon says Grand Exchange, never a step', () => {
    // S3-08 and S4-03 carry the Salmon in the required kit since 2.55.1; it is still bought.
    for (const id of ['S3-08', 'S4-01', 'S4-02', 'S4-03']) {
      const salmon = [...(step(id).itemsRequired ?? []), ...(step(id).itemsRecommended ?? [])].find((i) => i.nameEn === 'Salmon')!;
      expect(salmon.howToGet, id).toMatch(/^Buy on the Grand Exchange/);
    }
  });
});

describe('S5-05: Wormbrain is paid 10,000 gp', () => {
  const lines = () => step('S5-05').questStages!.stages.flatMap((s) => s.do);

  it('the step requires only S5-01, asks for 10,000 coins, and has no spell, no fight and no runes', () => {
    const s = step('S5-05');
    expect(s.requires).toEqual(['S5-01']);
    expect(s.itemsRequired!.map((i) => [i.nameEn, i.amount])).toEqual([['Coins', 10000]]);
    const text = JSON.stringify([s.how, s.quickSteps, s.fields, s.questStages]);
    expect(text).toMatch(/10,000/);
    expect(text).not.toMatch(/Telekinetic|Magic 33|Wind Strike|Fire Strike|Law rune|law rune/);
    expect(lines().find((l) => l.k === 'optionsForLozarPiece')!.s).toBe('Wormbrain (Port Sarim Jail): pay 10,000 gp');
  });

  it('no step up to the finale asks for Magic 33', () => {
    for (const s of allSteps.filter((x) => !x.membersOnly && x.id <= 'S5-09')) {
      expect(s.targets?.some((t) => t.skill === 'magic' && t.level >= 33) ?? false, s.id).toBe(false);
      const levels = s.inGame?.completionTrigger?.levels ?? [];
      expect(levels.some((l) => l.skill === 'magic' && l.level >= 33), s.id).toBe(false);
    }
    expect(step('S5-01').fields!.map((f) => f.text).join(' ')).not.toMatch(/Magic 33/);
  });

  it('the bribe is on the shopping list as coins the step itself needs', () => {
    const route = allSteps.filter((x) => !x.membersOnly && x.id <= 'S5-09');
    expect(aggregateShopping(route).coins).toBeGreaterThanOrEqual(10_000);
  });
});

describe('S3-06 follows S3-05 and skips itself on the stage 3 rewards', () => {
  it('it comes right after Shield of Arrav and is only suggested after it: a skipped optional quest never blocks it', () => {
    const order = allSteps.filter((x) => !x.membersOnly).map((x) => x.id);
    expect(order.indexOf('S3-06')).toBe(order.indexOf('S3-05') + 1);
    expect(step('S3-05').optional).toBe(true);
    expect(step('S3-06').requires).toEqual([]);
    expect(step('S3-06').softRequires).toEqual(['S3-05']);
  });

  it('the coins from the stage 3 quests alone pass the 2,500 gp threshold, so the mining is bypassed', () => {
    const rewards = [2500, 2000, 600, 180];
    const total = rewards.reduce((a, b) => a + b, 0);
    expect(total).toBe(5280);
    const trigger = step('S3-06').inGame!.completionTrigger!;
    expect(trigger).toMatchObject({ type: 'ITEM_OWNED' });
    expect(trigger.anyOf).toBeUndefined();
    const coins = trigger.items!.find((i) => i.names.includes('Coins'))!;
    expect(coins.count).toBe(2500);
    // After the scimitar (about 1,400 gp) is bought the threshold is still passed.
    expect(total - 1_400).toBeGreaterThanOrEqual(coins.count);
    expect(step('S3-06').moneyGoal).toBe(2500);
  });
});
