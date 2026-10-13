package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.Rectangle;
import java.util.ArrayList;
import java.util.List;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;
import net.runelite.client.ui.overlay.components.LineComponent;

/** A prominent band for the existing critical HUD messages; it makes no readiness decisions. */
final class OverlayAlert implements LayoutableRenderableEntity
{
	private final List<LineComponent> lines = new ArrayList<>();
	private final Font font;
	private Point location = new Point();
	private Dimension preferred;
	private final Rectangle bounds = new Rectangle();

	OverlayAlert(String text, FontMetrics fm, int width)
	{
		font = fm.getFont();
		preferred = new Dimension(width, 0);
		for (String line : OverlayText.wrap(text, fm, Math.max(20, width - 12)))
		{
			lines.add(LineComponent.builder().left(line).leftColor(new Color(255, 237, 237)).leftFont(font).build());
		}
	}

	@Override public void setPreferredLocation(Point point) { location = point; }
	@Override public void setPreferredSize(Dimension size) { preferred = size; }
	@Override public Rectangle getBounds() { return bounds; }

	@Override
	public Dimension render(Graphics2D g)
	{
		int height = 12 + lines.size() * g.getFontMetrics(font).getHeight();
		g.setColor(new Color(110, 27, 34, 225));
		g.fillRoundRect(location.x, location.y, preferred.width, height, 6, 6);
		g.setColor(new Color(245, 90, 98));
		g.drawRoundRect(location.x, location.y, Math.max(0, preferred.width - 1), height - 1, 6, 6);
		int y = location.y + 6;
		for (LineComponent line : lines)
		{
			line.setPreferredLocation(new Point(location.x + 6, y));
			line.setPreferredSize(new Dimension(Math.max(20, preferred.width - 12), 0));
			y += line.render(g).height;
		}
		int paintedHeight = Math.max(height, y - location.y + 6);
		bounds.setBounds(location.x, location.y, preferred.width, paintedHeight);
		return new Dimension(preferred.width, paintedHeight);
	}
}
