import { describe, expect, it } from 'vitest';
import { castCost, hidesToCover, OPTIONS, planFor, SPELLS, staffPayback, STAFFS, RUNE_IDS, COWHIDE_ID } from '../src/lib/magicPlan';
import { adviseMoney, combatLevel, hoursToCover, reqText, viewMethod } from '../src/lib/moneyAdvisor';
import { xpForLevel } from '../src/lib/xp';
import type { MoneyMethod, Step } from '../src/types';

// Цены как на бирже 03.10.2026: руны 6, разум 3, посох огня 940, посох воздуха 1542, шкура 125.
const prices = new Map<number, number>([
  [RUNE_IDS.air, 6], [RUNE_IDS.mind, 3], [RUNE_IDS.fire, 6], [RUNE_IDS.earth, 6], [RUNE_IDS.water, 6],
  [STAFFS.fire.id, 940], [STAFFS.air.id, 1542], [STAFFS.water.id, 1500], [STAFFS.earth.id, 1500], [COWHIDE_ID, 125],
]);
const spell = (id: string) => SPELLS.find((s) => s.id === id)!;
const opt = (id: string) => OPTIONS.find((o) => o.id === id)!;

describe('план магии', () => {
  it('таблица заклинаний — как на вики', () => {
    expect(SPELLS.map((s) => [s.name, s.level, s.xp])).toEqual([
      ['Wind Strike', 1, 5.5], ['Water Strike', 5, 7.5], ['Earth Strike', 9, 9.5], ['Fire Strike', 13, 11.5], ['Varrock Teleport', 25, 35], ['Lumbridge Teleport', 31, 41],
    ]);
    expect(spell('fire-strike').runes).toEqual({ fire: 3, air: 2, mind: 1 });
  });
  it('цена удара: посох убирает руны своей стихии', () => {
    expect(castCost(spell('fire-strike'), undefined, prices)).toBe(33);
    expect(castCost(spell('fire-strike'), 'fire', prices)).toBe(15);
    expect(castCost(spell('wind-strike'), 'air', prices)).toBe(3);
    expect(castCost(spell('fire-strike'), undefined, new Map())).toBeNull();
  });
  it('с 10 до 25 уровня: Fire Strike вдвое быстрее Wind Strike, посох огня дешевле рун', () => {
    const from = xpForLevel(10);
    const wind = planFor(opt('wind'), from, 25, prices)!;
    const best = planFor(opt('best'), from, 25, prices)!;
    const fire = planFor(opt('best-fire'), from, 25, prices)!;
    expect(wind.casts).toBeGreaterThan(best.casts * 1.5);
    expect(fire.runesCost).toBeLessThan(best.runesCost);
    expect(fire.staffCost).toBe(940);
    expect(fire.total).toBe(fire.runesCost + 940);
    // До 13 уровня — Earth Strike, дальше Fire Strike.
    expect(best.steps.map((s) => s.spell.id)).toEqual(['earth-strike', 'fire-strike']);
    // Опыт за все удары покрывает нужное.
    const gained = best.steps.reduce((s, x) => s + x.casts * x.spell.xp, 0);
    expect(gained).toBeGreaterThanOrEqual(xpForLevel(25) - from);
  });
  it('с 25 до 33: телепорты Varrock до 31 уровня, потом Lumbridge; дороже ударов, но вдвое-втрое меньше заклинаний', () => {
    const tp = new Map(prices).set(RUNE_IDS.law, 120);
    const tele = planFor(opt('tele'), xpForLevel(25), 33, tp)!;
    const best = planFor(opt('best-fire'), xpForLevel(25), 33, tp)!;
    expect(tele.steps.map((s) => s.spell.id)).toEqual(['varrock-teleport', 'lumbridge-teleport']);
    expect(tele.casts).toBeLessThan(best.casts / 2);
    expect(tele.total).toBeGreaterThan(best.total);
    // До 25 уровня телепортов нет — вариант не считается.
    expect(planFor(opt('tele'), xpForLevel(10), 25, tp)).toBeNull();
  });
  it('уже есть посох — он ничего не стоит; цены нет — плана нет', () => {
    expect(planFor(opt('best-fire'), xpForLevel(10), 25, prices, true)!.staffCost).toBe(0);
    expect(planFor(opt('best'), xpForLevel(10), 25, new Map())).toBeNull();
    expect(planFor(opt('best-fire'), xpForLevel(10), 25, new Map([[RUNE_IDS.air, 6], [RUNE_IDS.mind, 3], [RUNE_IDS.earth, 6], [RUNE_IDS.water, 6], [RUNE_IDS.fire, 6]]))).toBeNull();
  });
  it('окупаемость посоха и шкуры', () => {
    expect(staffPayback('fire', spell('fire-strike'), prices)).toEqual({ perCast: 18, casts: 53 });
    expect(hidesToCover(1000, prices)).toBe(8);
    expect(hidesToCover(1000, new Map())).toBeNull();
  });
});

