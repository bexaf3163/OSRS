package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** Item valuation by exchange prices: coins are not included, untradeable is zero, stacks are multiplied. */
public class ItemValueTest
{
	private static final int COINS = 995;

	@Test
	public void valueWithoutCoins()
	{
		ItemCounts c = new ItemCounts();
		c.add(COINS, "coins", 5000);
		c.add(1739, "cowhide", 28);
		c.add(1351, "bronze axe", 1);
		c.add(2528, "lamp", 1);
		long v = c.value(id -> id == 1739 ? 150 : id == 1351 ? 20 : id == COINS ? 1 : 0, COINS);
		assertEquals(28 * 150 + 20, v);
	}

	@Test
	public void noPriceAndNegativePriceAreNotCounted()
	{
		ItemCounts c = new ItemCounts();
		c.add(1, "x", 3);
		assertEquals(0, c.value(id -> -5, COINS));
		assertEquals(0, ItemCounts.EMPTY.value(id -> 100, COINS));
	}
}
