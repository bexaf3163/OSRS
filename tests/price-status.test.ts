import { beforeEach, describe, expect, it, vi } from 'vitest';

// Сеть не нужна: цены подменяются, досье берётся из локальной базы.
const getGePrice = vi.fn();
vi.mock('../src/services/pricesApi', () => ({ getGePrice: (id: number) => getGePrice(id), getMapping: async () => new Map() }));

const { getItemDetail } = await import('../src/services/wikiService');

describe('цена в досье', () => {
  beforeEach(() => { getGePrice.mockReset(); });

  it('нет связи — помечено, а не «не продаётся»', async () => {
    getGePrice.mockImplementation(async () => { throw new DOMException('The operation timed out.', 'TimeoutError'); });
    const d = await getItemDetail('Small fishing net');
    expect(d?.nameEn).toBe('Small fishing net');
    expect(d?.gePrice).toBeUndefined();
    expect(d?.priceUnavailable).toBe(true);
  });

  it('не торгуется — без пометки о связи', async () => {
    getGePrice.mockResolvedValue(null);
    const d = await getItemDetail('Small fishing net');
    expect(d?.gePrice).toBeUndefined();
    expect(d?.priceUnavailable).toBeUndefined();
  });

  it('цена есть — приклеена к досье', async () => {
    getGePrice.mockResolvedValue({ buyPrice: 12, sellPrice: 10, updatedAt: '2026-09-27T00:00:00Z' });
    const d = await getItemDetail('Small fishing net');
    expect(d?.gePrice?.buyPrice).toBe(12);
    expect(d?.priceUnavailable).toBeUndefined();
  });
});
