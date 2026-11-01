package com.osrspath.bridge;

import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;

/** Text drawing for the HUD faces: a glyph the face lacks (an icon) uses a local fallback only for that glyph. */
final class GuideFont
{
	private static final java.util.Map<java.util.List<Object>, FontMetrics> METRICS = new java.util.HashMap<>();

	private static Font fallback(Font font)
	{
		return new Font(Font.DIALOG, font.getStyle(), font.getSize());
	}

	static synchronized FontMetrics metrics(Graphics2D g, Font font)
	{
		FontMetrics base = g.getFontMetrics(font);
		java.util.List<Object> key = java.util.Arrays.asList(font, base.getFontRenderContext());
		FontMetrics cached = METRICS.get(key);
		if (cached != null) return cached;
		FontMetrics icons = g.getFontMetrics(fallback(font));
		FontMetrics result = new FontMetrics(font)
		{
			@Override public java.awt.font.FontRenderContext getFontRenderContext() { return base.getFontRenderContext(); }
			@Override public int getAscent() { return Math.max(base.getAscent(), icons.getAscent()); }
			@Override public int getDescent() { return Math.max(base.getDescent(), icons.getDescent()); }
			@Override public int getLeading() { return base.getLeading(); }
			@Override public int getHeight() { return getAscent() + getDescent() + getLeading(); }
			@Override public int stringWidth(String text)
			{
				if (font.canDisplayUpTo(text) == -1) return base.stringWidth(text);
				int width = 0, start = 0;
				for (int i = 0; i < text.length();)
				{
					int cp = text.codePointAt(i), end = i + Character.charCount(cp);
					if (!font.canDisplay(cp))
					{
						width += base.stringWidth(text.substring(start, i)) + icons.stringWidth(text.substring(i, end));
						start = end;
					}
					i = end;
				}
				return width + base.stringWidth(text.substring(start));
			}
		};
		if (METRICS.size() > 32) METRICS.clear();
		METRICS.put(key, result);
		return result;
	}

	static void draw(Graphics2D g, String text, Font font, int x, int baseline)
	{
		if (font.canDisplayUpTo(text) == -1)
		{
			g.setFont(font); g.drawString(text, x, baseline); return;
		}
		FontMetrics base = g.getFontMetrics(font);
		Font other = fallback(font);
		int start = 0;
		for (int i = 0; i < text.length();)
		{
			int cp = text.codePointAt(i), end = i + Character.charCount(cp);
			if (!font.canDisplay(cp))
			{
				String run = text.substring(start, i);
				g.setFont(font); g.drawString(run, x, baseline); x += base.stringWidth(run);
				String icon = text.substring(i, end);
				g.setFont(other); g.drawString(icon, x, baseline); x += g.getFontMetrics().stringWidth(icon);
				start = end;
			}
			i = end;
		}
		g.setFont(font);
		g.drawString(text.substring(start), x, baseline);
	}
}
