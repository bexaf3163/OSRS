package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import javax.imageio.ImageIO;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/**
 * The glass plate style: a flat translucent fill that stays readable, the state dot instead of the strip, and the same size and text padding as the
 * classic one. Pictures for the eye are in build/overlay-render/glass-*.png.
 */
public class GlassCardTest
{
	private static final OsrsPathBridgeConfig.OverlayTheme GLASS = OsrsPathBridgeConfig.OverlayTheme.GLASS;
	private static final OsrsPathBridgeConfig.OverlayTheme CLASSIC = OsrsPathBridgeConfig.OverlayTheme.CLASSIC;
	private static final File OUT = new File("build/overlay-render");

	private static BufferedImage draw(OsrsPathBridgeConfig.OverlayTheme theme, Color accent, int opacity)
	{
		BufferedImage img = new BufferedImage(200, 80, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		OverlayCard.paint(g, 200, 80, accent, opacity, theme);
		g.dispose();
		return img;
	}

	private static int alphaAt(BufferedImage img, int x, int y)
	{
		return (img.getRGB(x, y) >>> 24) & 0xFF;
	}

	@Test
	public void theClassicOverloadIsUnchanged_theStripIsTheAccent()
	{
		BufferedImage old = new BufferedImage(200, 80, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = old.createGraphics();
		OverlayCard.paint(g, 200, 80, OverlayCard.GOLD, 75);
		g.dispose();
		BufferedImage classic = draw(CLASSIC, OverlayCard.GOLD, 75);
		for (int y = 0; y < 80; y += 7)
		{
			for (int x = 0; x < 200; x += 5)
			{
				assertEquals("classic is what the five-argument paint draws, at " + x + "," + y, old.getRGB(x, y), classic.getRGB(x, y));
			}
		}
		assertEquals(OverlayCard.GOLD.getRGB(), classic.getRGB(1, 40));
	}

	@Test
	public void glassHasNoStripAndNeverGoesMoreSeeThroughThanTheFloor()
	{
		BufferedImage glass = draw(GLASS, OverlayCard.GOLD, 20);
		assertNotEquals("no coloured strip on the left edge in the glass style", OverlayCard.GOLD.getRGB(), glass.getRGB(1, 40));
		assertTrue("the fill keeps at least the floor of opacity so the text stays readable: " + alphaAt(glass, 100, 40),
			alphaAt(glass, 100, 40) >= OverlayCard.GLASS_MIN_ALPHA);
		BufferedImage solid = draw(GLASS, OverlayCard.GOLD, 100);
		assertEquals("a fully opaque setting is honoured", 255, alphaAt(solid, 100, 70));
	}

	@Test
	public void theStateDotSitsInTheTextGutterInTheAccentColour()
	{
		for (Color accent : new Color[] {OverlayCard.GOLD, OverlayCard.GREEN, OverlayCard.RED})
		{
			BufferedImage glass = draw(GLASS, accent, 75);
			int cx = OverlayCard.DOT_X + OverlayCard.DOT / 2;
			int cy = OverlayCard.DOT_Y + OverlayCard.DOT / 2;
			assertEquals("the dot centre is the state colour", accent.getRGB(), glass.getRGB(cx, cy));
			assertTrue("the dot ends before the text starts", OverlayCard.DOT_X + OverlayCard.DOT + 2 <= OverlayText.PAD_LEFT);
		}
	}

	@Test
	public void aCardWithoutAnAccentHasNoDot()
	{
		BufferedImage glass = draw(GLASS, null, 75);
		int cx = OverlayCard.DOT_X + OverlayCard.DOT / 2;
		int cy = OverlayCard.DOT_Y + OverlayCard.DOT / 2;
		assertTrue("only the dark fill there", ((glass.getRGB(cx, cy) >> 8) & 0xFF) < 60);
	}

	@Test
	public void tinySizesDoNotThrow()
	{
		draw(GLASS, OverlayCard.RED, 75);
		BufferedImage img = new BufferedImage(10, 10, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		OverlayCard.paint(g, 2, 2, OverlayCard.RED, 75, GLASS);
		OverlayCard.paint(g, 6, 6, OverlayCard.RED, 75, GLASS);
		g.dispose();
	}

	@Test
	public void theConfigDefaultsToGlass_underANewStableKey() throws Exception
	{
		assertEquals(GLASS, new OsrsPathBridgeConfig() { }.overlayTheme());
		ConfigItem item = OsrsPathBridgeConfig.class.getMethod("overlayTheme").getAnnotation(ConfigItem.class);
		assertEquals("overlayTheme", item.keyName());
		assertEquals("Glass", GLASS.toString());
		assertEquals("Classic", CLASSIC.toString());
	}

	/** A picture for the eye: the same plate in both styles over a bright scene and a dark one. Not asserted. */
	@Test
	public void picturesForTheEye() throws IOException
	{
		OUT.mkdirs();
		BufferedImage img = new BufferedImage(900, 330, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setColor(new Color(176, 150, 98));
		g.fillRect(0, 0, 450, 330);
		g.setColor(new Color(40, 78, 36));
		g.fillRect(450, 0, 450, 330);
		Font font = FontManager.getRunescapeSmallFont();
		g.setFont(font);
		OsrsPathBridgeConfig.OverlayTheme[] themes = {CLASSIC, GLASS};
		Color[] accents = {OverlayCard.GOLD, OverlayCard.GREEN, OverlayCard.RED};
		String[] text = {"S2-10 Prince Ali Rescue", "Bag ready - go", "Danger: aggressive goblins"};
		for (int col = 0; col < 2; col++)
		{
			for (int i = 0; i < 3; i++)
			{
				Graphics2D c = (Graphics2D) g.create();
				c.translate(20 + col * 450, 20 + i * 100);
				OverlayCard.paint(c, 190, 80, accents[i], 75, themes[col]);
				c.setFont(font);
				c.setColor(Color.WHITE);
				c.drawString(text[i], OverlayText.PAD_LEFT, 22);
				c.setColor(new Color(230, 230, 230));
				c.drawString(themes[col] + " style", OverlayText.PAD_LEFT, 42);
				c.dispose();
			}
		}
		g.dispose();
		ImageIO.write(img, "png", new File(OUT, "glass-vs-classic.png"));
	}
}
