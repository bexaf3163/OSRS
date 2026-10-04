package com.osrspath.bridge;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/**
 * The RuneLite development client with the OSRS Path Bridge plugin: ./gradlew run.
 * The method from the official template github.com/runelite/example-plugin: ExternalPluginManager.loadBuiltin
 * exists in RuneLite 1.12.39. An ordinary client from the launcher does not load third-party plugins this way: developer
 * mode is turned on only if RuneLite is started without the launcher.
 */
public class OsrsPathBridgeTest
{
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(OsrsPathBridgePlugin.class);
		RuneLite.main(args);
	}
}
