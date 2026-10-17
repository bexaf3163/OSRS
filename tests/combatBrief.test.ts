import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';

// The combat brief, section D (quest bosses) and A (stocking up), on the wiki numbers of 2026-10-15: Count Draynor 35 HP, max hit 3;
// Delrith 7 HP, max hit 3, the dark wizards at the circle up to 6; Ithoi the Navigator 55 HP, max hit 6 (magic); Brutus 58 HP, max hit 3 and a
// 19 special. A Strength potion dose is advice for the bosses with real health; Delrith (7 HP) gets food for the wizards instead.

const rec = (id: string) => (stepById.get(id)!.itemsRecommended ?? []).map((i) => `${i.nameEn} x${i.amount}`);
const combat = (id: string) => stepById.get(id)!.fields!.find((f) => f.label === 'Combat')!.text;

describe('quest bosses: food and a potion dose as advice, the numbers in the text', () => {
  it.each([
    ['S2-08', /35 hit points, hits up to 3/],
    ['S4-01', /55 hit points and hits up to 6 with magic/],
    ['S4-02', /58 hit points/],
  ])('%s recommends one Strength potion(4) and says why', (id, text) => {
    expect(rec(id)).toContain('Strength potion(4) x1');
    expect(combat(id)).toMatch(text);
    expect(combat(id)).toMatch(/Strength potion dose/);
  });

  it('S4-01 and S4-02 are fought with the Adamant scimitar (Attack 30 from S3-08)', () => {
    expect(combat('S4-01')).toMatch(/wield the Adamant scimitar/);
    expect(combat('S4-02')).toMatch(/Wield the Adamant scimitar/);
  });

  it('S3-03: food for the dark wizards, no potion for a 7 hit point demon', () => {
    expect(rec('S3-03')).toEqual(['Trout x5']);
    expect(combat('S3-03')).toMatch(/Delrith has 7 hit points/);
    expect(combat('S3-03')).toMatch(/hit up to 6 with magic/);
  });

  it('S3-07 stocks up for S3-08 in the same trip', () => {
    expect(stepById.get('S3-07')!.fields!.find((f) => f.label === 'Food and potions')!.text).toMatch(/Shopping list buys the whole goal/);
  });
});

describe('members bosses fought with Magic from the safespots the wiki names', () => {
  it.each([['S7-02', 60], ['S7-03', 50], ['S7-05', 50]])('%s: Staff of fire, %i Chaos and three times as many Air runes, the safespot and the armour', (id, casts) => {
    expect(rec(id)).toEqual(expect.arrayContaining(['Staff of fire x1', `Chaos rune x${casts}`, `Air rune x${casts * 3}`]));
    const t = stepById.get(id)!.fields!.find((f) => f.label === 'Magic from a safespot')!.text;
    expect(t).toMatch(/safespot/);
    expect(t).toMatch(/Take the metal armour off/);
  });
});

describe('S8-04 Ranged', () => {
  it('names darts on Rapid as the faster way, with the levels', () => {
    const t = stepById.get('S8-04')!.fields!.find((f) => f.label === 'Ranged 30')!.text;
    expect(t).toMatch(/darts on the Rapid style/);
    expect(t).toMatch(/Steel darts from Ranged 5, Mithril darts from 20/);
  });
});
