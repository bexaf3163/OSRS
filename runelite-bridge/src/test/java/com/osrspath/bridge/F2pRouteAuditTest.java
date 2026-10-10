package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

/**
 * The plugin side of the F2P route audit (tests/fullF2pRouteAudit.test.ts is the app side): on the data the app really sends, from Goblin Diplomacy (S2-12) to
 * the Dragon Slayer I finale (S5-09) every stage table is walked by a player without a dead end, every tile is on a real plane, and a line that waits for
 * several items is satisfied by "at least that many", in any mix of the listed names.
 */
public class F2pRouteAuditTest
{
	private static boolean inRoute(String stepId)
	{
		return stepId.compareTo("S2-12") >= 0 && stepId.compareTo("S5-09") <= 0 && stepId.startsWith("S");
	}

	private static ItemCounts bag(String name, int count)
	{
		ItemCounts b = new ItemCounts();
		b.add(1, ActiveTarget.nameKey(name), count);
		return b;
	}

	@Test
	public void everyStageTableFromGoblinDiplomacyToTheFinaleIsWalkedWithoutADeadEnd()
	{
		List<String> bad = new ArrayList<>();
		int tables = 0;
		int steps = 0;
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			ActiveTarget.Stage st = s.target.getGuide() == null ? null : s.target.getGuide().getStage();
			if (st == null || !inRoute(s.target.getStepId()))
			{
				continue;
			}
			steps++;
			for (int idx = 0; idx < st.getStages().size(); idx++)
			{
				tables++;
				String problem = QuestStageWalkTest.walk(s.target.getStepId(), idx, st.getStages().get(idx).getSteps());
				if (problem != null)
				{
					bad.add(s.target.getStepId() + " stage " + (idx + 1) + ": " + problem);
				}
			}
		}
		assertTrue("too few steps with a stage table: " + steps, steps >= 15);
		assertTrue("too few stage rows: " + tables, tables >= 40);
		assertTrue("dead ends:\n" + String.join("\n", bad), bad.isEmpty());
	}

	@Test
	public void theRetiredGrindsAreGoneAndWormbrainIsPaid()
	{
		boolean sawWormbrain = false;
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			String id = s.target.getStepId();
			assertFalse("S3-09 and S2-13 are not in the route any more: " + id, "S3-09".equals(id) || "S2-13".equals(id));
			if ("S5-05".equals(id))
			{
				sawWormbrain = true;
				StringBuilder text = new StringBuilder();
				for (ActiveTarget.StageLine l : s.target.getGuide().getStage().getStages().get(0).getSteps())
				{
					text.append(l.getT()).append(' ').append(l.shown()).append(' ');
				}
				assertTrue(text.toString(), text.toString().contains("10,000") && !text.toString().contains("Telekinetic"));
			}
		}
		assertTrue("S5-05 is in the fixtures", sawWormbrain);
	}

	@Test
	public void everyLineOfTheRouteHasARealPlaneAndAPositiveTile()
	{
		int points = 0;
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			ActiveTarget.Stage st = s.target.getGuide() == null ? null : s.target.getGuide().getStage();
			if (st == null || !inRoute(s.target.getStepId()))
			{
				continue;
			}
			for (ActiveTarget.StageStep row : st.getStages())
			{
				for (ActiveTarget.StageLine l : row.getSteps())
				{
					if (!l.hasPoint())
					{
						continue;
					}
					points++;
					String where = s.target.getStepId() + " " + l.getK();
					assertTrue(where + " plane " + l.getPlane(), l.getPlane() >= 0 && l.getPlane() <= 3);
					assertTrue(where + " tile", l.getX() > 0 && l.getY() > 0 && l.getX() < NavTarget.MAX_COORD && l.getY() < NavTarget.MAX_COORD);
				}
			}
		}
		assertTrue("too few points: " + points, points > 100);
	}

	@Test
	public void aLineThatWaitsForSeveralItemsIsSatisfiedByAtLeastThatManyInAnyMix()
	{
		int counted = 0;
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			ActiveTarget.Stage st = s.target.getGuide() == null ? null : s.target.getGuide().getStage();
			if (st == null || !inRoute(s.target.getStepId()))
			{
				continue;
			}
			for (ActiveTarget.StageStep row : st.getStages())
			{
				for (ActiveTarget.StageLine l : row.getSteps())
				{
					if (!l.hasHas() || l.hasCount() < 2)
					{
						continue;
					}
					counted++;
					String name = l.primaryHas();
					String where = s.target.getStepId() + " " + l.getK() + " (" + l.getHas() + ")";
					assertTrue(where + ": exactly N holds", l.holds(bag(name, l.hasCount())));
					assertTrue(where + ": more than N still holds", l.holds(bag(name, l.hasCount() + 3)));
					assertFalse(where + ": one short does not hold", l.holds(bag(name, l.hasCount() - 1)));
				}
			}
		}
		assertTrue("the route has lines that count several items: " + counted, counted >= 7);
	}

	@Test
	public void threeGoblinMailsOfDifferentColoursCountTogether()
	{
		ActiveTarget.StageLine line = new ActiveTarget.StageLine();
		line.setHas("Goblin mail|Blue goblin mail|Orange goblin mail x3");
		ItemCounts b = new ItemCounts();
		b.add(288, ActiveTarget.nameKey("Goblin mail"), 1);
		b.add(287, ActiveTarget.nameKey("Blue goblin mail"), 1);
		assertFalse("two of three", line.holds(b));
		b.add(286, ActiveTarget.nameKey("Orange goblin mail"), 1);
		assertTrue("one of each colour is three", line.holds(b));
		assertEquals(3, line.hasCount());
	}
}
