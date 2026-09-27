import { describe, expect, it } from 'vitest';
import { allSteps, itemById, items, plugins, reference, skills, stepsFor } from '../src/data';
import { emptyProgress, withStep } from '../src/lib/progress';
import { fightStepFor } from '../src/lib/gearAdvice';
import { buildIndex, search } from '../src/lib/search';
import { parseHash } from '../src/lib/router';
import {
  actionNav, adviseGear, canWear, DEFAULT_FOE, foeData, gainText, gearById, gearData, hudHint, killSeconds, meleeHit, meleeValue, meleeWith, routeNeeds,
  sourceText, statsText, stepFoes, watchNames, withKillEstimate, WINDOW,
  type AdvisorInput,
} from '../src/services/gearAdvisor';
import { matchStrict } from '../src/services/locationResolver';
import type { GearState } from '../src/services/runeliteBridge';
import type { OwnedState } from '../src/lib/checklist';
import type { GearData, GearPiece } from '../src/types';

const byName = (name: string): GearPiece => {
  const p = gearData.items.find((i) => i.name === name);
  if (!p) throw new Error(`нет ${name} в gear.json`);
  return p;
};
const item = (name: string, slot?: string) => ({ id: byName(name).id, name, ...(slot ? { slot } : {}) });
const gear = (over: Partial<GearState> = {}): GearState => ({
  equipment: [item('Bronze sword', 'weapon')], inventory: [], coins: 100, bankCoins: 8400, ...over,
});
const input = (over: Partial<AdvisorInput> = {}): AdvisorInput => ({
  levels: { attack: 5, strength: 5, defence: 1, prayer: 1 }, gear: gear(), mode: 'f2p', ...over,
});
const owned = (bank: Record<string, number>): OwnedState => ({
  bankSeen: true,
  items: new Map(Object.entries(bank).map(([name, n]) => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: n }])),
});

describe('формулы урона (OSRS Wiki, Damage per second/Melee)', () => {
  it('максимальный удар: 99 силы без снаряжения — 11, с Rune scimitar — 19 (стиль Aggressive)', () => {
    const lv = { attack: 99, strength: 99, defence: 1 };
    expect(meleeHit(lv, 0, 0, 4, 'aggressive').maxHit).toBe(11);
    expect(meleeHit(lv, 45, 44, 4, 'aggressive').maxHit).toBe(19);
  });

  it('шанс попадания и урон в секунду считаются по формулам вики', () => {
    // 1 атаки, стиль Accurate: (1+3+8)×64 = 768 > (1+9)×64 = 640 → 1 − 642/(2×769).
    const r = meleeHit({ attack: 1, strength: 1, defence: 1 }, 0, 0, 4, 'accurate');
    expect(r.hitChance).toBeCloseTo(1 - 642 / 1538, 10);
    expect(r.maxHit).toBe(1);
    expect(r.dps).toBeCloseTo((r.hitChance * (0.5 + 1 / 2)) / 2.4, 10);
  });

  it('без оружия — удар раз в 2,4 с; Bronze sword быстрее не делает, но бьёт точнее', () => {
    const lv = { attack: 5, strength: 5, defence: 1 };
    const fists = meleeWith(lv, null, null);
    const sword = meleeWith(lv, byName('Bronze sword'), null);
    expect(fists.speed).toBeCloseTo(2.4, 10);
    expect(sword.speed).toBeCloseTo(2.4, 10);
    expect(sword.dps).toBeGreaterThan(fists.dps);
  });

  it('стиль и тип удара — из категории оружия: у ятагана режущий, у булавы дробящий', () => {
    const lv = { attack: 20, strength: 20, defence: 1 };
    expect(meleeWith(lv, byName('Mithril scimitar'), null).type).toBe('slash');
    expect(meleeWith(lv, byName('Mithril mace'), null).type).toBe('crush');
    // Против защиты цели: у Al Kharid warrior защита от дробящего (10) ниже, чем от режущего (15).
    const warrior = foeData.foes.find((f) => f.name === 'Al Kharid warrior')!;
    const hit = meleeWith(lv, byName('Mithril scimitar'), null, {}, warrior).hitChance;
    const vsCow = meleeWith(lv, byName('Mithril scimitar'), null).hitChance;
    expect(hit).toBeLessThan(vsCow);
  });

  it('выгода считается на ближайших уровнях силы: ступенька удара не прячет лучший меч', () => {
    const lv = { attack: 20, strength: 20, defence: 1 };
    // На 20 силы Steel и Mithril scimitar бьют до 4 — на самом уровне разница только в точности…
    expect(meleeWith(lv, byName('Mithril scimitar'), null).maxHit).toBe(meleeWith(lv, byName('Steel scimitar'), null).maxHit);
    // …а с 24 силы мифрил бьёт до 5, сталь — всё ещё до 4.
    expect(meleeWith({ ...lv, strength: 24 }, byName('Mithril scimitar'), null).maxHit).toBe(5);
    expect(meleeWith({ ...lv, strength: 24 }, byName('Steel scimitar'), null).maxHit).toBe(4);
    const ratio = meleeValue(lv, byName('Mithril scimitar'), null) / meleeValue(lv, byName('Steel scimitar'), null);
    const atLevel = meleeWith(lv, byName('Mithril scimitar'), null).dps / meleeWith(lv, byName('Steel scimitar'), null).dps;
    expect(ratio).toBeGreaterThan(atLevel);
    expect(WINDOW).toBe(10);
    // У 99 силы окно не выходит за предел уровня.
    expect(meleeValue({ attack: 99, strength: 99, defence: 1 }, byName('Rune scimitar'), null)).toBeCloseTo(meleeWith({ attack: 99, strength: 99, defence: 1 }, byName('Rune scimitar'), null).dps, 10);
  });

  it('молитва на силу поднимает удар, когда хватает уровня силы', () => {
    const lv = { attack: 40, strength: 40, defence: 1 };
    const plain = meleeWith(lv, byName('Rune scimitar'), null);
    const burst = meleeWith(lv, byName('Rune scimitar'), null, { strength: 1.05 });
    expect(burst.maxHit).toBeGreaterThanOrEqual(plain.maxHit);
  });
});

