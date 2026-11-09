import { describe, expect, it } from 'vitest';
import { castCost, hidesToCover, OPTIONS, planFor, SPELLS, staffPayback, STAFFS, RUNE_IDS, COWHIDE_ID } from '../src/domain/combat/magicPlan';
import { combatLevel } from '../src/domain/player/xp';
import { xpForLevel } from '../src/domain/player/xp';
import type { FundingMethod } from '../src/domain/economy/funding/types';
import type { Step } from '../src/types';

// Prices as on the exchange on 03.10.2026: runes 6, mind 3, fire staff 940, air staff 1542, hide 125.
const prices = new Map<number, number>([
  [RUNE_IDS.air, 6], [RUNE_IDS.mind, 3], [RUNE_IDS.fire, 6], [RUNE_IDS.earth, 6], [RUNE_IDS.water, 6],
  [STAFFS.fire.id, 940], [STAFFS.air.id, 1542], [STAFFS.water.id, 1500], [STAFFS.earth.id, 1500], [COWHIDE_ID, 125],
]);
const spell = (id: string) => SPELLS.find((s) => s.id === id)!;
const opt = (id: string) => OPTIONS.find((o) => o.id === id)!;

describe('the magic plan', () => {
  it('the spell table — as on the wiki', () => {
    expect(SPELLS.map((s) => [s.name, s.level, s.xp])).toEqual([
      ['Wind Strike', 1, 5.5], ['Water Strike', 5, 7.5], ['Earth Strike', 9, 9.5], ['Fire Strike', 13, 11.5],
      ['Wind Bolt', 17, 13.5], ['Water Bolt', 23, 16.5], ['Earth Bolt', 29, 19.5], ['Fire Bolt', 35, 22.5],
      ['Wind Blast', 41, 25.5], ['Water Blast', 47, 28.5], ['Earth Blast', 53, 31.5], ['Fire Blast', 59, 34.5],
      ['Varrock Teleport', 25, 35], ['Lumbridge Teleport', 31, 41],
    ]);
    expect(spell('fire-strike').runes).toEqual({ fire: 3, air: 2, mind: 1 });
  });
  it('the price of a hit: the staff removes the runes of its element', () => {
    expect(castCost(spell('fire-strike'), undefined, prices)).toBe(33);
    expect(castCost(spell('fire-strike'), 'fire', prices)).toBe(15);
    expect(castCost(spell('wind-strike'), 'air', prices)).toBe(3);
    expect(castCost(spell('fire-strike'), undefined, new Map())).toBeNull();
  });
  it('from level 10 to 25: higher listed cast XP takes fewer casts, and the fire staff replaces paid runes', () => {
    const from = xpForLevel(10);
    const wind = planFor(opt('wind'), from, 25, prices)!;
    const best = planFor(opt('best'), from, 25, prices)!;
    const fire = planFor(opt('best-fire'), from, 25, prices)!;
    expect(wind.casts).toBeGreaterThan(best.casts * 1.5);
    expect(fire.runesCost).toBeLessThan(best.runesCost);
    expect(fire.staffCost).toBe(940);
    expect(fire.total).toBe(fire.runesCost + 940);
    // Up to level 13 — Earth Strike, then Fire Strike.
    expect(best.steps.map((s) => s.spell.id)).toEqual(['earth-strike', 'fire-strike']);
    // The experience from all the hits covers what is needed.
    const gained = best.steps.reduce((s, x) => s + x.casts * x.spell.xp, 0);
    expect(gained).toBeGreaterThanOrEqual(xpForLevel(25) - from);
  });
  it('from 25 to 33: Varrock teleports up to level 31, then Lumbridge; pricier than strikes, but two to three times fewer spells', () => {
    const tp = new Map(prices).set(RUNE_IDS.law, 120);
    const tele = planFor(opt('tele'), xpForLevel(25), 33, tp)!;
    const best = planFor(opt('best-fire'), xpForLevel(25), 33, tp)!;
    expect(tele.steps.map((s) => s.spell.id)).toEqual(['varrock-teleport', 'lumbridge-teleport']);
    expect(tele.casts).toBeLessThan(best.casts / 2);
    expect(tele.total).toBeGreaterThan(best.total);
    // Before level 25 there are no teleports — the option is not counted.
    expect(planFor(opt('tele'), xpForLevel(10), 25, tp)).toBeNull();
  });
  it('a staff is already owned — it costs nothing; no price — no plan', () => {
    expect(planFor(opt('best-fire'), xpForLevel(10), 25, prices, true)!.staffCost).toBe(0);
    expect(planFor(opt('best'), xpForLevel(10), 25, new Map())).toBeNull();
    expect(planFor(opt('best-fire'), xpForLevel(10), 25, new Map([[RUNE_IDS.air, 6], [RUNE_IDS.mind, 3], [RUNE_IDS.earth, 6], [RUNE_IDS.water, 6], [RUNE_IDS.fire, 6]]))).toBeNull();
  });
  it('the payback of the staff and the hide', () => {
    expect(staffPayback('fire', spell('fire-strike'), prices)).toEqual({ perCast: 18, casts: 53 });
    expect(hidesToCover(1000, prices)).toBe(8);
    expect(hidesToCover(1000, new Map())).toBeNull();
  });
});

