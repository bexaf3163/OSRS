import { describe, expect, it } from 'vitest';
import { listedWithoutRequirements, requirementsFromText, setRule } from '../scripts/gear-requirements';
import { adviseGear, canWear, gearData, missingRequirements, missingText, watchNames } from '../src/services/gearAdvisor';
import { questStep } from '../src/pages/Gear';
import { allSteps } from '../src/data';

const item = (name: string) => gearData.items.find((i) => i.name === name)!;
const lv = (o: Record<string, number>) => ({ attack: 1, strength: 1, defence: 1, ...o });

describe('требования к надеванию из текста вики', () => {
  it('навыки кроме Attack/Strength/Defence и квесты', () => {
    expect(requirementsFromText("A '''coif''' is an improved [[cowl]] that requires 20 [[Ranged]] to equip. Coifs are the best ranged headgear. It can be made by members at level 38 [[Crafting]].")).toEqual({ ranged: 20 });
    expect(requirementsFromText('The rune platebody is armour. It requires 40 [[Defence]] and completion of the [[quest]] [[Dragon Slayer I]] to equip.'))
      .toEqual({ defence: 40, quests: ['Dragon Slayer I'] });
    expect(requirementsFromText('It may be equipped in the torso slot by players with 1 [[Ranged]] and 10 [[Defence]].')).toEqual({ defence: 10 });
    expect(requirementsFromText("A '''studded body''' is armour and it requires 20 [[Ranged]] and [[Defence]] to equip.")).toEqual({ ranged: 20, defence: 20 });
  });

  it('не путает изготовление и отрицание с требованием', () => {
    // Magic здесь — для зачарования, а не для надевания.
    expect(requirementsFromText('The amulet of strength is an enchanted ruby amulet. With at least 49 [[Magic]], [[Lvl-3 Enchant]] can be cast on a ruby amulet to create an amulet of strength.')).toBeNull();
    expect(requirementsFromText('To wear this chainbody, a player needs at least level 40 [[Defence]]. Wearing it does not require completion of [[Dragon Slayer I]].')).toEqual({ defence: 40 });
    expect(requirementsFromText('Unlike other [[rune weapons]], it requires 40 [[Strength]] to wield and has no [[Attack]] requirement.')).toEqual({ strength: 40 });
    expect(requirementsFromText('It is created by casting [[Lvl-4 Enchant]] on a [[diamond amulet]], and has no requirements to be worn.')).toBe('none');
  });

  it('правило набора: исключение не распространяется на названный вид', () => {
    const adamant = "'''Adamant weapons''' require an [[Attack]] level of 30 to wield, except for the adamant cane and adamant warhammer, which requires 28 attack and 30 strength respectively.\n\n'''Adamant armour''' requires 30 [[Defence]] to wear.";
    expect(setRule(adamant, 'weapons', 'dagger')).toEqual({ attack: 30 });
    expect(setRule(adamant, 'weapons', 'warhammer')).toBeNull();
    expect(setRule(adamant, 'armour', 'platebody')).toEqual({ defence: 30 });
    expect(setRule("'''Leather armour''' is the lowest quality [[Armour/Ranged armour|ranged armour.]] There are no requirements to wear it.", 'armour', 'leather')).toBe('none');
  });

  it('обзор бесплатного снаряжения: без пометки о требовании — требований нет', () => {
    const overview = '==Jewellery==\n[[Free-to-play]] jewellery typically has no combat skill requirements to wear.\n{{Infotable Bonuses\n|Amulet of strength |comment5 = Most used.\n}}\n==Armour with no defence requirements==\n{{Infotable Bonuses\n|Coif |comment5 = Good.<br/>\'\'Note\'\': 20 [[ranged]] level requirement.\n|Wooden shield |comment3 = No penalties.\n}}';
    expect(listedWithoutRequirements(overview, 'Amulet of strength')).toBe(true);
    expect(listedWithoutRequirements(overview, 'Wooden shield')).toBe(true);
    expect(listedWithoutRequirements(overview, 'Coif')).toBe(false);
  });
});

