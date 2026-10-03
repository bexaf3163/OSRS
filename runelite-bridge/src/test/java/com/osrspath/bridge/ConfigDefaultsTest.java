package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import net.runelite.client.config.ConfigItem;
import org.junit.Test;

/**
 * RuneLite при первом запуске записывает значения по умолчанию в профиль игрока, и потом смена умолчания уже ничего
 * не меняет. Поэтому настройка, которую нельзя включать молча, живёт под новым ключом.
 */
public class ConfigDefaultsTest
{
	/** Все методы настроек — default, поэтому пустая реализация отдаёт значения по умолчанию. */
	private static OsrsPathBridgeConfig defaults()
	{
		return new OsrsPathBridgeConfig() { };
	}

	@Test
	public void умноеПроявление_выключеноПоУмолчанию_подНовымКлючом() throws Exception
	{
		assertFalse("в игре список и HUD видны всегда, пока игрок сам не включит", defaults().smartOverlays());
		ConfigItem item = OsrsPathBridgeConfig.class.getMethod("smartOverlays").getAnnotation(ConfigItem.class);
		assertEquals("smartView", item.keyName());
	}
}
