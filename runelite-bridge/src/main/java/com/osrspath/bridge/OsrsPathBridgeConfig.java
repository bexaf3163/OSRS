package com.osrspath.bridge;

import java.awt.Color;
import net.runelite.client.config.Alpha;
import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.ConfigSection;
import net.runelite.client.config.Range;
import net.runelite.client.config.Units;

@ConfigGroup(OsrsPathBridgeConfig.GROUP)
public interface OsrsPathBridgeConfig extends Config
{
	String GROUP = "osrspathbridge";

	@ConfigSection(
		name = "Помощник в игре",
		description = "Микро-HUD, проверка вылета, маршрут, подсказка на бирже и быстрые варианты",
		position = 10
	)
	String companion = "companion";

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

	@ConfigItem(
		keyName = "showHud",
		name = "Показывать микро-HUD",
		description = "Текущий шаг, цель и расстояние до неё. Плашку можно перетащить с зажатым Alt",
		section = companion,
		position = 11
	)
	default boolean showHud()
	{
		return true;
	}

	@Range(min = 20, max = 100)
	@Units(Units.PERCENT)
	@ConfigItem(
		keyName = "hudOpacity",
		name = "Непрозрачность HUD",
		description = "Насколько плотный фон у плашек помощника",
		section = companion,
		position = 12
	)
	default int hudOpacity()
	{
		return 75;
	}

	@ConfigItem(
		keyName = "hudLarge",
		name = "Крупный текст HUD",
		description = "Увеличить текст и ширину плашек помощника на четверть",
		section = companion,
		position = 13
	)
	default boolean hudLarge()
	{
		return false;
	}

	@ConfigItem(
		keyName = "showChecklist",
		name = "Проверка вылета у банка",
		description = "При открытом банке: что из предметов шага уже в сумке, а что взять. Нужное подсвечивается в банке",
		section = companion,
		position = 14
	)
	default boolean showChecklist()
	{
		return true;
	}

	@ConfigItem(
		keyName = "showBreadcrumbs",
		name = "Путевые точки на земле",
		description = "Метки маршрута шага на земле, если Shortest Path не ведёт к цели сам",
		section = companion,
		position = 15
	)
	default boolean showBreadcrumbs()
	{
		return true;
	}

	@ConfigItem(
		keyName = "useShortestPath",
		name = "Маршрут через Shortest Path",
		description = "Если установлен плагин Shortest Path (Plugin Hub), передавать ему цель шага — он проложит путь с учётом стен и дверей",
		section = companion,
		position = 16
	)
	default boolean useShortestPath()
	{
		return true;
	}

	@ConfigItem(
		keyName = "showGeHelper",
		name = "Подсказка на бирже",
		description = "При открытой Grand Exchange: оптовый список покупок из приложения. Сам ничего не покупает",
		section = companion,
		position = 17
	)
	default boolean showGeHelper()
	{
		return true;
	}

	@ConfigItem(
		keyName = "shareStats",
		name = "Быстрые варианты по уровням",
		description = "Передавать приложению уровни навыков, чтобы оно предлагало телепорты, каноэ и срезки",
		section = companion,
		position = 18
	)
	default boolean shareStats()
	{
		return true;
	}
}
