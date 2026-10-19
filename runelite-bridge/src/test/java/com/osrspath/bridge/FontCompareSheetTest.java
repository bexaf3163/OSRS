package com.osrspath.bridge;

import static org.junit.Assert.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.Test;

/**
 * The owner's font re-check (Task 5): the in-game card's text drawn the way the plugin draws it - Java2D on the game canvas, grayscale anti-aliasing,
 * the card's sizes (14 px body, 16 px bold action; 18 / 20 px at the large scale) - for the faces that can be shipped (Sora, Inter: SIL OFL, both in
 * public/fonts) and, for reference, Windows' Segoe UI and Java's Dialog. Two things Java2D does to a variable font are shown side by side:
 *  - the bold action line is the Regular outline made heavier by the renderer (Java2D cannot pick the font's 600/700 instance), and
 *  - with fractional metrics off (the plugin's setting) every letter's advance is rounded to a whole pixel, so the spacing of a wide face goes uneven.
 * Writes build/font-compare/*.png for the owner to choose from. Nothing in the plugin changes here.
 */
public class FontCompareSheetTest
{
	private static final String[] LINES = {
		"Fight the cows on Accurate until Attack 40",
		"Cow field east of Lumbridge · 31 / 746 cows",
		"Bring food: 24 Salmon (2 in the bag)",
		"Raising coins: 12 / 27 Cowhide · 1,400 gp to go",
	};

	private static Font load(String path) throws Exception
	{
		File f = new File(path);
		if (!f.exists()) return null;
		return Font.createFont(Font.TRUETYPE_FONT, f);
	}

	private static Font resource(String name) throws Exception
	{
		try (InputStream in = GuideFont.class.getResourceAsStream(name))
		{
			return in == null ? null : Font.createFont(Font.TRUETYPE_FONT, in);
		}
	}

	/** One candidate: a face, whether the action line is synthetic bold or the same weight one size up, and the metrics mode. */
	private static final class Variant
	{
		final String label;
		final Font face;
		final boolean syntheticBold;
		final boolean fractional;

		Variant(String label, Font face, boolean syntheticBold, boolean fractional)
		{
			this.label = label;
			this.face = face;
			this.syntheticBold = syntheticBold;
			this.fractional = fractional;
		}
	}

	private static int card(Graphics2D g, Variant v, float scale, int x, int y, int width)
	{
		Font body = v.face.deriveFont(Font.PLAIN, (float) Math.max(10, Math.round(14 * scale)));
		Font action = v.syntheticBold
			? body.deriveFont(Font.BOLD, (float) Math.round(body.getSize2D() * 1.14f))
			: body.deriveFont(Font.PLAIN, (float) Math.round(body.getSize2D() * 1.14f));
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, v.fractional ? RenderingHints.VALUE_FRACTIONALMETRICS_ON : RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
		FontMetrics am = GuideFont.metrics(g, action);
		FontMetrics bm = GuideFont.metrics(g, body);
		int pad = Math.round(10 * scale);
		int height = pad * 2 + am.getHeight() + bm.getHeight() * (LINES.length - 1) + 4;
		g.setColor(new Color(16, 29, 41, 235));
		g.fillRoundRect(x, y, width, height, 12, 12);
		g.setColor(new Color(255, 255, 255, 36));
		g.drawRoundRect(x, y, width - 1, height - 1, 12, 12);
		int baseline = y + pad + am.getAscent();
		g.setColor(Color.WHITE);
		GuideFont.draw(g, LINES[0], action, x + pad, baseline);
		baseline += am.getDescent() + 4 + bm.getAscent();
		for (int i = 1; i < LINES.length; i++)
		{
			g.setColor(i == 2 ? new Color(255, 214, 120) : new Color(205, 214, 226));
			GuideFont.draw(g, LINES[i], body, x + pad, baseline);
			baseline += bm.getHeight();
		}
		return height;
	}

	@Test public void writesTheComparisonSheets() throws Exception
	{
		Font sora = resource("fonts/Sora-variable.ttf");
		assertNotNull("the packaged Sora", sora);
		Font inter = load("../public/fonts/Inter-variable.ttf");
		List<Variant> variants = new ArrayList<>();
		variants.add(new Variant("A  Sora, as shipped (bold made by Java, whole-pixel spacing)", sora, true, false));
		variants.add(new Variant("B  Sora, exact spacing (fractional metrics on)", sora, true, true));
		variants.add(new Variant("C  Sora, exact spacing, action line not thickened", sora, false, true));
		if (inter != null)
		{
			variants.add(new Variant("D  Inter, as Sora is shipped", inter, true, false));
			variants.add(new Variant("E  Inter, exact spacing", inter, true, true));
			variants.add(new Variant("F  Inter, exact spacing, action line not thickened", inter, false, true));
		}
		Font segoe = new Font("Segoe UI", Font.PLAIN, 14);
		if ("Segoe UI".equals(segoe.getFamily())) variants.add(new Variant("R1 Segoe UI (Windows' own: reference, cannot be shipped)", segoe, true, true));
		variants.add(new Variant("R2 Dialog (Java's default sans: reference)", new Font(Font.DIALOG, Font.PLAIN, 14), true, false));

		File dir = new File("build/font-compare");
		assertTrue(dir.isDirectory() || dir.mkdirs());
		for (float scale : new float[] {1f, OsrsPathHudOverlay.LARGE})
		{
			int width = Math.round(430 * scale);
			BufferedImage probe = new BufferedImage(10, 10, BufferedImage.TYPE_INT_ARGB);
			Graphics2D pg = probe.createGraphics();
			int total = 16;
			for (Variant v : variants) total += 26 + card(pg, v, scale, 0, 0, width) + 18;
			pg.dispose();
			BufferedImage img = new BufferedImage(width + 32, total, BufferedImage.TYPE_INT_RGB);
			Graphics2D g = img.createGraphics();
			// A mid-tone game-like background, so the card's edges and the text weight read as they do over the world.
			g.setPaint(new GradientPaint(0, 0, new Color(74, 86, 60), 0, total, new Color(58, 52, 40)));
			g.fillRect(0, 0, img.getWidth(), img.getHeight());
			int y = 16;
			for (Variant v : variants)
			{
				g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
				g.setFont(new Font(Font.DIALOG, Font.BOLD, 12));
				g.setColor(new Color(255, 255, 255, 220));
				g.drawString(v.label, 16, y + 14);
				y += 26;
				y += card(g, v, scale, 16, y, width) + 18;
			}
			g.dispose();
			File out = new File(dir, scale == 1f ? "fonts-compare-normal.png" : "fonts-compare-large.png");
			ImageIO.write(img, "png", out);
			assertTrue(out.length() > 0);
		}
	}
}
