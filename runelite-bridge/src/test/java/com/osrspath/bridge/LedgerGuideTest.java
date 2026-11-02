package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.Test;

/**
 * The Ledger plaque laid out with its real faces at the widths and text sizes a player can set, under these rules:
 * every row inside, no text past its row, buttons apart and each with a hint, the closed plaque small, the open one within its share of the
 * window, every tab reachable. Pictures for the eye: build/overlay-render/ledger-*.png.
 */
public class LedgerGuideTest
{
	private static final int[] WIDTHS = {LedgerGuide.MIN_WIDTH, LedgerGuide.WIDTH, OsrsPathGuideOverlay.MAX_WIDTH};
	private static final float[] SCALES = {1f, Hud.LARGE};
	private static final int[] MAX_HEIGHTS = {(int) (503 * OsrsPathGuideOverlay.MAX_HEIGHT_SHARE), (int) (1050 * OsrsPathGuideOverlay.MAX_HEIGHT_SHARE)};
	static final int CLOSED = -1;
	private static final int[] STATES = {CLOSED, LedgerGuide.NOW, LedgerGuide.PREPARE, LedgerGuide.NEXT, LedgerGuide.ADVICE};

	private static Graphics2D scratch()
	{
		Graphics2D g = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
		return g;
	}

	static OsrsPathGuideOverlay.Layout layout(HudModel.Card c, int state, int width, float scale, int maxHeight)
	{
		Graphics2D g = scratch();
		try
		{
			return LedgerGuide.layout(c, state != CLOSED, Math.max(state, 0), g, scale, LedgerGuide.width(Math.round(width * scale), scale), maxHeight);
		}
		finally
		{
			g.dispose();
		}
	}

	@Test
	public void everyRowIsInside_noTextRunsOut_buttonsApartWithHints()
	{
		Graphics2D g = scratch();
		List<String> bad = new ArrayList<>();
		int checked = 0;
		for (Map.Entry<String, HudModel.Card> e : HudRenderTest.cards().entrySet())
		{
			for (int width : WIDTHS)
			{
				for (float scale : SCALES)
				{
					for (int maxHeight : MAX_HEIGHTS)
					{
						for (int state : STATES)
						{
							OsrsPathGuideOverlay.Layout l = layout(e.getValue(), state, width, scale, maxHeight);
							String at = e.getKey() + " w" + width + " x" + scale + " h" + maxHeight + " s" + state;
							Rectangle card = new Rectangle(0, 0, l.getSize().width, l.getSize().height);
							List<OsrsPathGuideOverlay.Row> buttons = new ArrayList<>();
							for (OsrsPathGuideOverlay.Row r : l.getRows())
							{
								checked++;
								if (!card.contains(r.getBox())) bad.add(at + ": " + r.getPart() + " " + r.getBox() + " outside " + card);
								if (r.getAction().isClickable() || r.getHint() != null) buttons.add(r);
								if (r.getAction().isClickable() && r.getHint() == null) bad.add(at + ": " + r.getPart() + " is a button without a hint");
								if (r.getFont().getStyle() != Font.PLAIN) bad.add(at + ": " + r.getPart() + " synthetic style");
								if (r.getPart() == OsrsPathGuideOverlay.Part.TAB)
								{
									boolean on = !r.getAction().isClickable();
									int need = Math.round(14 * scale) + (on ? 7 + LedgerFont.advance(g, r.getTexts().get(0), r.getFont()) : 0)
										+ (r.getRight() == null ? 0 : Math.round(22 * scale));
									if (need > r.getBox().width) bad.add(at + ": tab " + r.getTexts() + " needs " + need + " > " + r.getBox().width);
									continue;
								}
								if (r.getPart() == OsrsPathGuideOverlay.Part.LABEL) continue;
								FontMetrics fm = GuideFont.metrics(g, r.getFont());
								int rightW = r.getRight() == null ? 0 : fm.stringWidth(r.getRight()) + 8;
								int limit = r.getBox().x + r.getBox().width - rightW + 2;
								for (String t : r.getTexts())
								{
									if (r.getTextX() + fm.stringWidth(t) > limit) bad.add(at + ": text runs out (" + (r.getTextX() + fm.stringWidth(t)) + " > " + limit + "): " + t);
								}
							}
							for (int i = 0; i < buttons.size(); i++)
							{
								for (int j = i + 1; j < buttons.size(); j++)
								{
									if (buttons.get(i).getBox().intersects(buttons.get(j).getBox()))
										bad.add(at + ": " + buttons.get(i).getPart() + " overlaps " + buttons.get(j).getPart());
								}
							}
							int closedLimit = Math.round((e.getValue().getWarning() == null ? 135 : 170) * scale);
							if (state == CLOSED && l.getSize().height > closedLimit) bad.add(at + ": closed " + l.getSize().height + " > " + closedLimit);
							if (state != CLOSED && l.getSize().height > maxHeight) bad.add(at + ": open " + l.getSize().height + " > " + maxHeight);
							if (state == CLOSED && buttons.stream().filter(r -> r.getAction().isClickable()).count() != 1) bad.add(at + ": closed card has more buttons than the header");
						}
					}
				}
			}
		}
		g.dispose();
		assertTrue(checked > 1000);
		assertTrue(String.join("\n", bad), bad.isEmpty());
	}

