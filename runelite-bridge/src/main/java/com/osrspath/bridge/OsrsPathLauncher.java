package com.osrspath.bridge;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/**
 * Launching RuneLite with the OSRS Path Bridge plugin: done by the "OSRS Path" app (electron/runelite-launcher.cjs).
 * The client classes are taken from the installed RuneLite (~/.runelite/repository2), Java from its own jre folder.
 * loadBuiltin works even without developer mode: RuneLite always loads its built-in plugins.
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
