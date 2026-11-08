import { describe, expect, it } from 'vitest';
import { BANKS } from './travel';

describe('a deposit box is not a bank (S36)', () => {
  it('bank trips only target full banks: no deposit-only service can serve withdrawals, gear changes or buying', () => {
    expect(BANKS.length).toBeGreaterThan(0);
    expect(BANKS.filter(bank => /deposit/i.test(bank.label))).toEqual([]);
  });
});
