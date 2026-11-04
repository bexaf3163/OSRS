package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.font.TextAttribute;
import java.awt.font.TextLayout;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * The app's faces on the Ledger HUD (SIL OFL, the owner's pick 2026-11-01): Cinzel for titles and labels, EB Garamond for the text, the
 * same families as the app's Ledger pages. Loaded once; a missing file falls back to the system serif, so guidance still shows.
 */
final class LedgerFont
{
	private static final Font DISPLAY = load("fonts/Cinzel-variable.ttf");
	private static final Font TEXT = load("fonts/EBGaramond-variable.ttf");

	private LedgerFont()
	{
	}

	private static Font load(String name)
	{
		try (InputStream in = LedgerFont.class.getResourceAsStream(name))
		{
			if (in != null) return Font.createFont(Font.TRUETYPE_FONT, in);
		}
		catch (Exception ignored)
		{
			// A damaged font resource must not prevent guidance.
		}
		return new Font(Font.SERIF, Font.PLAIN, 14);
	}

	static synchronized Font display(float size)
	{
		return DISPLAYS.computeIfAbsent(Math.round(size), s -> DISPLAY.deriveFont(Font.PLAIN, (float) s));
	}

	static synchronized Font text(float size)
	{
		return TEXTS.computeIfAbsent(Math.round(size), s -> TEXT.deriveFont(Font.PLAIN, (float) s));
	}

	/** Spaced capitals as in the app's stamps, tabs and section names; kept per size, since the card asks for them every frame. */
	static synchronized Font label(float size)
	{
		return LABELS.computeIfAbsent(Math.round(size * 2) / 2f, s ->
		{
			Map<TextAttribute, Object> a = new HashMap<>();
			a.put(TextAttribute.SIZE, s);
			a.put(TextAttribute.TRACKING, 0.18f);
			return DISPLAY.deriveFont(a);
		});
	}

	private static final Map<Integer, Font> DISPLAYS = new HashMap<>();
	private static final Map<Integer, Font> TEXTS = new HashMap<>();
	private static final Map<Float, Font> LABELS = new HashMap<>();

	static int advance(Graphics2D g, String s, Font f)
	{
		return (int) Math.ceil(new TextLayout(s, f, g.getFontRenderContext()).getAdvance());
	}

	/** Draws a label (TextLayout keeps the letter spacing); returns its width. */
	static int draw(Graphics2D g, String s, Font f, Color c, float x, float baseline)
	{
		TextLayout t = new TextLayout(s, f, g.getFontRenderContext());
		g.setColor(c);
		t.draw(g, x, baseline);
		return (int) Math.ceil(t.getAdvance());
	}
}
