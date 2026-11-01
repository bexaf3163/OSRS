package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** The worn slots go into the GEAR event: the app uses them to tell what the character fights with. */
public class GearSlotTest
{
	@Test
	public void cellNumbersBecomeSlotNames()
	{
		assertEquals("head", PluginHints.slotName(0));
		assertEquals("amulet", PluginHints.slotName(2));
		assertEquals("weapon", PluginHints.slotName(3));
		assertEquals("body", PluginHints.slotName(4));
		assertEquals("shield", PluginHints.slotName(5));
		assertEquals("legs", PluginHints.slotName(7));
		assertEquals("ring", PluginHints.slotName(12));
		// A number outside the list has no name, rather than someone else's slot. (6, 8, 11 in RuneLite are ARMS, HAIR, JAW: parts of the model,
		// there are no items in those cells, they do not reach the GEAR event.)
		assertNull(PluginHints.slotName(-1));
		assertNull(PluginHints.slotName(99));
	}
}
