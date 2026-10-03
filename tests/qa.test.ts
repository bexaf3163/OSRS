import { describe, expect, it } from 'vitest';
import { qa, type QaInput } from '../scripts/qa';
import gear from '../src/data/gear.json';
import questStages from '../src/data/questStages.json';
import trainingMethods from '../src/data/trainingMethods.json';
import majorLocations from '../src/data/majorLocations.json';
import { allSteps, allLevelSkills } from '../src/data';

const real = (): QaInput => ({
  steps: allSteps, gear: gear as unknown as QaInput['gear'], questStages: questStages as unknown as QaInput['questStages'],
  training: trainingMethods as unknown as QaInput['training'], places: majorLocations as unknown as QaInput['places'], skillIds: allLevelSkills.map((l) => l.id),
});

describe('проверка согласованности данных', () => {
  it('настоящие данные — без замечаний', () => {
    expect(qa(real())).toEqual([]);
  });

  it('Coif без требования 20 Ranged ловится, с ним — нет', () => {
    const base = real();
    const broken = { ...base, gear: { items: base.gear.items.map((g) => (g.name === 'Coif' ? { ...g, req: undefined } : g)) } };
    expect(qa(broken).map((i) => i.rule)).toContain('gear-known-req');
    const wrong = { ...base, gear: { items: base.gear.items.map((g) => (g.name === 'Coif' ? { ...g, req: { ranged: 17 } } : g)) } };
    expect(qa(wrong).map((i) => i.rule)).toContain('gear-known-req');
  });

  it('мусорные требования и повтор id снаряжения ловятся', () => {
    const base = real();
    const items = [...base.gear.items, { ...base.gear.items[0] }, { id: 999999, name: 'Test', req: { cooking: 5, ranged: 1 } }];
    const rules = qa({ ...base, gear: { items } }).map((i) => i.rule);
    expect(rules).toContain('gear-duplicate');
    expect(rules).toContain('gear-req');
  });

  it('два главных амулета в «Требуемых» ловятся', () => {
    const base = real();
    const at = base.steps.findIndex((s) => (s.itemsRequired ?? []).some((i) => i.nameEn === 'Amulet of strength'));
    expect(at).toBeGreaterThanOrEqual(0);
    const steps = base.steps.map((s, i) => (i === at + 1
      ? { ...s, itemsRequired: [...(s.itemsRequired ?? []), { nameEn: 'Amulet of power', nameRu: 'Амулет мощи', amount: 1, howToGet: '' }] } : s));
    expect(qa({ ...base, steps }).map((i) => i.rule)).toContain('amulet-consistency');
  });

  it('«Home Teleport» без оговорки про перезарядку ловится', () => {
    const base = real();
    const steps = base.steps.map((s, i) => (i === 0 ? { ...s, how: 'Выход — Lumbridge Home Teleport.' } : s));
    expect(qa({ ...base, steps }).map((i) => i.rule)).toContain('home-teleport');
    const fine = base.steps.map((s, i) => (i === 0 ? { ...s, how: 'Выход — Lumbridge Home Teleport; если значок серый, он перезаряжается.' } : s));
    expect(qa({ ...base, steps: fine }).filter((i) => i.rule === 'home-teleport')).toEqual([]);
  });

  it('этапы квестов: чужой шаг, порядок, пустой этап, строчная буква, клетка вне карты', () => {
    const base = real();
    const bad: QaInput['questStages'] = {
      quests: {
        'S9-99': { var: ['varp', 1], stages: [{ at: 0, do: [{ t: 'Поговори.' }] }] },
        'S2-06': {
          var: ['bogus', 0],
          stages: [
            { at: 5, do: [{ t: 'поговори с кем-то', at: [10, 10, 0], need: 'Нет такого' }] },
            { at: 3, do: [] },
          ],
        },
        'S2-08': {
          var: ['varp', 5],
          stages: [{ at: 0, do: [{ t: 'Поговори.' }, { t: 'Отдай Beer ему.', at: [3000, 3000, 0] }, { t: 'Накопай Beer в шахте.', at: [3001, 3001, 0] }, { t: 'Последний.', s: 'Поговори. Диалог: «x»' }], items: [{ name: 'Beer' }] }],
        },
      },
    };
    const rules = qa({ ...base, questStages: bad }).map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(['stages-step', 'stages-var', 'stages-order', 'stages-empty', 'text', 'stages-point', 'stages-need', 'stages-need-missing', 'stages-has-missing', 'stages-short']));
  });

  it('способы прокачки: повтор, диапазон, скорость, неизвестное место и навык, чужая ссылка — ловятся', () => {
    const base = real();
    const ok = base.training!.methods[0];
    const bad: QaInput['training'] = {
      methods: [
        ok,
        { ...ok },
        { ...ok, id: 'x1', from: 30, to: 20 },
        { ...ok, id: 'x2', xph: [500, 100] },
        { ...ok, id: 'x3', place: 'Нет такого места' },
        { ...ok, id: 'x4', skill: 'basketweaving' },
        { ...ok, id: 'x5', url: 'https://example.com/guide' },
        { ...ok, id: 'x6', name: 'без заглавной' },
        { ...ok, id: 'x7', kind: 'quest' },
      ],
    };
    const rules = qa({ ...base, training: bad }).map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(['training-id', 'training-range', 'training-rate', 'training-place', 'training-skill', 'training-url', 'text']));
  });
});
