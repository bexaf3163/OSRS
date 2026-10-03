import { describe, expect, it } from 'vitest';
import { buildPlayerState, diffPlayerState, type PlayerStateInput } from '../src/lib/playerState';
import { entriesFor, MIN_ETA_SECONDS, ratePerMinute, resourceGoal, summarize, type LedgerEntry } from '../src/lib/ledger';
import { planSources } from '../src/lib/sourceRouter';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import type { WikiItemDetail } from '../src/types';

function owned(items: Record<string, Partial<OwnedItem>>, bankSeen: boolean): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const [name, o] of Object.entries(items)) map.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
  return { bankSeen, items: map };
}

function st(over: Partial<PlayerStateInput> & { coins?: number; bankCoins?: number | null } = {}) {
  const { coins, bankCoins, ...rest } = over;
  return buildPlayerState({
    mode: 'f2p', stats: null, progress: { levels: {} }, owned: null, gear: coins === undefined ? null : { equipment: [], inventory: [], coins, bankCoins: bankCoins ?? null }, questsDone: null, ...rest,
  });
}

const step = (a: ReturnType<typeof st>, b: ReturnType<typeof st>, t = 1000, price?: (n: string) => number | undefined) => entriesFor(a, b, diffPlayerState(a, b), t, price);

describe('журнал ресурсов', () => {
  it('добыча: предмет прибавился без трат — LOOT, с оценкой по цене; без цены — без оценки', () => {
    const a = st({ owned: owned({ 'Cowhide': { carried: 3 } }, false), coins: 100 });
    const b = st({ owned: owned({ 'Cowhide': { carried: 5 } }, false), coins: 100 });
    expect(step(a, b, 1, (n) => (n === 'Cowhide' ? 100 : undefined))).toEqual([{ name: 'Cowhide', quantityDelta: 2, reason: 'LOOT', timestamp: 1, estimatedGpValue: 200 }]);
    expect(step(a, b)[0]).not.toHaveProperty('estimatedGpValue');
  });

  it('покупка: предмет прибавился, монеты убавились; продажа: наоборот', () => {
    const a = st({ owned: owned({ Lobster: { carried: 0 } }, false), coins: 1000 });
    const b = st({ owned: owned({ Lobster: { carried: 10 } }, false), coins: 700 });
    const buy = step(a, b);
    expect(buy.find((e) => e.name === 'Lobster')?.reason).toBe('PURCHASE');
    expect(buy.find((e) => e.name === 'Coins')).toMatchObject({ reason: 'PURCHASE', quantityDelta: -300 });
    const sell = step(b, a);
    expect(sell.find((e) => e.name === 'Lobster')?.reason).toBe('SALE');
  });

  it('перекладывание в банк и из банка заработком не считается: при известном банке записей нет', () => {
    const a = st({ owned: owned({ Cowhide: { carried: 10, bank: 0 } }, true), coins: 500, bankCoins: 100 });
    const b = st({ owned: owned({ Cowhide: { carried: 0, bank: 10 } }, true), coins: 0, bankCoins: 600 });
    // Предметы не меняют сумму — записей нет; монеты переехали — запись BANK_TRANSFER, в заработок она не входит.
    const e = step(a, b);
    expect(e.every((x) => x.reason === 'BANK_TRANSFER' && x.name === 'Coins')).toBe(true);
    expect(summarize(e)).toMatchObject({ coinsEarned: 0, coinsSpent: 0, estimatedLootValue: 0 });
  });

  it('банк только что открыли — это появление данных, а не прибавка', () => {
    const a = st({ owned: owned({ Cowhide: { carried: 3 } }, false), coins: 500 });
    const b = st({ owned: owned({ Cowhide: { carried: 3, bank: 40 } }, true), coins: 500, bankCoins: 9000 });
    expect(step(a, b)).toEqual([]);
  });

  it('монеты положили в банк: итог нулевой — BANK_TRANSFER, а не LOOT и не расход', () => {
    const a = st({ owned: owned({}, true), coins: 1000, bankCoins: 0 });
    const b = st({ owned: owned({}, true), coins: 0, bankCoins: 1000 });
    const e = step(a, b);
    expect(e.every((x) => x.reason === 'BANK_TRANSFER')).toBe(true);
    expect(summarize(e)).toMatchObject({ coinsEarned: 0, coinsSpent: 0 });
  });

  it('сводка: известные монеты и оценка добычи — раздельно, без перекладываний', () => {
    const entries: LedgerEntry[] = [
      { name: 'Coins', quantityDelta: 300, reason: 'LOOT', timestamp: 1 },
      { name: 'Coins', quantityDelta: -100, reason: 'PURCHASE', timestamp: 2 },
      { name: 'Cowhide', quantityDelta: 4, reason: 'LOOT', timestamp: 3, estimatedGpValue: 400 },
      { name: 'Bones', quantityDelta: 4, reason: 'LOOT', timestamp: 4 },
      { name: 'Coins', quantityDelta: 500, reason: 'BANK_TRANSFER', timestamp: 5 },
    ];
    expect(summarize(entries)).toEqual({ coinsEarned: 300, coinsSpent: 100, estimatedLootValue: 400, unpricedLoot: 1, entries: 5 });
  });

  it('цель по ресурсу: известное, нехватка и отдельная оценка; неизвестное остаётся неизвестным', () => {
    expect(resourceGoal('Монеты', 850, 2000)).toMatchObject({ missing: 1150, done: false });
    expect(resourceGoal('Монеты', 850, 2000, { estimated: 720 })).toMatchObject({ estimatedProgress: 1570, missing: 1150 });
    expect(resourceGoal('Lobster', 25, 20)).toMatchObject({ missing: 0, done: true });
    expect(resourceGoal('Монеты', null, 2000)).toMatchObject({ current: null, missing: null, done: false });
  });

  it('время до цели — только по достаточным замерам', () => {
    const now = 10 * 60_000;
    const few: LedgerEntry[] = [{ name: 'Coins', quantityDelta: 100, reason: 'LOOT', timestamp: now - 1000 }];
    expect(ratePerMinute(few, now, (e) => e.quantityDelta)).toBeNull();
    const shortSpan: LedgerEntry[] = [
      { name: 'Coins', quantityDelta: 100, reason: 'LOOT', timestamp: now - 30_000 },
      { name: 'Coins', quantityDelta: 100, reason: 'LOOT', timestamp: now - 1000 },
    ];
    expect(ratePerMinute(shortSpan, now, (e) => e.quantityDelta)).toBeNull();
    const enough: LedgerEntry[] = [
      { name: 'Coins', quantityDelta: 300, reason: 'LOOT', timestamp: now - 300_000 },
      { name: 'Coins', quantityDelta: 300, reason: 'LOOT', timestamp: now - 1000 },
    ];
    const rate = ratePerMinute(enough, now, (e) => e.quantityDelta);
    expect(rate).toBeGreaterThan(0);
    expect(resourceGoal('Монеты', 500, 2000, { ratePerMinute: rate }).etaMinutes).toBeGreaterThan(0);
    expect(resourceGoal('Монеты', 500, 2000, { ratePerMinute: null }).etaMinutes).toBeUndefined();
    expect(MIN_ETA_SECONDS).toBeGreaterThan(0);
  });
});

