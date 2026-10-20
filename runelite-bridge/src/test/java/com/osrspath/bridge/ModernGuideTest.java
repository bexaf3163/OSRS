package com.osrspath.bridge;

import static org.junit.Assert.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.*;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.Test;

/**
 * The quest stage on the one HUD (2.74.0), drawn with the real face: a warning once in every state, the stage line as the action and not repeated, the way
 * there in its place, the recovery after a death said once. The cases come from the live game (S3-04 Below Ice Mountain).
 */
public class ModernGuideTest
{
	private StepGuide.View view(PrepPlan prep)
	{
		ActiveTarget.StageLine line = new ActiveTarget.StageLine();
		line.setT("Defeat the Ancient Guardian or mine 4 pillars (Mining 10)");
		line.setS(line.getT());
		return new StepGuide.View("[S3-04] Below Ice Mountain", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null,
			new StepGuide.StageView(7, 8, Collections.singletonList(line), 0, false, "Keep the required supplies with you.", false), prep);
	}

	private static Hud.State far()
	{
		return HudModelTest.state("~167 tiles ↙", 167);
	}

	/** Every text drawn on the card, row by row. */
	private static String drawn(OsrsPathGuideOverlay.Layout l)
	{
		StringBuilder sb = new StringBuilder();
		for (OsrsPathGuideOverlay.Row r : l.getRows())
		{
			sb.append(String.join(" ", r.getTexts())).append('\n');
		}
		return sb.toString();
	}

	private static int count(String text, String part)
	{
		return text.split(java.util.regex.Pattern.quote(part), -1).length - 1;
	}

	@Test public void warningsAndCanonicalRequirementSurviveEveryDisclosureState()
	{
		HudModel.Card c = HudModel.build(HudModelTest.input(view(null), far(), null));
		for (boolean expanded : new boolean[]{false, true})
		for (boolean advice : new boolean[]{false, true})
		{
			OsrsPathGuideOverlay.Layout l = HudRenderTest.layout(c, expanded, advice, 300, 1f, 2000);
			String text = drawn(l);
			assertEquals("the warning is drawn once\n" + text, 1, count(text, "Keep the required supplies"));
			assertEquals("the distance once\n" + text, 1, count(text, "167 tiles"));
			assertEquals(300, l.getSize().width);
			if (expanded)
			{
				assertEquals("the action is not repeated as a details row\n" + text, 1, count(text, "Mining 10"));
			}
			assertTrue(text, text.startsWith("Defeat the Ancient Guardian\n"));
		}
	}

	/** The recovery mode after a death: one heading, in every disclosure state (seen twice in the live game before 2.72). */
	@Test public void theRecoveryWarningIsDrawnOnceInEveryState()
	{
		PrepPlan prep = new com.google.gson.Gson().fromJson("{\"stepId\":\"S3-04\",\"recovery\":{\"title\":\"You died: step S3-04 is far away (~10582 tiles)\",\"steps\":["
			+ "\"Collect the things left after the death\",\"Take what is missing: 4 items\",\"Go back to step S3-04\"]}}", PrepPlan.class);
		assertNull(prep.prepare());
		for (Hud.State s : new Hud.State[]{HudModelTest.quiet(), far()})
		for (boolean expanded : new boolean[]{false, true})
		for (boolean advice : new boolean[]{false, true})
		{
			HudModel.Card c = HudModel.build(HudModelTest.input(view(prep), s, null));
			String text = drawn(HudRenderTest.layout(c, expanded, advice, 300, 1f, 2000));
			assertEquals("expanded=" + expanded + " advice=" + advice + "\n" + text, 1, count(text, "You died"));
		}
	}

	@Test public void onlyAWholeAlternativeIsSetApart()
	{
		assertEquals(27, GuideList.alternativeAt("Defeat the Ancient Guardian or mine 4 pillars (Mining 10)"));
		assertEquals("a restriction after a colon is the instruction itself", -1, GuideList.alternativeAt("Kill the Temple Guardian (level 30): melee or ranged only"));
		assertEquals("an or inside a bracket", -1, GuideList.alternativeAt("Bring Drezel 50 unnoted essence (rune or pure)"));
		assertEquals(-1, GuideList.alternativeAt("Talk to Willow"));
		assertEquals(-1, GuideList.alternativeAt(null));
		assertEquals("a closed bracket before it is fine", 21, GuideList.alternativeAt("Use the rope (bought) or ask Ned"));
	}

