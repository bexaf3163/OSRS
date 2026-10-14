package com.osrspath.bridge;

import static org.junit.Assert.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.*;
import java.util.List;
import javax.imageio.ImageIO;
import net.runelite.client.ui.overlay.components.PanelComponent;
import org.junit.Test;

public class ModernGuideTest
{
	private StepGuide.View view(boolean advice)
	{
		ActiveTarget.StageLine line = new ActiveTarget.StageLine();
		line.setT("Defeat the Ancient Guardian or mine 4 pillars (Mining 10)");
		line.setS(line.getT());
		return new StepGuide.View("[S3-04] Below Ice Mountain", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null,
			new StepGuide.StageView(7, 8, Collections.singletonList(line), 0, false, "Keep the required supplies with you.", false), null, advice);
	}

	@Test public void warningsAndCanonicalRequirementSurviveEveryDisclosureState() throws Exception
	{
		for (boolean advice : new boolean[]{false, true})
		for (boolean collapsed : new boolean[]{false, true})
		for (int reveal : new int[]{0, GuideList.EXPAND_STEPS})
		{
			PanelComponent panel = new PanelComponent();
			BufferedImage image = new BufferedImage(500, 1200, BufferedImage.TYPE_INT_ARGB);
			Graphics2D g = image.createGraphics();
			g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			Font font = GuideFont.font(1f);
			Font small = GuideFont.font(OsrsPathGuideOverlay.SMALL);
			List<OsrsPathGuideOverlay.RowComponent> rows = OsrsPathGuideOverlay.build(panel, view(advice), collapsed, -1,
				GuideFont.metrics(g, font), GuideFont.metrics(g, small), font, small, 300, 85, false, true, reveal, "167 tiles");
			String text = GuideList.plain(rows.stream().map(OsrsPathGuideOverlay.RowComponent::getRow).collect(java.util.stream.Collectors.toList()));
			assertTrue(text, text.contains("Keep the required supplies"));
			assertEquals("the warning is drawn once\n" + text, 1, text.split("Keep the required supplies", -1).length - 1);
			if (!collapsed) {
				assertTrue(text, text.contains("Mining 10"));
				assertEquals("the action is not repeated as a Details row\n" + text, 1, text.split("Mining 10", -1).length - 1);
				assertEquals(1, text.split("167 tiles", -1).length - 1);
				assertEquals(1, rows.stream().filter(r -> r.getRow().getAction().getKind() == GuideList.Kind.TAB).count());
			}
			panel.render(g);
			Dimension size = panel.render(g);
			assertEquals(300, size.width);
			g.dispose();
		}
	}

