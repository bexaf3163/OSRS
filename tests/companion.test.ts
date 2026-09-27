// Помощник в игре (V2.4): проверка вылета, быстрые варианты по статам, оптовый список GE и то, что уходит в плагин.

import { describe, expect, it } from 'vitest';
import type { Progress, Step, StepItemRequirement } from '../src/types';
import { evaluatePreflight, nameKey, parseAmount, parseOwned, preflightItems, type OwnedState } from '../src/lib/checklist';
import { evaluateBranches, evaluateCondition, reasonLabel, watchedItems, type BranchContext } from '../src/lib/branching';
import { aggregateShopping, carryOverFrom, plural, shoppingText } from '../src/lib/shopping';
import { parseStats, toInGameTarget } from '../src/services/runeliteBridge';
import { stepsFor } from '../src/data';

const item = (nameEn: string, amount: string | number, extra: Partial<StepItemRequirement> = {}): StepItemRequirement =>
  ({ nameEn, nameRu: nameEn, amount, howToGet: '', ...extra });

const step = (id: string, items: StepItemRequirement[], extra: Partial<Step> = {}): Step =>
  ({ id, stage: 2, type: 'quest', title: id, requires: [], doneWhen: '', itemsRequired: items, ...extra });

const owned = (bankSeen: boolean, rows: { name: string; carried?: number; noted?: number; bank?: number }[]): OwnedState =>
  parseOwned({ type: 'OWNED', bankSeen, items: rows.map((r) => ({ carried: 0, noted: 0, ...r })) })!;

const progress = (extra: Partial<Progress> = {}): Progress =>
  ({ version: 3, steps: {}, levels: {}, notes: {}, updatedAt: '', ...extra });

describe('количество из маршрута', () => {
  it('числа, «23 (…)», «20+», «1 000» и не-числа', () => {
    expect(parseAmount(5)).toBe(5);
    expect(parseAmount('23 (20 сдать, 3 в банк)')).toBe(23);
    expect(parseAmount('20+')).toBe(20);
    expect(parseAmount('1 000')).toBe(1000);
    expect(parseAmount('Сколько есть')).toBeNull();
    expect(parseAmount('По одной на алхимию')).toBeNull();
    expect(parseAmount(0)).toBeNull();
  });
});

describe('проверка вылета', () => {
  const rope = item('Rope', 1, { wikiItemId: 954 });
  const items = preflightItems(step('S7-01', [rope]));

  it('0/1 — не хватает, но в банке есть', () => {
    const r = evaluatePreflight(items, owned(true, [{ name: 'Rope', bank: 2 }]));
    expect(r.rows[0]).toMatchObject({ have: 0, inBank: 2, state: 'MISSING_FROM_BAG' });
    expect(r.ready).toBe(false);
  });

  it('1/1 — готов к выходу', () => {
    const r = evaluatePreflight(items, owned(false, [{ name: 'Rope', carried: 1 }]));
    expect(r.rows[0].state).toBe('IN_BAG_READY');
    expect(r.ready).toBe(true);
  });

  it('стопка: монеты считаются количеством, банкноты не в счёт', () => {
    const coins = preflightItems(step('S2-09', [item('Coins', 90, { wikiItemId: 995 })]));
    expect(evaluatePreflight(coins, owned(false, [{ name: 'Coins', carried: 120 }])).ready).toBe(true);
    // Лобстеры банкнотами есть нельзя — в сумке их по-прежнему 0.
    const food = preflightItems(step('S5-08', [item('Lobster', '20+', { heals: 12 })]));
    const r = evaluatePreflight(food, owned(false, [{ name: 'Lobster', noted: 50 }]));
    expect(r.rows[0]).toMatchObject({ have: 0, state: 'MISSING_FROM_BAG' });
    expect(r.rows[0].item).toMatchObject({ count: 20, exact: true, heals: 12 });
  });

  it('несколько одинаковых: 2/5 курятины', () => {
    const chicken = preflightItems(step('S1-09', [item('Cooked chicken', 5, { heals: 3 })]));
    const r = evaluatePreflight(chicken, owned(true, [{ name: 'Cooked chicken', carried: 2, bank: 10 }]));
    expect(r.rows[0]).toMatchObject({ have: 2, inBank: 10, state: 'MISSING_FROM_BAG' });
  });

  it('нет и в банке', () => {
    const r = evaluatePreflight(items, owned(true, [{ name: 'Rope', carried: 0 }]));
    expect(r.rows[0]).toMatchObject({ inBank: 0, state: 'NOT_FOUND_IN_BANK' });
  });

  it('банк не открывали — «нет в банке» не утверждаем', () => {
    const r = evaluatePreflight(items, owned(false, []));
    expect(r.rows[0]).toMatchObject({ inBank: null, state: 'MISSING_FROM_BAG' });
  });

  it('полный комплект, имя без учёта регистра', () => {
    const kit = preflightItems(step('S2-08', [item('Hammer', 1), item('Beer', 1, { inStep: true }), item('Garlic', 1)]));
    // Пиво покупается в самом шаге — у банка его не требуем.
    expect(kit.map((i) => i.nameEn)).toEqual(['Hammer', 'Garlic']);
    const r = evaluatePreflight(kit, owned(true, [{ name: 'HAMMER', carried: 1 }, { name: 'garlic', carried: 1 }]));
    expect(r.ready).toBe(true);
    expect(r.missing).toBe(0);
  });

  it('мусор в событии OWNED отбрасывается', () => {
    const o = parseOwned({ bankSeen: true, items: [{ name: 'Rope', carried: -3, bank: 'x' }, null, { carried: 1 }] })!;
    expect(o.items.get(nameKey('rope'))).toMatchObject({ carried: 0, noted: 0 });
    // Непонятное количество в банке — «неизвестно», а не ноль.
    expect(o.items.get(nameKey('rope'))!.bank).toBeUndefined();
    expect(o.items.size).toBe(1);
    expect(parseOwned({ items: 'нет' })).toBeNull();
  });
});

