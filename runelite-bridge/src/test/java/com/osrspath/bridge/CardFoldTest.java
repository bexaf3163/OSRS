package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.awt.Point;
import org.junit.Test;

public class CardFoldTest
{
	@Test
	public void aClickSwitchesOnlyThatCardAndTheChoiceIsSaved()
	{
		String once = CardFold.toggled("", CardFold.CHECK);
		assertTrue(CardFold.folded(once, CardFold.CHECK));
		assertFalse(CardFold.folded(once, CardFold.SHOP));
		String both = CardFold.toggled(once, CardFold.SHOP);
		assertEquals("check,shop", both);
		assertEquals("shop", CardFold.toggled(both, CardFold.CHECK));
	}

	@Test
	public void theTitleSaysWhatAClickDoes()
	{
		assertTrue(InventoryCheckOverlay.title("S0-20", false).endsWith("[-]"));
		assertTrue(InventoryCheckOverlay.title("S0-20", true).endsWith("[+]"));
	}

	@Test
	public void aBrokenSavedOffsetIsNoOffset()
	{
		assertEquals(new Point(-40, 12), CardFold.offset("-40,12"));
		assertEquals(new Point(), CardFold.offset(""));
		assertEquals(new Point(), CardFold.offset("a,b"));
	}
}
