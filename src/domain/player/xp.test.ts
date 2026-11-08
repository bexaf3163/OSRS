import { describe, expect, it } from 'vitest';
import { xpData } from '../../data';
import { clampLevel, coherentSkillXp, levelForXp, xpBetween, xpForLevel } from './xp';

describe('experience', () => {
  it('validates exact XP against real level without clamping invalid facts into valid ones', () => {
    expect(coherentSkillXp(82, 1)).toBe(true);
    expect(coherentSkillXp(83, 1)).toBe(false);
    expect(coherentSkillXp(0, 10)).toBe(false);
    expect(coherentSkillXp(200_000_000, 99)).toBe(true);
    for (const value of [-1, 0.5, 200_000_001, NaN, Infinity, '83', null]) expect(coherentSkillXp(value)).toBe(false);
    expect(coherentSkillXp(200_000_000, 126)).toBe(false);
  });
  it('matches the guide table', () => {
    for (const { level, xp } of xpData.points) expect(xpForLevel(level)).toBe(xp);
  });

  it('known OSRS values', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(92)).toBe(6_517_253);
    expect(xpForLevel(99)).toBe(13_034_431);
  });

  it('guide example: from 30 to 40 — 23,861 xp', () => {
    expect(xpBetween(30, 40)).toBe(23_861);
  });

  it('reversed order and equal levels — zero', () => {
    expect(xpBetween(40, 30)).toBe(0);
    expect(xpBetween(15, 15)).toBe(0);
  });

  it('level from experience', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(82)).toBe(1);
    expect(levelForXp(83)).toBe(2);
    expect(levelForXp(37_224)).toBe(40);
    expect(levelForXp(37_223)).toBe(39);
    expect(levelForXp(200_000_000)).toBe(99);
  });

  it('levels outside 1–99 are clamped', () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(150)).toBe(99);
    expect(clampLevel(12.7)).toBe(12);
    expect(clampLevel(Number.NaN)).toBe(1);
  });
});
