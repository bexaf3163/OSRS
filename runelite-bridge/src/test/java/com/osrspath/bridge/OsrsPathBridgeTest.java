package com.osrspath.bridge;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/**
 * Клиент RuneLite для разработки с плагином OSRS Path Bridge: ./gradlew run.
 * Способ из официального шаблона github.com/runelite/example-plugin — ExternalPluginManager.loadBuiltin
 * есть в RuneLite 1.12.39. Обычный клиент из лаунчера сторонние плагины так не грузит: режим
 * разработчика включается, только если RuneLite запущен без лаунчера.
 */
public class OsrsPathBridgeTest
{
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(OsrsPathBridgePlugin.class);
		RuneLite.main(args);
	}
}
