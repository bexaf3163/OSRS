import { describe, expect, it } from 'vitest';
import { ledgerKey, LEDGER_LIMIT, LEDGER_MAX_AGE_MS, loadLedger, saveLedger, since, trim } from '../src/lib/ledgerStore';
import type { LedgerEntry } from '../src/lib/ledger';

function memory(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const NOW = 1_800_000_000_000;
const e = (t: number, over: Partial<LedgerEntry> = {}): LedgerEntry => ({ name: 'Cowhide', quantityDelta: 2, reason: 'LOOT', timestamp: t, estimatedGpValue: 200, ...over });

describe('хранение журнала ресурсов', () => {
  it('ключ — профиль и персонаж; регистр и пробелы не различают одного игрока', () => {
    expect(ledgerKey('main', 'Iron  Mark')).toBe(ledgerKey('main', ' iron mark '));
    expect(ledgerKey('main', 'Iron Mark')).not.toBe(ledgerKey('alt', 'Iron Mark'));
    expect(ledgerKey('main', 'Iron Mark')).not.toBe(ledgerKey('main', 'Other'));
    expect(ledgerKey('main', null)).toBe(ledgerKey('main', ''));
  });

  it('записанное читается в новом сеансе так же', () => {
    const s = memory();
    const rows = [e(NOW - 5000), e(NOW - 1000, { name: 'Coins', quantityDelta: 300, reason: 'SALE' })];
    saveLedger(s, 'k', rows);
    expect(loadLedger(s, 'k', NOW)).toEqual(rows);
  });

  it('пустой журнал не оставляет ключа', () => {
    const s = memory();
    saveLedger(s, 'k', [e(NOW)]);
    saveLedger(s, 'k', []);
    expect(s.data.has('k')).toBe(false);
  });

  it('битые данные не ломают: мусор, не массив, чужие записи — пусто или только годное', () => {
    const s = memory();
    s.data.set('a', '{не json');
    s.data.set('b', '{"x":1}');
    s.data.set('c', JSON.stringify([e(NOW - 1), { name: '', quantityDelta: 1, reason: 'LOOT', timestamp: NOW }, { name: 'X', quantityDelta: 'много', reason: 'LOOT', timestamp: NOW }, { name: 'X', quantityDelta: 1, reason: 'ПОДАРОК', timestamp: NOW }, null, 7, { name: 'Y', quantityDelta: 1, reason: 'LOOT', timestamp: NOW, estimatedGpValue: NaN }]));
    expect(loadLedger(s, 'a', NOW)).toEqual([]);
    expect(loadLedger(s, 'b', NOW)).toEqual([]);
    expect(loadLedger(s, 'c', NOW)).toEqual([e(NOW - 1)]);
    expect(loadLedger(s, 'нет', NOW)).toEqual([]);
    expect(loadLedger(undefined, 'a', NOW)).toEqual([]);
  });

  it('старше 30 дней и записи «из будущего» отбрасываются, лимит режет с начала', () => {
    const old = e(NOW - LEDGER_MAX_AGE_MS - 1);
    const fresh = e(NOW - 1000);
    const future = e(NOW + 3_600_000);
    expect(trim([old, fresh, future], NOW)).toEqual([fresh]);
    const many = Array.from({ length: LEDGER_LIMIT + 50 }, (_, i) => e(NOW - 10_000 + i));
    const cut = trim(many, NOW);
    expect(cut).toHaveLength(LEDGER_LIMIT);
    expect(cut[cut.length - 1]).toEqual(many[many.length - 1]);
  });

  it('хранилище недоступно или переполнено — не падаем', () => {
    const broken = { getItem: () => { throw new Error('нет'); }, setItem: () => { throw new Error('полно'); }, removeItem: () => { throw new Error('нет'); } };
    expect(loadLedger(broken, 'k', NOW)).toEqual([]);
    expect(() => saveLedger(broken, 'k', [e(NOW)])).not.toThrow();
    expect(() => saveLedger(undefined, 'k', [e(NOW)])).not.toThrow();
  });

  it('«за сеанс» — только записи с начала сеанса', () => {
    const rows = [e(100), e(200), e(300)];
    expect(since(rows, 200)).toEqual([e(200), e(300)]);
    expect(since(rows, 1000)).toEqual([]);
  });
});
