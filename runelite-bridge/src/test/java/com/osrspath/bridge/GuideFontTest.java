package com.osrspath.bridge;

import static org.junit.Assert.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import org.junit.Test;

public class GuideFontTest
{
	@Test public void theHudFacesAreTheAppsLedgerFaces()
	{
		assertEquals("Cinzel", LedgerFont.display(15.5f).getFamily());
		assertEquals("EB Garamond", LedgerFont.text(14.5f).getFamily());
		assertEquals(15, LedgerFont.text(14.5f).getSize());
		assertEquals(18, LedgerFont.text(14.5f * Hud.LARGE).getSize());
	}

	@Test public void unsupportedIconUsesTheSameMeasuredAdvanceAsItsFallback()
	{
		Graphics2D g = new BufferedImage(500, 100, BufferedImage.TYPE_INT_ARGB).createGraphics();
		Font f = LedgerFont.text(14);
		assertFalse(f.canDisplay('⚡'));
		int expected = g.getFontMetrics(f).stringWidth("Detour ") + g.getFontMetrics(new Font(Font.DIALOG, Font.PLAIN, 14)).stringWidth("⚡")
			+ g.getFontMetrics(f).stringWidth(" to the bank");
		assertEquals(expected, GuideFont.metrics(g, f).stringWidth("Detour ⚡ to the bank"));
		GuideFont.draw(g, "Detour ⚡ to the bank", f, 0, GuideFont.metrics(g, f).getAscent());
		g.dispose();
	}
}