describe('требования в gear.json и советы', () => {
  it('у каждого предмета источник требований — статья вики', () => {
    for (const p of gearData.items) expect(p.reqFrom ?? (p.reqUnverified ? 'не проверено' : undefined), p.name).toBeTruthy();
    expect(gearData.items.filter((p) => p.reqUnverified)).toEqual([]);
    expect(item('Coif').req).toEqual({ ranged: 20 });
    expect(item('Rune platebody').req).toEqual({ defence: 40, quests: ['Dragon Slayer I'] });
    expect(item('Rune warhammer').req).toEqual({ strength: 40 });
  });

  it('Coif при 17 Ranged не надеть — и чего не хватает', () => {
    const coif = item('Coif');
    expect(canWear(coif, lv({ ranged: 17 }))).toBe(false);
    expect(missingText(missingRequirements(coif, lv({ ranged: 17 })))).toBe('20 Ranged (сейчас 17)');
    expect(canWear(coif, lv({ ranged: 20 }))).toBe(true);
    // Уровень неизвестен — считаем первым: не обещаем то, что может не надеться.
    expect(canWear(coif, lv({}))).toBe(false);
  });

  it('советы не предлагают Coif без 20 Ranged и Rune platebody без Dragon Slayer I', () => {
    const names = (levels: Record<string, number>, questsDone?: Set<string>) =>
      watchNames({ levels, gear: null, mode: 'f2p', ...(questsDone ? { questsDone } : {}) }, 50);
    expect(names({ ranged: 17 })).not.toContain('Coif');
    expect(names({ ranged: 20 })).toContain('Coif');
    const strong = { attack: 40, strength: 40, defence: 40 };
    expect(names(strong)).not.toContain('Rune platebody');
    expect(names(strong)).toContain('Rune chainbody');
    expect(names(strong, new Set(['Dragon Slayer I']))).toContain('Rune platebody');
    expect(missingText(missingRequirements(item('Rune platebody'), lv(strong)))).toBe('квест Dragon Slayer I');
  });
});

describe('замок «🔒 нужно …»: лучше, но пока нельзя надеть', () => {
  const base = { mode: 'f2p' as const, gear: { equipment: [] as { id: number; name: string; slot?: string }[], inventory: [], coins: 0, bankCoins: 0 } };
  const bankOf = (names: string[]) => ({
    bankSeen: true,
    items: new Map(names.map((n) => [n.toLowerCase(), { name: n, carried: 0, noted: 0, bank: 1 }])),
  });

  it('Steel full helm при 1 Defence — замок «нужно 5 Defence»: он заметно крепче Iron full helm, который можно уже сейчас', () => {
    const a = adviseGear({ ...base, levels: { defence: 1 } });
    expect(a.locked.find((l) => l.slot === 'head')).toMatchObject({ item: { name: 'Steel full helm' }, missing: [{ kind: 'skill', skill: 'defence', need: 5, have: 1 }] });
    // Coif (защита 18) не крепче Iron full helm (18) — замок на него был бы шумом.
    expect(adviseGear({ ...base, levels: { ranged: 17, defence: 1 } }).locked.some((l) => l.item.name === 'Coif')).toBe(false);
    expect(adviseGear({ ...base, levels: { defence: 5 } }).locked.some((l) => l.item.name === 'Steel full helm')).toBe(false);
  });

  it('Coif в банке при 17 Ranged: «есть, но надеть нельзя», а не «надень»', () => {
    const a = adviseGear({ ...base, levels: { ranged: 17 }, owned: bankOf(['Coif']) });
    expect(a.locked.find((l) => l.slot === 'head')).toMatchObject({ item: { name: 'Coif' }, owned: 'bank', missing: [{ kind: 'skill', skill: 'ranged', need: 20, have: 17 }] });
    expect([...a.actions, ...a.armour, ...a.goals].some((x) => x.item.name === 'Coif')).toBe(false);
    // С 20 Ranged — уже не замок, а «надень, он в банке».
    const at20 = adviseGear({ ...base, levels: { ranged: 20 }, owned: bankOf(['Coif']) });
    expect(at20.locked.some((l) => l.item.name === 'Coif')).toBe(false);
    expect(at20.actions.some((x) => x.item.name === 'Coif' && x.how === 'wear')).toBe(true);
  });

  it('далёкий предмет без него в банке не показываем, а в банке — показываем при любом разрыве', () => {
    const lv1 = { attack: 1, strength: 1, defence: 1 };
    const far = adviseGear({ ...base, levels: lv1, gear: { ...base.gear, equipment: [] } });
    expect(far.locked.some((l) => l.item.name === 'Rune scimitar')).toBe(false);
    const inBank = adviseGear({ ...base, levels: lv1, gear: { ...base.gear, equipment: [] }, owned: bankOf(['Rune scimitar']) });
    expect(inBank.locked.find((l) => l.slot === 'weapon')).toMatchObject({ item: { name: 'Rune scimitar' }, owned: 'bank' });
  });

  it('Rune platebody при 40 Defence без Dragon Slayer I — замок по квесту', () => {
    const lv40 = { attack: 40, strength: 40, defence: 40 };
    const a = adviseGear({ ...base, levels: lv40, owned: bankOf(['Rune platebody']) });
    const body = a.locked.find((l) => l.slot === 'body');
    expect(body).toMatchObject({ item: { name: 'Rune platebody' }, missing: [{ kind: 'quest', quest: 'Dragon Slayer I' }] });
    const done = adviseGear({ ...base, levels: lv40, owned: bankOf(['Rune platebody']), questsDone: new Set(['Dragon Slayer I']) });
    expect(done.locked.some((l) => l.item.name === 'Rune platebody')).toBe(false);
    expect(done.actions.some((x) => x.item.name === 'Rune platebody')).toBe(true);
  });

  it('квестовый замок ведёт к шагу с этим квестом', () => {
    expect(questStep(allSteps, 'Dragon Slayer I')?.id).toBe('S5-09');
  });
});