	/** The faster way the app suggests: usable now (green), or what to get for it first (amber). Drawn with the real face. */
	private static PrepPlan travelPlan(boolean prepare)
	{
		String ready = "{\"type\":\"item_teleport\",\"destination\":\"by Champions' Guild\",\"interactionId\":0,\"item\":\"Chronicle\",\"state\":\"check\","
			+ "\"summary\":\"Use Chronicle → Champions' Guild · saves ~36 s · check charges\","
			+ "\"text\":\"Teleport: Chronicle to Champions' Guild (saves ~119 tiles, about 36 s)\",\"chip\":\"⚡ Use Chronicle → Champions' Guild\"}";
		String stop = "{\"type\":\"spell_teleport\",\"destination\":\"Varrock Square\",\"interactionId\":0,\"tile\":{\"x\":3093,\"y\":3243,\"plane\":0},"
			+ "\"state\":\"prepare\",\"summary\":\"Varrock Teleport saves ~1 min: withdraw Law rune, Air rune ×3 at Draynor Bank\","
			+ "\"text\":\"Varrock Teleport (saves ~200 tiles, about 1 min). Missing: Law rune, Air rune ×3. Withdraw Law rune, Air rune ×3 at Draynor Bank.\","
			+ "\"chip\":\"⚡ Withdraw Law rune, Air rune ×3 at Draynor Bank\"}";
		PrepPlan p = new com.google.gson.Gson().fromJson("{\"stepId\":\"S3-04\",\"lines\":[],\"later\":[],\"recommendedTransport\":" + (prepare ? stop : ready) + "}", PrepPlan.class);
		assertNull(p.prepare());
		return p;
	}

	@Test public void theFasterWayIsOneLine_inItsPlace_andTheQuestStaysTheAction() throws Exception
	{
		for (boolean prepare : new boolean[]{false, true})
		{
			HudModel.Card c = HudModel.build(HudModelTest.input(view(travelPlan(prepare)), far(), null));
			assertEquals("the quest instruction stays the card's action", "Defeat the Ancient Guardian", c.getHeadline());
			String closed = c.plain(false, false);
			assertFalse("not on the closed card: " + closed, closed.contains("Chronicle") || closed.contains("Varrock Teleport"));
			List<HudModel.Line> where = prepare ? c.getAdvice() : c.getNow();
			assertEquals("one line for the way: " + where, 1, where.stream().filter(l -> l.getAction().getKind() == GuideList.Kind.TRANSPORT).count());
			String text = where.stream().filter(l -> l.getAction().getKind() == GuideList.Kind.TRANSPORT).findFirst().get().getText();
			assertTrue(text, text.startsWith(prepare ? "Varrock Teleport saves ~1 min: withdraw Law rune" : "Use Chronicle → Champions' Guild"));
			OsrsPathGuideOverlay.Layout l = HudRenderTest.layout(c, true, true, 300, 1f, 2000);
			File out = new File("build/overlay-render/hud-quest-travel-" + (prepare ? "prepare" : "ready") + ".png");
			out.getParentFile().mkdirs();
			ImageIO.write(HudRenderTest.paint(l), "png", out);
		}
	}

	/** The layout only measures: laying the card out paints nothing, and the card is drawn at the size it measured. */
	@Test public void theLayoutMeasuresWithoutPainting()
	{
		HudModel.Card c = HudModel.build(HudModelTest.input(view(travelPlan(true)), far(), null));
		BufferedImage image = new BufferedImage(400, 400, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = image.createGraphics();
		Font font = GuideFont.font(1f);
		OsrsPathGuideOverlay.Layout l = OsrsPathGuideOverlay.layout(c, true, false, g, font, GuideFont.font(OsrsPathGuideOverlay.SMALL),
			GuideFont.font(OsrsPathGuideOverlay.HEAD), 300, 2000);
		for (int y = 0; y < image.getHeight(); y++)
		{
			for (int x = 0; x < image.getWidth(); x++)
			{
				assertEquals("nothing is painted by the layout", 0, image.getRGB(x, y));
			}
		}
		OsrsPathGuideOverlay.paint(g, l, null, 85);
		g.dispose();
		int painted = 0;
		for (int y = 0; y < image.getHeight(); y++)
		{
			for (int x = 0; x < image.getWidth(); x++)
			{
				if (image.getRGB(x, y) != 0)
				{
					assertTrue("painted inside the measured card at " + x + "," + y, x < l.getSize().width && y < l.getSize().height);
					painted++;
				}
			}
		}
		assertTrue(painted > 1000);
	}
}
