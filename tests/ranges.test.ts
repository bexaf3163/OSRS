import { describe, expect, it } from 'vitest';
import { skillById } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { rangeForLevel, skillLevel, skillRange } from '../src/lib/ranges';

const ranges = (id: string) => skillById.get(id)!.plan.ranges;

describe('the training plan row by level', () => {
  it('woodcutting: 1 → WC-1, 14 → WC-1, 15 → WC-2, 44 → WC-3', () => {
    expect(rangeForLevel(ranges('WC'), 1)?.range.code).toBe('WC-1');
    expect(rangeForLevel(ranges('WC'), 14)?.range.code).toBe('WC-1');
    expect(rangeForLevel(ranges('WC'), 15)?.range.code).toBe('WC-2');
    expect(rangeForLevel(ranges('WC'), 44)?.range.code).toBe('WC-3');
  });

  it('the open range "60+" takes everything above', () => {
    expect(rangeForLevel(ranges('WC'), 60)?.range.code).toBe('WC-5');
    expect(rangeForLevel(ranges('WC'), 99)).toMatchObject({ index: 4, beyond: false });
  });

  it('above the closed last range — the last row with a note', () => {
    // Prayer: PR-4 — 37–43.
    expect(rangeForLevel(ranges('PR'), 42)).toMatchObject({ beyond: false });
    expect(rangeForLevel(ranges('PR'), 50)).toMatchObject({ beyond: true });
    expect(rangeForLevel(ranges('PR'), 50)?.range.code).toBe('PR-4');
  });

  it('smithing: 29 is already SM-2', () => {
    expect(rangeForLevel(ranges('SM'), 28)?.range.code).toBe('SM-1');
    expect(rangeForLevel(ranges('SM'), 29)?.range.code).toBe('SM-2');
  });

  it('melee — by the lowest of the three', () => {
    const me = skillById.get('ME')!;
    const p = { ...emptyProgress(), levels: { attack: 32, strength: 25, defence: 41 } };
    expect(skillLevel(me, p)).toBe(25);
    expect(skillRange(me, p)?.range.code).toBe('ME-3');
  });

  it('without entered levels — the first row', () => {
    expect(skillRange(skillById.get('RC')!, emptyProgress())?.range.code).toBe('RC-1');
  });

  it('an empty plan — null', () => {
    expect(rangeForLevel([], 10)).toBeNull();
  });
});