describe('разбор снаряжения', () => {
  it('S1-13: Bronze sword, 5 атаки, 8 500 монет → Steel scimitar у Zeke первым делом', () => {
    const a = adviseGear(input({ routeNeeds: routeNeeds(allSteps, () => false) }));
    const first = a.actions[0];
    expect(first).toMatchObject({ slot: 'weapon', how: 'buy', item: { name: 'Steel scimitar' } });
    expect(first.source).toMatchObject({ kind: 'shop', shop: "Zeke's Superior Scimitars", npc: 'Zeke', price: 400, toll: 10 });
    expect(first.cost).toBe(410);
    // По маршруту он всё равно покупается на большой закупке.
    expect(first.routeStep).toBe('S2-01');
    expect(first.current?.name).toBe('Bronze sword');
    expect(gainText(first)).toMatch(/урона в секунду \+\d+%/);
    expect(sourceText(first.source)).toBe("у Zeke в Zeke's Superior Scimitars (Al Kharid) — 400 gp + 10 gp за проход в Al Kharid");
    expect(hudHint(first)).toBe('⚡ Сильнее: Steel scimitar у Zeke (Al Kharid), 400 gp');
    // Монеты — сумка и банк вместе.
    expect(a.coins).toEqual({ bag: 100, bank: 8400, total: 8500 });
  });

  it('после Prince Ali Rescue шлагбаум бесплатный', () => {
    const first = adviseGear(input({ freeToll: true })).actions[0];
    expect(first.source).not.toHaveProperty('toll');
    expect(first.cost).toBe(400);
  });

  it('биржа дешевле магазина — берём биржу, магазин остаётся другим вариантом', () => {
    const steel = byName('Steel scimitar').id;
    const first = adviseGear(input({ gePrices: new Map([[steel, 150]]) })).actions[0];
    expect(first.source).toEqual({ kind: 'ge', price: 150 });
    expect(first.alternatives.some((s) => s.kind === 'shop')).toBe(true);
  });

  it('магазин немногим дороже биржи — сначала магазин, биржа — «или»', () => {
    const steel = byName('Steel scimitar').id;
    // Zeke: 400 + 10 за шлагбаум = 410; на бирже 350 — разница 60 gp, меньше 100.
    const first = adviseGear(input({ gePrices: new Map([[steel, 350]]) })).actions[0];
    expect(first.source).toMatchObject({ kind: 'shop', npc: 'Zeke' });
    expect(first.cost).toBe(410);
    expect(first.alternatives).toContainEqual({ kind: 'ge', price: 350 });
  });

  it('лучшее уже в банке — «надень», и это первым, бесплатно', () => {
    const a = adviseGear(input({ owned: owned({ 'Steel scimitar': 1 }) }));
    expect(a.actions[0]).toMatchObject({ how: 'wear', slot: 'weapon', item: { name: 'Steel scimitar' }, cost: 0, source: { kind: 'bank' } });
    expect(hudHint(a.actions[0])).toBe('⚡ Надень Steel scimitar — он в банке');
    expect(actionNav(a.actions[0])).toBeNull();
    // Купить оружие лучше при 5 атаке нечего — второй покупки оружия нет.
    expect(a.actions.filter((x) => x.slot === 'weapon')).toHaveLength(1);
  });

  it('S3-08, Attack 20 и Steel scimitar → Mithril scimitar у Zeke', () => {
    const foes = stepFoes(allSteps.find((s) => s.id === 'S3-08')!);
    const a = adviseGear(input({ foes, levels: { attack: 20, strength: 20, defence: 1 }, gear: gear({ equipment: [item('Steel scimitar', 'weapon')], coins: 10_000, bankCoins: 0 }) }));
    expect(a.actions[0]).toMatchObject({ slot: 'weapon', how: 'buy', item: { name: 'Mithril scimitar' }, source: { kind: 'shop', npc: 'Zeke', price: 1040 } });
    expect(a.foes.map((f) => f.name)).toEqual(['Al Kharid warrior', 'Flesh Crawler']);
  });

  it('лучшее оружие в сумке, а в руке слабее — «надень», покупать не нужно', () => {
    const a = adviseGear(input({
      foes: stepFoes(allSteps.find((s) => s.id === 'S3-08')!),
      levels: { attack: 20, strength: 20, defence: 1 },
      gear: gear({ equipment: [item('Steel scimitar', 'weapon')], inventory: [item('Mithril scimitar')], coins: 5000, bankCoins: 0 }),
    }));
    expect(a.actions[0]).toMatchObject({ how: 'wear', item: { name: 'Mithril scimitar' }, source: { kind: 'bag' }, cost: 0 });
    expect(a.actions.some((x) => x.how === 'buy' && x.item.name === 'Mithril scimitar')).toBe(false);
  });

  it('в сумке — тоже «надень»', () => {
    const a = adviseGear(input({ gear: gear({ inventory: [item('Steel scimitar')] }) }));
    expect(a.actions[0]).toMatchObject({ how: 'wear', item: { name: 'Steel scimitar' }, source: { kind: 'bag' } });
  });

  it('денег мало — лучшее по карману сейчас, лучшее вообще — цель «накопить», с суммой нехватки', () => {
    const a = adviseGear(input({ gear: gear({ coins: 50, bankCoins: 0 }) }));
    const now = a.actions.find((x) => x.slot === 'weapon')!;
    expect(now.cost).toBeLessThanOrEqual(50);
    expect(now.item.name).not.toBe('Steel scimitar');
    const goal = a.goals.find((x) => x.slot === 'weapon')!;
    expect(goal.item.name).toBe('Steel scimitar');
    expect(goal.short).toBe(410 - 50);
    // Совсем без денег — ничего не покупаем, только цель.
    const broke = adviseGear(input({ gear: gear({ coins: 0, bankCoins: 0 }) }));
    expect(broke.actions.find((x) => x.slot === 'weapon')).toBeUndefined();
    expect(broke.goals.find((x) => x.slot === 'weapon')?.short).toBe(410);
  });

  it('из почти равных — дешёвое: при 12 атаке против коров Steel scimitar, а не Black втрое дороже', () => {
    const black = byName('Black scimitar').id;
    const a = adviseGear(input({ levels: { attack: 12, strength: 10, defence: 6 }, gePrices: new Map([[black, 1300]]), gear: gear({ coins: 120, bankCoins: 8400 }) }));
    expect(a.actions.find((x) => x.slot === 'weapon')!.item.name).toBe('Steel scimitar');
    // Black scimitar по карману и почти не сильнее — и не цель «накопить».
    expect(a.goals.some((x) => x.item.name === 'Black scimitar')).toBe(false);
  });

  it('деньги расходуются по порядку: сначала оружие, на остальное — остаток', () => {
    const a = adviseGear(input({ gear: gear({ coins: 500, bankCoins: 0 }) }));
    const spent = [...a.actions, ...a.armour].filter((x) => x.how === 'buy').reduce((s, x) => s + (x.cost ?? 0), 0);
    expect(a.actions[0].item.name).toBe('Steel scimitar');
    expect(spent).toBeLessThanOrEqual(500);
  });

  it('без данных из игры — советы по уровням, но без «хватает денег»', () => {
    const a = adviseGear(input({ gear: null }));
    expect(a.live).toBe(false);
    expect(a.actions).toEqual([]);
    expect(a.goals.find((x) => x.slot === 'weapon')?.item.name).toBe('Steel scimitar');
  });

  it('без данных из игры — у целей свойства предмета, а не «+%» к неизвестному; из почти равных — то, что купит маршрут', () => {
    const route = routeNeeds(allSteps, () => false);
    const foes = stepFoes(allSteps.find((s) => s.id === 'S3-08')!);
    const a = adviseGear(input({ gear: null, foes, routeNeeds: route, levels: { attack: 1, strength: 1, defence: 1 } }));
    const w = a.goals.find((x) => x.slot === 'weapon')!;
    // Против воина булава чуть сильнее ятагана, но ятаган маршрут всё равно покупает на S2-01.
    expect(w.item.name).toBe('Iron scimitar');
    expect(w.routeStep).toBe('S2-01');
    expect(statsText(w)).toMatch(/^удар до \d+, раз в 2,4 с$/);
    const neck = a.goals.find((x) => x.slot === 'neck');
    if (neck) expect(statsText(neck)).not.toMatch(/удар/);
    expect(statsText({ ...w, slot: 'neck', item: byName('Amulet of strength') })).toBe('сила +10');
  });

  it('старый плагин без слотов: слот берётся из базы предметов', () => {
    const a = adviseGear(input({ gear: gear({ equipment: [item('Bronze sword')] }) }));
    expect(a.equipped.weapon?.piece?.name).toBe('Bronze sword');
  });

  it('незнакомое оружие в руке: советуем, но не выдумываем, насколько лучше', () => {
    const a = adviseGear(input({ gear: gear({ equipment: [{ id: 999999, name: 'Silverlight', slot: 'weapon' }] }) }));
    expect(a.weaponUnknown).toBe('Silverlight');
    const w = a.actions.find((x) => x.slot === 'weapon')!;
    expect(w.currentName).toBe('Silverlight');
    expect(gainText(w)).toContain('сравни с Silverlight');
  });

  it('молотам нужна сила (из статей вики), а не атака', () => {
    expect(byName('Rune warhammer').req).toEqual({ strength: 40 });
    expect(canWear(byName('Rune warhammer'), { attack: 99, strength: 1, defence: 1 })).toBe(false);
    expect(canWear(byName('Rune warhammer'), { attack: 1, strength: 40, defence: 1 })).toBe(true);
  });

  it('предмет с непроверенным требованием не советуем', () => {
    // С 2.8 требования у всех предметов подтверждены статьями; защиту проверяем на предмете, помеченном вручную.
    const { reqFrom: _from, ...dagger } = byName('Adamant dagger');
    const data: GearData = { ...gearData, items: gearData.items.map((i) => (i.id === dagger.id ? { ...dagger, reqUnverified: true } : i)) };
    const lv = { attack: 99, strength: 99, defence: 99 };
    const a = adviseGear(input({ levels: lv, data, gear: gear({ coins: 10_000_000 }) }));
    expect([...a.actions, ...a.goals].some((x) => x.item.name === 'Adamant dagger')).toBe(false);
  });

  it('F2P не получает предметы для подписки', () => {
    const members: GearData = { ...gearData, items: [...gearData.items, { ...byName('Rune scimitar'), id: 4587, name: 'Dragon scimitar', members: true, req: { attack: 60 }, strength: 66, attack: { ...byName('Rune scimitar').attack, slash: 67 } }] };
    const lv = { attack: 60, strength: 60, defence: 1 };
    const f2p = adviseGear(input({ levels: lv, data: members, gear: gear({ coins: 10_000_000 }) }));
    expect([...f2p.actions, ...f2p.goals].some((x) => x.item.name === 'Dragon scimitar')).toBe(false);
    const mem = adviseGear(input({ levels: lv, data: members, mode: 'members', gear: gear({ coins: 10_000_000 }) }));
    expect(mem.goals.concat(mem.actions).some((x) => x.item.name === 'Dragon scimitar')).toBe(true);
  });

  it('броня: при 1 защите — железо, стрелка ведёт к продавцу с предметом для автоснятия', () => {
    const a = adviseGear(input({ gear: gear({ coins: 5000, bankCoins: 0 }) }));
    const body = a.armour.find((x) => x.slot === 'body')!;
    expect(body.item.name).toBe('Iron platebody');
    const nav = actionNav(body, 'S1-13')!;
    const horvik = matchStrict("Horvik's Armour Shop")!;
    expect(nav).toMatchObject({ label: "Horvik's Armour Shop", x: horvik.x, y: horvik.y, npcNames: ['Horvik'], itemName: 'Iron platebody', itemId: body.item.id, stepId: 'S1-13' });
  });

  it('что откроется дальше: следующий ятаган и нагрудник', () => {
    const a = adviseGear(input());
    expect(a.unlocks[0]).toMatchObject({ item: { name: 'Black scimitar' }, skill: 'attack', level: 10, have: 5 });
    expect(a.unlocks[1]).toMatchObject({ item: { name: 'Steel platebody' }, skill: 'defence', level: 5, have: 1 });
  });

  it('молитвы: открытые по уровню молитвы', () => {
    expect(adviseGear(input({ levels: { attack: 5, strength: 5, defence: 1, prayer: 3 } })).prayers).toEqual([]);
    const p = adviseGear(input({ levels: { attack: 5, strength: 5, defence: 1, prayer: 8 } })).prayers.map((x) => x.name);
    expect(p).toEqual(['Burst of Strength', 'Clarity of Thought']);
  });

  it('что спросить у плагина про банк: не больше трёх предметов на слот, все надеваемые и лучше надетого', () => {
    const names = watchNames(input());
    expect(names.length).toBeLessThanOrEqual(18);
    expect(names).toContain('Steel scimitar');
    for (const n of names) expect(canWear(byName(n), { attack: 5, strength: 5, defence: 1 }), n).toBe(true);
  });
});

