import { describe, expect, it } from 'vitest';
import { rankMethods, score } from './rank';
import { evaluate } from './evaluate';
import { methodById } from './methods';
import { ctxOf, fakePrices, fakeSnap } from '../../../../tests/funding/helpers';

describe('comparable funding time without stacked uncertainty multipliers', () => {
  it('compares typical wall-clock time and keeps unknown time out of the ranking', () => {
    const base = evaluate(methodById('cows-cowhide')!, ctxOf({ snap: fakeSnap(), prices: fakePrices({}) }));
    const fast = { ...base, eligible: true, confidence: 'LOW' as const, method: { ...base.method, id: 'fast', risk: 'low' as const, intensity: 'low' as const },
      minutes: { fast: 1, typical: 2, slow: 6 } };
    const slow = { ...fast, confidence: 'HIGH' as const, method: { ...fast.method, id: 'slow' }, minutes: { fast: 2, typical: 3, slow: 4 } };
    expect(score(fast)).toBe(2);
    expect(rankMethods([slow, fast]).best?.method.id).toBe('fast');
    expect(rankMethods([{ ...fast, minutes: null }]).best).toBeNull();
  });
});
