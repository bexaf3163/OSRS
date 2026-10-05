import { describe, expect, it } from 'vitest';
import { items, plugins, reference, skills, stepsFor } from '../src/data';
import { buildIndex, search } from '../src/lib/search';

const index = buildIndex({ steps: stepsFor('members'), skills, reference, plugins, items, typeLabel: { quest: 'Quest', skill: 'Skill', gear: 'Gear', prep: 'Preparation' } });

describe('search', () => {
  it('a step code — the first result', () => {
    expect(search(index, 's3-05')[0].item.href).toBe('#/step/S3-05');
  });

  it('a range code leads to the skill', () => {
    expect(search(index, 'WC-3')[0].item.href).toBe('#/skills/WC');
  });

  it('a quest name', () => {
    expect(search(index, 'vampyre')[0].item.code).toBe('S2-08');
  });

  it('an NPC by name', () => {
    expect(search(index, 'Mizgog').map((h) => h.item.code)).toContain('S2-02');
  });

  it('an item from a step finds both the step and the dossier in the database', () => {
    const hits = search(index, 'Anti-dragon shield', 200);
    expect(hits.some((h) => h.item.kind === 'step' && h.item.code === 'S5-02')).toBe(true);
    const item = hits.find((h) => h.item.kind === 'item');
    expect(item?.item.title).toBe('Anti-dragon shield');
    expect(item?.item.itemId).toBeTypeOf('number');
    expect(item?.item.icon).toMatch(/^https:\/\/oldschool\.runescape\.wiki\//);
  });

  it('every database item is found by its own name', () => {
    const it0 = items[0];
    expect(search(index, it0.nameEn, 200).some((h) => h.item.itemId === it0.id)).toBe(true);
  });

  it('members steps are visible in the Members mode index and marked', () => {
    const hit = search(index, 'Waterfall Quest')[0];
    expect(hit.item.code).toBe('S7-01');
    expect(hit.item.subtitle).toContain('Members');
  });

  it('several words — all must occur', () => {
    const hits = search(index, 'salmon Barbarian');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.item.folded).toContain('barbarian');
  });

  it('letter case does not matter', () => {
    expect(search(index, 'WATERFALL quest').length).toBe(search(index, 'waterfall QUEST').length);
  });

  it('a plugin', () => {
    expect(search(index, 'Quest Helper').some((h) => h.item.kind === 'plugin')).toBe(true);
  });

  it('an empty query — empty', () => {
    expect(search(index, '   ')).toEqual([]);
  });
});
