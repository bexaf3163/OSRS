import { describe, expect, it } from 'vitest';
import { listedWithoutRequirements, requirementsFromText, setRule } from '../scripts/gear-requirements';
import { adviseGear, canWear, gearData, missingRequirements, missingText, watchNames } from '../src/services/gearAdvisor';
import { questStep } from '../src/pages/Gear';
import { allSteps } from '../src/data';

const item = (name: string) => gearData.items.find((i) => i.name === name)!;
const lv = (o: Record<string, number>) => ({ attack: 1, strength: 1, defence: 1, ...o });

describe('wearing requirements from the wiki text', () => {
  it('skills other than Attack/Strength/Defence, and quests', () => {
    expect(requirementsFromText("A '''coif''' is an improved [[cowl]] that requires 20 [[Ranged]] to equip. Coifs are the best ranged headgear. It can be made by members at level 38 [[Crafting]].")).toEqual({ ranged: 20 });
    expect(requirementsFromText('The rune platebody is armour. It requires 40 [[Defence]] and completion of the [[quest]] [[Dragon Slayer I]] to equip.'))
      .toEqual({ defence: 40, quests: ['Dragon Slayer I'] });
    expect(requirementsFromText('It may be equipped in the torso slot by players with 1 [[Ranged]] and 10 [[Defence]].')).toEqual({ defence: 10 });
    expect(requirementsFromText("A '''studded body''' is armour and it requires 20 [[Ranged]] and [[Defence]] to equip.")).toEqual({ ranged: 20, defence: 20 });
  });

  it('does not confuse crafting and negation with a requirement', () => {
    // Magic here is for enchanting, not for wearing.
    expect(requirementsFromText('The amulet of strength is an enchanted ruby amulet. With at least 49 [[Magic]], [[Lvl-3 Enchant]] can be cast on a ruby amulet to create an amulet of strength.')).toBeNull();
    expect(requirementsFromText('To wear this chainbody, a player needs at least level 40 [[Defence]]. Wearing it does not require completion of [[Dragon Slayer I]].')).toEqual({ defence: 40 });
    expect(requirementsFromText('Unlike other [[rune weapons]], it requires 40 [[Strength]] to wield and has no [[Attack]] requirement.')).toEqual({ strength: 40 });
    expect(requirementsFromText('It is created by casting [[Lvl-4 Enchant]] on a [[diamond amulet]], and has no requirements to be worn.')).toBe('none');
  });

  it('the set rule: an exception does not extend to the named kind', () => {
    const adamant = "'''Adamant weapons''' require an [[Attack]] level of 30 to wield, except for the adamant cane and adamant warhammer, which requires 28 attack and 30 strength respectively.\n\n'''Adamant armour''' requires 30 [[Defence]] to wear.";
    expect(setRule(adamant, 'weapons', 'dagger')).toEqual({ attack: 30 });
    expect(setRule(adamant, 'weapons', 'warhammer')).toBeNull();
    expect(setRule(adamant, 'armour', 'platebody')).toEqual({ defence: 30 });
    expect(setRule("'''Leather armour''' is the lowest quality [[Armour/Ranged armour|ranged armour.]] There are no requirements to wear it.", 'armour', 'leather')).toBe('none');
  });

  it('free equipment overview: without a requirement note — no requirements', () => {
    const overview = '==Jewellery==\n[[Free-to-play]] jewellery typically has no combat skill requirements to wear.\n{{Infotable Bonuses\n|Amulet of strength |comment5 = Most used.\n}}\n==Armour with no defence requirements==\n{{Infotable Bonuses\n|Coif |comment5 = Good.<br/>\'\'Note\'\': 20 [[ranged]] level requirement.\n|Wooden shield |comment3 = No penalties.\n}}';
    expect(listedWithoutRequirements(overview, 'Amulet of strength')).toBe(true);
    expect(listedWithoutRequirements(overview, 'Wooden shield')).toBe(true);
    expect(listedWithoutRequirements(overview, 'Coif')).toBe(false);
  });
});