const method = (over: Partial<MoneyMethod>): MoneyMethod =>
  ({ id: 'm', title: 'M', url: 'https://x', profit: 1000, intensity: 'Low', category: 'c', skills: [], ...over });
const quest = (title: string): Step => ({ id: 'Q', stage: 2, type: 'quest', title, requires: [], doneWhen: '' }) as Step;

describe('как добрать деньги', () => {
  it('боевой уровень — как в игре', () => {
    expect(combatLevel({ attack: 1, strength: 1, defence: 1, hitpoints: 10 })).toBe(3);
    expect(combatLevel({ attack: 40, strength: 40, defence: 40, hitpoints: 40, prayer: 20, magic: 1, ranged: 1 })).toBe(Math.floor(0.25 * (40 + 40 + 10) + 0.325 * 80));
    expect(combatLevel({ attack: 40 })).toBeNull();
  });
  it('обязательный уровень отсекает, советуемый — только подсказка, неизвестный — «?»', () => {
    const hard = method({ skills: [{ skill: 'mining', level: 15, required: true }] });
    const soft = method({ skills: [{ skill: 'combat', level: 20, required: false }] });
    expect(viewMethod(hard, { mining: 10 }, [], new Set()).missing).toHaveLength(1);
    expect(viewMethod(hard, { mining: 15 }, [], new Set()).missing).toHaveLength(0);
    expect(viewMethod(hard, {}, [], new Set()).unknown).toHaveLength(1);
    const v = viewMethod(soft, { attack: 5, strength: 5, defence: 5 }, [], new Set());
    expect(v.missing).toHaveLength(0);
    expect(v.advice).toHaveLength(1);
  });
  it('сортировка по выручке; недоступное и скоро доступное разделены', () => {
    const a = method({ id: 'a', profit: 5000 });
    const b = method({ id: 'b', profit: 9000, skills: [{ skill: 'mining', level: 40, required: true }] });
    const c = method({ id: 'c', profit: 7000, skills: [{ skill: 'mining', level: 12, required: true }] });
    const adv = adviseMoney({ mining: 10 }, [], new Set(), [a, b, c]);
    expect(adv.free.map((v) => v.method.id)).toEqual(['a']);
    expect(adv.soon.map((v) => v.method.id)).toEqual(['c']);
  });
  it('вложения: без капитала — «free», с капиталом по карману — «invest», не по карману — отсечены', () => {
    const free = method({ id: 'f', profit: 1000 });
    const cheap = method({ id: 'c', profit: 9000, capital: 5000 });
    const rich = method({ id: 'r', profit: 20000, capital: 400000 });
    const buys = method({ id: 'b', profit: 8000, inputs: ['Gold bar'] });
    const adv = adviseMoney({}, [], new Set(), [free, cheap, rich, buys], 6000);
    expect(adv.free.map((v) => v.method.id)).toEqual(['f']);
    expect(adv.invest.map((v) => v.method.id)).toEqual(['c', 'b']);
    // Монет неизвестно — дорогие не отсекаются.
    expect(adviseMoney({}, [], new Set(), [rich], null).invest).toHaveLength(1);
  });
  it('квест из жёсткого условия, не пройденный, закрывает способ; «recommended» — нет', () => {
    const q = method({ quests: 'Dragon Slayer I' });
    const rec = method({ quests: 'Prince Ali Rescue strongly recommended' });
    const steps = [quest('Dragon Slayer I'), quest('Prince Ali Rescue')];
    expect(viewMethod(q, {}, steps, new Set()).questsMissing).toEqual(['Dragon Slayer I']);
    expect(viewMethod(q, {}, steps, new Set(['dragon slayer i'])).questsMissing).toEqual([]);
    expect(viewMethod(rec, {}, steps, new Set()).questsMissing).toEqual([]);
  });
  it('часы до цели и подпись требования', () => {
    expect(hoursToCover(5000, 10000)).toBe(0.5);
    expect(hoursToCover(0, 10000)).toBeNull();
    expect(reqText({ skill: 'combat', level: 20, required: false, plus: true })).toBe('боевой 20+');
    expect(reqText({ skill: 'mining', level: 15, required: true })).toBe('Mining 15');
  });
});