describe('быстрые варианты по статам', () => {
  const teleport = step('S2-05', [], {
    branches: [{ id: 'varrock-teleport', label: 'Varrock Teleport', condition: { type: 'SKILL_LEVEL', skill: 'magic', minLevel: 25 } }],
  });
  const canoe = step('S1-09', [], {
    branches: [{ id: 'canoe-log', label: 'Каноэ', condition: { type: 'SKILL_LEVEL', skill: 'woodcutting', minLevel: 12 } }],
  });
  const ctx = (stats: Record<string, number> | null, extra: Partial<BranchContext> = {}): BranchContext =>
    ({ stats, progress: progress(), steps: [], owned: null, ...extra });

  it('Magic 24 — обычный путь, Magic 25 — телепорт', () => {
    expect(evaluateBranches(teleport, ctx({ magic: 24 }))[0]).toMatchObject({ status: 'locked', have: 24, need: 25 });
    const r = evaluateBranches(teleport, ctx({ magic: 25 }))[0];
    expect(r).toMatchObject({ status: 'available', source: 'runelite' });
    expect(reasonLabel(r)).toBe('у тебя Magic 25 (из игры)');
  });

  it('Woodcutting 11 — пешком, 12 — каноэ', () => {
    expect(evaluateBranches(canoe, ctx({ woodcutting: 11 }))[0].status).toBe('locked');
    expect(evaluateBranches(canoe, ctx({ woodcutting: 12 }))[0].status).toBe('available');
  });

  it('без RuneLite — уровень, введённый вручную; без него — неизвестно', () => {
    expect(evaluateBranches(teleport, ctx(null, { progress: progress({ levels: { magic: 30 } }) }))[0])
      .toMatchObject({ status: 'available', source: 'manual' });
    expect(evaluateBranches(teleport, ctx(null))[0].status).toBe('unknown');
    // Уровень из игры главнее введённого вручную.
    expect(evaluateBranches(teleport, ctx({ magic: 20 }, { progress: progress({ levels: { magic: 30 } }) }))[0].status).toBe('locked');
  });

  it('квест по прогрессу и предмет по данным из игры', () => {
    const quests = [step('S9-01', [], { title: 'Lost City' })];
    const done = ctx(null, { steps: quests, progress: progress({ steps: { 'S9-01': 'done' } }) });
    expect(evaluateCondition({ type: 'QUEST_COMPLETED', questName: 'Lost City' }, done).status).toBe('available');
    expect(evaluateCondition({ type: 'QUEST_COMPLETED', questName: 'Lost City' }, ctx(null, { steps: quests })).status).toBe('locked');
    const chronicle = { type: 'ITEM_OWNED' as const, itemName: 'Chronicle' };
    expect(evaluateCondition(chronicle, ctx(null)).status).toBe('unknown');
    expect(evaluateCondition(chronicle, ctx(null, { owned: owned(true, [{ name: 'Chronicle', bank: 1 }]) })).status).toBe('available');
    expect(evaluateCondition(chronicle, ctx(null, { owned: owned(false, [{ name: 'Chronicle' }]) })).status).toBe('unknown');
    expect(evaluateCondition(chronicle, ctx(null, { owned: owned(true, [{ name: 'Chronicle' }]) })).status).toBe('locked');
  });

  it('уровни из моста: только осмысленные числа', () => {
    expect(parseStats({ magic: 25, woodcutting: 12, attack: 'x', agility: 0, prayer: 2.5 })).toEqual({ magic: 25, woodcutting: 12 });
    expect(parseStats(null)).toBeNull();
    expect(parseStats({})).toBeNull();
  });
});

