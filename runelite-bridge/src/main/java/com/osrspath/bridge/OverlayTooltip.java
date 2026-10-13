package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.geom.RoundRectangle2D;
import java.util.List;

/**
 * The explanation of a list line, shown beside the plate instead of inside it: the plate keeps its size and place while the mouse moves over it,
 * and the text never covers the line it explains. It goes to the right of the plate, or to the left when there is no room, or under / over it,
 * and is always kept inside the canvas. Drawing is plain Java2D, like the plate.
 */
final class OverlayTooltip
{
	/** The text width of a tip, so a long explanation becomes a few lines instead of a wide strip across the game. */
	static final int TEXT_WIDTH = 220;
	static final int PAD = 6;
	static final int GAP = 6;
	private static final Color FILL = new Color(18, 22, 30);
	private static final Color BORDER = new Color(255, 255, 255, 70);
	private static final Color TEXT = new Color(235, 235, 235);

	private OverlayTooltip()
	{
	}

	/**
	 * The rectangle for a tip of {@code size}: beside the plate at the height of the line it explains, inside {@code canvas}. All the rectangles are in
	 * one coordinate system. The plate itself is never covered unless the canvas is too small for any other place.
	 */
	static Rectangle place(Rectangle plate, Rectangle line, Dimension size, Rectangle canvas)
	{
		int w = Math.min(size.width, canvas.width);
		int h = Math.min(size.height, canvas.height);
		int y = clamp(line.y, canvas.y, canvas.y + canvas.height - h);
		int right = plate.x + plate.width + GAP;
		if (right + w <= canvas.x + canvas.width)
		{
			return new Rectangle(right, y, w, h);
		}
		int left = plate.x - GAP - w;
		if (left >= canvas.x)
		{
			return new Rectangle(left, y, w, h);
		}
		// Neither side has room (a narrow canvas or a plate pushed to the edge): under the plate, else over it, kept horizontally inside.
		int x = clamp(plate.x, canvas.x, canvas.x + canvas.width - w);
		int below = plate.y + plate.height + GAP;
		if (below + h <= canvas.y + canvas.height)
		{
			return new Rectangle(x, below, w, h);
		}
		int above = plate.y - GAP - h;
		return new Rectangle(x, Math.max(canvas.y, above), w, h);
	}

	private static int clamp(int v, int lo, int hi)
	{
		return Math.max(lo, Math.min(v, Math.max(lo, hi)));
	}

	/** The size a tip needs for the wrapped lines. */
	static Dimension size(List<String> lines, FontMetrics fm)
	{
		int w = 0;
		for (String l : lines)
		{
			w = Math.max(w, fm.stringWidth(l));
		}
		return new Dimension(w + PAD * 2, lines.size() * fm.getHeight() + PAD * 2);
	}

	/** The text of a tip split to {@link #TEXT_WIDTH}, with the same word wrapping the plate uses. */
	static List<String> wrap(String text, FontMetrics fm)
	{
		return OverlayText.wrap(text, fm, TEXT_WIDTH);
	}

	/** Draws the tip into {@code at} (the same coordinates as the graphics). */
	static void paint(Graphics2D g, Rectangle at, List<String> lines, Font font)
	{
		Graphics2D c = (Graphics2D) g.create();
		try
		{
			c.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			RoundRectangle2D box = new RoundRectangle2D.Float(at.x + 0.5f, at.y + 0.5f, at.width - 1, at.height - 1, 8, 8);
			c.setColor(FILL);
			c.fill(box);
			c.setColor(BORDER);
			c.setStroke(new BasicStroke(1f));
			c.draw(box);
			c.setFont(font);
			c.setColor(TEXT);
			FontMetrics fm = GuideFont.metrics(c, font);
			int y = at.y + PAD + fm.getAscent();
			for (String l : lines)
			{
				GuideFont.draw(c, l, font, at.x + PAD, y);
				y += fm.getHeight();
			}
		}
		finally
		{
			c.dispose();
		}
	}
}