	@Test
	public void theTabsSwitchSections_theOpenOneIsNotAButton_theFooterLeadsToNext()
	{
		OsrsPathGuideOverlay.Layout l = layout(HudRenderTest.cards().get("food"), LedgerGuide.NOW, LedgerGuide.WIDTH, 1f, 2000);
		List<Integer> tabs = new ArrayList<>();
		boolean footer = false;
		for (OsrsPathGuideOverlay.Row r : l.getRows())
		{
			if (r.getPart() == OsrsPathGuideOverlay.Part.TAB && r.getAction().isClickable())
			{
				assertEquals(GuideList.Kind.TAB, r.getAction().getKind());
				tabs.add(r.getAction().getPlace());
				Rectangle b = r.getBox();
				assertEquals(r, OsrsPathGuideOverlay.rowAt(l, b.x + b.width / 2, b.y + b.height / 2));
			}
			if (r.getPart() == OsrsPathGuideOverlay.Part.FOOT)
			{
				footer = true;
				assertEquals(GuideList.Action.tab(LedgerGuide.NEXT), r.getAction());
			}
		}
		assertTrue("the open Now tab is not a button: " + tabs, !tabs.contains(LedgerGuide.NOW));
		assertTrue(tabs.contains(LedgerGuide.PREPARE) && tabs.contains(LedgerGuide.NEXT));
		assertTrue("the Now page ends with the next step", footer);
	}

	@Test
	public void theOpenPlaqueIsCutWithAPointer_neverPastItsShare()
	{
		OsrsPathGuideOverlay.Layout tall = layout(HudRenderTest.cards().get("food"), LedgerGuide.NOW, LedgerGuide.MIN_WIDTH, Hud.LARGE, 230);
		assertTrue(tall.getSize().height <= 230);
		OsrsPathGuideOverlay.Row last = tall.getRows().get(tall.getRows().size() - 1);
		assertEquals("More in the OSRS Path panel on the right", String.join(" ", last.getTexts()));
	}

	/** The plaque painted on grass-green ground, as it stands in the game. */
	@Test
	public void exportThePictures() throws IOException
	{
		File dir = new File("build/overlay-render");
		assertTrue(dir.isDirectory() || dir.mkdirs());
		String[] names = {"closed", "now", "prepare", "next", "advice"};
		for (Map.Entry<String, HudModel.Card> e : HudRenderTest.cards().entrySet())
		{
			for (int s = 0; s < STATES.length; s++)
			{
				BufferedImage img = paint(layout(e.getValue(), STATES[s], LedgerGuide.WIDTH, 1f, MAX_HEIGHTS[1]), 85);
				ImageIO.write(img, "png", new File(dir, "ledger-" + e.getKey() + "-" + names[s] + ".png"));
			}
		}
	}

