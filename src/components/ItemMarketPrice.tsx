import { useReadinessEngine } from '../readinessContext';
import { marketItemPrice } from '../lib/itemPrice';

/** Supporting item metadata, served by the same market snapshot as preparation and the game. */
export function ItemMarketPrice({ name, id, quantity }: { name: string; id?: number; quantity: number | null }) {
  const { prices } = useReadinessEngine().ctx;
  const price = quantity === null ? undefined : marketItemPrice(prices, name, id, quantity);
  return price ? <span className="muted small item-market-price" title={price.detail}>{price.text}</span> : null;
}
