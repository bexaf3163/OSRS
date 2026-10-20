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
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.Test;

/**
 * The one HUD laid out and painted with the real face (Sora) at the widths and text sizes a player can set: every row and every button stays inside the
 * card, no text runs past its edge, the closed card stays small, the open one stays within its share of the window, and the brief's texts are not cut.
 * Pictures for the eye: build/overlay-render/hud-*.png.
 */
public class HudRenderTest
{
	private static final int[] WIDTHS = {OsrsPathGuideOverlay.MIN_WIDTH, OsrsPathGuideOverlay.WIDTH, OsrsPathGuideOverlay.MAX_WIDTH};
	private static final float[] SCALES = {1f, Hud.LARGE};
	/** 60 % of the fixed-mode game (503 pixels high) and of a 1080p resizable one. */
	private static final int[] MAX_HEIGHTS = {(int) (503 * OsrsPathGuideOverlay.MAX_HEIGHT_SHARE), (int) (1050 * OsrsPathGuideOverlay.MAX_HEIGHT_SHARE)};

	/** The cards of the brief and of the screenshots, by name. */
	static Map<String, HudModel.Card> cards()
	{
		Map<String, HudModel.Card> out = new LinkedHashMap<>();
		String s403 = "[S4-03] Attack to 40 and bank 50 Big bones";
		StepGuide.ItemLine salmonBag = HudModelTest.salmon(StepGuide.Have.BAG, 21, 30);
		StepGuide.ItemLine scimitar = HudModelTest.item("Adamant scimitar", StepGuide.Have.BAG, 1, 1, 0, 1, null, false);
		HudModel.Input training = HudModelTest.with(HudModelTest.input(HudModelTest.view(s403, null, scimitar, salmonBag), HudModelTest.quiet(), HudModelTest.attack(30)),
			"planNext", "Fight the Hill Giants until 50 Big bones are in the bank: Edgeville Dungeon.");
		out.put("training", HudModel.build(training));
		PrepPlan food = HudModelTest.plan(HudModelTest.line("Salmon", 21, "BANK", "CRITICAL", "NOW", "CRITICAL", "Take from the bank ×21"),
			HudModelTest.line("Iron chainbody", 1, "BANK", "OPTIMIZATION", "NOW", null, "Take from the bank"));
		StepGuide.ItemLine chain = HudModelTest.item("Iron chainbody", StepGuide.Have.BANK, 0, 1, 1, 0, null, false);
		out.put("food", HudModel.build(HudModelTest.with(HudModelTest.input(HudModelTest.view(s403, food, scimitar, HudModelTest.salmon(StepGuide.Have.BANK, 0, 30), chain),
			HudModelTest.quiet(), HudModelTest.attack(30)), "planNext", "Fight the Hill Giants until 50 Big bones are in the bank: Edgeville Dungeon.")));
		out.put("unknown-bank", HudModel.build(HudModelTest.input(HudModelTest.view(s403, null, HudModelTest.salmon(StepGuide.Have.UNKNOWN, 0, -1)),
			HudModelTest.state("~229 tiles ↘", 229), HudModelTest.attack(30))));
		Hud.State danger = new Hud.State(null, null, "~12 tiles ↑", false, null, false, "Hill Giants (level 28) hit up to 8 here: keep food with you", true, null, false,
			null, "HP 7/24 - EAT NOW! Hits up to 8", true, null, 12, null, 0.4, true, "No Salmon left - bank now", true);
		out.put("danger", HudModel.build(HudModelTest.input(HudModelTest.view(s403, null, scimitar), danger, HudModelTest.attack(31))));
		out.put("stage", HudModel.build(HudModelTest.input(HudModelTest.princeAli(1, false), HudModelTest.quiet(), null)));
		PrepPlan advice = new com.google.gson.Gson().fromJson("{\"stepId\":\"S4-03\",\"lines\":[],\"later\":[\"Lobster ×20\",\"Anti-dragon shield\"],"
			+ "\"weight\":\"Leave the logs: 18 kg slows the run\",\"slots\":\"The bag is full by 3 slots: leave the Oak logs\",\"activeDetour\":{"
			+ "\"text\":\"Bank: Withdraw Hammer at Varrock West Bank (+60 tiles, saves ~84 s)\",\"label\":\"Varrock West Bank\","
			+ "\"targetTile\":{\"x\":3185,\"y\":3436,\"plane\":0},\"costTiles\":60,\"actionType\":\"WITHDRAW\"},"
			+ "\"recommendedTransport\":{\"type\":\"Item teleport\",\"destination\":\"Falador\",\"interactionId\":0,\"item\":\"Falador teleport\","
			+ "\"tile\":{\"x\":2965,\"y\":3378,\"plane\":0},\"text\":\"Falador teleport saves ~120 tiles\"},"
			+ "\"bankWithdrawals\":[{\"itemId\":8007,\"itemName\":\"Falador teleport\",\"quantity\":2}]}", PrepPlan.class);
		assertNull(advice.prepare());
		Hud.State upgrade = new Hud.State(null, null, null, false, null, false, null, false, null, false, "Wear Iron chainbody - it is in the bank", null, false,
			null, -1, null, null, false, null, false);
		out.put("advice", HudModel.build(HudModelTest.input(HudModelTest.view(s403, advice, scimitar, salmonBag), upgrade, HudModelTest.attack(30))));
		out.put("funding", HudModel.build(HudModelTest.with(HudModelTest.input(HudModelTest.view(s403, null), HudModelTest.quiet(), HudModelTest.attack(30)), "funding",
			new HudModel.Funding("Kill cows and sell the cowhides at the Grand Exchange", "12 / 27 Cowhide", true))));
		Preflight.Block pb = new Preflight.Block("Salmon", 21, 3, Preflight.Via.BANK, null, 3117, 9856, 0);
		out.put("preflight", HudModel.build(HudModelTest.with(HudModelTest.input(HudModelTest.view(s403, null), HudModelTest.quiet(), HudModelTest.attack(30)),
			"preflight", pb)));
		return out;
	}

