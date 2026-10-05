package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

/**
 * Goblin Diplomacy (S2-12), live report: a goblin mail went into the bag and the list stayed on "Goblin mail #1". Collection steps are counted by items (one,
 * two, three mails of any colour), the crates have tiles, and the crate upstairs (plane 2) is highlighted along with the ladder. The lines are real.
 */
public class GoblinDiplomacyStageTest
{
	private static final String ID = "S2-12";

	private static List<ActiveTarget.StageLine> lines()
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (ID.equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				for (ActiveTarget.StageStep st : s.target.getGuide().getStage().getStages())
				{
					for (ActiveTarget.StageLine l : st.getSteps())
					{
						if ("goUpLadder".equals(l.getK()))
						{
							return st.getSteps();
						}
					}
				}
			}
		}
		throw new AssertionError("no S2-12 stage");
	}

	private static int indexOf(List<ActiveTarget.StageLine> lines, String key)
	{
		for (int i = 0; i < lines.size(); i++)
		{
			if (key.equals(lines.get(i).getK()))
			{
				return i;
			}
		}
		throw new AssertionError(key);
	}

	private static ItemCounts bag(int plain, int blue, int orange)
	{
		ItemCounts b = new ItemCounts();
		if (plain > 0)
		{
			b.add(288, ActiveTarget.nameKey("Goblin mail"), plain);
		}
		if (blue > 0)
		{
			b.add(287, ActiveTarget.nameKey("Blue goblin mail"), blue);
		}
		if (orange > 0)
		{
			b.add(286, ActiveTarget.nameKey("Orange goblin mail"), orange);
		}
		return b;
	}

	@Test
	public void eachMailInTheBag_movesTheListToTheNextCrate()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		int x = 2954;
		int y = 3497;
		assertEquals("no mail yet: the first crate", indexOf(lines, "goUpLadder"), t.update(ID, 0, lines, x, y, 0, bag(0, 0, 0)));
		assertEquals("one mail: the western hut", indexOf(lines, "getCrate2"), t.update(ID, 0, lines, x, y, 2, bag(1, 0, 0)));
		assertEquals("two mails: north of the generals' hut", indexOf(lines, "getCrate3"), t.update(ID, 0, lines, 2951, 3508, 0, bag(2, 0, 0)));
		assertEquals("three mails: dye the first", indexOf(lines, "dyeBlue"), t.update(ID, 0, lines, 2959, 3514, 0, bag(3, 0, 0)));
	}

	@Test
	public void mailsOfAnyColourCount_soARestartAfterDyeingDoesNotRollBack()
	{
		List<ActiveTarget.StageLine> lines = lines();
		int general = indexOf(lines, "talkToGeneral1");
		// One plain, one blue and one orange mail: the three crates and both dyeings are done.
		assertEquals(general, new StageTracker().update(ID, 3, lines, 2958, 3512, 0, bag(1, 1, 1)));
	}

	@Test
	public void theCrateUpstairsIsHighlightedWithTheLadder()
	{
		ActiveTarget.StageLine first = lines().get(0);
		List<Integer> ids = first.getHl().getObj();
		assertTrue(ids.toString(), ids.contains(16450) && ids.contains(16561));
	}

	@Test
	public void theOtherCratesHaveTilesForTheArrow()
	{
		List<ActiveTarget.StageLine> lines = lines();
		assertTrue(lines.get(indexOf(lines, "getCrate2")).hasPoint());
		assertTrue(lines.get(indexOf(lines, "getCrate3")).hasPoint());
	}
}
