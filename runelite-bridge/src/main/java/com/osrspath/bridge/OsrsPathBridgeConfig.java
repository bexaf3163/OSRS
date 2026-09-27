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
		name = "Звук: шаг выполнен",
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
		name = "Фон HUD",
		description = "Непрозрачность фона у плашек помощника, в процентах",
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
		keyName = "useShortestPath",
		name = "Через Shortest Path",
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
		name = "Варианты по уровням",
		description = "Передавать приложению уровни навыков, чтобы оно предлагало телепорты, каноэ и срезки",
		section = companion,
		position = 18
	)
	default boolean shareStats()
	{
		return true;
	}

	@ConfigSection(
		name = "Места, радар, темп",
		description = "Навигация к местам и магазинам из приложения, предметы этапа в банке, радар опасных мест и темп прокачки",
		position = 20
	)
	String helpers = "helpers";

	@ConfigItem(
		keyName = "autoNavigation",
		name = "Стрелка к местам",
		description = "Кнопка «Направить стрелку в игре» в приложении ставит стрелку (и маршрут Shortest Path) к месту с карты. "
			+ "Дошёл — стрелка возвращается к шагу. Выключено — приложение получает отказ",
		section = helpers,
		position = 21
	)
	default boolean autoNavigation()
	{
		return true;
	}

	@ConfigItem(
		keyName = "upgradeRouter",
		name = "Подсказки апгрейдов",
		description = "Передавать приложению снаряжение и монеты, чтобы оно предлагало инструмент, оружие, амулет и броню получше. "
			+ "На шаге с боем совет — строкой ⚡ в HUD, лучшее из сумки и банка подсвечивается. "
			+ "По кнопке «Направить» — продавец и нужный предмет в магазине подсвечиваются. Сам ничего не покупает и не надевает",
		section = helpers,
		position = 22
	)
	default boolean upgradeRouter()
	{
		return true;
	}

	@ConfigItem(
		keyName = "bankTagsHelper",
		name = "Предметы этапа",
		description = "Принимать от приложения список предметов этапа — для подсветки в банке",
		section = helpers,
		position = 23
	)
	default boolean bankTagsHelper()
	{
		return true;
	}

	@ConfigItem(
		keyName = "bankHighlight",
		name = "Подсветка в банке",
		description = "Мягкая золотистая рамка у предметов этапа в основном окне банка — вкладка Bank Tags не нужна",
		section = helpers,
		position = 24
	)
	default boolean bankHighlight()
	{
		return true;
	}

	@ConfigItem(
		keyName = "dangerRadar",
		name = "Радар опасности",
		description = "Красная граница опасных мест (тёмные маги, ожившие деревья, агрессивные стражники), "
			+ "контур опасных NPC и предупреждение в HUD. Выключено — ничего не считается",
		section = helpers,
		position = 25
	)
	default boolean dangerRadar()
	{
		return true;
	}

	@ConfigItem(
		keyName = "dangerSound",
		name = "Звук у опасной зоны",
		description = "Один раз при входе в зону; снова — только если вышел и зашёл опять",
		section = helpers,
		position = 26
	)
	default boolean dangerSound()
	{
		return true;
	}

	@ConfigItem(
		keyName = "smartPacing",
		name = "Темп прокачки",
		description = "Считать по опыту, сколько действий осталось до цели шага и сколько это займёт, и передавать приложению",
		section = helpers,
		position = 27
	)
	default boolean smartPacing()
	{
		return true;
	}

	@ConfigItem(
		keyName = "hudPacing",
		name = "Темп в микро-HUD",
		description = "Строка вида «34 креветки до 20 Fishing (~7 мин)» в плашке шага",
		section = helpers,
		position = 28
	)
	default boolean hudPacing()
	{
		return true;
	}
}
