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
		name = "In-game helper",
		description = "Micro HUD, departure check, route, exchange hint and quick variants",
		position = 10
	)
	String companion = "companion";

	@Range(min = 1024, max = 65535)
	@ConfigItem(
		keyName = "port",
		name = "Port",
		description = "Bridge port on 127.0.0.1. The OSRS Path app expects 38282. Applied after the plugin restarts.",
		position = 1
	)
	default int port()
	{
		return BridgeServer.DEFAULT_PORT;
	}

	@ConfigItem(
		keyName = "hintArrow",
		name = "Arrow to the step's place",
		description = "The game's yellow arrow above the current step's point",
		position = 2
	)
	default boolean hintArrow()
	{
		return true;
	}

	@ConfigItem(
		keyName = "worldMapMarker",
		name = "World map marker",
		description = "Shows where the arrow points as a marker on the game's world map. Far away: the marker sits at the map edge; click it to open the map there",
		position = 3
	)
	default boolean worldMapMarker()
	{
		return true;
	}

	@Alpha
	@ConfigItem(
		keyName = "highlightColor",
		name = "Highlight colour",
		description = "NPCs, objects, tiles, dialogue options and the step's items",
		position = 4
	)
	default Color highlightColor()
	{
		return new Color(0, 220, 255, 230);
	}

	@ConfigItem(
		keyName = "completionSound",
		name = "Sound: step done",
		description = "A short interface sound when a step is counted automatically",
		position = 5
	)
	default boolean completionSound()
	{
		return true;
	}

	@ConfigItem(
		keyName = "smartView",
		name = "Smart reveal",
		description = "Off by default: the 'What you need' list and HUD are always visible. If enabled, only the arrow and "
			+ "one HUD line remain while travelling; the list appears at the bank and near the step's place, the bulk list at the exchange, the radar when you are already in a zone",
		section = companion,
		position = 10
	)
	default boolean smartOverlays()
	{
		return false;
	}

	@ConfigItem(
		keyName = "showHud",
		name = "Show micro HUD",
		description = "The current step, the target and the distance to it. The plate can be dragged while holding Alt",
		section = companion,
		position = 11
	)
	default boolean showHud()
	{
		return true;
	}

	@ConfigItem(
		keyName = "hudLean",
		name = "Compact HUD",
		description = "Do not repeat in the HUD what the 'What you need' list already shows: the step name, target, distance and 'Bag ready'. "
			+ "The plate stays only when there is a warning (danger, health, action, pace) or no list",
		section = companion,
		position = 11
	)
	default boolean hudLean()
	{
		return true;
	}

	@ConfigItem(
		keyName = "showGuide",
		name = "'What you need' list",
		description = "Under the HUD: the step's items (have, in bank, missing) with 'where to get it' and the step's places with NPCs. "
			+ "A click on a line gives the arrow and path there, a click on the heading collapses it. Draggable with Alt",
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
		description = "The 'What you need' list is collapsed to one line; changed by clicking its heading",
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
		name = "HUD background",
		description = "Opacity of the helper plates' background, in percent",
		section = companion,
		position = 13
	)
	default int hudOpacity()
	{
		return 75;
	}

	@ConfigItem(
		keyName = "hudLarge",
		name = "Large HUD text",
		description = "Enlarge the text and width of the helper plates by a quarter",
		section = companion,
		position = 14
	)
	default boolean hudLarge()
	{
		return false;
	}

	@ConfigItem(
		keyName = "showChecklist",
		name = "Departure check at the bank",
		description = "With the bank open: which of the step's items are already in the bag and which to take. What is needed is highlighted in the bank",
		section = companion,
		position = 15
	)
	default boolean showChecklist()
	{
		return true;
	}

	/** Big arrow size: the circle's diameter in screen pixels. */
	enum ArrowSize
	{
		SMALL("Small", 48),
		MEDIUM("Medium", 68),
		LARGE("Large", 92);

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
		name = "Big arrow",
		description = "A large arrow at the top of the screen: it turns with the camera and shows where to go and how many tiles. Draggable with Alt",
		section = companion,
		position = 16
	)
	default boolean bigArrow()
	{
		return true;
	}

	// The name is short: next to a dropdown there is less room than next to a checkbox, and "Arrow size"
	// was cut to "Arrow si..." in the live client. It sits right under "Big arrow", so it is clear what the size is of.
	@ConfigItem(
		keyName = "arrowSize",
		name = "Size",
		description = "Size of the big arrow: small, medium or large, to fit the window and screen",
		section = companion,
		position = 17
	)
	default ArrowSize arrowSize()
	{
		return ArrowSize.MEDIUM;
	}

	@ConfigItem(
		keyName = "useShortestPath",
		name = "Via Shortest Path",
		description = "If the Shortest Path plugin (Plugin Hub) is installed, pass it the step's target; it lays out a path that accounts for walls and doors",
		section = companion,
		position = 18
	)
	default boolean useShortestPath()
	{
		return true;
	}

	@ConfigItem(
		keyName = "shopWindow",
		name = "Bank and shop window",
		description = "A separate card next to the bank, exchange and merchant windows: what to take from the bank, what to buy and where it is sold, for any quest. "
			+ "Moves and buys nothing",
		section = companion,
		position = 19
	)
	default boolean showShopWindow()
	{
		return true;
	}

	@ConfigItem(
		keyName = "showGeHelper",
		name = "Exchange hint",
		description = "With the Grand Exchange open: the bulk shopping list from the app. Buys nothing by itself",
		section = companion,
		position = 20
	)
	default boolean showGeHelper()
	{
		return true;
	}

	@ConfigItem(
		keyName = "shareStats",
		name = "Level-based variants",
		description = "Send skill levels to the app so it can offer teleports, canoes and shortcuts",
		section = companion,
		position = 20
	)
	default boolean shareStats()
	{
		return true;
	}

	@ConfigSection(
		name = "Places, radar, pace",
		description = "Navigation to places and shops from the app, stage items in the bank, the danger radar and the training pace",
		position = 20
	)
	String helpers = "helpers";

	@ConfigItem(
		keyName = "autoNavigation",
		name = "Arrow to places",
		description = "The 'Point arrow in game' button in the app sets the arrow (and the Shortest Path route) to a place from the map. "
			+ "On arrival the arrow returns to the step. When off, the app gets a refusal",
		section = helpers,
		position = 21
	)
	default boolean autoNavigation()
	{
		return true;
	}

	@ConfigItem(
		keyName = "upgradeRouter",
		name = "Upgrade hints",
		description = "Send gear and coins to the app so it can suggest a better tool, weapon, amulet and armour. "
			+ "On a combat step the advice is a ⚡ line in the HUD, and the best item from the bag and bank is highlighted. "
			+ "With the 'Navigate' button, the seller and the needed item in the shop are highlighted. Buys and equips nothing by itself",
		section = helpers,
		position = 22
	)
	default boolean upgradeRouter()
	{
		return true;
	}

	@ConfigItem(
		keyName = "bankTagsHelper",
		name = "Stage items",
		description = "Accept the stage's item list from the app, for highlighting in the bank",
		section = helpers,
		position = 23
	)
	default boolean bankTagsHelper()
	{
		return true;
	}

	@ConfigItem(
		keyName = "bankHighlight",
		name = "Bank highlight",
		description = "A soft golden frame on the stage's items in the main bank window; the Bank Tags tab is not needed",
		section = helpers,
		position = 24
	)
	default boolean bankHighlight()
	{
		return true;
	}

	@ConfigItem(
		keyName = "dangerRadar",
		name = "Danger radar",
		description = "A red border on dangerous places (dark wizards, animated trees, aggressive guards), "
			+ "an outline on dangerous NPCs and a HUD warning. When off, nothing is computed",
		section = helpers,
		position = 25
	)
	default boolean dangerRadar()
	{
		return true;
	}

	@ConfigItem(
		keyName = "dangerSound",
		name = "Danger zone sound",
		description = "Once on entering the zone; again only if you leave and re-enter",
		section = helpers,
		position = 26
	)
	default boolean dangerSound()
	{
		return true;
	}

	@ConfigItem(
		keyName = "smartPacing",
		name = "Training pace",
		description = "Count by XP how many actions are left to the step's goal and how long that takes, and send it to the app",
		section = helpers,
		position = 27
	)
	default boolean smartPacing()
	{
		return true;
	}

	@ConfigItem(
		keyName = "hudPacing",
		name = "Pace in micro HUD",
		description = "A line like '34 shrimps to 20 Fishing (~7 min)' on the step plate",
		section = helpers,
		position = 28
	)
	default boolean hudPacing()
	{
		return true;
	}

	@ConfigItem(
		keyName = "hudHealth",
		name = "Health in HUD",
		description = "A red line on the step plate when health drops below two max hits of the step's enemy",
		section = helpers,
		position = 29
	)
	default boolean hudHealth()
	{
		return true;
	}

	@ConfigItem(
		keyName = "stageFollow",
		name = "Arrow by stages",
		description = "For quests with stages the 'What you need' list shows the current stage, and the arrow itself leads to its NPC and moves "
			+ "when the quest moves to the next stage. When off, the arrow stays at the step; the list still shows the stage",
		section = helpers,
		position = 30
	)
	default boolean stageFollow()
	{
		return true;
	}

	@ConfigItem(
		keyName = "qhMachine",
		name = "Steps like Quest Helper",
		description = "The current stage step is chosen by the same conditions as in the Quest Helper plugin: items, place, quest variables, "
			+ "chat messages and dialogues. When off, only place and items decide the step (as before version 2.27)",
		section = helpers,
		position = 31
	)
	default boolean qhMachine()
	{
		return true;
	}

	@ConfigSection(
		name = "Developer",
		description = "A badge with the engine status, a log and screenshots for troubleshooting",
		position = 90,
		closedByDefault = true
	)
	String developer = "developer";

	@ConfigItem(
		keyName = "telemetry",
		name = "Debug log",
		description = "Writes to the osrs-path-telemetry folder next to the RuneLite settings what the plugin did: step and stage changes, where the cursor moved and why, "
			+ "clicks, bag, death and teleport, badge text and 'anomalies'. Stays on this computer, nothing is sent. Up to 8 files of 6 MB",
		section = developer,
		position = 91
	)
	default boolean telemetry()
	{
		return true;
	}

	@ConfigItem(
		keyName = "telemetryShots",
		name = "Screenshot on anomaly",
		description = "When the plugin notices an anomaly (the step does not change, an empty screen), it saves a game screenshot to osrs-path-telemetry/shots. "
			+ "No more than once per 20 seconds and no more than 12 per session. The screenshot shows everything on the game screen, including chat",
		section = developer,
		position = 92
	)
	default boolean telemetryShots()
	{
		return true;
	}

	@ConfigItem(
		keyName = "telemetryDetail",
		name = "Log: chat and dialogues",
		description = "The log gets game messages (chat, message boxes, dialogue lines and answer options), game menu clicks, "
			+ "variable changes and the quest journal text when you open it. Needed to understand why a step was not counted. Stays on this computer",
		section = developer,
		position = 95
	)
	default boolean telemetryDetail()
	{
		return true;
	}

	@ConfigItem(
		keyName = "telemetryEventShots",
		name = "Screenshot on every step",
		description = "A game screenshot at every stage cursor move, so the log shows what the player saw. "
			+ "No more than once per 6 seconds and no more than 40 per session; the last 80 stay in the folder",
		section = developer,
		position = 96
	)
	default boolean telemetryEventShots()
	{
		return true;
	}

	@ConfigItem(
		keyName = "debugKey",
		name = "Developer badge",
		description = "Hotkey: show or hide the engine status over the screen: step, cursor, conditions, the app's snapshot, anomalies",
		section = developer,
		position = 93
	)
	default Keybind debugKey()
	{
		return new Keybind(KeyEvent.VK_D, InputEvent.CTRL_DOWN_MASK | InputEvent.SHIFT_DOWN_MASK);
	}

	@ConfigItem(
		keyName = "shotKey",
		name = "Debug screenshot",
		description = "Hotkey: save a game screenshot to osrs-path-telemetry/shots and mark it in the log",
		section = developer,
		position = 94
	)
	default Keybind shotKey()
	{
		return new Keybind(KeyEvent.VK_K, InputEvent.CTRL_DOWN_MASK | InputEvent.SHIFT_DOWN_MASK);
	}
}