describe('requirements in gear.json and the advice', () => {
  it('every item has a requirements source — a wiki article', () => {
    for (const p of gearData.items) expect(p.reqFrom ?? (p.reqUnverified ? 'not verified' : undefined), p.name).toBeTruthy();
    expect(gearData.items.filter((p) => p.reqUnverified)).toEqual([]);
    expect(item('Coif').req).toEqual({ ranged: 20 });
    expect(item('Rune platebody').req).toEqual({ defence: 40, quests: ['Dragon Slayer I'] });
    expect(item('Rune warhammer').req).toEqual({ strength: 40 });
  });

  it('Coif cannot be worn at 17 Ranged — and what is missing', () => {
    const coif = item('Coif');
    expect(canWear(coif, lv({ ranged: 17 }))).toBe(false);
    expect(missingText(missingRequirements(coif, lv({ ranged: 17 })))).toBe('20 Ranged (now 17)');
    expect(canWear(coif, lv({ ranged: 20 }))).toBe(true);
    // The level is unknown — counted as the first: we do not promise what may not be wearable.
    expect(canWear(coif, lv({}))).toBe(false);
  });

  it('the advice does not offer Coif without 20 Ranged and Rune platebody without Dragon Slayer I', () => {
    const names = (levels: Record<string, number>, questsDone?: Set<string>) =>
      watchNames({ levels, gear: null, mode: 'f2p', ...(questsDone ? { questsDone } : {}) }, 50);
    expect(names({ ranged: 17 })).not.toContain('Coif');
    expect(names({ ranged: 20 })).toContain('Coif');
    const strong = { attack: 40, strength: 40, defence: 40 };
    expect(names(strong)).not.toContain('Rune platebody');
    expect(names(strong)).toContain('Rune chainbody');
    expect(names(strong, new Set(['Dragon Slayer I']))).toContain('Rune platebody');
    expect(missingText(missingRequirements(item('Rune platebody'), lv(strong)))).toBe('quest Dragon Slayer I');
  });
});

describe('the "🔒 needs …" lock: better, but cannot be worn yet', () => {
  const base = { mode: 'f2p' as const, gear: { equipment: [] as { id: number; name: string; slot?: string }[], inventory: [], coins: 0, bankCoins: 0 } };
  const bankOf = (names: string[]) => ({
    bankSeen: true,
    items: new Map(names.map((n) => [n.toLowerCase(), { name: n, carried: 0, noted: 0, bank: 1 }])),
  });

  it('Steel full helm at 1 Defence — the lock "needs 5 Defence": it is noticeably stronger than the Iron full helm, which can be worn right now', () => {
    const a = adviseGear({ ...base, levels: { defence: 1 } });
    expect(a.locked.find((l) => l.slot === 'head')).toMatchObject({ item: { name: 'Steel full helm' }, missing: [{ kind: 'skill', skill: 'defence', need: 5, have: 1 }] });
    // Coif (defence 18) is not stronger than the Iron full helm (18) — a lock on it would be noise.
    expect(adviseGear({ ...base, levels: { ranged: 17, defence: 1 } }).locked.some((l) => l.item.name === 'Coif')).toBe(false);
    expect(adviseGear({ ...base, levels: { defence: 5 } }).locked.some((l) => l.item.name === 'Steel full helm')).toBe(false);
  });

  it('Coif in the bank at 17 Ranged: "owned but cannot be worn", not "wear it"', () => {
    const a = adviseGear({ ...base, levels: { ranged: 17 }, owned: bankOf(['Coif']) });
    expect(a.locked.find((l) => l.slot === 'head')).toMatchObject({ item: { name: 'Coif' }, owned: 'bank', missing: [{ kind: 'skill', skill: 'ranged', need: 20, have: 17 }] });
    expect([...a.actions, ...a.armour, ...a.goals].some((x) => x.item.name === 'Coif')).toBe(false);
    // With 20 Ranged — no longer a lock, but "wear it, it is in the bank".
    const at20 = adviseGear({ ...base, levels: { ranged: 20 }, owned: bankOf(['Coif']) });
    expect(at20.locked.some((l) => l.item.name === 'Coif')).toBe(false);
    expect(at20.actions.some((x) => x.item.name === 'Coif' && x.how === 'wear')).toBe(true);
  });

  it('a far item is not shown if it is not in the bank, and if it is in the bank — shown at any gap', () => {
    const lv1 = { attack: 1, strength: 1, defence: 1 };
    const far = adviseGear({ ...base, levels: lv1, gear: { ...base.gear, equipment: [] } });
    expect(far.locked.some((l) => l.item.name === 'Rune scimitar')).toBe(false);
    const inBank = adviseGear({ ...base, levels: lv1, gear: { ...base.gear, equipment: [] }, owned: bankOf(['Rune scimitar']) });
    expect(inBank.locked.find((l) => l.slot === 'weapon')).toMatchObject({ item: { name: 'Rune scimitar' }, owned: 'bank' });
  });

  it('Rune platebody at 40 Defence without Dragon Slayer I — a quest lock', () => {
    const lv40 = { attack: 40, strength: 40, defence: 40 };
    const a = adviseGear({ ...base, levels: lv40, owned: bankOf(['Rune platebody']) });
    const body = a.locked.find((l) => l.slot === 'body');
    expect(body).toMatchObject({ item: { name: 'Rune platebody' }, missing: [{ kind: 'quest', quest: 'Dragon Slayer I' }] });
    const done = adviseGear({ ...base, levels: lv40, owned: bankOf(['Rune platebody']), questsDone: new Set(['Dragon Slayer I']) });
    expect(done.locked.some((l) => l.item.name === 'Rune platebody')).toBe(false);
    expect(done.actions.some((x) => x.item.name === 'Rune platebody')).toBe(true);
  });

  it('a quest lock leads to the step with that quest', () => {
    expect(questStep(allSteps, 'Dragon Slayer I')?.id).toBe('S5-09');
  });
});