describe('противники шагов (monsters.json)', () => {
  it('у каждого противника шага есть карточка с вики, уровень совпадает с текстом гайда', () => {
    const named = allSteps.filter((s) => s.foes?.length);
    expect(named.map((s) => s.id)).toEqual(['S1-13', 'S2-08', 'S3-08', 'S4-01', 'S4-02', 'S4-03', 'S8-02']);
    for (const s of named) {
      expect(stepFoes(s).map((f) => f.name), s.id).toEqual(s.foes);
      const text = [s.how, s.where, ...(s.fields ?? []).map((f) => f.text)].join(' ');
      for (const f of stepFoes(s)) {
        // «Count Draynor, 34 уровень», «Moss giant, 42 ур.», «коров (2 уровень)» — если гайд называет уровень, он тот же.
        const said = [...text.matchAll(/(\d+)\s*(?:ур\.|уровень)/g)].map((m) => Number(m[1]));
        if (said.length && s.id !== 'S3-08' && s.id !== 'S4-03') expect(said, `${s.id} ${f.name}`).toContain(f.combat);
      }
    }
    // Противники S3-08 и S4-03 названы в «где»: воин 9 и великан 42 — их уровни в тексте.
    expect(foeData.foes.find((f) => f.name === 'Al Kharid warrior')!.combat).toBe(9);
    expect(foeData.foes.find((f) => f.name === 'Moss giant')!.combat).toBe(42);
  });

  it('квестовые противники с особым оружием в советы не попадают: Delrith — Silverlight, Tanglefoot — секатор', () => {
    for (const id of ['S3-03', 'S9-02']) expect(allSteps.find((s) => s.id === id)!.foes, id).toBeUndefined();
  });

  it('без шага сравнение идёт с коровой', () => {
    expect(DEFAULT_FOE).toMatchObject({ name: 'Cow', combat: 2, defenceLevel: 1 });
    expect(adviseGear(input()).foes).toEqual([DEFAULT_FOE]);
  });
});