	private static Graphics2D scratch()
	{
		Graphics2D g = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
		return g;
	}

	static OsrsPathGuideOverlay.Layout layout(HudModel.Card c, boolean expanded, boolean advice, int width, float scale, int maxHeight)
	{
		Graphics2D g = scratch();
		try
		{
			return OsrsPathGuideOverlay.layout(c, expanded, advice, g, GuideFont.font(scale), GuideFont.font(scale * OsrsPathGuideOverlay.SMALL),
				GuideFont.font(scale * OsrsPathGuideOverlay.HEAD), OsrsPathGuideOverlay.width(Math.round(width * scale), scale), maxHeight);
		}
		finally
		{
			g.dispose();
		}
	}

	@Test
	public void everyRowAndButtonIsInsideTheCard_andNoTextRunsOut()
	{
		Graphics2D g = scratch();
		List<String> bad = new ArrayList<>();
		int checked = 0;
		for (Map.Entry<String, HudModel.Card> e : cards().entrySet())
		{
			assertNotNull(e.getKey(), e.getValue());
			for (int width : WIDTHS)
			{
				for (float scale : SCALES)
				{
					for (int maxHeight : MAX_HEIGHTS)
					{
						for (boolean[] state : new boolean[][] {{false, false}, {true, false}, {true, true}})
						{
							OsrsPathGuideOverlay.Layout l = layout(e.getValue(), state[0], state[1], width, scale, maxHeight);
							String at = e.getKey() + " w" + width + " x" + scale + " h" + maxHeight + (state[0] ? " open" : " closed") + (state[1] ? "+advice" : "");
							Rectangle card = new Rectangle(0, 0, l.getSize().width, l.getSize().height);
							int bottom = 0;
							for (OsrsPathGuideOverlay.Row r : l.getRows())
							{
								checked++;
								if (!card.contains(r.getBox()))
								{
									bad.add(at + ": " + r.getPart() + " " + r.getBox() + " outside " + card.getSize() + " " + r.getTexts());
								}
								if (r.getBox().y < bottom - 1)
								{
									bad.add(at + ": " + r.getPart() + " overlaps the row above " + r.getTexts());
								}
								bottom = Math.max(bottom, r.getBox().y + r.getBox().height);
								FontMetrics fm = GuideFont.metrics(g, r.getFont());
								int right = l.getSize().width - OsrsPathGuideOverlay.PAD_X + 2 - (r.getRight() == null ? 0 : fm.stringWidth(r.getRight()) + 6);
								for (String t : r.getTexts())
								{
									if (r.getTextX() + fm.stringWidth(t) > right)
									{
										bad.add(at + ": text runs out (" + (r.getTextX() + fm.stringWidth(t)) + " > " + right + "): " + t);
									}
								}
							}
							if (state[0] && l.getSize().height > maxHeight)
							{
								bad.add(at + ": open card " + l.getSize().height + " px, more than " + maxHeight);
							}
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
	public void theClosedCardStaysSmall_andItsWordsAreWhole()
	{
		for (Map.Entry<String, HudModel.Card> e : cards().entrySet())
		{
			for (float scale : SCALES)
			{
				OsrsPathGuideOverlay.Layout l = layout(e.getValue(), false, false, OsrsPathGuideOverlay.WIDTH, scale, MAX_HEIGHTS[0]);
				int limit = Math.round((e.getValue().getWarning() == null ? 135 : 170) * scale);
				assertTrue(e.getKey() + " x" + scale + ": " + l.getSize().height + " px > " + limit, l.getSize().height <= limit);
				for (OsrsPathGuideOverlay.Row r : l.getRows())
				{
					for (String t : r.getTexts())
					{
						assertFalse(e.getKey() + " x" + scale + ": cut " + r.getTexts(), t.endsWith("…"));
					}
				}
			}
		}
	}

	@Test
	public void theClosedCardHasOneButton_theHeader()
	{
		for (Map.Entry<String, HudModel.Card> e : cards().entrySet())
		{
			OsrsPathGuideOverlay.Layout l = layout(e.getValue(), false, false, OsrsPathGuideOverlay.WIDTH, 1f, MAX_HEIGHTS[0]);
			List<GuideList.Kind> buttons = new ArrayList<>();
			for (OsrsPathGuideOverlay.Row r : l.getRows())
			{
				if (r.getAction().isClickable())
				{
					buttons.add(r.getAction().getKind());
				}
			}
			assertEquals(e.getKey(), Collections.singletonList(GuideList.Kind.TOGGLE), buttons);
			assertEquals(OsrsPathGuideOverlay.Part.HEADER, l.getRows().get(0).getPart());
		}
	}

	@Test
	public void theOpenCardIsCutWithAPointer_neverPastItsShare()
	{
		HudModel.Card c = cards().get("advice");
		OsrsPathGuideOverlay.Layout tall = layout(c, true, true, OsrsPathGuideOverlay.MIN_WIDTH, Hud.LARGE, 200);
		assertTrue(tall.getSize().height <= 200);
		OsrsPathGuideOverlay.Row last = tall.getRows().get(tall.getRows().size() - 1);
		assertEquals("More in the OSRS Path panel on the right", String.join(" ", last.getTexts()));
	}

	@Test
	public void aHintComesWithEveryButtonAndEveryCutLine()
	{
		for (Map.Entry<String, HudModel.Card> e : cards().entrySet())
		{
			OsrsPathGuideOverlay.Layout l = layout(e.getValue(), true, true, OsrsPathGuideOverlay.MIN_WIDTH, Hud.LARGE, 2000);
			for (OsrsPathGuideOverlay.Row r : l.getRows())
			{
				boolean cut = !r.getTexts().isEmpty() && r.getTexts().get(r.getTexts().size() - 1).endsWith("…");
				if (r.getAction().isClickable() || cut)
				{
					assertNotNull(e.getKey() + ": " + r.getTexts(), r.getHint());
				}
				if (r.getAction().isClickable() || r.getHint() != null)
				{
					Rectangle b = r.getBox();
					assertEquals(e.getKey(), r, OsrsPathGuideOverlay.rowAt(l, b.x + 3, b.y + b.height / 2));
				}
			}
			assertNull("outside the rows: no hint, no button", OsrsPathGuideOverlay.rowAt(l, -5, -5));
		}
	}

	@Test
	public void theWidthKeepsToItsLimits()
	{
		assertEquals(OsrsPathGuideOverlay.MIN_WIDTH, OsrsPathGuideOverlay.width(100, 1f));
		assertEquals(OsrsPathGuideOverlay.MAX_WIDTH, OsrsPathGuideOverlay.width(2000, 1f));
		assertEquals(310, OsrsPathGuideOverlay.width(310, 1f));
		assertEquals(Math.round(OsrsPathGuideOverlay.MIN_WIDTH * Hud.LARGE), OsrsPathGuideOverlay.width(100, Hud.LARGE));
	}

	@Test
	public void theFacesAreRegular_noSyntheticBold()
	{
		OsrsPathGuideOverlay.Layout l = layout(cards().get("food"), true, true, OsrsPathGuideOverlay.WIDTH, 1f, 2000);
		for (OsrsPathGuideOverlay.Row r : l.getRows())
		{
			assertEquals(r.getPart() + " " + r.getTexts(), Font.PLAIN, r.getFont().getStyle());
		}
	}

	/** The pictures: closed and open, the preparation and warning states, over a game-like ground. */
	@Test
	public void exportThePictures() throws IOException
	{
		File dir = new File("build/overlay-render");
		assertTrue(dir.isDirectory() || dir.mkdirs());
		for (Map.Entry<String, HudModel.Card> e : cards().entrySet())
		{
			for (boolean[] state : new boolean[][] {{false, false}, {true, false}, {true, true}})
			{
				OsrsPathGuideOverlay.Layout l = layout(e.getValue(), state[0], state[1], OsrsPathGuideOverlay.WIDTH, 1f, MAX_HEIGHTS[1]);
				BufferedImage img = paint(l);
				String name = "hud-" + e.getKey() + (state[0] ? state[1] ? "-advice" : "-open" : "-closed") + ".png";
				ImageIO.write(img, "png", new File(dir, name));
			}
		}
	}

	/** The card painted on a patch of grass-green ground with a 12-pixel margin, as it stands in the game. */
	static BufferedImage paint(OsrsPathGuideOverlay.Layout l)
	{
		int m = 12;
		BufferedImage img = new BufferedImage(l.getSize().width + 2 * m, l.getSize().height + 2 * m, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setColor(new Color(74, 96, 52));
		g.fillRect(0, 0, img.getWidth(), img.getHeight());
		g.setColor(new Color(92, 112, 64));
		for (int x = 0; x < img.getWidth(); x += 9)
		{
			g.drawLine(x, 0, x + 40, img.getHeight());
		}
		g.translate(m, m);
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
		OsrsPathGuideOverlay.paint(g, l, null, 85);
		g.dispose();
		return img;
	}

	@Test
	public void thePaintedCardIsOpaque_theGroundDoesNotShowThrough()
	{
		OsrsPathGuideOverlay.Layout l = layout(cards().get("training"), false, false, OsrsPathGuideOverlay.WIDTH, 1f, MAX_HEIGHTS[0]);
		BufferedImage img = paint(l);
		// A point inside the card away from text: the fill, not the green ground.
		Color c = new Color(img.getRGB(12 + l.getSize().width - 4, 12 + l.getSize().height - 4));
		assertTrue(c.toString(), c.getGreen() < 50 && c.getRed() < 40);
		for (int lowOpacity : Arrays.asList(0, 30))
		{
			BufferedImage glass = new BufferedImage(l.getSize().width, l.getSize().height, BufferedImage.TYPE_INT_RGB);
			Graphics2D g = glass.createGraphics();
			g.setColor(Color.WHITE);
			g.fillRect(0, 0, glass.getWidth(), glass.getHeight());
			OsrsPathGuideOverlay.paint(g, l, null, lowOpacity);
			g.dispose();
			Color fill = new Color(glass.getRGB(l.getSize().width - 4, l.getSize().height - 4));
			assertTrue("even a low opacity setting keeps the card readable: " + fill, fill.getRed() < 40);
		}
	}
}