describe('оптовый список GE', () => {
  it('Rope ×1 + Rope ×1 + Hammer ×1 → Rope ×2, Hammer ×1', () => {
    const list = aggregateShopping([
      step('A', [item('Rope', 1, { wikiItemId: 954 })]),
      step('B', [item('Rope', 1, { wikiItemId: 954 })]),
      step('C', [item('Hammer', 1, { wikiItemId: 2347 })]),
    ]);
    expect(list.required.map((l) => [l.nameEn, l.count])).toEqual([['Rope', 2], ['Hammer', 1]]);
    expect(list.required[0].sources.map((s) => s.stepId)).toEqual(['A', 'B']);
  });

  it('тот же предмет из более раннего шага не считается дважды', () => {
    const list = aggregateShopping([
      step('S2-01', [item('Iron bar', 2, { wikiItemId: 2351 })]),
      step('S2-07', [item('Iron bar', 2, { wikiItemId: 2351, howToGet: 'Из шага S2-01.' })]),
    ]);
    expect(list.required[0].count).toBe(2);
    expect(list.required[0].sources[1].carryOver).toBe(true);
    // Если S2-01 не выбран (уже пройден), предмет из S2-07 считается.
    expect(aggregateShopping([step('S2-07', [item('Iron bar', 2, { wikiItemId: 2351, howToGet: 'Из шага S2-01.' })])]).required[0].count).toBe(2);
  });

  it('инструмент одного на все шаги; две строки в одном шаге складываются', () => {
    const list = aggregateShopping([
      step('S4-04', [item('Lobster pot', 1, { wikiItemId: 301 })]),
      step('S4-05', [item('Lobster pot', 1, { wikiItemId: 301 }), item('Lobster pot', 1, { wikiItemId: 301 }), item('Hammer', 1)]),
      step('S5-06', [item('Hammer', 1)]),
    ]);
    expect(list.required.find((l) => l.nameEn === 'Lobster pot')!.count).toBe(2);
    expect(list.required.find((l) => l.nameEn === 'Hammer')!.count).toBe(1);
  });

  it('по ID, иначе по имени; монеты — отдельно; рекомендуемое без повторов', () => {
    const list = aggregateShopping([
      step('A', [item('Beer', 1, { wikiItemId: 1917 }), item('Coins', 90, { wikiItemId: 995 })], { itemsRecommended: [item('beer', 1), item('Garlic', 1)] }),
      step('B', [item('beer', 2), item('Coins', 2000)]),
    ]);
    expect(list.required).toHaveLength(1);
    expect(list.required[0]).toMatchObject({ nameEn: 'Beer', count: 3, id: 1917 });
    expect(list.coins).toBe(2090);
    expect(list.recommended.map((l) => l.nameEn)).toEqual(['Garlic']);
  });

  it('покупки шага-закупки — это покупки, а не «добудешь по ходу»', () => {
    const list = aggregateShopping([step('S2-01', [item('Red bead', 1, { inStep: true })], { type: 'gear' })]);
    expect(list.required[0].inStepOnly).toBe(false);
  });

  it('количество не числом и «только по ходу шага»', () => {
    const list = aggregateShopping([step('S2-13', [item('Feather', 'Сколько есть'), item('Egg', 1, { inStep: true })])]);
    expect(list.required[0]).toMatchObject({ nameEn: 'Feather', count: 1, exact: false, inStepOnly: false });
    expect(list.required[1]).toMatchObject({ nameEn: 'Egg', inStepOnly: true });
  });

  it('ссылки на ранние шаги из маршрута распознаются', () => {
    expect(carryOverFrom(item('Beads', 1, { howToGet: 'Из шага S2-01.' }))).toBe('S2-01');
    expect(carryOverFrom(item('Silk', 1, { howToGet: 'Из S4-05: у торговца шёлком' }))).toBe('S4-05');
    expect(carryOverFrom(item('Wool', 3, { howToGet: 'Сохранённые из S1-04!' }))).toBe('S1-04');
    expect(carryOverFrom(item('Flour', 1, { howToGet: 'Запасной из шага S1-03.' }))).toBe('S1-03');
    expect(carryOverFrom(item('Rope', 1, { howToGet: 'Купи у Ned за 18 gp.' }))).toBeNull();
  });

  it('число позиций по-русски', () => {
    const w = (n: number) => `${n} ${plural(n, 'позицию', 'позиции', 'позиций')}`;
    expect([1, 3, 5, 11, 21, 31, 44, 112].map(w)).toEqual(['1 позицию', '3 позиции', '5 позиций', '11 позиций', '21 позицию', '31 позицию', '44 позиции', '112 позиций']);
  });

  it('текст для биржи', () => {
    expect(shoppingText('GE', [{ nameEn: 'Iron bar', buy: 2, exact: true }, { nameEn: 'Feather', buy: 1, exact: false }, { nameEn: 'Rope', buy: 0, exact: true }], 2500))
      .toBe('GE\nIron bar x2\nFeather x1+\nCoins ~2 500 gp (на сами шаги)');
  });

  it('настоящий маршрут: этап 2 F2P без двойного счёта', () => {
    const steps = stepsFor('f2p').filter((s) => s.stage === 2);
    const list = aggregateShopping(steps);
    const keys = list.required.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Бусины покупаются в S2-01, Imp Catcher (S2-02) берёт те же — по одной, а не по две.
    expect(list.required.find((l) => l.nameEn === 'Red bead')!.count).toBe(1);
    // Железные слитки: 2 в S2-01, в The Knight's Sword — те же.
    expect(list.required.find((l) => l.nameEn === 'Iron bar')!.count).toBe(2);
  });
});

