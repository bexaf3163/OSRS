import { describe, expect, it } from 'vitest';
import { entriesFor, type LedgerEntry } from '../../src/lib/ledger';
import { buildPlayerState, diffPlayerState, type PlayerState } from '../../src/lib/playerState';
import { addWork, loadRates, observedRates, RATE_WINDOW_SECONDS, ratesKey, realizedSince, saveRates, unitsOf } from '../../src/lib/funding/session';
import { OBSERVED_MIN_SECONDS, OBSERVED_MIN_UNITS } from '../../src/lib/funding/evaluate';
import { nameKey, type OwnedItem, type OwnedState } from '../../src/lib/checklist';

const T = 1_792_000_000_000;
const e = (name: string, qty: number, reason: LedgerEntry['reason'], at = T, value?: number): LedgerEntry => ({ name, quantityDelta: qty, reason, timestamp: at, ...(value !== undefined ? { estimatedGpValue: value } : {}) });

describe('realized coins and unsold loot, never both', () => {
  it('loot is an estimate until it is sold: 27 hides taken are no coins', () => {
    const r = realizedSince([e('Cowhide', 27, 'LOOT', T, 3132)], T - 1);
    expect(r.net).toBe(0);
    expect(r.fromSales).toBe(0);
    expect(r.unsold).toEqual([{ name: 'Cowhide', qty: 27, estimated: 3132 }]);
    expect(r.unsoldEstimate).toBe(3132);
  });

  it('a full sale moves the value from the estimate to the coins, once', () => {
    const r = realizedSince([e('Cowhide', 27, 'LOOT', T, 3132), e('Cowhide', -27, 'SALE', T + 1), e('Coins', 3069, 'SALE', T + 1, 3069)], T - 1);
    expect(r.fromSales).toBe(3069);
    expect(r.unsold).toEqual([]);
    expect(r.unsoldEstimate).toBe(0);
    // 3,069 in total, not 3,069 + 3,132.
    expect(r.net + r.unsoldEstimate).toBe(3069);
  });

  it('a partial sale leaves the rest as an estimate, in proportion', () => {
    const r = realizedSince([e('Cowhide', 27, 'LOOT', T, 2700), e('Cowhide', -10, 'SALE', T + 1), e('Coins', 980, 'SALE', T + 1)], T - 1);
    expect(r.fromSales).toBe(980);
    expect(r.unsold).toEqual([{ name: 'Cowhide', qty: 17, estimated: 1700 }]);
  });

  it('coin drops count as realized, supplies bought are subtracted, a quest reward is not funding income', () => {
    const r = realizedSince([
      e('Coins', 120, 'LOOT'), e('Coins', -330, 'PURCHASE'), e('Salmon', 10, 'PURCHASE'), e('Coins', 500, 'QUEST_REWARD'), e('Coins', 40, 'UNKNOWN'),
    ], T - 1);
    expect(r).toMatchObject({ fromDrops: 120, spent: 330, fromSales: 0, net: -210 });
  });

  it('moving coins to the bank is not income and not a loss', () => {
    const r = realizedSince([e('Coins', 1000, 'LOOT'), e('Coins', -800, 'BANK_TRANSFER'), e('Coins', 800, 'BANK_TRANSFER')], T - 1);
    expect(r.net).toBe(1000);
  });

  it('only entries since the plan started are counted', () => {
    const r = realizedSince([e('Coins', 900, 'SALE', T - 5000), e('Coins', 100, 'SALE', T + 5)], T);
    expect(r.fromSales).toBe(100);
  });

  it('food eaten is not a sale and does not reduce loot', () => {
    const r = realizedSince([e('Big bones', 3, 'LOOT', T, 975), e('Salmon', -3, 'CONSUMED')], T - 1);
    expect(r.unsold).toEqual([{ name: 'Big bones', qty: 3, estimated: 975 }]);
  });
});

