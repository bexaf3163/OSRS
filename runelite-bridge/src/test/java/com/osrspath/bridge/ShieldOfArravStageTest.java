package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.util.List;
import org.junit.Test;

/** Shield of Arrav, stage 1 (varp 145 = 1): the book in the bag moves the card from "search" to "read" (live game: the card kept saying "search the bookcase"). */
public class ShieldOfArravStageTest
{
	private static List<ActiveTarget.StageLine> row(int at)
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (s.name.equals("S3-05"))
			{
				for (ActiveTarget.StageStep r : s.target.getGuide().getStage().getStages())
				{
					if (r.getAt() == at)
					{
						return r.getSteps();
					}
				}
			}
		}
		throw new AssertionError("S3-05 row " + at);
	}

	@Test public void theBookInTheBagMovesTheCardToReadingIt()
	{
		List<ActiveTarget.StageLine> lines = row(1);
		assertEquals(2, lines.size());
		StageTracker t = new StageTracker(() -> 1_000L);
		// In the library, nothing in the bag: search the bookcase.
		t.update("S3-05", 0, lines, 3209, 3494, 0, new ItemCounts());
		assertEquals(0, t.cursor());
		// The book is in the bag (it is called Book): the next line is reading it, with no place, and it stays until the quest variable moves.
		ItemCounts bag = new ItemCounts();
		bag.add(757, ActiveTarget.nameKey("Book"), 1);
		t.update("S3-05", 0, lines, 3209, 3494, 0, bag);
		assertEquals(1, t.cursor());
		assertNotNull(lines.get(1).getHl());
		t.update("S3-05", 0, lines, 3230, 3480, 0, bag);
		assertEquals("walking about does not skip the reading", 1, t.cursor());
	}
}
