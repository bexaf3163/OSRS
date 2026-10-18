// The Grand Exchange tax: what a sale really pays. The wiki rule (verified 2026-10-18, see data/geTaxExempt.json): 2% of the sale price of ONE item,
// rounded down, at most 5,000,000 an item, nothing on the exempt list. The tax is taken from the seller, so a price shown by the exchange is never
// the money received. Every funding figure that talks about "sale proceeds" goes through here.

import exemptJson from '../../data/geTaxExempt.json';
import { nameKey } from '../checklist';

export const GE_TAX_RATE: number = exemptJson.rate;
export const GE_TAX_CAP: number = exemptJson.cap;
export const GE_TAX_SOURCE = { url: exemptJson.source, retrievedAt: exemptJson.retrievedAt };

const EXEMPT = new Set(exemptJson.names.map(nameKey));

/** An item the tax does not touch. A banknote and an item with a plural "s" are the same item to the exchange. */
export function isTaxExempt(name: string): boolean {
  const k = nameKey(name);
  return EXEMPT.has(k) || (k.endsWith('s') && EXEMPT.has(k.slice(0, -1)));
}

/** The tax on selling ONE item at `price` (whole gp): 2% rounded down, capped; zero when exempt, unpriced or under 50 gp (the rounding gives that by itself). */
export function geTax(price: number, name?: string): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (name !== undefined && isTaxExempt(name)) return 0;
  return Math.min(GE_TAX_CAP, Math.floor(Math.floor(price) * GE_TAX_RATE));
}

/** What one item brings after the tax. */
export function netEach(price: number, name?: string): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.floor(price) - geTax(price, name);
}

/** What `qty` items sold at `price` each bring after the tax. The tax is per item, so it rounds per item, never on the total. */
export function netSale(price: number, qty: number, name?: string): number {
  if (!(qty > 0)) return 0;
  return netEach(price, name) * Math.floor(qty);
}

/** The tax paid on `qty` items. */
export function taxOnSale(price: number, qty: number, name?: string): number {
  if (!(qty > 0)) return 0;
  return geTax(price, name) * Math.floor(qty);
}
