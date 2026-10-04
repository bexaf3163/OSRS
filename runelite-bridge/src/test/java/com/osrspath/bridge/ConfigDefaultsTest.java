package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import net.runelite.client.config.ConfigItem;
import org.junit.Test;

/**
 * On the first launch RuneLite writes the default values into the player's profile, and after that changing a default changes nothing.
 * So a setting that must not be turned on silently lives under a new key.
 */
public class ConfigDefaultsTest
{
	/** All the settings methods are default, so an empty implementation returns the default values. */
	private static OsrsPathBridgeConfig defaults()
	{
		return new OsrsPathBridgeConfig() { };
	}

	@Test
	public void smartViewIsOffByDefault_underANewKey() throws Exception
	{
		assertFalse("in the game the list and the HUD are always visible until the player turns it on themselves", defaults().smartOverlays());
		ConfigItem item = OsrsPathBridgeConfig.class.getMethod("smartOverlays").getAnnotation(ConfigItem.class);
		assertEquals("smartView", item.keyName());
	}
}