describe('первая оценка темпа боя', () => {
  const s308 = allSteps.find((s) => s.id === 'S3-08')!;
  const warrior = foeData.foes.find((f) => f.name === 'Al Kharid warrior')!;
  const lv = { attack: 20, strength: 20, defence: 20 };
  const iron: GearState = { equipment: [{ id: 1323, name: 'Iron scimitar', slot: 'weapon' }], inventory: [], coins: 0, bankCoins: null };

  it('секунд на противника — его здоровье / урон в секунду нынешнего оружия', () => {
    const dps = meleeWith(lv, gearById.get(1323)!, null, {}, warrior).dps;
    expect(killSeconds(s308, lv, iron)).toBeCloseTo(warrior.hitpoints / dps, 6);
    // Без оружия — кулаки: медленнее, но оценка есть.
    const fists = killSeconds(s308, lv, { ...iron, equipment: [] })!;
    expect(fists).toBeGreaterThan(killSeconds(s308, lv, iron)!);
  });

  it('неизвестно, что в руке, или нет снаряжения из игры — времени не выдумываем', () => {
    expect(killSeconds(s308, lv, null)).toBeNull();
    expect(killSeconds(s308, lv, { ...iron, equipment: null })).toBeNull();
    expect(killSeconds(s308, lv, { ...iron, equipment: [{ id: 99999, name: 'Mystery blade', slot: 'weapon' }] })).toBeNull();
    expect(killSeconds({ foes: undefined }, lv, iron)).toBeNull();
  });

  it('в игру уходит шаг с оценкой, у остальных шагов ничего не меняется', () => {
    const sent = withKillEstimate(s308, lv, iron);
    expect(sent.pacing!.secondsPerAction).toBe(Math.round(killSeconds(s308, lv, iron)! * 10) / 10);
    expect(s308.pacing!.secondsPerAction).toBeUndefined();
    expect(withKillEstimate(s308, lv, null)).toBe(s308);
    const fishing = allSteps.find((s) => s.id === 'S2-13')!;
    expect(withKillEstimate(fishing, lv, iron)).toBe(fishing);
  });
});

