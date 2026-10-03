import { describe, expect, it } from 'vitest';
import { qa, type QaInput } from '../scripts/qa';
import gear from '../src/data/gear.json';
import questStages from '../src/data/questStages.json';
import { allSteps } from '../src/data';

const real = (): QaInput => ({ steps: allSteps, gear: gear as unknown as QaInput['gear'], questStages: questStages as unknown as QaInput['questStages'] });

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
            { at: 5, do: [{ t: 'поговори с кем-то', at: [10, 10, 0] }] },
            { at: 3, do: [] },
          ],
        },
      },
    };
    const rules = qa({ ...base, questStages: bad }).map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(['stages-step', 'stages-var', 'stages-order', 'stages-empty', 'text', 'stages-point']));
  });
});