describe('откуда взять предмет', () => {
  const detail = (over: Partial<WikiItemDetail>): WikiItemDetail => ({
    id: 1, nameEn: 'Thing', examine: '', members: false, iconUrl: '', value: 10, wikiUrl: '', ...over,
  });
  const at = (over: Partial<PlayerStateInput> = {}, pos?: { x: number; y: number; plane: number }) => st({ ...over, ...(pos ? { position: pos } : {}) });

  it('уже в сумке — искать нечего', () => {
    const p = planSources({ name: 'Rope', need: 1 }, at({ owned: owned({ Rope: { carried: 1 } }, true) }));
    expect(p.satisfied).toBe(true);
  });

  it('в банке — первым, банк рядом показан', () => {
    const p = planSources({ name: 'Rope', need: 1, detail: detail({ gePrice: { buyPrice: 20, sellPrice: 15, updatedAt: '' } }) },
      at({ owned: owned({ Rope: { carried: 0, bank: 2 } }, true) }, { x: 3208, y: 3220, plane: 2 }));
    expect(p.primary?.kind).toBe('bank');
    expect(p.primary?.point).toBeDefined();
    expect(p.alternatives[0]?.kind).toBe('ge');
  });

  it('бесплатное рядом раньше магазина, магазин немногим дороже биржи раньше биржи', () => {
    const d = detail({
      freeSpawns: ['Lumbridge'],
      buyLocations: [{ shopName: 'Shop', location: 'Varrock', price: 150, stock: 10 }],
      gePrice: { buyPrice: 100, sellPrice: 90, updatedAt: '' },
    });
    const near = planSources({ name: 'Thing', need: 1, detail: d }, at({ owned: owned({ Thing: { carried: 0 } }, false) }, { x: 3222, y: 3218, plane: 0 }));
    expect(near.primary?.kind).toBe('free');
    const noFree = planSources({ name: 'Thing', need: 1, detail: { ...d, freeSpawns: [] } }, at({ owned: owned({ Thing: { carried: 0 } }, false) }));
    expect(noFree.primary?.kind).toBe('shop');
    expect(noFree.alternatives[0]?.kind).toBe('ge');
  });

  it('магазин сильно дороже биржи — сначала биржа; пустой магазин и подписочный в F2P пропускаются', () => {
    const d = detail({
      buyLocations: [
        { shopName: 'Dear', location: 'Varrock', price: 900, stock: 10 },
        { shopName: 'Empty', location: 'Lumbridge', price: 10, stock: 0 },
        { shopName: 'Members', location: 'Catherby', price: 10, stock: 5, members: true },
      ],
      gePrice: { buyPrice: 100, sellPrice: 90, updatedAt: '' },
    });
    const p = planSources({ name: 'Thing', need: 1, detail: d }, at({ owned: owned({ Thing: { carried: 0 } }, false) }));
    expect(p.primary?.kind).toBe('ge');
    expect(p.alternatives.some((a) => a.label.includes('Empty') || a.label.includes('Members'))).toBe(false);
  });

  it('Al Kharid: плата за проход входит в цену, после Prince Ali Rescue — нет', () => {
    const d = detail({ buyLocations: [{ shopName: 'Zeke', location: 'Al Kharid', price: 20, stock: 10 }] });
    const s = at({ owned: owned({ Thing: { carried: 0 } }, false) });
    expect(planSources({ name: 'Thing', need: 1, detail: d }, s).primary?.price).toBe(30);
    expect(planSources({ name: 'Thing', need: 1, detail: d, freeToll: true }, s).primary?.price).toBe(20);
  });
});
