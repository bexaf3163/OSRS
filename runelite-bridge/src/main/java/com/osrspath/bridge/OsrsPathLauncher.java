package com.osrspath.bridge;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/**
 * Запуск RuneLite с плагином OSRS Path Bridge — его делает программа «OSRS Путь» (electron/runelite-launcher.cjs).
 * Классы клиента берутся из установленного RuneLite (~/.runelite/repository2), Java — из его же папки jre.
 * loadBuiltin работает и без режима разработчика: встроенные плагины RuneLite загружает всегда.
 */
public final class OsrsPathLauncher
{
	private OsrsPathLauncher()
	{
	}

	@SuppressWarnings("unchecked")
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(OsrsPathBridgePlugin.class);
		RuneLite.main(args);
	}
}
