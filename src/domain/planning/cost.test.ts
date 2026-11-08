import { describe, expect, it } from 'vitest';
import { comparableKnown, exactCost, noTime, sumExpressions } from './cost';

describe('unknown wall-clock terms', () => {
  it('cancels only identical unknown terms with identical counts and retains their unknown total', () => {
    const a = { known: { ...noTime(), fast: 2, typical: 2, slow: 2 }, unresolved: ['quest-a-work', 'quest-b-work'] };
    const b = { known: noTime(), unresolved: ['quest-b-work', 'quest-a-work'] };
    expect(comparableKnown(a, b)).toBe(true);
    expect(comparableKnown(a, { ...b, unresolved: ['quest-a-work', 'quest-b-work', 'quest-b-work'] })).toBe(false);
    expect(comparableKnown(a, { ...b, unresolved: ['unknown-fight', 'quest-b-work'] })).toBe(false);
    expect(sumExpressions([a, exactCost(noTime())])).toEqual(a);
    expect(sumExpressions([a, null])).toBeNull();
    expect(sumExpressions([{ ...a, known: { ...a.known, typical: NaN } }])).toBeNull();
    expect(sumExpressions([{ ...a, unresolved: [''] }])).toBeNull();
  });
});
