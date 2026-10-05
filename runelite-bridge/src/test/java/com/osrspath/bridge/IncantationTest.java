package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** Delrith's incantation is read from the five varbits, in the account's own order; unknown stays unknown. */
public class IncantationTest
{
	@Test
	public void theOrderIsTheAccountsOwn()
	{
		assertEquals("Carlem, Aber, Camerinthum, Purchai, Gabindo", Incantation.order(new int[] {0, 1, 2, 3, 4}));
		assertEquals("Gabindo, Purchai, Aber, Carlem, Camerinthum", Incantation.order(new int[] {4, 3, 1, 0, 2}));
	}

	@Test
	public void notToldYetOrBrokenValuesGiveNothing()
	{
		assertNull(Incantation.order(new int[] {0, 0, 0, 0, 0}));
		assertNull(Incantation.order(new int[] {1, 5, 0, 0, 0}));
		assertNull(Incantation.order(new int[] {1, 2}));
		assertNull(Incantation.order(null));
	}
}
