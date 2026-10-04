package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Game facts for the Quest Helper machine: items (bag, worn, bank) and the message memory. The client itself is not needed here. */
public class QhLiveFactsTest
{
	private static ItemCounts counts(Object... idNameQty)
	{
		ItemCounts c = new ItemCounts();
		for (int i = 0; i < idNameQty.length; i += 3)
		{
			c.add((Integer) idNameQty[i], (String) idNameQty[i + 1], (Integer) idNameQty[i + 2]);
		}
		return c;
	}

	@Test
	public void items_bagWornBank()
	{
		// In "carried" the worn is already part of the bag: that is how the plugin counts it.
		ItemCounts carried = counts(431, "karamjan rum", 2, 1005, "white apron", 1);
		ItemCounts worn = counts(1005, "white apron", 1);
		ItemCounts bank = counts(431, "karamjan rum", 5);
		QhLiveFacts f = new QhLiveFacts(null, () -> carried, () -> worn, () -> bank);
		assertEquals("in the bag", 2, f.items(new int[] {431}, false, false));
		assertEquals("and in the bank", 7, f.items(new int[] {431}, false, true));
		assertEquals("the rum is not worn", 0, f.items(new int[] {431}, true, false));
		assertEquals("the apron is worn", 1, f.items(new int[] {1005}, true, false));
		assertEquals("several ids are summed", 3, f.items(new int[] {431, 1005}, false, false));
		assertEquals("no such item", 0, f.items(new int[] {9999}, false, true));
	}

	@Test
	public void bankUnknown_doesNotInterfere()
	{
		ItemCounts carried = counts(431, "karamjan rum", 1);
		QhLiveFacts f = new QhLiveFacts(null, () -> carried, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY);
		assertEquals(1, f.items(new int[] {431}, false, true));
	}

	@Test
	public void memoryKeepsNoMoreThanTheLimit_oldOnesGoAway()
	{
		QhLiveFacts f = new QhLiveFacts(null, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY);
		for (int i = 0; i < QhLiveFacts.MAX_EVENTS + 25; i++)
		{
			f.add("GAMEMESSAGE", "message " + i);
		}
		assertEquals(QhLiveFacts.MAX_EVENTS, f.events().size());
		assertEquals("the oldest are forgotten", "message 25", f.events().get(0).getText());
		assertEquals("message " + (QhLiveFacts.MAX_EVENTS + 24), f.events().get(f.events().size() - 1).getText());
	}

	@Test
	public void clearForgetsAll_andEmptyIsNotAdded()
	{
		QhLiveFacts f = new QhLiveFacts(null, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY);
		f.add("DIALOG", "Luthas|Hello");
		f.add("DIALOG", null);
		assertEquals(1, f.events().size());
		assertEquals("DIALOG", f.events().get(0).getType());
		f.clear();
		assertTrue(f.events().isEmpty());
	}
}
