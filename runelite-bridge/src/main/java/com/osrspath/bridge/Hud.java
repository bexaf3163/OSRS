package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import lombok.AllArgsConstructor;
import lombok.Value;
import net.runelite.client.ui.overlay.Overlay;

/**
 * The per-tick state the in-game HUD is built from, and the colours the plugin's plates share.
 *
 * Until 2.73 this was a second overlay, a text plate in the top-left corner, beside the guide card: the two repeated each other and the plate sat under
 * RuneLite's hover text. Since 2.74.0 there is one HUD, {@link OsrsPathGuideOverlay}, and this class is not an overlay any more: the plugin computes
 * {@link State} once per tick ({@code updateHud}) and {@link HudModel} turns it, with the guide view, into the one card. Do not register anything here
 * with the overlay manager; a new in-game line belongs in {@link HudModel}.
 */
final class Hud
{
	/** The large text option: the font and width are a quarter bigger. */
	static final float LARGE = 1.25f;
	/** The plate width of the bank and exchange cards' base (they add their own margin). */
	static final int WIDTH = 190;
	static final Color TITLE = new Color(232, 193, 123);
	static final Color TEXT = new Color(231, 237, 245);
	static final Color DISTANCE = new Color(120, 210, 255);
	static final Color GOOD = new Color(90, 220, 120);
	static final Color WARN = new Color(255, 170, 60);
	/** "Almost done": golden green. */
	static final Color ALMOST = new Color(200, 225, 90);
	/** Gear advice: amber, like "Speed upgrade" in the app. */
	static final Color UPGRADE = new Color(255, 190, 70);

	private Hud()
	{
	}

	/** Everything the plugin knows about the moment, once per tick. Immutable: the plugin replaces it whole. */
	@Value
	@AllArgsConstructor
	static class State
	{
		String title;
		String goal;
		String distance;
		boolean near;
		/** "Bag: missing 2" / "Bag ready", if the step has a departure check. */
		String bag;
		boolean bagReady;
		/** The danger radar warning; null means nothing dangerous nearby. */
		String danger;
		/** The player is already inside the danger zone, not on the approach. */
		boolean dangerInside;
		/** "34 shrimps to 20 Fishing (~7 min)"; null means the step has no pace. */
		String pacing;
		/** Pace: almost done or the goal reached. */
		boolean pacingGood;
		/** "Wear Iron scimitar - it is in the bank"; null means no advice or upgrade hints are off. */
		String upgrade;
		/** "HP 12/40 - eat! Hits up to 8"; null means health is fine or the step has no enemy with a known hit. */
		String health;
		/** Health no higher than one max hit: the next hit may kill. */
		boolean healthCritical;
		/** The recommended way's chip, the funding plan's line or "Use Raw rat meat on Fireplace"; null means nothing to remind of. */
		String action;
		/** The distance to the target in tiles in a straight line; -1 means unknown (no target, another plane, underground). */
		int tiles;
		/** "Missing Item: Cabbage - Turn back!": the step ahead needs an item that is not in the bag; null means nothing is missing. */
		String missing;
		/** The pace's skill XP as a share of its goal, 0 to 1; null means no bar. */
		Double progress;
		/** Training now on a paced step (XP in its skills within two minutes, no temporary target, the bank closed). */
		boolean training;
		/** While training on a step with food: "Food: 8 Salmon · ~24 kills" ({@link TrainingFood}); null otherwise. */
		String food;
		/** The food is nearly out. */
		boolean foodLow;

		/** Without the food line, as before 2.57.0. */
		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade, String health, boolean healthCritical, String action, int tiles, String missing,
			Double progress, boolean training)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, health, healthCritical, action, tiles, missing,
				progress, training, null, false);
		}

		/** Without the training view, as before 2.55.1. */
		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade, String health, boolean healthCritical, String action, int tiles, String missing)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, health, healthCritical, action, tiles, missing, null, false);
		}

		/** Without the missing-item chip, as before 2.45. */
		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade, String health, boolean healthCritical, String action, int tiles)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, health, healthCritical, action, tiles, null);
		}

		/** Without the health and action warnings, as before 2.15. */
		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, null, false, null, -1, null);
		}

		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade, String health, boolean healthCritical)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, health, healthCritical, null, -1, null);
		}

		/** Without the distance in tiles, as before 2.19. */
		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade, String health, boolean healthCritical, String action)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, health, healthCritical, action, -1, null);
		}
	}

	/** A plate's width: its own or the one the player set by stretching it with Alt. */
	static int panelWidth(Overlay overlay, int standard)
	{
		Dimension d = overlay.getPreferredSize();
		return d != null && d.width > 0 ? d.width : standard;
	}
}