	@Test
	public void thePaintedPlaqueIsOpaque_theGroundDoesNotShowThrough()
	{
		OsrsPathGuideOverlay.Layout l = layout(HudRenderTest.cards().get("training"), CLOSED, LedgerGuide.WIDTH, 1f, 2000);
		BufferedImage img = new BufferedImage(l.getSize().width, l.getSize().height, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setColor(Color.WHITE);
		g.fillRect(0, 0, img.getWidth(), img.getHeight());
		LedgerGuide.paint(g, l, null, 0);
		g.dispose();
		Color fill = new Color(img.getRGB(l.getSize().width - 6, l.getSize().height - 6));
		assertTrue("even a low opacity setting keeps the plaque readable: " + fill, fill.getRed() < 60);
	}

	static BufferedImage paint(OsrsPathGuideOverlay.Layout l, int opacity)
	{
		int m = 12;
		BufferedImage img = new BufferedImage(l.getSize().width + 2 * m, l.getSize().height + 2 * m, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setColor(new Color(74, 96, 52));
		g.fillRect(0, 0, img.getWidth(), img.getHeight());
		g.setColor(new Color(92, 112, 64));
		for (int x = 0; x < img.getWidth(); x += 9) g.drawLine(x, 0, x + 40, img.getHeight());
		g.translate(m, m);
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
		LedgerGuide.paint(g, l, null, opacity);
		g.dispose();
		return img;
	}

	@Test
	public void theFooterSkipsANextLineThePageAlreadyShows()
	{
		// A detour: the next line is the step's own activity, titled like the step the Now page shows above.
		List<HudModel.Line> next = java.util.Arrays.asList(
			new HudModel.Line(HudModel.Icon.NEXT, "Ranged to 40: prepare your kit", null, HudModel.Tone.TEXT, false, GuideList.Action.NONE, null),
			new HudModel.Line(HudModel.Icon.GO, "Seagulls at Port Sarim", null, HudModel.Tone.LINK, true, GuideList.Action.NONE, null));
		HudModel.Card c = new HudModel.Card(HudModel.Icon.GO, HudModel.Tone.TEXT, "Get Iron arrow", "Iron arrow: 0 / 100", null, 0, null,
			"Then: Ranged to 40: prepare your kit", "S6-04 · Ranged to 40: prepare your kit", java.util.Collections.emptyList(),
			java.util.Collections.emptyList(), next, java.util.Collections.emptyList());
		OsrsPathGuideOverlay.Row foot = layout(c, LedgerGuide.NOW, LedgerGuide.WIDTH, 1f, 2000).getRows().stream()
			.filter(r -> r.getPart() == OsrsPathGuideOverlay.Part.FOOT).findFirst().orElse(null);
		assertEquals("Seagulls at Port Sarim", String.join(" ", foot.getTexts()));
	}

	@Test
	public void theClosedPlaqueKeepsItsWordsWhole()
	{
		for (Map.Entry<String, HudModel.Card> e : HudRenderTest.cards().entrySet())
		{
			for (float scale : SCALES)
			{
				for (OsrsPathGuideOverlay.Row r : layout(e.getValue(), CLOSED, LedgerGuide.WIDTH, scale, MAX_HEIGHTS[0]).getRows())
				{
					for (String t : r.getTexts())
					{
						assertFalse(e.getKey() + " x" + scale + ": cut " + r.getTexts(), t.endsWith("..."));
					}
				}
			}
		}
	}

	@Test
	public void aHintComesWithEveryButtonAndEveryCutLine()
	{
		for (Map.Entry<String, HudModel.Card> e : HudRenderTest.cards().entrySet())
		{
			for (int state : STATES)
			{
				OsrsPathGuideOverlay.Layout l = layout(e.getValue(), state, LedgerGuide.MIN_WIDTH, Hud.LARGE, 2000);
				for (OsrsPathGuideOverlay.Row r : l.getRows())
				{
					boolean cut = !r.getTexts().isEmpty() && r.getTexts().get(r.getTexts().size() - 1).endsWith("...");
					if (r.getAction().isClickable() || cut)
					{
						assertNotNull(e.getKey() + " " + state + ": " + r.getTexts(), r.getHint());
					}
					if (r.getAction().isClickable() || r.getHint() != null)
					{
						Rectangle b = r.getBox();
						assertEquals(e.getKey() + " " + state, r, OsrsPathGuideOverlay.rowAt(l, b.x + 3, b.y + b.height / 2));
					}
				}
				assertNull("outside the rows: no hint, no button", OsrsPathGuideOverlay.rowAt(l, -5, -5));
			}
		}
	}

	@Test
	public void theWidthKeepsToItsLimits()
	{
		assertEquals(LedgerGuide.MIN_WIDTH, LedgerGuide.width(100, 1f));
		assertEquals(OsrsPathGuideOverlay.MAX_WIDTH, LedgerGuide.width(2000, 1f));
		assertEquals(310, LedgerGuide.width(310, 1f));
		assertEquals(Math.round(LedgerGuide.MIN_WIDTH * Hud.LARGE), LedgerGuide.width(100, Hud.LARGE));
	}
}
