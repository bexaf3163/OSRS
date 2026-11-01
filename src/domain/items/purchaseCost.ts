/** A declared access charge for one shared acquisition trip, separate from the item's price. */
export interface PurchaseFee { key: string; coins: number; label: string }

/** Several purchases on the same trip share an access charge. */
export function purchaseFees(items: Iterable<{ fee?: PurchaseFee }>): number {
  const fees = new Map<string, number>();
  for (const { fee } of items) if (fee) fees.set(fee.key, Math.max(fees.get(fee.key) ?? 0, fee.coins));
  return [...fees.values()].reduce((sum, value) => sum + value, 0);
}

export function purchaseCost(source: { price?: number | null; fee?: PurchaseFee }, quantity: number): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  if (quantity === 0) return 0;
  return source.price == null ? null : source.price * quantity + purchaseFees([source]);
}
