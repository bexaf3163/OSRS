package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import javax.inject.Inject;
import lombok.AllArgsConstructor;
import lombok.Value;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPanel;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.components.ComponentConstants;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;
import net.runelite.client.ui.overlay.components.PanelComponent;

/**
 * The micro HUD: the step's code and name, the current target and the distance to it. Top left, under the game windows,
 * draggable with the mouse while holding Alt (like any RuneLite plate).
 *
 * The plugin computes the lines once per game tick ({@link State}); here the panel is rebuilt only
 * when the state or settings changed: a normal frame creates nothing. Long lines,
 * including the step name, wrap to the plate width ({@link OverlayText}).
 */
class OsrsPathHudOverlay extends OverlayPanel
{
	static final int WIDTH = 190;
	/** The large HUD: the font and width are a quarter bigger. */
	static final float LARGE = 1.25f;
	static final Color TITLE = new Color(255, 210, 90);
	static final Color TEXT = new Color(230, 230, 230);
	static final Color DISTANCE = new Color(120, 210, 255);
	static final Color GOOD = new Color(90, 220, 120);
	static final Color WARN = new Color(255, 170, 60);
	/** "Almost done": golden green. */
	static final Color ALMOST = new Color(200, 225, 90);
	/** Gear advice: amber, like "⚡ Speed upgrade" in the app. */
	static final Color UPGRADE = new Color(255, 190, 70);

	/** Everything the HUD shows. Immutable: the plugin replaces it whole. */
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
		/** Pace: almost done or the goal reached: the line is green. */
		boolean pacingGood;
		/** "⚡ Wear Iron scimitar - it is in the bank"; null means no advice or upgrade hints are off. */
		String upgrade;
		/** "HP 12/40 - eat! Hits up to 8"; null means health is fine or the step has no enemy with a known hit. */
		String health;
		/** Health no higher than one max hit: the next hit may kill. */
		boolean healthCritical;
		/** "Use Raw rat meat on Fireplace": what to do now by the step; null means nothing to remind of. */
		String action;
		/** The distance to the target in tiles in a straight line; -1 means unknown (no target, another plane, underground). */
		int tiles;

