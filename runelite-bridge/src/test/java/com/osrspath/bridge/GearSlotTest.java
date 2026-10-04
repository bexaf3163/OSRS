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
		assertEquals("head", OsrsPathBridgePlugin.slotName(0));
		assertEquals("amulet", OsrsPathBridgePlugin.slotName(2));
		assertEquals("weapon", OsrsPathBridgePlugin.slotName(3));
		assertEquals("body", OsrsPathBridgePlugin.slotName(4));
		assertEquals("shield", OsrsPathBridgePlugin.slotName(5));
		assertEquals("legs", OsrsPathBridgePlugin.slotName(7));
		assertEquals("ring", OsrsPathBridgePlugin.slotName(12));
		// A number outside the list has no name, rather than someone else's slot. (6, 8, 11 in RuneLite are ARMS, HAIR, JAW: parts of the model,
		// there are no items in those cells, they do not reach the GEAR event.)
		assertNull(OsrsPathBridgePlugin.slotName(-1));
		assertNull(OsrsPathBridgePlugin.slotName(99));
	}
}
