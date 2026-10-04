package com.osrspath.bridge;

import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

/**
 * Every stage of every quest - on the app's real data (active-steps.json) - is walked by a "live player": arrives
 * at the step, takes the step's item, hands in the step's item. The cursor must reach the last step without a single skip and
 * without a dead end: either the step is determined by the game (place, item), or it has a "done" button. When going forward by click was
 * closed for all but steps in a row at one place, this very test makes sure no stage gets stuck.
 */
public class QuestStageWalkTest
{
	private static ItemCounts bagOf(java.util.Map<String, Integer> items)
	{
		ItemCounts b = new ItemCounts();
		int id = 1;
		for (java.util.Map.Entry<String, Integer> e : items.entrySet())
		{
			b.add(id++, e.getKey(), e.getValue());
		}
		return b;
	}

	/** The player walks the steps: at a step with has takes the item, at a step with need brings and hands it in. Returns where it got stuck, or null. */
	static String walk(String name, int stage, List<ActiveTarget.StageLine> lines)
	{
		StageTracker t = new StageTracker();
		java.util.Map<String, Integer> items = new java.util.HashMap<>();
		ItemCounts bag = bagOf(items);
		int x = 3200;
		int y = 3200;
		int plane = 0;
		t.update(name, stage, lines, x, y, plane, bag);
		for (int i = 0; i < lines.size(); i++)
		{
			ActiveTarget.StageLine l = lines.get(i);
			if (l.hasPoint())
			{
				x = l.getX();
				y = l.getY();
				plane = l.getPlane();
			}
			if (l.hasHas())
			{
				items.put(ActiveTarget.nameKey(l.getHas()), 1);
			}
			if (l.hasNeed())
			{
				items.put(ActiveTarget.nameKey(l.getNeed()), 1);
			}
			bag = bagOf(items);
			t.update(name, stage, lines, x, y, plane, bag);
			// What the game does not show by itself - by the "done" button, until the cursor reaches that step.
			int guard = 0;
			while (t.cursor() < i && guard++ < lines.size())
			{
				if (!t.forward(lines))
				{
					return "dead end before step " + (i + 1) + "/" + lines.size() + " '" + l.shown() + "': the cursor is on " + (t.cursor() + 1)
						+ " '" + lines.get(t.cursor()).shown() + "', there is no 'done' button";
				}
				t.update(name, stage, lines, x, y, plane, bag);
			}
			if (t.cursor() < i)
			{
				return "the cursor did not reach step " + (i + 1) + " '" + l.shown() + "'";
			}
			if (l.hasNeed())
			{
				// Handed in: the item left near the step's point.
				items.remove(ActiveTarget.nameKey(l.getNeed()));
				bag = bagOf(items);
				t.update(name, stage, lines, x, y, plane, bag);
				if (i < lines.size() - 1 && t.cursor() <= i && l.hasPoint())
				{
					return "after handing in '" + l.getNeed() + "' the cursor stayed on step " + (i + 1) + " '" + l.shown() + "'";
				}
			}
		}
		return null;
	}

	@Test
	public void inEveryStageTheCursorReachesTheEndWithoutDeadEnds()
	{
		List<String> bad = new ArrayList<>();
		int stages = 0;
		int manual = 0;
		int lines = 0;
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			ActiveTarget.Stage st = s.target.getGuide() == null ? null : s.target.getGuide().getStage();
			if (st == null)
			{
				continue;
			}
			for (int idx = 0; idx < st.getStages().size(); idx++)
			{
				List<ActiveTarget.StageLine> l = st.getStages().get(idx).getSteps();
				stages++;
				lines += l.size();
				for (int i = 0; i < l.size(); i++)
				{
					if (StageTracker.needsManualStep(l, i))
					{
						manual++;
					}
				}
				String problem = walk(s.target.getStepId(), idx, l);
				if (problem != null)
				{
					bad.add(s.target.getStepId() + " stage " + (idx + 1) + ": " + problem);
				}
			}
		}
		assertTrue("too few stages: " + stages, stages > 100);
		System.out.println("Stages " + stages + ", steps " + lines + ", of which manual only (in a row at one place): " + manual);
		assertTrue("stages with a dead end (" + bad.size() + "):\n" + String.join("\n", bad.subList(0, Math.min(25, bad.size()))), bad.isEmpty());
	}
}
