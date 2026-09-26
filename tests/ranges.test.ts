import { describe, expect, it } from 'vitest';
import { skillById } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { rangeForLevel, skillLevel, skillRange } from '../src/lib/ranges';

const ranges = (id: string) => skillById.get(id)!.plan.ranges;

describe('строка плана прокачки по уровню', () => {
  it('рубка: 1 → WC-1, 14 → WC-1, 15 → WC-2, 44 → WC-3', () => {
    expect(rangeForLevel(ranges('WC'), 1)?.range.code).toBe('WC-1');
    expect(rangeForLevel(ranges('WC'), 14)?.range.code).toBe('WC-1');
    expect(rangeForLevel(ranges('WC'), 15)?.range.code).toBe('WC-2');
    expect(rangeForLevel(ranges('WC'), 44)?.range.code).toBe('WC-3');
  });

  it('открытый диапазон «60+» берёт всё выше', () => {
    expect(rangeForLevel(ranges('WC'), 60)?.range.code).toBe('WC-5');
    expect(rangeForLevel(ranges('WC'), 99)).toMatchObject({ index: 4, beyond: false });
  });

  it('выше закрытого последнего диапазона — последняя строка с пометкой', () => {
    // Молитва: PR-4 — 37–43.
    expect(rangeForLevel(ranges('PR'), 42)).toMatchObject({ beyond: false });
    expect(rangeForLevel(ranges('PR'), 50)).toMatchObject({ beyond: true });
    expect(rangeForLevel(ranges('PR'), 50)?.range.code).toBe('PR-4');
  });

  it('кузнечное дело: 29 уже SM-2', () => {
    expect(rangeForLevel(ranges('SM'), 28)?.range.code).toBe('SM-1');
    expect(rangeForLevel(ranges('SM'), 29)?.range.code).toBe('SM-2');
  });

  it('ближний бой — по отстающему из трёх', () => {
    const me = skillById.get('ME')!;
    const p = { ...emptyProgress(), levels: { attack: 32, strength: 25, defence: 41 } };
    expect(skillLevel(me, p)).toBe(25);
    expect(skillRange(me, p)?.range.code).toBe('ME-3');
  });

  it('без введённых уровней — первая строка', () => {
    expect(skillRange(skillById.get('RC')!, emptyProgress())?.range.code).toBe('RC-1');
  });

  it('пустой план — null', () => {
    expect(rangeForLevel([], 10)).toBeNull();
  });
});