describe('the journal itself: banking and reconnecting are not earnings', () => {
  const own = (items: Record<string, [number, number]>, bankSeen = true): OwnedState => {
    const m = new Map<string, OwnedItem>();
    for (const [n, [carried, bank]] of Object.entries(items)) m.set(nameKey(n), { name: n, carried, noted: 0, bank: bankSeen ? bank : undefined });
    return { bankSeen, items: m };
  };
  const st = (owned: OwnedState, bag: number, bank: number | null, connected = true): PlayerState => buildPlayerState({
    mode: 'f2p', stats: null, progress: { levels: {} }, owned, gear: { equipment: [], inventory: [], coins: bag, bankCoins: bank }, questsDone: null, connected,
  });
  const journal = (a: PlayerState, b: PlayerState): LedgerEntry[] => entriesFor(a, b, diffPlayerState(a, b), T, (n) => (n === 'Cowhide' ? 116 : undefined));

  it('hides banked with the bank open before and after make no entries at all', () => {
    const before = st(own({ Cowhide: [27, 0] }), 0, 0);
    const after = st(own({ Cowhide: [0, 27] }), 0, 0);
    expect(journal(before, after)).toEqual([]);
  });

  it('coins deposited are a bank transfer: the realized figure does not move', () => {
    const before = st(own({}), 1000, 0);
    const after = st(own({}), 0, 1000);
    const entries = journal(before, after);
    expect(entries.every((x) => x.reason === 'BANK_TRANSFER')).toBe(true);
    expect(realizedSince(entries, T - 1).net).toBe(0);
  });

  it('opening the bank for the first time is the arrival of data, not a gain', () => {
    const before = st(own({ Cowhide: [27, 0] }, false), 400, null);
    const after = st(own({ Cowhide: [27, 800] }), 400, 5000);
    expect(journal(before, after)).toEqual([]);
  });

  it('a reconnect is not a change: nothing is written while the link is down', () => {
    const connected = st(own({ Cowhide: [27, 0] }), 400, 0);
    const dropped = st(own({}), 0, null, false);
    const entries = journal(connected, dropped);
    // The journal keeps only changes it can trust; the app never passes a dropped link in (playerStateContext), and a changed ownership alone has no coins.
    expect(realizedSince(entries.filter((x) => x.name === 'Coins'), T - 1).fromSales).toBe(0);
  });

  it('a sale is the item leaving while the coins arrive', () => {
    const before = st(own({ Cowhide: [27, 0] }), 400, 0);
    const after = st(own({ Cowhide: [0, 0] }), 3469, 0);
    const r = realizedSince([e('Cowhide', 27, 'LOOT', T - 100, 3132), ...journal(before, after)], T - 200);
    expect(r.fromSales).toBe(3069);
    expect(r.unsold).toEqual([]);
  });
});

describe('the pace a player really works at', () => {
  it('counts only the method\'s own product, not unrelated drops', () => {
    const entries = [e('Cowhide', 10, 'LOOT'), e('Bones', 10, 'LOOT'), e('Cowhide', 5, 'PICKUP'), e('Cowhide', -3, 'SALE'), e('Coins', 90, 'LOOT')];
    expect(unitsOf(entries, T - 1, ['Cowhide'])).toBe(15);
    expect(unitsOf(entries, T + 1, ['Cowhide'])).toBe(0);
  });

  it('is trusted only after enough units and enough work', () => {
    let book = addWork({}, 'cows-cowhide', OBSERVED_MIN_UNITS - 1, OBSERVED_MIN_SECONDS + 100);
    expect(observedRates(book).size).toBe(0);
    book = addWork({}, 'cows-cowhide', OBSERVED_MIN_UNITS + 5, OBSERVED_MIN_SECONDS - 1);
    expect(observedRates(book).size).toBe(0);
    book = addWork({}, 'cows-cowhide', 30, 600);
    const r = observedRates(book).get('cows-cowhide')!;
    expect(r.unitsPerHour).toBeCloseTo(180, 6);
  });

  it('adds up across plans and lets old work fade once past four hours', () => {
    let book = addWork({}, 'm', 100, 3600);
    book = addWork(book, 'm', 100, 3600);
    expect(book.m).toEqual({ units: 200, activeSeconds: 7200 });
    book = addWork(book, 'm', 400, 10_800);
    expect(book.m.activeSeconds).toBe(RATE_WINDOW_SECONDS);
    // The pace is still units over seconds: 600 over 18,000 s (scaled to the four-hour window together).
    expect(book.m.units / book.m.activeSeconds).toBeCloseTo(600 / 18_000, 3);
    expect(addWork(book, 'm', -1, 10)).toBe(book);
    expect(addWork(book, 'm', 5, 0)).toBe(book);
  });

  it('is saved per character, damaged data is ignored', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    const key = ratesKey('p1', 'Tester');
    expect(ratesKey('p1', 'Other')).not.toBe(key);
    saveRates(s, key, { a: { units: 50, activeSeconds: 900 } });
    expect(loadRates(s, key)).toEqual({ a: { units: 50, activeSeconds: 900 } });
    m.set(key, JSON.stringify({ a: { units: -1, activeSeconds: 5 }, b: 'x', c: { units: 3, activeSeconds: 60 } }));
    expect(loadRates(s, key)).toEqual({ c: { units: 3, activeSeconds: 60 } });
    m.set(key, '[1,2]');
    expect(loadRates(s, key)).toEqual({});
    m.set(key, '{{');
    expect(loadRates(s, key)).toEqual({});
    saveRates(s, key, {});
    expect(m.has(key)).toBe(false);
  });
});
