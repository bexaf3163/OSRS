package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** Слоты надетого уходят в событие GEAR: по ним приложение понимает, чем персонаж дерётся. */
public class GearSlotTest
{
	@Test
	public void номераЯчеекСтановятсяИменамиСлотов()
	{
		assertEquals("head", OsrsPathBridgePlugin.slotName(0));
		assertEquals("amulet", OsrsPathBridgePlugin.slotName(2));
		assertEquals("weapon", OsrsPathBridgePlugin.slotName(3));
		assertEquals("body", OsrsPathBridgePlugin.slotName(4));
		assertEquals("shield", OsrsPathBridgePlugin.slotName(5));
		assertEquals("legs", OsrsPathBridgePlugin.slotName(7));
		assertEquals("ring", OsrsPathBridgePlugin.slotName(12));
		// Номер вне перечня — без имени, а не чужой слот. (6, 8, 11 в RuneLite — ARMS, HAIR, JAW: части модели,
		// предметов в этих ячейках не бывает, до события GEAR они не доходят.)
		assertNull(OsrsPathBridgePlugin.slotName(-1));
		assertNull(OsrsPathBridgePlugin.slotName(99));
	}
}