		/** Without the health and action warnings, as before 2.15. */
		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, null, false, null, -1);
		}

		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade, String health, boolean healthCritical)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, health, healthCritical, null, -1);
		}

		/** Without the distance in tiles, as before 2.19. */
		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade, String health, boolean healthCritical, String action)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, health, healthCritical, action, -1);
		}
	}

	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private Object builtFor;
	/** The plate size in the previous frame, which the card is drawn by. */
	private Dimension last = new Dimension();

	@Inject
	OsrsPathHudOverlay(OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		super(plugin);
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.TOP_LEFT);
		setLayer(OverlayLayer.UNDER_WIDGETS);
		setPriority(PRIORITY_MED);
		setClearChildren(false);
		setMovable(true);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		State s = plugin.getHud();
		if (!config.showHud() || s == null)
		{
			plugin.hudShown(false);
			return null;
		}
		// Smart reveal: while travelling and at the exchange one line (the action and distance), the rest is not needed in the game.
		if (config.smartOverlays() && SmartView.compactHud(plugin.overlayContext()))
		{
			s = SmartView.compact(s);
		}
		else if (config.hudLean())
		{
			// Compact HUD: the step, target, distance and "bag" are already in the "What you need" list; the plate stays only if it has something to say.
			s = lean(s, GuideList.shown(config.showGuide(), config.guideCollapsed(), plugin.getGuideView(), config.smartOverlays(), plugin.overlayContext()));
			if (s == null)
			{
				plugin.hudShown(false);
				return null;
			}
		}
		boolean large = config.hudLarge();
		Font font = OverlayText.font(g.getFont(), large ? LARGE : 1f);
		g.setFont(font);
		int width = panelWidth(this, large ? Math.round(WIDTH * LARGE) : WIDTH);
		Object key = Arrays.asList(s, config.hudOpacity(), font, width);
		if (!Objects.equals(key, builtFor))
		{
			build(panelComponent, s, g.getFontMetrics(font), width, config.hudOpacity());
			builtFor = key;
			plugin.uiShown("hud", plain(s));
		}
		plugin.hudShown(true);
		OverlayCard.paint(g, last.width, last.height, accent(s), config.hudOpacity(), config.overlayTheme());
		Dimension d = super.render(g);
		last = d == null ? new Dimension() : d;
		return d;
	}

	/**
	 * Compact HUD. Next to it is the "What you need" list: the step, target, distance and "bag" in the HUD duplicate it (and the arrow and minimap),
	 * only warnings remain: danger, health, action, pace, gear advice. With no list the HUD is the only
	 * source: the name and target stay, but "Bag ready" does not (good news is not needed, bad news, "Bag: missing X", stays).
	 * null means nothing to show: no plate at all.
	 */
	static State lean(State s, boolean guideShown)
	{
		String title = guideShown ? null : s.getTitle();
		String goal = guideShown ? null : s.getGoal();
		String distance = guideShown ? null : s.getDistance();
		String bag = guideShown || s.isBagReady() ? null : s.getBag();
		if (isBlank(title) && isBlank(goal) && isBlank(distance) && isBlank(bag) && isBlank(s.getDanger()) && isBlank(s.getHealth())
			&& isBlank(s.getAction()) && isBlank(s.getPacing()) && isBlank(s.getUpgrade()))
		{
			return null;
		}
		return new State(title, goal, distance, s.isNear(), bag, s.isBagReady(), s.getDanger(), s.isDangerInside(), s.getPacing(),
			s.isPacingGood(), s.getUpgrade(), s.getHealth(), s.isHealthCritical(), s.getAction(), s.getTiles());
	}

	/** The plate text in lines, for the debug log: what the player sees at the top. */
	static String plain(State s)
	{
		java.util.List<String> lines = new java.util.ArrayList<>();
		for (String t : new String[] {s.getTitle(), s.getDanger(), s.getHealth(), s.getGoal(), s.getAction(), s.getDistance(), s.getPacing(), s.getBag(), s.getUpgrade()})
		{
			if (!isBlank(t))
			{
				lines.add(t);
			}
		}
		return String.join("\n", lines);
	}

	private static boolean isBlank(String s)
	{
		return s == null || s.isEmpty();
	}

	/** The strip colour: danger is red, a target nearby is green, the rest gold. */
	static Color accent(State s)
	{
		if (s.getDanger() != null || s.isHealthCritical())
		{
			return OverlayCard.RED;
		}
		return s.isNear() ? OverlayCard.GREEN : OverlayCard.GOLD;
	}

	/** The plate width: its own or the one the player set by stretching it with Alt. */
	static int panelWidth(Overlay overlay, int standard)
	{
		Dimension d = overlay.getPreferredSize();
		return d != null && d.width > 0 ? d.width : standard;
	}

	/** The HUD contents. Static, so a test can draw it with the real fonts without a client. */
	static void build(PanelComponent panel, State s, FontMetrics fm, int width, int opacity)
	{
		int inner = OverlayText.inner(width);
		List<LayoutableRenderableEntity> c = panel.getChildren();
		c.clear();
		panel.setPreferredSize(new Dimension(width, 0));
		OverlayText.frame(panel, fm);
		if (!isBlank(s.getTitle()))
		{
			OverlayText.title(c, s.getTitle(), TITLE, fm, inner);
		}
		if (s.getDanger() != null)
		{
			// Danger comes right under the name, above the target: it cannot be missed.
			OverlayText.line(c, s.isDangerInside() ? "⚠ DANGER - you are in the zone!" : "⚠ WARNING", OsrsPathDangerOverlay.DANGER, fm, inner);
			OverlayText.line(c, s.getDanger(), OsrsPathDangerOverlay.DANGER, fm, inner);
		}
		if (s.getHealth() != null)
		{
			OverlayText.line(c, s.getHealth(), s.isHealthCritical() ? OsrsPathDangerOverlay.DANGER : WARN, fm, inner);
		}
		if (s.getGoal() != null && !s.getGoal().isEmpty())
		{
			OverlayText.line(c, s.getGoal(), TEXT, fm, inner);
		}
		if (s.getAction() != null)
		{
			OverlayText.line(c, s.getAction(), GOOD, fm, inner);
		}
		if (s.getDistance() != null)
		{
			OverlayText.line(c, s.getDistance(), s.isNear() ? GOOD : DISTANCE, fm, inner);
		}
		if (s.getPacing() != null)
		{
			OverlayText.line(c, s.getPacing(), s.isPacingGood() ? ALMOST : TEXT, fm, inner);
		}
		if (s.getBag() != null)
		{
			OverlayText.line(c, s.getBag(), s.isBagReady() ? GOOD : WARN, fm, inner);
		}
		if (s.getUpgrade() != null)
		{
			OverlayText.line(c, s.getUpgrade(), UPGRADE, fm, inner);
		}
	}

	/** The standard RuneLite plate background with the transparency from the settings. */
	static Color background(int opacityPercent)
	{
		Color c = ComponentConstants.STANDARD_BACKGROUND_COLOR;
		int alpha = Math.max(0, Math.min(255, Math.round(opacityPercent * 2.55f)));
		return new Color(c.getRed(), c.getGreen(), c.getBlue(), alpha);
	}
}
