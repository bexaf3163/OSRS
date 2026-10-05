package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.geom.RoundRectangle2D;
import lombok.Setter;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;

/**
 * The look of the plugin plates: a dark rounded card with a coloured strip on the left (the colour is the state: gold, green,
 * red) and a thin border. Instead of PanelComponent's flat brownish background.
 *
 * The card is drawn before the panel, by its size from the previous frame, the same way PanelComponent draws its own background.
 * The size changes only with the contents, that is once per game tick, and a one-frame difference is not visible.
 */
final class OverlayCard
{
	static final int RADIUS = 12;
	/** The width of the coloured strip on the left. */
	static final int BAR = 3;
	private static final Color TOP = new Color(32, 36, 49);
	private static final Color BOTTOM = new Color(15, 17, 24);
	private static final Color BORDER = new Color(255, 255, 255, 36);
	private static final Color TRACK = new Color(255, 255, 255, 38);

	/** The glass style: flat fill, never more see-through than this (of 255), a round corner, and the state dot in the left gutter of the text. */
	static final int GLASS_MIN_ALPHA = 190;
	static final int GLASS_RADIUS = 14;
	private static final Color GLASS_FILL = new Color(18, 22, 30);
	private static final Color GLASS_HIGHLIGHT = new Color(255, 255, 255, 30);
	static final int DOT = 5;
	static final int DOT_X = 3;
	static final int DOT_Y = 11;

	/** State accents: the same colours as the plate text. */
	static final Color GOLD = OsrsPathHudOverlay.TITLE;
	static final Color GREEN = OsrsPathHudOverlay.GOOD;
	static final Color AMBER = OsrsPathHudOverlay.WARN;
	static final Color RED = OsrsPathDangerOverlay.DANGER;
	static final Color BLUE = GuideList.LINK;

	private OverlayCard()
	{
	}

	static int alpha(int opacityPercent)
	{
		return Math.max(0, Math.min(255, Math.round(opacityPercent * 2.55f)));
	}

	private static Color withAlpha(Color c, int a)
	{
		return new Color(c.getRed(), c.getGreen(), c.getBlue(), a);
	}

	/** A card of size w x h from the top-left corner (RuneLite has already moved the canvas to the plate). */
	static void paint(Graphics2D g, int w, int h, Color accent, int opacityPercent)
	{
		paint(g, w, h, accent, opacityPercent, OsrsPathBridgeConfig.OverlayTheme.CLASSIC);
	}

	/** The same card in the chosen style. The text and its padding do not depend on the style, so the layout is the same. */
	static void paint(Graphics2D g, int w, int h, Color accent, int opacityPercent, OsrsPathBridgeConfig.OverlayTheme theme)
	{
		if (w <= 2 || h <= 2)
		{
			return;
		}
		Graphics2D c = (Graphics2D) g.create();
		try
		{
			c.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			if (theme == OsrsPathBridgeConfig.OverlayTheme.GLASS)
			{
				paintGlass(c, w, h, accent, opacityPercent);
				return;
			}
			int a = alpha(opacityPercent);
			Shape card = new RoundRectangle2D.Float(0.5f, 0.5f, w - 1, h - 1, RADIUS, RADIUS);
			c.setPaint(new GradientPaint(0, 0, withAlpha(TOP, a), 0, h, withAlpha(BOTTOM, a)));
			c.fill(card);
			if (accent != null)
			{
				c.setClip(card);
				c.setColor(accent);
				c.fillRect(0, 0, BAR, h);
				c.setClip(null);
			}
			c.setColor(BORDER);
			c.setStroke(new BasicStroke(1f));
			c.draw(card);
		}
		finally
		{
			c.dispose();
		}
	}

	/**
	 * The glass card: a flat translucent fill (never below GLASS_MIN_ALPHA, so the text stays readable over a bright scene), a soft wash of the state
	 * colour from the top, a 1 px highlight on the top edge, a border tinted by the state, and a dot with a halo in the left gutter instead of the strip.
	 * Java2D has no backdrop blur, so the "frost" is only the translucency.
	 */
	private static void paintGlass(Graphics2D c, int w, int h, Color accent, int opacityPercent)
	{
		int a = Math.max(alpha(opacityPercent), GLASS_MIN_ALPHA);
		Shape card = new RoundRectangle2D.Float(0.5f, 0.5f, w - 1, h - 1, GLASS_RADIUS, GLASS_RADIUS);
		c.setColor(withAlpha(GLASS_FILL, a));
		c.fill(card);
		c.setClip(card);
		if (accent != null)
		{
			c.setPaint(new GradientPaint(0, 0, withAlpha(accent, 40), 0, Math.max(1, h * 0.8f), withAlpha(accent, 0)));
			c.fillRect(0, 0, w, h);
		}
		c.setColor(GLASS_HIGHLIGHT);
		c.fillRect(GLASS_RADIUS / 2, 1, Math.max(0, w - GLASS_RADIUS), 1);
		c.setClip(null);
		c.setColor(accent == null ? BORDER : withAlpha(accent, 95));
		c.setStroke(new BasicStroke(1f));
		c.draw(card);
		if (accent != null)
		{
			c.setColor(withAlpha(accent, 60));
			c.fillOval(DOT_X - 2, DOT_Y - 2, DOT + 4, DOT + 4);
			c.setColor(accent);
			c.fillOval(DOT_X, DOT_Y, DOT, DOT);
		}
	}

	/** A thin progress bar: "stage 3 of 9", "collected 4 of 6". */
	static final class Bar implements LayoutableRenderableEntity
	{
		static final int HEIGHT = 9;
		private static final int THICK = 4;

		private final double fraction;
		private final Color color;
		@Setter
		private Point preferredLocation = new Point();
		@Setter
		private Dimension preferredSize = new Dimension();
		private final java.awt.Rectangle bounds = new java.awt.Rectangle();

		Bar(double fraction, Color color)
		{
			this.fraction = Math.max(0, Math.min(1, fraction));
			this.color = color;
		}

		@Override
		public Dimension render(Graphics2D g)
		{
			paint(g, preferredLocation.x, preferredLocation.y, preferredSize.width, fraction, color);
			bounds.setBounds(preferredLocation.x, preferredLocation.y, preferredSize.width, HEIGHT);
			return new Dimension(preferredSize.width, HEIGHT);
		}

		@Override
		public java.awt.Rectangle getBounds()
		{
			return bounds;
		}
	}

	/** A bar of the given width from the top-left corner (x, y) with the height {@link Bar#HEIGHT} including the padding. */
	static void paint(Graphics2D g, int x, int y, int width, double fraction, Color color)
	{
		if (width <= 4)
		{
			return;
		}
		Graphics2D c = (Graphics2D) g.create();
		try
		{
			c.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			int top = y + (Bar.HEIGHT - Bar.THICK) / 2;
			c.setColor(TRACK);
			c.fillRoundRect(x, top, width, Bar.THICK, Bar.THICK, Bar.THICK);
			int filled = (int) Math.round(width * Math.max(0, Math.min(1, fraction)));
			if (filled > 0)
			{
				c.setColor(color);
				c.fillRoundRect(x, top, Math.max(Bar.THICK, filled), Bar.THICK, Bar.THICK, Bar.THICK);
			}
		}
		finally
		{
			c.dispose();
		}
	}
}