describe('страница «Снаряжение»', () => {
  it('сравнение — с противником ближайшего невыполненного шага с боем, а открытый шаг с боем — со своим', () => {
    const f2p = stepsFor('f2p');
    expect(fightStepFor(f2p, emptyProgress())?.id).toBe('S1-13');
    const cowsDone = withStep(emptyProgress(), 'S1-13', 'done');
    expect(fightStepFor(f2p, cowsDone)?.id).toBe('S2-08');
    const s308 = f2p.find((s) => s.id === 'S3-08')!;
    expect(fightStepFor(f2p, emptyProgress(), s308)?.id).toBe('S3-08');
    // Шаг без боя — берётся ближайший с боем.
    expect(fightStepFor(f2p, emptyProgress(), f2p.find((s) => s.id === 'S1-08'))?.id).toBe('S1-13');
  });

  it('открывается по #/gear и находится поиском', () => {
    expect(parseHash('#/gear').page).toBe('gear');
    const index = buildIndex({ steps: stepsFor('f2p'), skills, reference, plugins, items, typeLabel: {} });
    for (const q of ['снаряжение', 'оружие', 'броня', 'экипировка', 'gear']) {
      expect(search(index, q).slice(0, 5).map((h) => h.item.href), q).toContain('#/gear');
    }
  });
});

