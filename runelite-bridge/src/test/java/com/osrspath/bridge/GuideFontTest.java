package com.osrspath.bridge;

import static org.junit.Assert.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import org.junit.Test;

public class GuideFontTest
{
	@Test public void packagedTypefaceIsInterAndScaleIsIndependentOfGameFont()
	{
		assertEquals("Inter", GuideFont.font(1).getFamily());
		assertEquals(14, GuideFont.font(1).getSize());
		assertEquals(13, GuideFont.font(OsrsPathGuideOverlay.SMALL).getSize());
		assertEquals(18, GuideFont.font(OsrsPathHudOverlay.LARGE).getSize());
		assertEquals("Inter", GuideFont.action(GuideFont.font(1)).getFamily());
		assertEquals(16, GuideFont.action(GuideFont.font(1)).getSize());
		assertTrue(GuideFont.action(GuideFont.font(1)).isBold());
	}

	@Test public void unsupportedIconUsesTheSameMeasuredAdvanceAsItsFallback()
	{
		Graphics2D g = new BufferedImage(500, 100, BufferedImage.TYPE_INT_ARGB).createGraphics();
		Font f = GuideFont.font(1);
		assertFalse(f.canDisplay('⚡'));
		int expected = g.getFontMetrics(f).stringWidth("Detour ") + g.getFontMetrics(new Font(Font.DIALOG, Font.PLAIN, 14)).stringWidth("⚡")
			+ g.getFontMetrics(f).stringWidth(" to the bank");
		assertEquals(expected, GuideFont.metrics(g, f).stringWidth("Detour ⚡ to the bank"));
		GuideFont.draw(g, "Detour ⚡ to the bank", f, 0, GuideFont.metrics(g, f).getAscent());
		g.dispose();
	}
}
