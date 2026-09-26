import { describe, expect, it } from 'vitest';
import { plugins, reference, skills, steps } from '../src/data';
import { buildIndex, search } from '../src/lib/search';

const index = buildIndex({ steps, skills, reference, plugins, typeLabel: { quest: 'Квест', skill: 'Навык', gear: 'Снаряжение', prep: 'Подготовка' } });

describe('поиск', () => {
  it('код шага — первым результатом', () => {
    expect(search(index, 's3-05')[0].item.href).toBe('#/step/S3-05');
  });

  it('код диапазона ведёт к навыку', () => {
    expect(search(index, 'WC-3')[0].item.href).toBe('#/skills/WC');
  });

  it('название квеста', () => {
    expect(search(index, 'vampyre')[0].item.code).toBe('S3-05');
  });

  it('предмет из текста шага, по-английски', () => {
    const hits = search(index, 'Fly fishing rod');
    expect(hits.map((h) => h.item.code)).toContain('S2-03');
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
