import { describe, expect, it } from 'vitest';
import { buildPriceBook, priceNote, reprice } from '../src/lib/priceBook';
import { createPriceService } from '../src/services/pricesApi';
import { nameKey } from '../src/lib/checklist';
import type { LedgerEntry } from '../src/lib/ledger';

const baked = new Map<string, number>([[nameKey('Lobster'), 100], [nameKey('Rare thing'), 7]]);
const mapping = new Map([[379, { name: 'Lobster' }], [380, { name: 'Lobster' }], [1511, { name: 'Logs' }]]);
const live = (at = Date.parse('2026-10-03T17:15:00Z')) => ({ at, prices: new Map([[379, { sellPrice: 150 }], [380, { sellPrice: 120 }], [1511, { sellPrice: 90 }]]) });

describe('цены для оценки добычи', () => {
  it('без свежих цен — из базы проекта, с пометкой', () => {
    const b = buildPriceBook(null, null, baked);
    expect(b.source).toBe('baked');
    expect(b.priceOf('lobster')).toBe(100);
    expect(b.priceOf('Нет такого')).toBeUndefined();
    expect(priceNote(b)).toContain('биржа недоступна');
  });

  it('свежие цены главнее базы; одно название у двух предметов — меньшая цена', () => {
    const b = buildPriceBook(live(), mapping, baked);
    expect(b.source).toBe('live');
    expect(b.priceOf('Lobster')).toBe(120);
    expect(b.priceOf('Logs')).toBe(90);
    expect(priceNote(b)).toMatch(/по ценам биржи на \d\d:\d\d/);
  });

  it('предмета нет в свежих ценах — берётся цена из базы', () => {
    expect(buildPriceBook(live(), mapping, baked).priceOf('Rare thing')).toBe(7);
  });

  it('пустой ответ или справочник не вышел — остаётся база, а не пустота', () => {
    expect(buildPriceBook({ at: 1, prices: new Map() }, mapping, baked).source).toBe('baked');
    expect(buildPriceBook(live(), null, baked).source).toBe('baked');
  });

  it('оценка пересчитывается по текущим ценам; монеты и безымянные не трогаются', () => {
    const entries: LedgerEntry[] = [
      { name: 'Lobster', quantityDelta: 10, reason: 'LOOT', timestamp: 1, estimatedGpValue: 1000 },
      { name: 'Coins', quantityDelta: 500, reason: 'LOOT', timestamp: 2, estimatedGpValue: 500 },
      { name: 'Unknown item', quantityDelta: 1, reason: 'LOOT', timestamp: 3, estimatedGpValue: 99 },
    ];
    const out = reprice(entries, buildPriceBook(live(), mapping, baked));
    expect(out[0].estimatedGpValue).toBe(1200);
    expect(out[1].estimatedGpValue).toBe(500);
    // Цены больше нет — старую оценку не оставляем: она показывала бы то, чего мы не знаем.
    expect(out[2].estimatedGpValue).toBeUndefined();
    expect(entries[0].estimatedGpValue).toBe(1000);
  });
});

describe('служба цен: все цены разом', () => {
  const rows = { data: { '379': { high: 160, highTime: 1000, low: 150, lowTime: 900 }, '1511': { high: null, highTime: null, low: null, lowTime: null } } };
  it('отдаёт цены и время получения одним запросом', async () => {
    let calls = 0;
    const svc = createPriceService(async () => { calls++; return { ok: true, status: 200, json: async () => rows }; }, () => 5000);
    const all = await svc.getAllPrices();
    expect(all.at).toBe(5000);
    expect(all.prices.get(379)).toMatchObject({ buyPrice: 160, sellPrice: 150 });
    expect(all.prices.has(1511)).toBe(false);
    await svc.getGePrice(379);
    expect(calls).toBe(1);
  });
});
