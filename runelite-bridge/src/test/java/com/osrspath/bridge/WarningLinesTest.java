package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.Collections;
import org.junit.Test;

/** A warning on the card is read whole: in a live session "Do not board the ship without it: Elvarg's fire hits…" lost its reason to the ellipsis. */
public class WarningLinesTest
{
	private static final String TEXT = "No Anti-dragon shield with you — Do not board the ship without it: Elvarg's fire hits up to 70. Duke Horacio in Lumbridge Castle gives it free.";

	private static OsrsPathGuideOverlay.Row row(HudModel.Tone tone)
	{
		Font font = GuideFont.font(1f);
		Font small = GuideFont.font(OsrsPathGuideOverlay.SMALL);
		Graphics2D g = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
		FontMetrics fm = g.getFontMetrics(font);
		FontMetrics sm = g.getFontMetrics(small);
		HudModel.Line line = HudModel.Line.small(HudModel.Icon.WARN, TEXT, tone);
		return OsrsPathGuideOverlay.lineRow(OsrsPathGuideOverlay.Part.LINE, line, fm, sm, font, small, OsrsPathGuideOverlay.MIN_WIDTH, 0);
	}

	@Test
	public void aWarningKeepsItsWholeTextAtTheNarrowestCard()
	{
		for (HudModel.Tone tone : new HudModel.Tone[]{HudModel.Tone.CAUTION, HudModel.Tone.DANGER})
		{
			OsrsPathGuideOverlay.Row r = row(tone);
			String shown = String.join(" ", r.getTexts());
			assertFalse(tone + ": " + shown, shown.endsWith("…"));
			assertTrue(tone + ": " + shown, shown.contains("hits up to 70"));
			assertTrue("within the warning limit", r.getTexts().size() <= OsrsPathGuideOverlay.WARNING_LINES);
		}
	}

	@Test
	public void theCollapsedCardsWarningIsWholeToo()
	{
		HudModel.Line w = HudModel.Line.small(HudModel.Icon.WARN, TEXT, HudModel.Tone.DANGER);
		HudModel.Card c = new HudModel.Card(HudModel.Icon.GO, HudModel.Tone.TEXT, "Board the Lady Lumbridge", null, null, 0, w, null, null,
			Collections.emptyList(), Collections.emptyList(), Collections.emptyList(), Collections.emptyList());
		OsrsPathGuideOverlay.Layout l = HudRenderTest.layout(c, false, false, OsrsPathGuideOverlay.MIN_WIDTH, 1f, 400);
		OsrsPathGuideOverlay.Row r = l.getRows().stream().filter(x -> x.getPart() == OsrsPathGuideOverlay.Part.WARNING).findFirst().orElseThrow(AssertionError::new);
		String shown = String.join(" ", r.getTexts());
		assertFalse(shown, shown.endsWith("…"));
		assertTrue(shown, shown.contains("gives it free"));
	}

	@Test
	public void anOrdinaryLineIsStillClippedWithItsTextInTheHint()
	{
		OsrsPathGuideOverlay.Row r = row(HudModel.Tone.MUTED);
		assertEquals(3, r.getTexts().size());
		assertTrue(r.getTexts().get(2).endsWith("…"));
		assertTrue(r.getHint().contains("hits up to 70"));
	}
}