import { mmgFields, parseCapital, parseInputs, parseSkillsHtml, skillsNote } from '../scripts/money-parse';

const scp = (skill: string, level: string, tail = '') =>
  `<span class="scp" data-skill="${skill}" data-level="${level}" style="position:relative"><span class="mw-default-size"><a href="/w/${skill}" title="${skill}"><img alt="${skill}" src="x.png" /></a></span> ${level} </span>${tail}`;

describe('разбор вики для способов заработка', () => {
  it('уровни из отрисованной ячейки: обязательные, советуемые, «+», боевой', () => {
    const cell = `${scp('Mining', '85+')}, ${scp('Attack', '40')} (optional), ${scp('Combat level', '20+')} recommended`;
    expect(parseSkillsHtml(cell)).toEqual([
      { skill: 'mining', level: 85, required: true, plus: true },
      { skill: 'attack', level: 40, required: false },
      { skill: 'combat', level: 20, required: false, plus: true },
    ]);
    expect(parseSkillsHtml('None')).toEqual([]);
    expect(parseSkillsHtml(scp('Crafting', '56'))).toEqual([{ skill: 'crafting', level: 56, required: true }]);
  });
  it('капитал — только явные монеты; переменные шаблона не считаем', () => {
    expect(parseCapital('{{Coins|100000}}+ recommended')).toBe(100000);
    expect(parseCapital('* {{Coins|400,000}}+\n* [[Cowhide]]s')).toBe(400000);
    expect(parseCapital('{{#var:mould}}')).toBeUndefined();
    expect(parseCapital('')).toBeUndefined();
  });
  it('карточка Mmgtable: поля верхнего уровня, вложенные шаблоны не рвутся', () => {
    const f = mmgFields('{{Mmgtable\n|Activity = Tanning [[cowhide]]\n|Skill = {{SCP|Crafting|{{#var:skill}}}}\n|Input1 = Coins\n|Input2 = Cowhide\n|Input3 = Energy potion(4)\n|Quest = None\n}}');
    expect(f.activity).toBe('Tanning [[cowhide]]');
    expect(f.skill).toBe('{{SCP|Crafting|{{#var:skill}}}}');
    expect(parseInputs(f)).toEqual(['Cowhide', 'Energy potion(4)']);
  });
  it('«Decent…» — заметка о боевой подготовке', () => {
    expect(skillsNote(`Decent and recommended ${scp('Prayer', '43')} recommended`)).toContain('Decent');
    expect(skillsNote(scp('Mining', '15'))).toBeUndefined();
  });
});

import { MONEY } from '../src/lib/moneyAdvisor';
import { allSteps } from '../src/data';

describe('данные 2.13', () => {
  it('способы заработка: уникальные id, ссылки на вики, выручка по убыванию, только F2P', () => {
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
  it('S2-04: описан подробно — предметы, быстрый путь с покупкой рун и расчёт магии', () => {
    const s = allSteps.find((x) => x.id === 'S2-04')!;
    expect(s.magicPlan).toEqual({ target: 25, from: 10 });
    expect(s.itemsRequired?.map((i) => i.nameEn)).toEqual(['Staff', 'Air rune', 'Mind rune']);
    expect(s.quickSteps!.length).toBeGreaterThanOrEqual(5);
    expect(s.quickSteps!.join(' ')).toContain("Aubury's Rune Shop");
    expect(s.quickSteps!.join(' ')).toContain("Zaff's Superior Staffs");
    expect(s.resourceSpots!.map((p) => p.label).join(' ')).toContain('Aubury');
  });
  it('шаги с описанием, которых раньше не было: у каждого есть быстрый путь, а последний пункт — чем шаг кончается', () => {
    for (const id of ['S1-07', 'S3-05', 'S4-02', 'S5-01', 'S5-02', 'S5-05', 'S5-07']) {
      const s = allSteps.find((x) => x.id === id)!;
      expect(s.quickSteps?.length, id).toBeGreaterThanOrEqual(2);
    }
  });
});
