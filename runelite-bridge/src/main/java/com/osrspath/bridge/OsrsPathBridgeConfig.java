package com.osrspath.bridge;

import java.awt.Color;
import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;
import net.runelite.client.config.Alpha;
import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.ConfigSection;
import net.runelite.client.config.Keybind;
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
		position = 2
	)
	default boolean hintArrow()
	{
		return true;
	}

	@ConfigItem(
		keyName = "worldMapMarker",
		name = "Метка на карте мира",
		description = "Куда ведёт стрелка — меткой на карте мира игры. Далеко — метка у края карты; клик по ней — карта туда",
		position = 3
	)
	default boolean worldMapMarker()
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
		keyName = "smartView",
		name = "Умное проявление",
		description = "Выключено по умолчанию: список «Что нужно» и HUD видны всегда. Включишь — в пути останется только стрелка и "
			+ "одна строка HUD, список появится у банка и рядом с местом шага, оптовый — на бирже, радар — когда ты уже в зоне",
		section = companion,
		position = 10
	)
	default boolean smartOverlays()
	{
		return false;
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

	@ConfigItem(
		keyName = "hudLean",
		name = "Компактный HUD",
		description = "Не повторять в HUD то, что уже есть в списке «Что нужно»: название шага, цель, расстояние и «Сумка готова». "
			+ "Плашка остаётся, только когда есть предупреждение (опасность, здоровье, действие, темп) или списка нет",
		section = companion,
		position = 11
	)
	default boolean hudLean()
	{
		return true;
	}

	@ConfigItem(
		keyName = "showGuide",
		name = "Список «Что нужно»",
		description = "Под HUD: предметы шага (есть, в банке, нет) с «где взять» и места шага с NPC. "
			+ "Клик по строке — стрелка и путь туда, клик по заголовку — свернуть. Перетаскивается с Alt",
		section = companion,
		position = 12
	)
	default boolean showGuide()
	{
		return true;
	}

	@ConfigItem(
		keyName = "guideCollapsed",
		name = "",
		description = "Список «Что нужно» свёрнут в одну строку — меняется кликом по его заголовку",
		hidden = true
	)
	default boolean guideCollapsed()
	{
		return false;
	}

	@Range(min = 20, max = 100)
	@Units(Units.PERCENT)
	@ConfigItem(
		keyName = "hudOpacity",
		name = "Фон HUD",
		description = "Непрозрачность фона у плашек помощника, в процентах",
		section = companion,
		position = 13
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
		position = 14
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
		position = 15
	)
	default boolean showChecklist()
	{
		return true;
	}

	/** Размер большой стрелки: диаметр круга в точках экрана. */
	enum ArrowSize
	{
		SMALL("Маленькая", 48),
		MEDIUM("Средняя", 68),
		LARGE("Крупная", 92);

		private final String label;
		final int diameter;

		ArrowSize(String label, int diameter)
		{
			this.label = label;
			this.diameter = diameter;
		}

		@Override
		public String toString()
		{
			return label;
		}
	}

	@ConfigItem(
		keyName = "bigArrow",
		name = "Большая стрелка",
		description = "Крупная стрелка вверху экрана: поворачивается вместе с камерой и показывает, куда идти и сколько клеток. Перетаскивается с Alt",
		section = companion,
		position = 16
	)
	default boolean bigArrow()
	{
		return true;
	}

	// Название короткое: рядом с выпадающим списком места меньше, чем рядом с галочкой, — «Размер стрелки»
	// в живом клиенте обрезался до «Размер ст…». Стоит сразу под «Большая стрелка», поэтому понятно, чего размер.
	@ConfigItem(
		keyName = "arrowSize",
		name = "Размер",
		description = "Размер большой стрелки: маленькая, средняя или крупная — под размер окна и экрана",
		section = companion,
		position = 17
	)
	default ArrowSize arrowSize()
	{
		return ArrowSize.MEDIUM;
	}

	@ConfigItem(
		keyName = "useShortestPath",
		name = "Через Shortest Path",
		description = "Если установлен плагин Shortest Path (Plugin Hub), передавать ему цель шага — он проложит путь с учётом стен и дверей",
		section = companion,
		position = 18
	)
	default boolean useShortestPath()
	{
		return true;
	}

	@ConfigItem(
		keyName = "shopWindow",
		name = "Окно у банка и торговца",
		description = "Отдельная карточка рядом с банком, биржей и окном торговца: что взять из банка, что купить и где это продают — для любого квеста. "
			+ "Ничего не перекладывает и не покупает",
		section = companion,
		position = 19
	)
	default boolean showShopWindow()
	{
		return true;
	}

	@ConfigItem(
		keyName = "showGeHelper",
		name = "Подсказка на бирже",
		description = "При открытой Grand Exchange: оптовый список покупок из приложения. Сам ничего не покупает",
		section = companion,
		position = 20
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
		position = 20
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

	@ConfigItem(
		keyName = "hudHealth",
		name = "Здоровье в HUD",
		description = "Красная строка в плашке шага, когда здоровье упало ниже двух максимальных ударов противника шага",
		section = helpers,
		position = 29
	)
	default boolean hudHealth()
	{
		return true;
	}

	@ConfigItem(
		keyName = "stageFollow",
		name = "Стрелка по этапам",
		description = "У квестов с этапами список «Что нужно» показывает текущий этап, а стрелка сама ведёт к его NPC и сдвигается, "
			+ "когда квест перешёл на следующий этап. Выключено — стрелка остаётся у шага, список всё равно показывает этап",
		section = helpers,
		position = 30
	)
	default boolean stageFollow()
	{
		return true;
	}

	@ConfigSection(
		name = "Для разработчика",
		description = "Плашка со статусом движка, журнал и скриншоты для разбора ошибок",
		position = 90,
		closedByDefault = true
	)
	String developer = "developer";

	@ConfigItem(
		keyName = "telemetry",
		name = "Журнал для отладки",
		description = "Пишет в папку osrs-path-telemetry рядом с настройками RuneLite, что делал плагин: смена шага и этапа, куда сдвинулся курсор и почему, "
			+ "клики, сумка, смерть и телепорт, текст плашек и «странности». Только на этом компьютере, никуда не отправляется. До 8 файлов по 6 МБ",
		section = developer,
		position = 91
	)
	default boolean telemetry()
	{
		return true;
	}

	@ConfigItem(
		keyName = "telemetryShots",
		name = "Снимок при странности",
		description = "Когда плагин заметил странность (шаг не меняется, пустой экран), сохраняет скриншот игры в папку osrs-path-telemetry/shots. "
			+ "Не чаще раза в 20 секунд и не больше 12 за сеанс. На снимке видно всё, что на экране игры, включая чат",
		section = developer,
		position = 92
	)
	default boolean telemetryShots()
	{
		return true;
	}

	@ConfigItem(
		keyName = "debugKey",
		name = "Плашка разработчика",
		description = "Горячая клавиша: показать или скрыть поверх экрана статус движка — шаг, курсор, условия, снимок программы, странности",
		section = developer,
		position = 93
	)
	default Keybind debugKey()
	{
		return new Keybind(KeyEvent.VK_D, InputEvent.CTRL_DOWN_MASK | InputEvent.SHIFT_DOWN_MASK);
	}

	@ConfigItem(
		keyName = "shotKey",
		name = "Скриншот для отладки",
		description = "Горячая клавиша: сохранить скриншот игры в osrs-path-telemetry/shots и отметить его в журнале",
		section = developer,
		position = 94
	)
	default Keybind shotKey()
	{
		return new Keybind(KeyEvent.VK_K, InputEvent.CTRL_DOWN_MASK | InputEvent.SHIFT_DOWN_MASK);
	}
}
