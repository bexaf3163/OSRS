import { describe, expect, it } from 'vitest';
import { geTax, GE_TAX_CAP, isTaxExempt, netEach, netSale, taxOnSale } from '../../src/lib/funding/ge';

// Reference figures worked by hand from the wiki rule (2% of one item's price, rounded down, at most 5,000,000, exempt list pays nothing).
describe('Grand Exchange tax', () => {
  it('rounds down per item: 334 gp pays 6 (6.68), nets 328', () => {
    expect(geTax(334, 'Big bones')).toBe(6);
    expect(netEach(334, 'Big bones')).toBe(328);
  });

  it('prices under 50 gp pay nothing, 50 gp pays 1', () => {
    expect(geTax(49, 'Cowhide')).toBe(0);
    expect(geTax(50, 'Cowhide')).toBe(1);
    expect(geTax(99, 'Cowhide')).toBe(1);
    expect(geTax(100, 'Cowhide')).toBe(2);
  });

  it('is capped at 5,000,000 an item', () => {
    expect(geTax(250_000_000, 'Some item')).toBe(5_000_000);
    expect(geTax(300_000_000, 'Some item')).toBe(GE_TAX_CAP);
    expect(netEach(300_000_000, 'Some item')).toBe(295_000_000);
  });

  it('is taken per item, never on the total (100 Big bones at 334 = 32 800, not 32 732)', () => {
    expect(netSale(334, 100, 'Big bones')).toBe(32_800);
    expect(taxOnSale(334, 100, 'Big bones')).toBe(600);
  });

  it('the exempt list pays nothing: Salmon, Lobster, Tuna, Bread, tools; Trout and Swordfish do pay', () => {
    expect(geTax(34, 'Salmon')).toBe(0);
    expect(geTax(100, 'Salmon')).toBe(0);
    expect(isTaxExempt('Lobster')).toBe(true);
    expect(isTaxExempt('Tuna')).toBe(true);
    expect(isTaxExempt('Hammer')).toBe(true);
    expect(isTaxExempt('Trout')).toBe(false);
    expect(isTaxExempt('Swordfish')).toBe(false);
    expect(netEach(500, 'Swordfish')).toBe(490);
  });

  it('only the charged (8) necklace and ring are exempt', () => {
    expect(isTaxExempt('Games necklace(8)')).toBe(true);
    expect(isTaxExempt('Games necklace(7)')).toBe(false);
    expect(isTaxExempt('Ring of dueling(8)')).toBe(true);
  });

  it('bad input is zero, never NaN or negative', () => {
    expect(geTax(Number.NaN)).toBe(0);
    expect(geTax(-5)).toBe(0);
    expect(netSale(334, 0)).toBe(0);
    expect(netSale(334, -3)).toBe(0);
    expect(netEach(0)).toBe(0);
  });
});
