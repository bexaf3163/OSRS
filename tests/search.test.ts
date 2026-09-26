import { describe, expect, it } from 'vitest';
import { items, plugins, reference, skills, stepsFor } from '../src/data';
import { buildIndex, search } from '../src/lib/search';

const index = buildIndex({ steps: stepsFor('members'), skills, reference, plugins, items, typeLabel: { quest: 'Квест', skill: 'Навык', gear: 'Снаряжение', prep: 'Подготовка' } });

describe('поиск', () => {
  it('код шага — первым результатом', () => {
    expect(search(index, 's3-05')[0].item.href).toBe('#/step/S3-05');
  });

  it('код диапазона ведёт к навыку', () => {
    expect(search(index, 'WC-3')[0].item.href).toBe('#/skills/WC');
  });

  it('название квеста', () => {
    expect(search(index, 'vampyre')[0].item.code).toBe('S2-08');
  });

  it('NPC по-английски и по-русски', () => {
    expect(search(index, 'Mizgog').map((h) => h.item.code)).toContain('S2-02');
    const ru = stepsFor('f2p').find((s) => s.id === 'S2-02')!.npc!.nameRu;
    expect(search(index, ru).map((h) => h.item.code)).toContain('S2-02');
  });

  it('предмет из шага находит и шаг, и досье в базе', () => {
    const hits = search(index, 'Anti-dragon shield', 200);
    expect(hits.some((h) => h.item.kind === 'step' && h.item.code === 'S5-02')).toBe(true);
    const item = hits.find((h) => h.item.kind === 'item');
    expect(item?.item.title).toBe('Anti-dragon shield');
    expect(item?.item.itemId).toBeTypeOf('number');
    expect(item?.item.icon).toMatch(/^https:\/\/oldschool\.runescape\.wiki\//);
  });

  it('предмет базы по-русски', () => {
    const withRu = items.find((i) => i.nameRu)!;
    expect(search(index, withRu.nameRu!, 200).some((h) => h.item.itemId === withRu.id)).toBe(true);
  });

  it('шаги подписки видны в индексе режима Members и помечены', () => {
    const hit = search(index, 'Waterfall Quest')[0];
    expect(hit.item.code).toBe('S7-01');
    expect(hit.item.subtitle).toContain('Members');
  });

  it('несколько слов — все должны встретиться', () => {
    const hits = search(index, 'лосось Barbarian');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.item.folded).toContain('barbarian');
  });

  it('ё и е не различаются', () => {
    expect(search(index, 'клен').length).toBe(search(index, 'клён').length);
  });

  it('плагин', () => {
    expect(search(index, 'Quest Helper').some((h) => h.item.kind === 'plugin')).toBe(true);
  });

  it('пустой запрос — пусто', () => {
    expect(search(index, '   ')).toEqual([]);
  });
});
