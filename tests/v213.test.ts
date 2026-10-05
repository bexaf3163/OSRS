import { describe, expect, it } from 'vitest';
import { castCost, hidesToCover, OPTIONS, planFor, SPELLS, staffPayback, STAFFS, RUNE_IDS, COWHIDE_ID } from '../src/lib/magicPlan';
import { adviseMoney, combatLevel, hoursToCover, reqText, viewMethod } from '../src/lib/moneyAdvisor';
import { xpForLevel } from '../src/lib/xp';
import type { MoneyMethod, Step } from '../src/types';

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
      ['Wind Strike', 1, 5.5], ['Water Strike', 5, 7.5], ['Earth Strike', 9, 9.5], ['Fire Strike', 13, 11.5], ['Varrock Teleport', 25, 35], ['Lumbridge Teleport', 31, 41],
    ]);
    expect(spell('fire-strike').runes).toEqual({ fire: 3, air: 2, mind: 1 });
  });
  it('the price of a hit: the staff removes the runes of its element', () => {
    expect(castCost(spell('fire-strike'), undefined, prices)).toBe(33);
    expect(castCost(spell('fire-strike'), 'fire', prices)).toBe(15);
    expect(castCost(spell('wind-strike'), 'air', prices)).toBe(3);
    expect(castCost(spell('fire-strike'), undefined, new Map())).toBeNull();
  });
  it('from level 10 to 25: Fire Strike is twice as fast as Wind Strike, the fire staff is cheaper than runes', () => {
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

const method = (over: Partial<MoneyMethod>): MoneyMethod =>
  ({ id: 'm', title: 'M', url: 'https://x', profit: 1000, intensity: 'Low', category: 'c', skills: [], ...over });
const quest = (title: string): Step => ({ id: 'Q', stage: 2, type: 'quest', title, requires: [], doneWhen: '' }) as Step;

describe('how to make up the money', () => {
  it('the combat level — as in the game', () => {
    expect(combatLevel({ attack: 1, strength: 1, defence: 1, hitpoints: 10 })).toBe(3);
    expect(combatLevel({ attack: 40, strength: 40, defence: 40, hitpoints: 40, prayer: 20, magic: 1, ranged: 1 })).toBe(Math.floor(0.25 * (40 + 40 + 10) + 0.325 * 80));
    expect(combatLevel({ attack: 40 })).toBeNull();
  });
  it('a mandatory level cuts off, a recommended one is only a hint, an unknown one — "?"', () => {
    const hard = method({ skills: [{ skill: 'mining', level: 15, required: true }] });
    const soft = method({ skills: [{ skill: 'combat', level: 20, required: false }] });
    expect(viewMethod(hard, { mining: 10 }, [], new Set()).missing).toHaveLength(1);
    expect(viewMethod(hard, { mining: 15 }, [], new Set()).missing).toHaveLength(0);
    expect(viewMethod(hard, {}, [], new Set()).unknown).toHaveLength(1);
    const v = viewMethod(soft, { attack: 5, strength: 5, defence: 5 }, [], new Set());
    expect(v.missing).toHaveLength(0);
    expect(v.advice).toHaveLength(1);
  });
  it('sorting by income; unavailable and soon available are separated', () => {
    const a = method({ id: 'a', profit: 5000 });
    const b = method({ id: 'b', profit: 9000, skills: [{ skill: 'mining', level: 40, required: true }] });
    const c = method({ id: 'c', profit: 7000, skills: [{ skill: 'mining', level: 12, required: true }] });
    const adv = adviseMoney({ mining: 10 }, [], new Set(), [a, b, c]);
    expect(adv.free.map((v) => v.method.id)).toEqual(['a']);
    expect(adv.soon.map((v) => v.method.id)).toEqual(['c']);
  });
  it('investments: without capital — "free", with capital within reach — "invest", out of reach — cut off', () => {
    const free = method({ id: 'f', profit: 1000 });
    const cheap = method({ id: 'c', profit: 9000, capital: 5000 });
    const rich = method({ id: 'r', profit: 20000, capital: 400000 });
    const buys = method({ id: 'b', profit: 8000, inputs: ['Gold bar'] });
    const adv = adviseMoney({}, [], new Set(), [free, cheap, rich, buys], 6000);
    expect(adv.free.map((v) => v.method.id)).toEqual(['f']);
    expect(adv.invest.map((v) => v.method.id)).toEqual(['c', 'b']);
    // The coins are unknown — the expensive ones are not cut off.
    expect(adviseMoney({}, [], new Set(), [rich], null).invest).toHaveLength(1);
  });
  it('a quest from a hard condition, not completed, closes a method; "recommended" — does not', () => {
    const q = method({ quests: 'Dragon Slayer I' });
    const rec = method({ quests: 'Prince Ali Rescue strongly recommended' });
    const steps = [quest('Dragon Slayer I'), quest('Prince Ali Rescue')];
    expect(viewMethod(q, {}, steps, new Set()).questsMissing).toEqual(['Dragon Slayer I']);
    expect(viewMethod(q, {}, steps, new Set(['dragon slayer i'])).questsMissing).toEqual([]);
    expect(viewMethod(rec, {}, steps, new Set()).questsMissing).toEqual([]);
  });
  it('hours to the goal and the requirement caption', () => {
    expect(hoursToCover(5000, 10000)).toBe(0.5);
    expect(hoursToCover(0, 10000)).toBeNull();
    expect(reqText({ skill: 'combat', level: 20, required: false, plus: true })).toBe('combat 20+');
    expect(reqText({ skill: 'mining', level: 15, required: true })).toBe('Mining 15');
  });
});

import { mmgFields, parseCapital, parseInputs, parseSkillsHtml, skillsNote } from '../scripts/money-parse';

const scp = (skill: string, level: string, tail = '') =>
  `<span class="scp" data-skill="${skill}" data-level="${level}" style="position:relative"><span class="mw-default-size"><a href="/w/${skill}" title="${skill}"><img alt="${skill}" src="x.png" /></a></span> ${level} </span>${tail}`;

describe('wiki parsing for earning methods', () => {
  it('levels from the rendered cell: mandatory, recommended, "+", combat', () => {
    const cell = `${scp('Mining', '85+')}, ${scp('Attack', '40')} (optional), ${scp('Combat level', '20+')} recommended`;
    expect(parseSkillsHtml(cell)).toEqual([
      { skill: 'mining', level: 85, required: true, plus: true },
      { skill: 'attack', level: 40, required: false },
      { skill: 'combat', level: 20, required: false, plus: true },
    ]);
    expect(parseSkillsHtml('None')).toEqual([]);
    expect(parseSkillsHtml(scp('Crafting', '56'))).toEqual([{ skill: 'crafting', level: 56, required: true }]);
  });
  it('capital — only explicit coins; template variables are not counted', () => {
    expect(parseCapital('{{Coins|100000}}+ recommended')).toBe(100000);
    expect(parseCapital('* {{Coins|400,000}}+\n* [[Cowhide]]s')).toBe(400000);
    expect(parseCapital('{{#var:mould}}')).toBeUndefined();
    expect(parseCapital('')).toBeUndefined();
  });
  it('the Mmgtable card: top-level fields, nested templates do not break', () => {
    const f = mmgFields('{{Mmgtable\n|Activity = Tanning [[cowhide]]\n|Skill = {{SCP|Crafting|{{#var:skill}}}}\n|Input1 = Coins\n|Input2 = Cowhide\n|Input3 = Energy potion(4)\n|Quest = None\n}}');
    expect(f.activity).toBe('Tanning [[cowhide]]');
    expect(f.skill).toBe('{{SCP|Crafting|{{#var:skill}}}}');
    expect(parseInputs(f)).toEqual(['Cowhide', 'Energy potion(4)']);
  });
  it('"Decent…" — a note about combat preparation', () => {
    expect(skillsNote(`Decent and recommended ${scp('Prayer', '43')} recommended`)).toContain('Decent');
    expect(skillsNote(scp('Mining', '15'))).toBeUndefined();
  });
});

import { MONEY } from '../src/lib/moneyAdvisor';
import { allSteps } from '../src/data';

describe('data 2.13', () => {
  it('earning methods: unique ids, wiki links, income in descending order, F2P only', () => {
    expect(MONEY.methods.length).toBeGreaterThan(60);
    expect(new Set(MONEY.methods.map((m) => m.id)).size).toBe(MONEY.methods.length);
    for (const m of MONEY.methods) {
      expect(m.url.startsWith('https://oldschool.runescape.wiki/w/')).toBe(true);
      expect(m.profit).toBeGreaterThan(0);
      for (const r of m.skills) expect(r.level).toBeGreaterThan(0);
    }
    const profits = MONEY.methods.map((m) => m.profit);
    expect(profits).toEqual([...profits].sort((a, b) => b - a));
  });
  it('S2-04: described in detail — items, a quick path with buying runes and the magic calculation', () => {
    const s = allSteps.find((x) => x.id === 'S2-04')!;
    expect(s.magicPlan).toEqual({ target: 25, from: 10 });
    expect(s.itemsRequired?.map((i) => i.nameEn)).toEqual(['Staff', 'Air rune', 'Mind rune']);
    expect(s.quickSteps!.length).toBeGreaterThanOrEqual(5);
    expect(s.quickSteps!.join(' ')).toContain("Aubury's Rune Shop");
    expect(s.quickSteps!.join(' ')).toContain("Zaff's Superior Staffs");
    expect(s.resourceSpots!.map((p) => p.label).join(' ')).toContain('Aubury');
  });
  it('steps with a description that did not have one before: each has a quick path, and the last point is how the step ends', () => {
    for (const id of ['S1-07', 'S3-05', 'S4-02', 'S5-01', 'S5-02', 'S5-05', 'S5-07']) {
      const s = allSteps.find((x) => x.id === id)!;
      expect(s.quickSteps?.length, id).toBeGreaterThanOrEqual(2);
    }
  });
});

import { foodInBag, foodsCovering, threatKeys, typicalHit, viewThreat, FOODS, THREATS } from '../src/lib/foodAdvice';

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

import { fixChain } from '../src/lib/readiness';
import { toInGameTarget } from '../src/services/runeliteBridge';

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
    expect(toInGameTarget(allSteps.find((x) => x.id === 'S1-13')!)!.maxHit).toBeUndefined();
  });
});
