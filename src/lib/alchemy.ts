// High Level Alchemy: the margin of one cast. "Price below the alchemy value" is not a profit: every cast burns a Nature rune.

export const NATURE_RUNE_ID = 561;

export interface AlchMargin {
  /** High Alchemy value - the item's price - the Nature rune; negative is a loss. */
  profit: number;
  /** Whether it is worth casting. */
  worth: boolean;
}

/**
 * The margin of one cast. null when a part is unknown: a missing price is not zero (that would turn an unknown into a profit).
 * Prices are the instant buy prices of the Grand Exchange, which is what the player pays.
 */
export function alchMargin(highAlch: number | undefined, itemPrice: number | undefined, natureRune: number | undefined): AlchMargin | null {
  if (highAlch === undefined || itemPrice === undefined || natureRune === undefined) return null;
  const profit = highAlch - itemPrice - natureRune;
  return { profit, worth: profit > 0 };
}
