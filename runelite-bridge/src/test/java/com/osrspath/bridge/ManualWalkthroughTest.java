package com.osrspath.bridge;

import static org.junit.Assert.*;
import com.google.gson.Gson;
import java.io.File;
import java.util.List;
import java.util.stream.Collectors;
import javax.imageio.ImageIO;
import org.junit.Test;

/**
 * A quest the app has no stage data for is not an empty guide: in the live game Shield of Arrav showed only "Reldo, ~7 tiles" from the first
 * line to the last. Its walkthrough lines become one stage that the player moves through with "done". The sample is Shield of Arrav exactly as the
 * app sent it before 2.53 (manual-walkthrough.json); since 2.53 the app sends its stage table instead, and every route quest has one.
 */
public class ManualWalkthroughTest
{
	private static ActiveTarget arrav()
	{
		ActiveTarget t = new Gson().fromJson(new java.io.InputStreamReader(ManualWalkthroughTest.class.getResourceAsStream("/manual-walkthrough.json"),
			java.nio.charset.StandardCharsets.UTF_8), ActiveTarget.class);
		assertNull(t.prepare());
		return t;
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
			assertFalse(s.name + ": every quest the app sends has stage data (Shield of Arrav since 2.53)", st != null && st.isManual());
		}
		assertTrue("the old sample still becomes a walkthrough", arrav().getGuide().getStage().isManual());
	}

	@Test public void theGuideShowsTheLineAndCountsLinesNotStages()
	{
		ActiveTarget t = arrav();
		int n = t.getGuide().getSteps().size();
		StepGuide.View v = StepGuide.view(t, new ItemCounts(), new ItemCounts(), null, 0, 0, 0, null, 0, false, 3);
		assertNotNull(v.getStage());
		assertEquals(4, v.getStage().getIndex());
		assertEquals(n, v.getStage().getTotal());
		HudModel.Card c = HudModel.build(HudModelTest.input(v, HudModelTest.quiet(), null));
		String closed = c.plain(false, false);
		assertTrue(closed, closed.contains("4 of " + n) && c.getHeadline().contains("Choose a gang"));
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
		HudModel.Card c = HudModel.build(HudModelTest.input(v, HudModelTest.state("~7 tiles ↑", 7), null));
		for (boolean open : new boolean[]{false, true})
		{
			OsrsPathGuideOverlay.Layout l = HudRenderTest.layout(c, open, false, OsrsPathGuideOverlay.WIDTH, 1f, 2000);
			if (open)
			{
				String flat = c.plain(true, false).replaceAll("\\s+", " ");
				assertTrue("the whole line, to its last word: " + flat, flat.contains("Phoenix Gang: ask the fur trader Baraek") && flat.contains("(pay 20 coins)"));
				assertTrue("a line the game cannot see has its Done button", c.getNext().stream().anyMatch(x -> x.getAction().equals(GuideList.Action.NEXT)));
			}
			File out = new File("build/overlay-render/walkthrough-" + (open ? "expanded" : "compact") + ".png");
			out.getParentFile().mkdirs();
			ImageIO.write(HudRenderTest.paint(l), "png", out);
		}
	}
}
