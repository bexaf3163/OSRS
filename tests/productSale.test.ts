import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../src/domain/player/playerState';
import { emptyProgress } from '../src/domain/persistence/progress';
import { heldProducts } from '../src/domain/training/processingRates';
import { productSaleRate } from '../src/domain/planning/earn';
import { trainingMethods, viewMethod } from '../src/domain/training/trainingRouter';
import { processRate } from '../src/domain/training/processingRates';
import type { PriceView } from '../src/domain/market/quotes';
import type { Step } from '../src/types';

const quote = (price: number) => ({ price, basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: null, notes: [] });
const BUY: Record<string, number> = { 'Gold bar': 100, Diamond: 2_600 };
const prices = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined,
  buy: (name: string) => quote(BUY[name] ?? 1), sell: (name: string) => quote(name === 'Diamond necklace' ? 1_957 : 1) } as unknown as PriceView;
// Crafting 57 with 1,185 coins, as in the live session, and the diamond necklaces made so far in the bank.
const state = (necklaces: number) => buildPlayerState({ mode: 'f2p', connected: true, stats: { crafting: 57, hitpoints: 31 }, progress: emptyProgress(), questsDone: [],
  gear: { equipment: [], inventory: [], coins: 1_185, bankCoins: 0 },
  owned: { bankSeen: true, items: new Map([['gold bar', 0], ['diamond', 0], ['diamond necklace', necklaces]].map(([key, bank]) => [key as string,
    { name: String(key).charAt(0).toUpperCase() + String(key).slice(1), carried: 0, noted: 0, bank: bank as number }])) } });

describe('a processing loop sells what it made to fund the next batch', () => {
  it('counts its own products held as coins for the next batch', () => {
    const method = { ...trainingMethods.find((m) => m.id === 'cr-gold')!, needs: [{ type: 'item' as const, name: 'Gold bar', count: 13 }, { type: 'item' as const, name: 'Diamond', count: 13 }] };
    expect(heldProducts('cr-gold', state(220), prices)).toEqual([{ name: 'Diamond necklace', count: 220, value: expect.any(Number) }]);
    expect(viewMethod(method, state(0), prices).fundingShortfall).toBeGreaterThan(0);
    expect(viewMethod(method, state(220), prices).fundingShortfall).toBeUndefined();
  });

  it('does not sell a material the same skill uses next (bronze bars are smithed, not sold)', () => {
    const bars = buildPlayerState({ mode: 'f2p', connected: true, stats: { smithing: 15, hitpoints: 10 }, progress: emptyProgress(), questsDone: [],
      gear: { equipment: [], inventory: [], coins: 0, bankCoins: 0 }, owned: { bankSeen: true, items: new Map([['bronze bar', { name: 'Bronze bar', carried: 0, noted: 0, bank: 50 }]]) } });
    expect(heldProducts('sm-smelting', bars, prices)).toEqual([]);
  });

  it('earns a shortfall by selling them when they cover it', () => {
    const step = { trainingPhase: JSON.stringify(['cr-gold', 70, []]) } as Step;
    expect(productSaleRate(state(220), step, 30_000, { prices })?.title).toBe('Sell 220 Diamond necklace');
    expect(productSaleRate(state(10), step, 30_000, { prices })).toBeNull();
    expect(productSaleRate(state(220), { } as Step, 30_000, { prices })).toBeNull();
  });

  it('picks the recipe its products can fund, not the one the coins alone cover', () => {
    const method = trainingMethods.find((m) => m.id === 'cr-gold')!;
    const withMould = (n: number) => { const st = state(n); st.owned!.items.set('necklace mould', { name: 'Necklace mould', carried: 1, noted: 0, bank: 0 }); return st; };
    // Diamond necklaces pay best here, but 13 cost about 35,000 coins and the bag holds 1,185.
    const rich = { ...prices, sell: (name: string) => quote(name === 'Diamond necklace' ? 3_500 : 1) } as unknown as PriceView;
    expect(processRate(method, 'crafting', withMould(0), { prices: rich })?.basis).not.toBe('Diamond necklace');
    expect(processRate(method, 'crafting', withMould(260), { prices: rich })?.basis).toBe('Diamond necklace');
  });
});
