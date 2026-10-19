import { describe, expect, it } from 'vitest';
import { holdingFor, pluginCount, shoppingText } from '../src/lib/shopping';
import { emptyProgress, normalizeProgress, withOwnedManual, MAX_OWNED } from '../src/lib/progress';
import { known } from '../src/data';

const line = (count: number, nameEn = 'Lobster') => ({ nameEn, count, exact: true });
const live = (items: Record<string, { carried?: number; bank?: number }>, bankSeen = true) => ({
  bankSeen,
  items: new Map(Object.entries(items).map(([n, v]) => [n.toLowerCase(), { carried: v.carried ?? 0, noted: 0, ...(v.bank !== undefined ? { bank: v.bank } : {}) }])),
});

describe('"I already have it": how much to buy (§97.22)', () => {
  it('20 needed: have 0 / 13 / 20 / 25 → buy 20 / 7 / 0 / 0', () => {
    expect(holdingFor(line(20), null, 0)).toMatchObject({ buy: 20, status: 'MISSING', source: 'manual' });
    expect(holdingFor(line(20), null, 13)).toMatchObject({ buy: 7, status: 'PARTIAL' });
    expect(holdingFor(line(20), null, 20)).toMatchObject({ buy: 0, status: 'SUFFICIENT' });
    expect(holdingFor(line(20), null, 25)).toMatchObject({ buy: 0, status: 'SUFFICIENT', owned: 25 });
  });

  it('unknown — not zero: without the game and a mark the status is UNKNOWN', () => {
    expect(holdingFor(line(20), null)).toMatchObject({ owned: null, status: 'UNKNOWN', buy: 20, source: 'none' });
  });

  it('bag 5 + bank 8 with 20 needed → have 13, buy 7', () => {
    const h = holdingFor(line(20), live({ Lobster: { carried: 5, bank: 8 } }));
    expect(h).toMatchObject({ owned: 13, buy: 7, status: 'PARTIAL', source: 'live', carried: 5, bank: 8 });
  });

  it('the bank was not opened: the bag does not prove that there is nothing else', () => {
    const h = holdingFor(line(20), live({ Lobster: { carried: 3 } }, false));
    expect(h).toMatchObject({ owned: null, status: 'UNKNOWN', source: 'bag', carried: 3, bank: null, buy: 17 });
    // What is in the bag already suffices — that is known even without the bank.
    expect(holdingFor(line(2), live({ Lobster: { carried: 3 } }, false))).toMatchObject({ status: 'SUFFICIENT', buy: 0 });
  });

  it('game data with the bank wins over the manual mark; a mismatch is marked', () => {
    const h = holdingFor(line(20), live({ Lobster: { carried: 0, bank: 0 } }), 13);
    expect(h).toMatchObject({ source: 'live', owned: 0, buy: 20, status: 'MISSING', stale: true });
    const ok = holdingFor(line(20), live({ Lobster: { carried: 5, bank: 10 } }), 13);
    expect(ok.stale).toBeUndefined();
  });

  it('a manual mark with an unknown bank: the bag does not refute it, the larger is taken', () => {
    expect(holdingFor(line(20), live({ Lobster: { carried: 5 } }, false), 13)).toMatchObject({ source: 'manual', owned: 13, buy: 7 });
    expect(holdingFor(line(20), live({ Lobster: { carried: 15 } }, false), 13)).toMatchObject({ owned: 15, buy: 5 });
  });

  it('not sold on the exchange — UNAVAILABLE', () => {
    expect(holdingFor(line(1, 'Dragon Slayer map'), null, undefined, false).status).toBe('UNAVAILABLE');
  });

  it('the hint in the game: the plugin subtracts the bag itself, the manual mark is subtracted here — no double counting', () => {
    const h = holdingFor(line(20), live({ Lobster: { carried: 5 } }, false), 13);
    // The plugin will see 5 in the bag: 12 − 5 = 7 — the same as in the app.
    expect(pluginCount(h)).toBe(12);
    expect(pluginCount(h) - 5).toBe(h.buy);
    expect(pluginCount(holdingFor(line(20), live({ Lobster: { carried: 5, bank: 8 } })))).toBe(20);
  });

  it('what is already owned does not go into the copied list', () => {
    const text = shoppingText('GE', [
      { nameEn: 'Iron bar', buy: 0, exact: true },
      { nameEn: 'Lobster', buy: 7, exact: true },
    ], 0);
    expect(text).toBe('GE\nLobster x7');
  });
});