	/** The recovery mode after a death is in the open list and in the alerts: one heading, in every disclosure state (seen twice in the live game). */
	@Test public void theRecoveryWarningIsDrawnOnceInEveryState()
	{
		PrepPlan prep = new com.google.gson.Gson().fromJson("{\"stepId\":\"S3-04\",\"recovery\":{\"title\":\"You died: step S3-04 is far away (~10582 tiles)\",\"steps\":["
			+ "\"Collect the things left after the death\",\"Take what is missing: 4 items\",\"Go back to step S3-04\"]}}", PrepPlan.class);
		ActiveTarget.StageLine line = new ActiveTarget.StageLine();
		line.setT("Defeat the Ancient Guardian or mine 4 pillars (Mining 10)");
		line.setS(line.getT());
		for (boolean advice : new boolean[]{false, true})
		for (boolean collapsed : new boolean[]{false, true})
		for (boolean compact : new boolean[]{false, true})
		for (int reveal : new int[]{0, GuideList.EXPAND_STEPS})
		{
			StepGuide.View v = new StepGuide.View("[S3-04] Below Ice Mountain", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null,
				new StepGuide.StageView(7, 8, Collections.singletonList(line), 0, false, null, false), prep, advice);
			Graphics2D g = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
			Font font = GuideFont.font(1f);
			Font small = GuideFont.font(OsrsPathGuideOverlay.SMALL);
			List<OsrsPathGuideOverlay.RowComponent> rows = OsrsPathGuideOverlay.build(new PanelComponent(), v, collapsed, -1,
				GuideFont.metrics(g, font), GuideFont.metrics(g, small), font, small, 300, 85, false, compact, reveal, null);
			String text = GuideList.plain(rows.stream().map(OsrsPathGuideOverlay.RowComponent::getRow).collect(java.util.stream.Collectors.toList()));
			String state = "advice=" + advice + " collapsed=" + collapsed + " compact=" + compact + " reveal=" + reveal + "\n" + text;
			assertEquals(state, 1, text.split("You died", -1).length - 1);
			g.dispose();
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

	@Test public void exportActualCompactAndExpandedRendering() throws Exception
	{
		for (int reveal : new int[]{0, GuideList.EXPAND_STEPS})
		{
			PanelComponent panel = new PanelComponent();
			panel.setBackgroundColor(new Color(0, 0, 0, 0));
			Graphics2D scratch = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
			scratch.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			Font font = GuideFont.font(1f);
			Font small = GuideFont.font(OsrsPathGuideOverlay.SMALL);
			StepGuide.View sample = view(false);
			sample = sample.withStage(sample.getStage().with(null, false, false));
			OsrsPathGuideOverlay.build(panel, sample, false, -1, GuideFont.metrics(scratch, font), GuideFont.metrics(scratch, small), font, small, 300, 94, false, true, reveal, "167 tiles");
			panel.render(scratch);
			Dimension size = panel.render(scratch);
			scratch.dispose();
			BufferedImage image = new BufferedImage(size.width, size.height, BufferedImage.TYPE_INT_ARGB);
			Graphics2D g = image.createGraphics();
			g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			OverlayCard.paintGuide(g, size.width, size.height, OsrsPathGuideOverlay.MODERN_LINK, 94, OsrsPathBridgeConfig.OverlayTheme.GLASS);
			panel.render(g);
			g.dispose();
			File out = new File("build/overlay-render/modern-" + (reveal == 0 ? "compact" : "expanded") + ".png");
			out.getParentFile().mkdirs();
			ImageIO.write(image, "png", out);
		}
	}

	/** The closed card with one travel line: the way that is shorter (green) or what to get for it first (amber). Rendered with the real fonts. */
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

	@Test public void theClosedCardCarriesExactlyOneTravelLineAboveTheTabs() throws Exception
	{
		for (boolean prepare : new boolean[]{false, true})
		{
			StepGuide.View v = view(false);
			v = v.withStage(v.getStage().with(null, false, false)).withPrep(travelPlan(prepare));
			PanelComponent panel = new PanelComponent();
			panel.setBackgroundColor(new Color(0, 0, 0, 0));
			Graphics2D scratch = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
			scratch.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			Font font = GuideFont.font(1f);
			Font small = GuideFont.font(OsrsPathGuideOverlay.SMALL);
			List<OsrsPathGuideOverlay.RowComponent> rows = OsrsPathGuideOverlay.build(panel, v, false, -1, GuideFont.metrics(scratch, font), GuideFont.metrics(scratch, small),
				font, small, 300, 94, false, true, 0, "167 tiles");
			List<GuideList.Kind> kinds = rows.stream().map(r -> r.getRow().getAction().getKind()).collect(java.util.stream.Collectors.toList());
			assertEquals("one travel line: " + kinds, 1, kinds.stream().filter(k -> k == GuideList.Kind.TRANSPORT).count());
			assertEquals("the travel line sits right above the tabs: " + kinds, kinds.indexOf(GuideList.Kind.TAB) - 1, kinds.indexOf(GuideList.Kind.TRANSPORT));
			String text = GuideList.plain(rows.stream().map(OsrsPathGuideOverlay.RowComponent::getRow).collect(java.util.stream.Collectors.toList())).replace('\n', ' ');
			assertTrue(text, text.contains(prepare ? "➜ Varrock Teleport saves ~1 min: withdraw Law rune" : "➜ Use Chronicle → Champions' Guild"));
			assertTrue("the quest instruction stays the card's action: " + text, text.contains("Defeat the Ancient Guardian"));
			panel.render(scratch);
			Dimension size = panel.render(scratch);
			scratch.dispose();
			BufferedImage image = new BufferedImage(size.width, size.height, BufferedImage.TYPE_INT_ARGB);
			Graphics2D g = image.createGraphics();
			g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			OverlayCard.paintGuide(g, size.width, size.height, OsrsPathGuideOverlay.MODERN_LINK, 94, OsrsPathBridgeConfig.OverlayTheme.GLASS);
			panel.render(g);
			g.dispose();
			File out = new File("build/overlay-render/modern-travel-" + (prepare ? "prepare" : "ready") + ".png");
			out.getParentFile().mkdirs();
			ImageIO.write(image, "png", out);
		}
	}

	/** The card background is measured before it is painted: a dry layout gives the size of the real one and paints nothing (live: rows outside the card for a frame). */
	@Test public void aDryLayoutMeasuresTheCardWithoutPainting()
	{
		StepGuide.View v = view(false);
		v = v.withStage(v.getStage().with(null, false, false)).withPrep(travelPlan(true));
		PanelComponent panel = new PanelComponent();
		panel.setBackgroundColor(new Color(0, 0, 0, 0));
		BufferedImage image = new BufferedImage(400, 400, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = image.createGraphics();
		Font font = GuideFont.font(1f);
		Font small = GuideFont.font(OsrsPathGuideOverlay.SMALL);
		OsrsPathGuideOverlay.build(panel, v, false, -1, GuideFont.metrics(g, font), GuideFont.metrics(g, small), font, small, 300, 94, false, true, 0,
			"Target is on the surface - get back up");
		Dimension dry = OsrsPathGuideOverlay.dryRun(g, panel::render);
		for (int y = 0; y < image.getHeight(); y++)
		{
			for (int x = 0; x < image.getWidth(); x++)
			{
				assertEquals("nothing is painted by the measuring pass", 0, image.getRGB(x, y));
			}
		}
		Dimension real = panel.render(g);
		g.dispose();
		assertEquals(real, dry);
		assertTrue("a wrapped heading makes the card taller than its closed size", dry.height > 100);
	}
}
