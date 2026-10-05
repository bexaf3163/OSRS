import { beforeEach, describe, expect, it, vi } from 'vitest';

// No network needed: prices are replaced, the dossier comes from the local database.
const getGePrice = vi.fn();
vi.mock('../src/services/pricesApi', () => ({ getGePrice: (id: number) => getGePrice(id), getMapping: async () => new Map() }));

const { getItemDetail } = await import('../src/services/wikiService');

describe('price in the dossier', () => {
  beforeEach(() => { getGePrice.mockReset(); });

  it('no connection — marked, not "not sold"', async () => {
    getGePrice.mockImplementation(async () => { throw new DOMException('The operation timed out.', 'TimeoutError'); });
    const d = await getItemDetail('Small fishing net');
    expect(d?.nameEn).toBe('Small fishing net');
    expect(d?.gePrice).toBeUndefined();
    expect(d?.priceUnavailable).toBe(true);
  });

  it('not traded — without a connection note', async () => {
    getGePrice.mockResolvedValue(null);
    const d = await getItemDetail('Small fishing net');
    expect(d?.gePrice).toBeUndefined();
    expect(d?.priceUnavailable).toBeUndefined();
  });

  it('the price is there — attached to the dossier', async () => {
    getGePrice.mockResolvedValue({ buyPrice: 12, sellPrice: 10, updatedAt: '2026-09-27T00:00:00Z' });
    const d = await getItemDetail('Small fishing net');
    expect(d?.gePrice?.buyPrice).toBe(12);
    expect(d?.priceUnavailable).toBeUndefined();
  });
});