describe('данные gear.json', () => {
  it('ID уникальны, у оружия есть скорость, требования — из статей вики', () => {
    const ids = gearData.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of gearData.items) {
      if (i.slot === 'weapon') expect(i.speed, i.name).toBeGreaterThan(0);
      expect(i.members, i.name).toBe(false);
    }
    expect(gearData.items.length).toBeGreaterThanOrEqual(130);
  });

  it('совпадает с базой предметов: те же ID у предметов, что есть в обеих', () => {
    for (const i of gearData.items) {
      const other = itemById.get(i.id);
      if (other) expect(other.nameEn, `ID ${i.id}`).toBe(i.name);
    }
    // Ятаганы и амулет силы из закупки S2-01 — в базе снаряжения.
    for (const name of ['Iron scimitar', 'Steel scimitar', 'Mithril scimitar', 'Amulet of strength']) expect(gearById.get(byName(name).id)).toBeTruthy();
  });

  it('магазины с ценами; у Zeke — ятаганы до мифрила', () => {
    const zeke = gearData.items.filter((i) => i.shops?.some((s) => s.shop === "Zeke's Superior Scimitars")).map((i) => [i.name, i.shops!.find((s) => s.shop === "Zeke's Superior Scimitars")!.price]);
    expect(zeke).toEqual([['Bronze scimitar', 32], ['Iron scimitar', 112], ['Steel scimitar', 400], ['Mithril scimitar', 1040]]);
  });
});