describe('the combat level', () => {
  it('as in the game', () => {
    expect(combatLevel({ attack: 1, strength: 1, defence: 1, hitpoints: 10 })).toBe(3);
    expect(combatLevel({ attack: 40, strength: 40, defence: 40, hitpoints: 40, prayer: 20, magic: 1, ranged: 1 })).toBe(Math.floor(0.25 * (40 + 40 + 10) + 0.325 * 80));
    expect(combatLevel({ attack: 40 })).toBeNull();
  });
});

import { mmgFields, parseSkillsHtml } from '../scripts/data/money-parse';

const scp = (skill: string, level: string, tail = '') =>
  `<span class="scp" data-skill="${skill}" data-level="${level}" style="position:relative"><span class="mw-default-size"><a href="/w/${skill}" title="${skill}"><img alt="${skill}" src="x.png" /></a></span> ${level} </span>${tail}`;

describe('wiki parsing for earning methods', () => {
  it('levels from the rendered cell: every level, the recommended ones too (the pace is measured at them), and combat', () => {
    const cell = `${scp('Mining', '85+')}, ${scp('Attack', '40')} (optional), ${scp('Combat level', '20+')} recommended`;
    expect(parseSkillsHtml(cell)).toEqual([{ skill: 'mining', level: 85 }, { skill: 'attack', level: 40 }, { skill: 'combat', level: 20 }]);
    expect(parseSkillsHtml('None')).toEqual([]);
    expect(parseSkillsHtml(scp('Crafting', '56'))).toEqual([{ skill: 'crafting', level: 56 }]);
  });

  it('the Mmgtable card: top-level fields, nested templates do not break', () => {
    const f = mmgFields('{{Mmgtable\n|Activity = Tanning [[cowhide]]\n|Skill = {{SCP|Crafting|{{#var:skill}}}}\n|Input1 = Coins\n|Input2 = Cowhide\n|Input3 = Energy potion(4)\n|Quest = None\n}}');
    expect(f.activity).toBe('Tanning [[cowhide]]');
    expect(f.skill).toBe('{{SCP|Crafting|{{#var:skill}}}}');
    expect([f.input2, f.input3]).toEqual(['Cowhide', 'Energy potion(4)']);
  });
});

import { allSteps, fundingWikiJson } from '../src/data';

describe('data 2.13', () => {
  it('earning methods from the wiki: unique ids, wiki sources, free to play, a pace and a product sold every unit', () => {
    const methods = (fundingWikiJson as unknown as { methods: FundingMethod[] }).methods;
    expect(methods.length).toBeGreaterThan(40);
    expect(new Set(methods.map((m) => m.id)).size).toBe(methods.length);
    for (const m of methods) {
      expect(m.sources[0].url.startsWith('https://oldschool.runescape.wiki/w/')).toBe(true);
      expect(m.access).toBe('f2p');
      expect(m.rate.perHour.typical).toBeGreaterThan(0);
      expect(m.outputs.some((o) => !o.chance)).toBe(true);
    }
  });

  it('steps with a description that did not have one before: each has a quick path, and the last point is how the step ends', () => {
    for (const id of ['S1-07', 'S3-05', 'S4-02', 'S5-01', 'S5-05', 'S5-07']) {
      const s = allSteps.find((x) => x.id === id)!;
      expect(s.quickSteps?.length, id).toBeGreaterThanOrEqual(2);
    }
  });
});

import { foodInBag, foodsCovering, threatKeys, typicalHit, viewThreat } from '../src/domain/combat/foodAdvice';
import { FOODS, THREATS } from '../src/data/threats';

