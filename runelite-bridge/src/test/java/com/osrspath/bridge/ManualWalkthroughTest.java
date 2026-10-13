package com.osrspath.bridge;

import static org.junit.Assert.*;
import com.google.gson.Gson;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.List;
import java.util.stream.Collectors;
import javax.imageio.ImageIO;
import net.runelite.client.ui.overlay.components.PanelComponent;
import org.junit.Test;

/**
 * A quest the app has no stage data for (Shield of Arrav) is not an empty guide: in the live game it showed only "Reldo, ~7 tiles" from the first
 * line to the last. Its walkthrough lines become one stage that the player moves through with "done". The lines are the real ones, as the app sends them.
 */
public class ManualWalkthroughTest
{
	private static ActiveTarget arrav()
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (s.name.equals("S3-05"))
			{
				assertNull(s.target.prepare());
				return s.target;
			}
		}
		throw new AssertionError("S3-05 is not among the targets the app sends");
	}

	@Test public void theQuestWithoutStageDataGetsItsWholeWalkthrough()
	{
		ActiveTarget t = arrav();
		ActiveTarget.Stage stage = t.getGuide().getStage();
		assertNotNull("the walkthrough stands in for the missing stages", stage);
		assertTrue(stage.isManual());
		List<ActiveTarget.StageLine> lines = stage.getStages().get(0).getSteps();
		assertEquals("no line of the quick path is lost (two paragraphs used to be over the size limit and were dropped)", t.getGuide().getSteps().size(), lines.size());
		String all = lines.stream().map(ActiveTarget.StageLine::getT).collect(Collectors.joining("\n"));
		for (String must : new String[]{"Reldo", "Baraek", "Straven", "Jonny the beard", "Katrine", "Weaponsmaster", "Haig Halen", "King Roald"})
		{
			assertTrue(must + "\n" + all, all.contains(must));
		}
		assertNull("preparing the same target again changes nothing", t.prepare());
		assertSame(stage, t.getGuide().getStage());
	}

	@Test public void onlyAQuestWithoutStagesIsTouched()
	{
		Gson gson = new Gson();
		ActiveTarget skill = gson.fromJson("{\"stepId\":\"S1-08\",\"title\":\"Train\",\"completionTrigger\":{\"type\":\"SKILL_LEVEL\",\"levels\":[{\"skill\":\"attack\",\"level\":5}]},"
			+ "\"guide\":{\"steps\":[\"Kill chickens\",\"Bank the feathers\"]}}", ActiveTarget.class);
		assertNull(skill.prepare());
		assertNull("a training step keeps its own list of items and places", skill.getGuide().getStage());
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			assertNull(s.name, s.target.prepare());
			ActiveTarget.Stage st = s.target.getGuide() == null ? null : s.target.getGuide().getStage();
			assertEquals(s.name + ": only Shield of Arrav has no stage data", s.name.startsWith("S3-05"), st != null && st.isManual());
		}
	}

	@Test public void theGuideShowsTheLineAndCountsLinesNotStages()
	{
		ActiveTarget t = arrav();
		int n = t.getGuide().getSteps().size();
		StepGuide.View v = StepGuide.view(t, new ItemCounts(), new ItemCounts(), null, 0, 0, 0, null, 0, false, 3);
		assertNotNull(v.getStage());
		assertEquals(4, v.getStage().getIndex());
		assertEquals(n, v.getStage().getTotal());
		assertTrue("the list is drawn, not only the small target plate", GuideList.worthShowing(v));
		Graphics2D g = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
		FontMetrics fm = GuideFont.metrics(g, GuideFont.font(1f));
		String core = GuideList.plain(GuideList.coreRows(v, fm, 300));
		g.dispose();
		assertTrue(core, core.contains("[4/" + n + "]") && core.contains("Choose a gang"));
		StepGuide.View done = StepGuide.view(t, new ItemCounts(), new ItemCounts(), null, 0, 0, 0, null, 0, true, 3);
		assertTrue("the game says the quest is complete: the walkthrough is over", done.getStage().isFinished());
	}

	@Test public void onlyDoneMovesTheLineAndARestartKeepsIt()
	{
		List<ActiveTarget.StageLine> lines = arrav().getGuide().getStage().getStages().get(0).getSteps();
		StageTracker tracker = new StageTracker(() -> 1_000L);
		// Walking around Varrock moves nothing: the lines have no tiles and no items for the game to confirm.
		for (int i = 0; i < 40; i++)
		{
			tracker.update("S3-05", 0, lines, 3200 + i * 3, 3420 + (i % 7) * 5, 0, new ItemCounts());
		}
		assertEquals(0, tracker.cursor());
		assertNull(tracker.warning());
		for (int at = 0; at < lines.size() - 1; at++)
		{
			assertTrue("'done' is offered on line " + (at + 1), tracker.canStepForward(lines));
			assertTrue(tracker.forward(lines));
			tracker.update("S3-05", 0, lines, 3210, 3425, 0, new ItemCounts());
			assertEquals(at + 1, tracker.cursor());
		}
		assertFalse("the last line ends with the quest itself", tracker.canStepForward(lines));

		StageTracker restarted = new StageTracker(() -> 1_000L);
		restarted.update("S3-05", 0, lines, 3210, 3425, 0, new ItemCounts());
		restarted.restore(7);
		restarted.update("S3-05", 0, lines, 3210, 3425, 0, new ItemCounts());
		assertEquals("the line reached before the restart", 7, restarted.cursor());
	}
	/** The card as the player sees it, closed and open, for a look by eye: build/overlay-render/walkthrough-*.png. */
	@Test public void exportTheWalkthroughCard() throws Exception
	{
		ActiveTarget t = arrav();
		StepGuide.View v = StepGuide.view(t, new ItemCounts(), new ItemCounts(), null, 0, 0, 0, null, 0, false, 4);
		v = v.withStage(v.getStage().with(null, false, true));
		for (int reveal : new int[]{0, GuideList.EXPAND_STEPS})
		{
			PanelComponent panel = new PanelComponent();
			panel.setBackgroundColor(new java.awt.Color(0, 0, 0, 0));
			Graphics2D scratch = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
			scratch.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			Font font = GuideFont.font(1f);
			Font small = GuideFont.font(OsrsPathGuideOverlay.SMALL);
			List<OsrsPathGuideOverlay.RowComponent> rows = OsrsPathGuideOverlay.build(panel, v, false, -1, GuideFont.metrics(scratch, font), GuideFont.metrics(scratch, small),
				font, small, 300, 94, false, true, reveal, "7 tiles");
			String text = GuideList.plain(rows.stream().map(OsrsPathGuideOverlay.RowComponent::getRow).collect(Collectors.toList()));
			String flat = text.replaceAll("\\s+", " ");
			assertTrue("the whole line, to its last word: " + text, flat.contains("Phoenix Gang: ask the fur trader Baraek") && flat.contains("(pay 20 coins)"));
			panel.render(scratch);
			Dimension size = panel.render(scratch);
			scratch.dispose();
			BufferedImage image = new BufferedImage(size.width, size.height, BufferedImage.TYPE_INT_ARGB);
			Graphics2D g = image.createGraphics();
			g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			OverlayCard.paintGuide(g, size.width, size.height, OsrsPathGuideOverlay.MODERN_LINK, 94, OsrsPathBridgeConfig.OverlayTheme.GLASS);
			panel.render(g);
			g.dispose();
			File out = new File("build/overlay-render/walkthrough-" + (reveal == 0 ? "compact" : "expanded") + ".png");
			out.getParentFile().mkdirs();
			ImageIO.write(image, "png", out);
		}
	}
}
