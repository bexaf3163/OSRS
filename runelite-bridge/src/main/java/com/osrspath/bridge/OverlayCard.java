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
 * The look of the plugin plates: the app's Ledger, a leather card with a gold frame and a coloured strip on the left (the colour
 * is the state: gold, green, red). Instead of PanelComponent's flat brownish background.
 *
 * The card is drawn before the panel, by its size from the previous frame, the same way PanelComponent draws its own background.
 * The size changes only with the contents, that is once per game tick, and a one-frame difference is not visible.
 */
final class OverlayCard
{
	static final int RADIUS = 12;
	/** The width of the coloured strip on the left. */
	static final int BAR = 3;
	private static final Color TRACK = new Color(255, 255, 255, 38);

	/** State accents: the same colours as the plate text. */
	static final Color GOLD = Hud.TITLE;
	static final Color GREEN = Hud.GOOD;
	static final Color AMBER = Hud.WARN;
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

	/** A card of size w x h from the top-left corner (RuneLite has already moved the canvas to the plate), nearly opaque. */
	static void paint(Graphics2D g, int w, int h, Color accent, int opacityPercent)
	{
		if (w <= 2 || h <= 2)
		{
			return;
		}
		Graphics2D c = (Graphics2D) g.create();
		try
		{
			c.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			int a = Math.max(alpha(opacityPercent), 236);
			Shape card = new RoundRectangle2D.Float(0.5f, 0.5f, w - 1, h - 1, RADIUS, RADIUS);
			c.setPaint(new GradientPaint(0, 0, withAlpha(LedgerGuide.LEATHER, a), 0, h, withAlpha(LedgerGuide.LEATHER_DARK, a)));
			c.fill(card);
			if (accent != null)
			{
				c.setClip(card);
				c.setColor(accent);
				c.fillRect(0, 0, BAR, h);
				c.setClip(null);
			}
			c.setColor(new Color(201, 162, 75, 45));
			c.draw(new RoundRectangle2D.Float(3.5f, 3.5f, w - 7, h - 7, RADIUS - 3, RADIUS - 3));
			c.setColor(LedgerGuide.GOLD_DARK);
			c.setStroke(new BasicStroke(1f));
			c.draw(card);
		}
		finally
		{
			c.dispose();
		}
	}

	/** A thin progress bar: "stage 3 of 9", "collected 4 of 6". */
	static final class Bar implements LayoutableRenderableEntity
	{
		static final int HEIGHT = 9;
		private static final int THICK = 4;

		private final double fraction;
		private final int segments;
		private final Color color;
		@Setter
		private Point preferredLocation = new Point();
		@Setter
		private Dimension preferredSize = new Dimension();
		private final java.awt.Rectangle bounds = new java.awt.Rectangle();

		Bar(double fraction, Color color)
		{
			this(fraction, color, 0);
		}

		Bar(double fraction, Color color, int segments)
		{
			this.segments = Math.max(0, Math.min(segments, 32));
			this.fraction = Math.max(0, Math.min(1, fraction));
			this.color = color;
		}

		@Override
		public Dimension render(Graphics2D g)
		{
			if (segments > 0) {
				int gap = 3;
				for (int i = 0; i < segments; i++) {
					int left = i * preferredSize.width / segments;
					int right = (i + 1) * preferredSize.width / segments;
					paint(g, preferredLocation.x + left, preferredLocation.y, Math.max(1, right - left - gap), i < Math.round(fraction * segments) ? 1 : 0, color);
				}
			} else paint(g, preferredLocation.x, preferredLocation.y, preferredSize.width, fraction, color);
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