describe('food for combat', () => {
  it('wiki data: Elvarg — the shield lowers the flame to 10; Brutus — the special hit 19; food heals as on the wiki', () => {
    expect(THREATS.Elvarg.hits.map((h) => h.n)).toEqual([8, 70, 10]);
    expect(THREATS.Brutus.hits.find((h) => h.label === 'special')!.n).toBe(19);
    expect(Object.fromEntries(FOODS.map((f) => [f.name, f.heals]))).toMatchObject({ Lobster: 12, Swordfish: 14, Shrimps: 3, Trout: 7 });
  });
  it('the threshold: a flame without a shield is not counted, but is shown separately', () => {
    const t = typicalHit(THREATS.Elvarg);
    expect(t).toMatchObject({ typical: 10, worst: 70 });
    expect(t.excluded?.label).toBe('Dragonfire');
    const v = viewThreat('Elvarg', 40);
    expect(v.eatBelow).toBe(20);
    expect(v.survives).toBe(3);
    expect(v.everySeconds).toBe(2.4);
    expect(viewThreat('Melzar the Mad', undefined).survives).toBeNull();
  });
  it('enemy keys: foes and threats, without those with no data', () => {
    expect(threatKeys({ foes: ['Cow', 'Count Draynor'], threats: ['Elvarg'] })).toEqual(['Count Draynor', 'Elvarg']);
    expect(threatKeys({})).toEqual([]);
    expect(threatKeys(allSteps.find((s) => s.id === 'S5-08')!)).toEqual(['Elvarg']);
  });
  it('food from the bag by healing and food that covers a hit', () => {
    const bag = foodInBag([{ name: 'Trout', count: 3 }, { name: 'Lobster' }, { name: 'Coins', count: 50 }]);
    expect(bag.map((b) => [b.food.name, b.count])).toEqual([['Lobster', 1], ['Trout', 3]]);
    expect(foodInBag(null)).toEqual([]);
    expect(foodsCovering(10)[0].name).toBe('Tuna');
    expect(foodsCovering(99)).toEqual([]);
  });
});

import { fixChain } from '../src/domain/readiness/readiness';
import { toInGameTarget } from '../src/domain/guide/inGameTarget';

describe('the chain to readiness (§12) and data to the game', () => {
  const s = (id: string, requires: string[] = [], extra: Partial<Step> = {}): Step =>
    ({ id, stage: 1, type: 'skill', title: id, requires, doneWhen: '', ...extra }) as Step;
  const input = (steps: Step[], target: string, done: string[] = []) => ({
    step: steps.find((x) => x.id === target)!, steps,
    progress: { version: 3, steps: Object.fromEntries(done.map((d) => [d, 'done'])), levels: {}, notes: {}, updatedAt: '' } as never,
    qp: 0, mode: 'members' as const, stats: null, owned: null, gear: null,
  });
  it('S1-03 ← S1-02 ← S1-01: links in the order of execution, the step itself is not included', () => {
    const steps = [s('S1-01'), s('S1-02', ['S1-01']), s('S1-03', ['S1-02'])];
    expect(fixChain(input(steps, 'S1-03')).map((l) => l.step.id)).toEqual(['S1-01', 'S1-02']);
    expect(fixChain(input(steps, 'S1-03', ['S1-01'])).map((l) => l.step.id)).toEqual(['S1-02']);
    expect(fixChain(input(steps, 'S1-03', ['S1-01', 'S1-02']))).toEqual([]);
  });
  it('the depth is limited to three, a cycle does not loop', () => {
    const chain = [s('S1-01'), s('S1-02', ['S1-01']), s('S1-03', ['S1-02']), s('S1-04', ['S1-03']), s('S1-05', ['S1-04'])];
    expect(fixChain(input(chain, 'S1-05')).map((l) => l.step.id)).toEqual(['S1-02', 'S1-03', 'S1-04']);
    const loop = [s('S1-01', ['S1-02']), s('S1-02', ['S1-01'])];
    expect(fixChain(input(loop, 'S1-01')).map((l) => l.step.id)).toEqual(['S1-02']);
  });
  it('the maximum hit and "use X on Y" go to the game', () => {
    expect(toInGameTarget(allSteps.find((x) => x.id === 'S5-08')!)!.maxHit).toBe(10);
    expect(toInGameTarget(allSteps.find((x) => x.id === 'S2-03')!)!.useOn).toEqual([{ item: 'Raw rat meat', target: 'Fireplace' }]);
    expect(toInGameTarget(allSteps.find((x) => x.id === 'S1-03')!)!.maxHit).toBeUndefined();
  });
});
