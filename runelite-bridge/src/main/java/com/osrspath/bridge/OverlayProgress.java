package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.Rectangle;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;

/**
 * The pace's progress bar under the HUD's pace line (the training view, 2.55.1): a bar with the percent centred in it. Drawn here and not with
 * RuneLite's ProgressBarComponent, whose label sat a point below the plate with the large RuneScape font (the layout test draws every font).
 */
final class OverlayProgress implements LayoutableRenderableEntity
{
	private static final Color BACK = new Color(40, 44, 52, 220);
	private static final Color SHADOW = new Color(0, 0, 0, 200);

	private final double share;
	private final Color fill;
	private final Font font;
	private Point location = new Point();
	private Dimension preferred;
	private final Rectangle bounds = new Rectangle();

	OverlayProgress(double share, Color fill, FontMetrics fm, int width)
	{
		this.share = Math.max(0, Math.min(1, share));
		this.fill = fill;
		this.font = fm.getFont();
		this.preferred = new Dimension(width, 0);
	}

	/** "79%": whole percents; 100% only when the goal is reached. */
	static String percent(double share)
	{
		int p = (int) Math.floor(Math.max(0, Math.min(1, share)) * 100);
		return p + "%";
	}

	@Override public void setPreferredLocation(Point point) { location = point; }
	@Override public void setPreferredSize(Dimension size) { preferred = size; }
	@Override public Rectangle getBounds() { return bounds; }

	@Override
	public Dimension render(Graphics2D g)
	{
		FontMetrics fm = g.getFontMetrics(font);
		// The text and its one-point shadow fit inside with room: three points above, at least two below.
		int height = fm.getHeight() + 6;
		int width = preferred.width;
		g.setColor(BACK);
		g.fillRoundRect(location.x, location.y, width, height, 4, 4);
		g.setColor(fill);
		g.fillRoundRect(location.x, location.y, (int) Math.round(width * share), height, 4, 4);
		String text = percent(share);
		g.setFont(font);
		int x = location.x + (width - fm.stringWidth(text)) / 2;
		int y = location.y + 3 + fm.getAscent();
		g.setColor(SHADOW);
		g.drawString(text, x + 1, y + 1);
		g.setColor(Hud.TEXT);
		g.drawString(text, x, y);
		bounds.setBounds(location.x, location.y, width, height);
		return new Dimension(width, height);
	}
}
