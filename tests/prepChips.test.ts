import { describe, expect, it } from 'vitest';
import { chipOf, prepChipGroups } from '../src/lib/prepChips';
import type { PrepLine, PrepWhere } from '../src/lib/prepPlan';

const line = (name: string, where: PrepWhere, count = 1, exact = true): PrepLine => ({
  key: `${name}:${where}`, name, count, exact, where,
  have: { bag: null, noted: 0, bank: null, equipped: 0 }, toGet: null,
  priority: 'CRITICAL', timing: 'NOW', why: '', usedIn: [],
} as PrepLine);

describe('prepChips', () => {
  it('says where the thing is in words, and never turns "not checked" into "missing"', () => {
    expect(chipOf(line('Soft clay', 'INVENTORY')).text).toBe('Soft clay');
    expect(chipOf(line('Bronze bar', 'BANK')).text).toBe('Bronze bar · in the bank');
    expect(chipOf(line('Pink skirt', 'MISSING')).text).toBe('Pink skirt · missing');
    const unknown = chipOf(line('Rope', 'UNKNOWN'));
    expect(unknown.text).toBe('Rope · not checked');
    expect(unknown.state).toBe('unknown');
    expect(chipOf(line('Worn cape', 'EQUIPPED')).state).toBe('ok');
  });

  it('shows the count, and a plus when the count is a lower estimate', () => {
    expect(chipOf(line('Ball of wool', 'INVENTORY', 3)).text).toBe('Ball of wool ×3');
    expect(chipOf(line('Redberries', 'MISSING', 2, false)).text).toBe('Redberries ×2+ · missing');
  });

  it('groups by timing, drops empty groups and honours the "later" switch', () => {
    const plan = { now: [line('A', 'MISSING')], soon: [], byTheWay: [line('B', 'UNKNOWN')], later: [line('C', 'BANK')] };
    expect(prepChipGroups(plan, true).map((g) => g.key)).toEqual(['now', 'way', 'later']);
    expect(prepChipGroups(plan, false).map((g) => g.key)).toEqual(['now', 'way']);
    expect(prepChipGroups({ now: [], soon: [], byTheWay: [], later: [] }, true)).toEqual([]);
  });
});
