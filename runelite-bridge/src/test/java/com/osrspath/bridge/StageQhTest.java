package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

/**
 * The stage cursor and the Quest Helper machine: when the machine has evidence, it sets the cursor; when it has none - place and items,
 * as before. A pressed "done" and a "back" view are stronger than the machine. The lines are real, S2-09 (Pirate's Treasure).
 */
public class StageQhTest
{
	private static final String ID = "S2-09";

	private static List<ActiveTarget.StageLine> lines()
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (ID.equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target.getGuide().getStage().getStages().get(1).getSteps();
			}
		}
		throw new AssertionError("no stage S2-09#1");
	}

	private static StageTracker.QhPick pick(int line)
	{
		return new StageTracker.QhPick(line, "test");
	}

	private static int update(StageTracker t, List<ActiveTarget.StageLine> lines, int x, int y, StageTracker.QhPick pick)
	{
		return t.update(ID, 1, lines, x, y, 0, new ItemCounts(), pick);
	}

	@Test
	public void machineEvidence_setsTheCursorWherePlaceAndItemsDoNotSee()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		assertEquals("without the machine, on the quay: the first line", 0, update(t, lines, 3028, 3220, null));
		assertFalse(t.qhStrong());
		// Luthas paid 30 coins: the line "pay the Customs officer" cannot be seen by place, the player stands at Luthas.
		assertEquals(6, update(t, lines, 2938, 3154, pick(6)));
		assertTrue(t.qhStrong());
		assertTrue(t.reason(), t.reason().startsWith("QH"));
		assertEquals("a tick later the cursor is in the same place", 6, update(t, lines, 2938, 3154, pick(6)));
	}

	@Test
	public void withoutEvidence_placeAndItemsAsBefore()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		update(t, lines, 3040, 3235, null);
		update(t, lines, 3028, 3220, null);
		assertEquals("arrived: 'buy rum'", 1, update(t, lines, 2956, 3146, null));
		assertFalse(t.qhStrong());
		assertTrue(t.reason(), t.reason().startsWith("LEFT"));
	}

	@Test
	public void theMachineCanReturnTheCursorBack_itKnowsMore()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		update(t, lines, 2938, 3154, pick(6));
		// The journal and the latches were recounted: now Quest Helper thinks the crate is not yet filled.
		assertEquals(4, update(t, lines, 2938, 3154, pick(4)));
	}

	@Test
	public void aChoiceOutsideTheList_isIgnored()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		assertEquals(0, update(t, lines, 3028, 3220, pick(lines.size())));
		assertEquals(0, update(t, lines, 3028, 3220, pick(-1)));
		assertFalse(t.qhStrong());
	}

	@Test
	public void theDoneButtonRemainsEvenWithAMachineChoice_andTheMachineDoesNotReturnTheCursorBack()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		// "Put the rum in the crate" and "fill the crate" stand at the crate in a row: the game tells them apart only by the message.
		assertEquals(3, update(t, lines, 2939, 3149, pick(3)));
		assertTrue("the message may not have arrived - the button is needed", t.canStepForward(lines));
		assertTrue(t.forward(lines));
		assertEquals(4, t.cursor());
		assertEquals("the machine still thinks the rum is not put in - the player answers for their own mark", 4, update(t, lines, 2939, 3149, pick(3)));
		assertFalse(t.qhStrong());
		assertEquals("and when the machine reached a line no earlier than the mark, it leads", 5, update(t, lines, 2938, 3154, pick(5)));
		assertTrue(t.qhStrong());
	}

	@Test
	public void viewBack_strongerThanTheMachine()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		update(t, lines, 2938, 3154, pick(6));
		t.back();
		assertTrue(t.peeking());
		assertEquals(5, update(t, lines, 2938, 3154, pick(6)));
		assertFalse(t.qhStrong());
		t.resume();
		assertEquals(6, update(t, lines, 2938, 3154, pick(6)));
		assertTrue(t.qhStrong());
	}

	@Test
	public void aNewStage_resetsTheMarksAndTellsAgain()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		update(t, lines, 2939, 3149, pick(3));
		assertTrue(t.forward(lines));
		// The game moved the quest to another stage: the previous stage's mark means nothing.
		assertEquals(2, t.update(ID, 2, lines, 2939, 3149, 0, new ItemCounts(), pick(2)));
		assertTrue(t.qhStrong());
	}

	@Test
	public void withoutAMachineChoice_allAsBefore_tickByTickOnTheSameWay()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker old = new StageTracker();
		StageTracker now = new StageTracker();
		ItemCounts rum = new ItemCounts();
		rum.add(431, ActiveTarget.nameKey("Karamjan rum"), 1);
		// A path from the live game: the quay, the boat, the shore, Zembo, Luthas, the crate - with the bag changing.
		int[][] walk = {{3040, 3235, 0}, {3028, 3220, 0}, {2956, 3146, 0}, {2942, 3146, 0}, {2936, 3146, 0}, {2930, 3145, 0}, {2938, 3154, 1},
			{2939, 3149, 1}, {2939, 3149, 0}, {2955, 3146, 0}, {3020, 3230, 0}};
		for (int[] w : walk)
		{
			ItemCounts bag = w[2] == 1 ? rum : new ItemCounts();
			int a = old.update(ID, 1, lines, w[0], w[1], 0, bag);
			int b = now.update(ID, 1, lines, w[0], w[1], 0, bag, null);
			assertEquals("the cursor at (" + w[0] + "," + w[1] + ")", a, b);
			assertEquals(old.reason(), now.reason());
			assertEquals(old.warning(), now.warning());
			assertFalse(now.qhStrong());
		}
	}
}