describe('что уходит в плагин', () => {
  const steps = stepsFor('f2p');
  const byId = (id: string) => steps.find((s) => s.id === id)!;

  it('цель HUD, проверка вылета без предметов «по ходу шага»', () => {
    const p = toInGameTarget(byId('S2-08'))!;
    expect(p.goal).toBe('Дом Моргана в Draynor Village');
    expect(p.checklist!.map((i) => i.name)).toEqual(['Hammer']);
    expect(p.checklist![0]).toMatchObject({ id: 2347, count: 1 });
  });

  it('путевые точки The Restless Ghost', () => {
    const p = toInGameTarget(byId('S1-06'))!;
    expect(p.pathWaypoints).toHaveLength(5);
    // Амулет выдаёт Father Urhney по ходу квеста — у банка его не требуем.
    expect(p.checklist).toBeUndefined();
  });

  it('выбранный быстрый вариант заменяет точку и убирает путевые точки обычного пути', () => {
    const s = byId('S2-05');
    const branch = s.branches!.find((b) => b.id === 'varrock-teleport')!;
    const p = toInGameTarget(s, branch)!;
    expect(p.worldPoint).toMatchObject({ x: 3213, y: 3424, plane: 0 });
    // Подпись точки уже начинается с названия варианта — не повторяем его.
    expect(p.goal).toBe('Varrock Teleport — площадь у фонтана');
    const ghost = byId('S1-06');
    const fake = { id: 'x', label: 'X', condition: { type: 'SKILL_LEVEL' as const, skill: 'magic', minLevel: 1 }, replacementTarget: { x: 3200, y: 3200, plane: 0, label: 'Y' } };
    expect(toInGameTarget(ghost, fake)!.pathWaypoints).toBeUndefined();
  });

  it('предметы из условий — плагину на подсчёт', () => {
    expect(watchedItems(byId('S2-01'))).toEqual(['Chronicle']);
    expect(toInGameTarget(byId('S2-01'))!.watchItems).toEqual(['Chronicle']);
  });

  it('шаг только с предметами тоже уходит в игру — ради проверки вылета', () => {
    const p = toInGameTarget(step('S9-99', [item('Rope', 1)]));
    expect(p?.checklist).toEqual([{ name: 'Rope', id: undefined, count: 1, heals: undefined }]);
  });
});
