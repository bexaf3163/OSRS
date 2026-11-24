import { describe, expect, it } from 'vitest';
import { pickKit } from '../src/domain/combat/kitPick';

describe('pickKit', () => {
  const prices: Record<string, number> = { 'Dragon kiteshield': 58_498_000, 'Rune kiteshield': 32_000 };
  const kit = (budget: number) => pickKit({
    slots: [{ slot: 'shield', names: ['Rune kiteshield', 'Dragon kiteshield'] }],
    rank: (name) => [name.startsWith('Dragon') ? 2 : 1], owned: () => false, price: (name) => prices[name] ?? null, budget,
  });

  it('earns the shortfall for a cheap piece but buys a dear one only from coins in hand', () => {
    expect(kit(22)).toEqual([{ slot: 'shield', name: 'Rune kiteshield', buy: true }]);
    expect(kit(100_000_000)).toEqual([{ slot: 'shield', name: 'Dragon kiteshield', buy: true }]);
  });
});
