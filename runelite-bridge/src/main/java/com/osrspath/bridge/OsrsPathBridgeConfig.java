package com.osrspath.bridge;

import java.awt.Color;
import net.runelite.client.config.Alpha;
import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.Range;

@ConfigGroup(OsrsPathBridgeConfig.GROUP)
public interface OsrsPathBridgeConfig extends Config
{
	String GROUP = "osrspathbridge";

	@Range(min = 1024, max = 65535)
	@ConfigItem(
		keyName = "port",
		name = "Порт",
		description = "Порт моста на 127.0.0.1. Приложение «OSRS Путь» ждёт 38282. Меняется после перезапуска плагина.",
		position = 1
	)
	default int port()
	{
		return BridgeServer.DEFAULT_PORT;
	}

	@ConfigItem(
		keyName = "allowedOrigins",
		name = "Разрешённые сайты",
		description = "Адреса веб-версии «OSRS Путь» через запятую, например https://example.github.io. "
			+ "Программа для ПК и http://localhost работают без этого.",
		position = 2
	)
	default String allowedOrigins()
	{
		return "";
	}

	@ConfigItem(
		keyName = "hintArrow",
		name = "Стрелка к месту шага",
		description = "Жёлтая стрелка игры над точкой текущего шага",
		position = 3
	)
	default boolean hintArrow()
	{
		return true;
	}

	@Alpha
	@ConfigItem(
		keyName = "highlightColor",
		name = "Цвет подсветки",
		description = "NPC, объекты, клетки, варианты диалога и предметы шага",
		position = 4
	)
	default Color highlightColor()
	{
		return new Color(0, 220, 255, 230);
	}

	@ConfigItem(
		keyName = "completionSound",
		name = "Звук при выполнении шага",
		description = "Короткий звук интерфейса, когда шаг засчитан автоматически",
		position = 5
	)
	default boolean completionSound()
	{
		return true;
	}
}
