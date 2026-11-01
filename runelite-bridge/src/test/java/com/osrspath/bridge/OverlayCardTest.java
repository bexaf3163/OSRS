package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import org.junit.Test;

/** The plugin plates' Ledger card: the state strip on the left, and a fill that stays readable at any opacity setting. */
public class OverlayCardTest
{
	private static BufferedImage draw(Color accent, int opacity)
	{
		BufferedImage img = new BufferedImage(200, 80, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		OverlayCard.paint(g, 200, 80, accent, opacity);
		g.dispose();
		return img;
	}

	@Test
	public void theStripOnTheLeftIsTheStateColour()
	{
		for (Color accent : new Color[]{OverlayCard.GOLD, OverlayCard.GREEN, OverlayCard.RED})
		{
			assertEquals(accent.getRGB(), draw(accent, 75).getRGB(1, 40));
		}
		assertNotEquals("no strip without a state", OverlayCard.GOLD.getRGB(), draw(null, 75).getRGB(1, 40));
	}

	@Test
	public void theFillStaysNearlyOpaqueAtLowOpacity()
	{
		int alpha = draw(OverlayCard.GOLD, 0).getRGB(100, 40) >>> 24;
		assertTrue("the text stays readable over a bright scene: " + alpha, alpha >= 236);
		assertEquals("a fully opaque setting is honoured", 255, draw(OverlayCard.GOLD, 100).getRGB(100, 40) >>> 24);
	}

	@Test
	public void tinySizesDoNotThrow()
	{
		BufferedImage img = new BufferedImage(10, 10, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		OverlayCard.paint(g, 2, 2, OverlayCard.RED, 75);
		OverlayCard.paint(g, 6, 6, OverlayCard.RED, 75);
		g.dispose();
	}
}
