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

describe('data consistency check', () => {
  it('the real data — no remarks', () => {
    expect(qa(real())).toEqual([]);
  });

  it('Coif without the 20 Ranged requirement is caught, with it — not', () => {
    const base = real();
    const broken = { ...base, gear: { items: base.gear.items.map((g) => (g.name === 'Coif' ? { ...g, req: undefined } : g)) } };
    expect(qa(broken).map((i) => i.rule)).toContain('gear-known-req');
    const wrong = { ...base, gear: { items: base.gear.items.map((g) => (g.name === 'Coif' ? { ...g, req: { ranged: 17 } } : g)) } };
    expect(qa(wrong).map((i) => i.rule)).toContain('gear-known-req');
  });

  it('garbage requirements and a repeated gear id are caught', () => {
    const base = real();
    const items = [...base.gear.items, { ...base.gear.items[0] }, { id: 999999, name: 'Test', req: { cooking: 5, ranged: 1 } }];
    const rules = qa({ ...base, gear: { items } }).map((i) => i.rule);
    expect(rules).toContain('gear-duplicate');
    expect(rules).toContain('gear-req');
  });

  it('two main amulets in "Required" are caught', () => {
    const base = real();
    const at = base.steps.findIndex((s) => (s.itemsRequired ?? []).some((i) => i.nameEn === 'Amulet of strength'));
    expect(at).toBeGreaterThanOrEqual(0);
    const steps = base.steps.map((s, i) => (i === at + 1
      ? { ...s, itemsRequired: [...(s.itemsRequired ?? []), { nameEn: 'Amulet of power', amount: 1, howToGet: '' }] } : s));
    expect(qa({ ...base, steps }).map((i) => i.rule)).toContain('amulet-consistency');
  });

  it('"Home Teleport" without a note about the cooldown is caught', () => {
    const base = real();
    const steps = base.steps.map((s, i) => (i === 0 ? { ...s, how: 'Exit — Lumbridge Home Teleport.' } : s));
    expect(qa({ ...base, steps }).map((i) => i.rule)).toContain('home-teleport');
    const fine = base.steps.map((s, i) => (i === 0 ? { ...s, how: 'Exit — Lumbridge Home Teleport; if the icon is grey, it is recharging.' } : s));
    expect(qa({ ...base, steps: fine }).filter((i) => i.rule === 'home-teleport')).toEqual([]);
  });

  it('quest stages: a foreign step, order, an empty stage, a lowercase letter, a tile off the map', () => {
    const base = real();
    const bad: QaInput['questStages'] = {
      quests: {
        'S9-99': { var: ['varp', 1], stages: [{ at: 0, do: [{ t: 'Talk.' }] }] },
        'S2-06': {
          var: ['bogus', 0],
          stages: [
            { at: 5, do: [{ t: 'talk to someone', at: [10, 10, 0], need: 'No such item' }] },
            { at: 3, do: [] },
          ],
        },
        'S2-08': {
          var: ['varp', 5],
          stages: [{ at: 0, do: [{ t: 'Talk.' }, { t: 'Give Beer to him.', at: [3000, 3000, 0] }, { t: 'Mine Beer in the mine.', at: [3001, 3001, 0] }, { t: 'The last.', s: 'Talk. Dialogue: “x”' }], items: [{ name: 'Beer' }] }],
        },
      },
    };
    const rules = qa({ ...base, questStages: bad }).map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(['stages-step', 'stages-var', 'stages-order', 'stages-empty', 'text', 'stages-point', 'stages-need', 'stages-need-missing', 'stages-has-missing', 'stages-short']));
  });

  it('step highlight: wrong IDs, empty and repeated lists, foreign fields — are caught; a correct one — not', () => {
    const base = real();
    const stage = (hl: unknown) => ({
      quests: { 'S2-08': { var: ['varp', 5] as [string, number], stages: [{ at: 0, do: [{ t: 'Talk to someone.', s: 'Talk to someone', at: [3000, 3000, 0], hl: hl as never }, { t: 'The second.', s: 'The second', at: [3001, 3001, 0] }] }] } },
    });
    const bad = (hl: unknown) => qa({ ...base, questStages: stage(hl) }).filter((i) => i.rule === 'stages-hl').length;
    expect(bad({ npc: [3647], obj: [2072], on: ['Banana tree'], item: ['Karamjan rum'] })).toBe(0);
    for (const hl of [{}, { npc: [] }, { npc: [0] }, { npc: [1.5] }, { npc: [3647, 3647] }, { npc: [300000] }, { obj: 'x' }, { on: [''] }, { item: [7] }, { foo: [1] },
      { npc: [1, 2, 3, 4, 5, 6, 7, 8, 9] }]) {
      expect(bad(hl), JSON.stringify(hl)).toBe(1);
    }
  });

  it('training methods: a repeat, a range, a speed, an unknown place and skill, a foreign link — are caught', () => {
    const base = real();
    const ok = base.training!.methods[0];
    const bad: QaInput['training'] = {
      methods: [
        ok,
        { ...ok },
        { ...ok, id: 'x1', from: 30, to: 20 },
        { ...ok, id: 'x2', xph: [500, 100] },
        { ...ok, id: 'x3', place: 'No such place' },
        { ...ok, id: 'x4', skill: 'basketweaving' },
        { ...ok, id: 'x5', url: 'https://example.com/guide' },
        { ...ok, id: 'x6', name: 'lowercase start' },
        { ...ok, id: 'x7', kind: 'quest' },
      ],
    };
    const rules = qa({ ...base, training: bad }).map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(['training-id', 'training-range', 'training-rate', 'training-place', 'training-skill', 'training-url', 'text']));
  });
});