describe('амулеты: Amulet of strength и Amulet of power не спорят (§69)', () => {
  const s308 = allSteps.find((s) => s.id === 'S3-08')!;
  const s403 = allSteps.find((s) => s.id === 'S4-03')!;
  const lv30 = { attack: 30, strength: 30, defence: 30 };
  const wearing = (...names: string[]) => gear({ equipment: names.map((n) => item(n, byName(n).slot === 'neck' ? 'amulet' : byName(n).slot)), coins: 50_000, bankCoins: 0 });
  const neckAdvice = (a: ReturnType<typeof adviseGear>) => [...a.actions, ...a.goals].filter((x) => x.slot === 'neck').map((x) => x.item.name);

  it('на всех шагах с боем амулет силы бьёт быстрее амулета мощи', () => {
    for (const step of allSteps.filter((s) => s.foes?.length)) {
      const foes = stepFoes(step);
      if (!foes.length) continue;
      const lv = { attack: 30, strength: 30, defence: 30 };
      expect(meleeValue(lv, byName('Adamant scimitar'), byName('Amulet of strength'), foes), step.id)
        .toBeGreaterThan(meleeValue(lv, byName('Adamant scimitar'), byName('Amulet of power'), foes));
    }
  });

  it('надет амулет силы — амулет мощи не советуется, и наоборот: разница меньше порога', () => {
    for (const step of [s308, s403]) {
      const foes = stepFoes(step);
      expect(neckAdvice(adviseGear(input({ levels: lv30, foes, gear: wearing('Adamant scimitar', 'Amulet of strength') })))).toEqual([]);
      expect(neckAdvice(adviseGear(input({ levels: lv30, foes, gear: wearing('Adamant scimitar', 'Amulet of power') })))).toEqual([]);
    }
  });

  it('без амулета — один главный совет, и это амулет силы, на любом шаге с боем', () => {
    for (const step of [s308, s403]) {
      const a = adviseGear(input({ levels: lv30, foes: stepFoes(step), gear: wearing('Adamant scimitar') }));
      expect(neckAdvice(a)).toEqual(['Amulet of strength']);
    }
  });

  it('амулет силы в банке — «надень», а не поход на биржу; HUD говорит то же, что программа', () => {
    const a = adviseGear(input({ levels: lv30, foes: stepFoes(s308), gear: wearing('Adamant scimitar'), owned: owned({ 'Amulet of strength': 1 }) }));
    const neck = a.actions.find((x) => x.slot === 'neck')!;
    expect(neck).toMatchObject({ how: 'wear', source: { kind: 'bank' }, item: { name: 'Amulet of strength' } });
    expect(hudHint(neck)).toBe('⚡ Надень Amulet of strength — он в банке');
    expect(a.actions.some((x) => x.item.name === 'Amulet of power')).toBe(false);
  });

  it('маршрут покупает один амулет: второй не попадает ни в закупки, ни в автоотметку', () => {
    const buys = allSteps.flatMap((s) => (s.itemsRequired ?? []).filter((i) => /^Amulet of (strength|power)$/.test(i.nameEn)).map((i) => `${s.id}:${i.nameEn}`));
    expect(buys).toEqual(['S2-01:Amulet of strength']);
    const needs = routeNeeds(allSteps, () => false);
    expect(needs.get('amulet of power')).toBeUndefined();
    const s307 = allSteps.find((s) => s.id === 'S3-07')!;
    const trig = s307.inGame?.completionTrigger;
    expect(JSON.stringify(trig)).not.toContain('Amulet');
  });
});
