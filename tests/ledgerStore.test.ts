import { describe, expect, it } from 'vitest';
import { ledgerKey, LEDGER_LIMIT, LEDGER_MAX_AGE_MS, loadLedger, saveLedger, since, trim } from '../src/lib/ledgerStore';
import type { LedgerEntry } from '../src/lib/ledger';

function memory(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const NOW = 1_800_000_000_000;
const e = (t: number, over: Partial<LedgerEntry> = {}): LedgerEntry => ({ name: 'Cowhide', quantityDelta: 2, reason: 'LOOT', timestamp: t, estimatedGpValue: 200, ...over });

describe('resource journal storage', () => {
  it('the key is the profile and the character; case and spaces do not distinguish one player', () => {
    expect(ledgerKey('main', 'Iron  Mark')).toBe(ledgerKey('main', ' iron mark '));
    expect(ledgerKey('main', 'Iron Mark')).not.toBe(ledgerKey('alt', 'Iron Mark'));
    expect(ledgerKey('main', 'Iron Mark')).not.toBe(ledgerKey('main', 'Other'));
    expect(ledgerKey('main', null)).toBe(ledgerKey('main', ''));
  });

  it('what was saved reads back the same in a new session', () => {
    const s = memory();
    const rows = [e(NOW - 5000), e(NOW - 1000, { name: 'Coins', quantityDelta: 300, reason: 'SALE' })];
    saveLedger(s, 'k', rows);
    expect(loadLedger(s, 'k', NOW)).toEqual(rows);
  });

  it('an empty journal leaves no key', () => {
    const s = memory();
    saveLedger(s, 'k', [e(NOW)]);
    saveLedger(s, 'k', []);
    expect(s.data.has('k')).toBe(false);
  });

  it('broken data does not break anything: garbage, not an array, foreign records — empty or only the valid ones', () => {
    const s = memory();
    s.data.set('a', '{not json');
    s.data.set('b', '{"x":1}');
    s.data.set('c', JSON.stringify([e(NOW - 1), { name: '', quantityDelta: 1, reason: 'LOOT', timestamp: NOW }, { name: 'X', quantityDelta: 'many', reason: 'LOOT', timestamp: NOW }, { name: 'X', quantityDelta: 1, reason: 'GIFT', timestamp: NOW }, null, 7, { name: 'Y', quantityDelta: 1, reason: 'LOOT', timestamp: NOW, estimatedGpValue: NaN }]));
    expect(loadLedger(s, 'a', NOW)).toEqual([]);
    expect(loadLedger(s, 'b', NOW)).toEqual([]);
    expect(loadLedger(s, 'c', NOW)).toEqual([e(NOW - 1)]);
    expect(loadLedger(s, 'none', NOW)).toEqual([]);
    expect(loadLedger(undefined, 'a', NOW)).toEqual([]);
  });

  it('older than 30 days and records "from the future" are dropped, the limit cuts from the start', () => {
    const old = e(NOW - LEDGER_MAX_AGE_MS - 1);
    const fresh = e(NOW - 1000);
    const future = e(NOW + 3_600_000);
    expect(trim([old, fresh, future], NOW)).toEqual([fresh]);
    const many = Array.from({ length: LEDGER_LIMIT + 50 }, (_, i) => e(NOW - 10_000 + i));
    const cut = trim(many, NOW);
    expect(cut).toHaveLength(LEDGER_LIMIT);
    expect(cut[cut.length - 1]).toEqual(many[many.length - 1]);
  });

  it('the storage is unavailable or full — we do not fail', () => {
    const broken = { getItem: () => { throw new Error('none'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('none'); } };
    expect(loadLedger(broken, 'k', NOW)).toEqual([]);
    expect(() => saveLedger(broken, 'k', [e(NOW)])).not.toThrow();
    expect(() => saveLedger(undefined, 'k', [e(NOW)])).not.toThrow();
  });

  it('"this session" — only records since the start of the session', () => {
    const rows = [e(100), e(200), e(300)];
    expect(since(rows, 200)).toEqual([e(200), e(300)]);
    expect(since(rows, 1000)).toEqual([]);
  });
});
