package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;

import java.util.List;
import org.junit.Test;

/**
 * Dragon Slayer I from the Oracle to Captain Ned (S5-04 to S5-07) on the real data. The occasion was a live session: after talking to the Oracle
 * the list stayed on "talk to the Oracle"; after three planks in the hull it asked to buy a plank; after the Crandor map it asked for three map
 * parts. Quest Helper reads the Oracle (varbit 1832), the door (varp 177 bits 17-20) and the hull (varbits 1835-1837); the stage lists no
 * longer count what the earlier lines used up.
 */
public class QhDragonSlayerPartsTest
{
	/** Dragon Slayer I after the boat is bought (varp 176); 2 while the pieces are gathered. */
	private static final int BOAT_BOUGHT = 3;
	private static final int GATHERING = 2;

	private static ActiveTarget target(String step)
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (step.equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target;
			}
		}
		throw new AssertionError("no stage " + step);
	}

	private static List<ActiveTarget.StageLine> lines(String step)
	{
		return target(step).getGuide().getStage().getStages().get(0).getSteps();
	}

	/** The list line (from one) that the machine chose; 0 means the machine does not decide or decided by default. */
	private static int pick(String step, int value, QhFakeGame game)
	{
		QhMachine m = QhMachine.all().get(step);
		assertNotNull("no machine " + step, m);
		QhMachine.Verdict v = m.resolve(value, game, new QhMachine.Session());
		if (v.isUndecided() || !v.isStrong())
		{
			return 0;
		}
		return m.lineFor(v, lines(step)) + 1;
	}

	private static int line(String step, String k)
	{
		List<ActiveTarget.StageLine> lines = lines(step);
		for (int i = 0; i < lines.size(); i++)
		{
			if (k.equals(lines.get(i).getK()))
			{
				return i + 1;
			}
		}
		throw new AssertionError("no line " + k);
	}

	private static QhFakeGame at(int x, int y, int plane)
	{
		QhFakeGame g = new QhFakeGame();
		g.pos = new int[] {x, y, plane};
		return g;
	}

	@Test
	public void theOracleHasAnswered_downIntoTheDwarvenMine()
	{
		QhFakeGame g = at(3014, 3501, 0);
		g.varbits.put(1832, 1);
		assertEquals("talked to the Oracle: the next line is the ladder, though the Oracle is still beside you", line("S5-04", "goIntoDwarvenMine"),
			pick("S5-04", GATHERING, g));
	}

	@Test
	public void theDoorTakesTheItemsInOrder()
	{
		QhFakeGame g = at(3050, 9840, 0);
		g.varbits.put(1832, 1);
		assertEquals(line("S5-04", "useSilkOnDoor"), pick("S5-04", GATHERING, g));
		g.varps.put(177, 1 << 17);
		assertEquals("the silk is on the door: the lobster pot next", line("S5-04", "usePotOnDoor"), pick("S5-04", GATHERING, g));
	}

	@Test
	public void eachPlankMovesTheHullOn()
	{
		QhFakeGame g = at(3047, 9640, 1);
		g.varps.put(176, BOAT_BOUGHT);
		assertEquals(line("S5-06", "repairShip"), pick("S5-06", BOAT_BOUGHT, g));
		g.varbits.put(1835, 1);
		assertEquals(line("S5-06", "repairShip2"), pick("S5-06", BOAT_BOUGHT, g));
		g.varbits.put(1836, 1);
		assertEquals(line("S5-06", "repairShip3"), pick("S5-06", BOAT_BOUGHT, g));
	}

	@Test
	public void withTheCrandorMap_talkToNed()
	{
		QhFakeGame g = at(3098, 3257, 0);
		g.bag.put(1538, 1);
		assertEquals(line("S5-07", "talkToNed"), pick("S5-07", GATHERING, g));
	}

	@Test
	public void thePlanksLeftAreCountedByTheRepairLine_notTheStagesTotal()
	{
		ActiveTarget t = target("S5-06");
		int cursor = line("S5-06", "repairShip2") - 1;
		// One plank went into the hull: two planks, 60 nails and the hammer are left; the coins went to Klarense.
		ItemCounts bag = StepGuideTest.counts(960, "Plank", 2, 1539, "Steel nails", 60, 2347, "Hammer", 1);
		StepGuide.View v = StepGuide.view(t, bag, StepGuideTest.counts(), null, 0, 0, 0, null, BOAT_BOUGHT, false, cursor);
		for (StepGuide.ItemLine i : v.getItems())
		{
			if (i.getName().startsWith("Plank") || i.getName().startsWith("Steel nails"))
			{
				assertEquals(i.getName(), StepGuide.Have.IN_STEP, i.getHave());
			}
			if (i.getName().startsWith("Coins"))
			{
				assertEquals("the ship is bought: the coins are handled", StepGuide.Have.DONE, i.getHave());
			}
		}
	}

	@Test
	public void theJoinedMapIsNotAskedForAsParts()
	{
		ActiveTarget t = target("S5-07");
		int cursor = line("S5-07", "talkToNed") - 1;
		StepGuide.View v = StepGuide.view(t, StepGuideTest.counts(1538, "Crandor map", 1), StepGuideTest.counts(), null, 0, 0, 0, null, GATHERING, false, cursor);
		for (StepGuide.ItemLine i : v.getItems())
		{
			if (i.getName().startsWith("Map part"))
			{
				assertEquals(StepGuide.Have.DONE, i.getHave());
			}
		}
	}

	@Test
	public void wormbrainsStageAsksOnlyForTheCoins()
	{
		for (ActiveTarget.GuideItem i : target("S5-05").getGuide().getStage().getStages().get(0).getItems())
		{
			assertNotEquals("Wormbrain's own piece is not a thing to bring", "Map part", i.getName());
		}
	}
}
