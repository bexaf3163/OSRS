import { describe, expect, it } from 'vitest';
import { xpData } from '../src/data';
import { clampLevel, levelForXp, xpBetween, xpForLevel } from '../src/lib/xp';

describe('опыт', () => {
  it('совпадает с таблицей гайда', () => {
    for (const { level, xp } of xpData.points) expect(xpForLevel(level)).toBe(xp);
  });

  it('известные значения OSRS', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(92)).toBe(6_517_253);
    expect(xpForLevel(99)).toBe(13_034_431);
  });

  it('пример из гайда: от 30 до 40 — 23 861 опыта', () => {
    expect(xpBetween(30, 40)).toBe(23_861);
  });

  it('обратный порядок и равные уровни — ноль', () => {
    expect(xpBetween(40, 30)).toBe(0);
    expect(xpBetween(15, 15)).toBe(0);
  });

  it('уровень по опыту', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(82)).toBe(1);
    expect(levelForXp(83)).toBe(2);
    expect(levelForXp(37_224)).toBe(40);
    expect(levelForXp(37_223)).toBe(39);
    expect(levelForXp(200_000_000)).toBe(99);
  });

  it('уровни вне 1–99 зажимаются', () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(150)).toBe(99);
    expect(clampLevel(12.7)).toBe(12);
    expect(clampLevel(Number.NaN)).toBe(1);
  });
});
