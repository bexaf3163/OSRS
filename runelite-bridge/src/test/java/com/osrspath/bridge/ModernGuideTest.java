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
}
