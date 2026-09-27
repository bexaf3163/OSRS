import { describe, expect, it } from 'vitest';
import { holdingFor, pluginCount, shoppingText } from '../src/lib/shopping';
import { emptyProgress, normalizeProgress, withOwnedManual, MAX_OWNED } from '../src/lib/progress';
import { known } from '../src/data';

const line = (count: number, nameEn = 'Lobster') => ({ nameEn, count, exact: true });
const live = (items: Record<string, { carried?: number; bank?: number }>, bankSeen = true) => ({
  bankSeen,
  items: new Map(Object.entries(items).map(([n, v]) => [n.toLowerCase(), { carried: v.carried ?? 0, noted: 0, ...(v.bank !== undefined ? { bank: v.bank } : {}) }])),
});

describe('«У меня уже есть»: сколько купить (§97.22)', () => {
  it('нужно 20: есть 0 / 13 / 20 / 25 → купить 20 / 7 / 0 / 0', () => {
    expect(holdingFor(line(20), null, 0)).toMatchObject({ buy: 20, status: 'MISSING', source: 'manual' });
    expect(holdingFor(line(20), null, 13)).toMatchObject({ buy: 7, status: 'PARTIAL' });
    expect(holdingFor(line(20), null, 20)).toMatchObject({ buy: 0, status: 'SUFFICIENT' });
    expect(holdingFor(line(20), null, 25)).toMatchObject({ buy: 0, status: 'SUFFICIENT', owned: 25 });
  });

  it('неизвестно — не ноль: без игры и отметки статус UNKNOWN', () => {
    expect(holdingFor(line(20), null)).toMatchObject({ owned: null, status: 'UNKNOWN', buy: 20, source: 'none' });
  });

  it('сумка 5 + банк 8 при нужных 20 → есть 13, купить 7', () => {
    const h = holdingFor(line(20), live({ Lobster: { carried: 5, bank: 8 } }));
    expect(h).toMatchObject({ owned: 13, buy: 7, status: 'PARTIAL', source: 'live', carried: 5, bank: 8 });
  });

  it('банк не открывали: сумка не доказывает, что остального нет', () => {
    const h = holdingFor(line(20), live({ Lobster: { carried: 3 } }, false));
    expect(h).toMatchObject({ owned: null, status: 'UNKNOWN', source: 'bag', carried: 3, bank: null, buy: 17 });
    // Хватает уже того, что в сумке, — это известно и без банка.
    expect(holdingFor(line(2), live({ Lobster: { carried: 3 } }, false))).toMatchObject({ status: 'SUFFICIENT', buy: 0 });
  });

  it('данные игры с банком главнее ручной отметки; расхождение помечается', () => {
    const h = holdingFor(line(20), live({ Lobster: { carried: 0, bank: 0 } }), 13);
    expect(h).toMatchObject({ source: 'live', owned: 0, buy: 20, status: 'MISSING', stale: true });
    const ok = holdingFor(line(20), live({ Lobster: { carried: 5, bank: 10 } }), 13);
    expect(ok.stale).toBeUndefined();
  });

  it('ручная отметка при неизвестном банке: сумка её не опровергает, а берётся большее', () => {
    expect(holdingFor(line(20), live({ Lobster: { carried: 5 } }, false), 13)).toMatchObject({ source: 'manual', owned: 13, buy: 7 });
    expect(holdingFor(line(20), live({ Lobster: { carried: 15 } }, false), 13)).toMatchObject({ owned: 15, buy: 5 });
  });

  it('не продаётся на бирже — UNAVAILABLE', () => {
    expect(holdingFor(line(1, 'Dragon Slayer map'), null, undefined, false).status).toBe('UNAVAILABLE');
  });

  it('подсказка в игре: плагин вычтет сумку сам, ручную отметку вычитаем здесь — без двойного счёта', () => {
    const h = holdingFor(line(20), live({ Lobster: { carried: 5 } }, false), 13);
    // Плагин увидит 5 в сумке: 12 − 5 = 7 — столько же, сколько в программе.
    expect(pluginCount(h)).toBe(12);
    expect(pluginCount(h) - 5).toBe(h.buy);
    expect(pluginCount(holdingFor(line(20), live({ Lobster: { carried: 5, bank: 8 } })))).toBe(20);
  });

  it('в копируемый список не попадает то, что уже есть', () => {
    const text = shoppingText('GE', [
      { nameEn: 'Iron bar', buy: 0, exact: true },
      { nameEn: 'Lobster', buy: 7, exact: true },
    ], 0);
    expect(text).toBe('GE\nLobster x7');
  });
});

describe('ручные отметки хранятся в прогрессе', () => {
  it('сохраняются, снимаются, мусор не проходит', () => {
    let p = withOwnedManual(emptyProgress(), 'id:379', 13);
    expect(p.ownedManual).toMatchObject({ 'id:379': { count: 13 } });
    for (const bad of [NaN, -1, Infinity]) expect(withOwnedManual(p, 'id:379', bad)).toBe(p);
    expect(withOwnedManual(p, 'id:379', 2.7).ownedManual!['id:379'].count).toBe(2);
    expect(withOwnedManual(p, 'id:379', 1e12).ownedManual!['id:379'].count).toBe(MAX_OWNED);
    p = withOwnedManual(p, 'id:379', null);
    expect(p.ownedManual).toBeUndefined();
  });

  it('переживают перезапуск (чтение сохранения), битые записи отбрасываются', () => {
    const saved = JSON.parse(JSON.stringify(withOwnedManual(emptyProgress(), 'name:ball of wool', 3)));
    saved.ownedManual['id:1'] = { count: -5 };
    saved.ownedManual['junk'] = { count: 1 };
    saved.ownedManual['id:2'] = null;
    const back = normalizeProgress(saved, known)!.progress;
    expect(Object.keys(back.ownedManual!)).toEqual(['name:ball of wool']);
    expect(back.ownedManual!['name:ball of wool'].count).toBe(3);
  });
});