describe('manual marks are kept in the progress', () => {
  it('they are saved, removed, garbage does not pass', () => {
    let p = withOwnedManual(emptyProgress(), 'id:379', 13);
    expect(p.ownedManual).toMatchObject({ 'id:379': { count: 13 } });
    for (const bad of [NaN, -1, Infinity]) expect(withOwnedManual(p, 'id:379', bad)).toBe(p);
    expect(withOwnedManual(p, 'id:379', 2.7).ownedManual!['id:379'].count).toBe(2);
    expect(withOwnedManual(p, 'id:379', 1e12).ownedManual!['id:379'].count).toBe(MAX_OWNED);
    p = withOwnedManual(p, 'id:379', null);
    expect(p.ownedManual).toBeUndefined();
  });

  it('a potion is marked in doses under its own key, and the mark survives a restart (2.73.0)', () => {
    const p = withOwnedManual(emptyProgress(), 'dose:energy potion', 12);
    expect(p.ownedManual).toMatchObject({ 'dose:energy potion': { count: 12 } });
    const back = normalizeProgress(JSON.parse(JSON.stringify(p)), known)!.progress;
    expect(back.ownedManual!['dose:energy potion'].count).toBe(12);
  });

  it('they survive a restart (reading the save), broken records are dropped', () => {
    const saved = JSON.parse(JSON.stringify(withOwnedManual(emptyProgress(), 'name:ball of wool', 3)));
    saved.ownedManual['id:1'] = { count: -5 };
    saved.ownedManual['junk'] = { count: 1 };
    saved.ownedManual['id:2'] = null;
    const back = normalizeProgress(saved, known)!.progress;
    expect(Object.keys(back.ownedManual!)).toEqual(['name:ball of wool']);
    expect(back.ownedManual!['name:ball of wool'].count).toBe(3);
  });
});

describe('unverified items are not purchases', () => {
  it('summarizeShopping keeps confirmed shortages, unverified items and budgets apart', async () => {
    const { summarizeShopping } = await import('../src/lib/shopping');
    const s = summarizeShopping([
      { h: { status: 'MISSING', buy: 2 }, unitPrice: 100 },
      { h: { status: 'PARTIAL', buy: 1 }, unitPrice: 50 },
      { h: { status: 'UNKNOWN', buy: 25 }, unitPrice: 10 },
      { h: { status: 'UNKNOWN', buy: 1 }, unitPrice: null },
      { h: { status: 'SUFFICIENT', buy: 0 }, unitPrice: 5 },
      { h: { status: 'UNAVAILABLE', buy: 3 }, unitPrice: 5 },
    ]);
    expect(s).toMatchObject({ confirmed: 2, missing: 1, partial: 1, unverified: 2, owned: 1, confirmedGp: 250, unverifiedGp: 250, unpriced: 1 });
  });

  it('no observation at all: every item is unverified and none is a confirmed purchase', async () => {
    const { summarizeShopping } = await import('../src/lib/shopping');
    const rows = ['Bones', 'Bucket', 'Knife'].map((nameEn) => ({
      h: holdingFor({ nameEn, count: 1, exact: true }, null), unitPrice: 10,
    }));
    expect(rows.every((r) => r.h.status === 'UNKNOWN')).toBe(true);
    expect(summarizeShopping(rows)).toMatchObject({ confirmed: 0, unverified: 3, confirmedGp: 0, unverifiedGp: 30 });
  });

  it('the copied text lists unverified items apart', () => {
    expect(shoppingText('GE', [
      { nameEn: 'Lobster', buy: 7, exact: true },
      { nameEn: 'Bones', buy: 25, exact: true, unverified: true },
    ], 0)).toBe('GE\nLobster x7\nUnverified (check your bank first):\nBones x25');
  });
});
