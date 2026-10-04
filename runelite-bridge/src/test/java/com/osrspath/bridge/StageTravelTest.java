package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

/**
 * Transitions on the app's real data: a boat, a ladder, a door. The player was at the transition step's point and ended up far from it
 * (sailed, teleported, went down): the step is done, the arrow leads to the next one. The occasion was S2-09 from the live game: after
 * "Seaman at the dock: sail to Musa Point" the cursor stayed on "sail", the arrow led back to Port Sarim, and the player sailed back and forth.
 * Tests on invented lines ("Enter...") missed this: in the real data a place name stands before the verb.
 */
public class StageTravelTest
{
	private static List<ActiveTarget.StageLine> stage(String stepId, int idx)
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (stepId.equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target.getGuide().getStage().getStages().get(idx).getSteps();
			}
		}
		throw new AssertionError("no stage " + stepId + "#" + idx);
	}

	private static int at(StageTracker t, String id, int idx, List<ActiveTarget.StageLine> lines, int x, int y)
	{
		return t.update(id, idx, lines, x, y, 0, new ItemCounts());
	}

	@Test
	public void s209_sailedToMusaPoint_cursorOnZembo_notBackToTheQuay()
	{
		List<ActiveTarget.StageLine> lines = stage("S2-09", 1);
		assertTrue("the 'sail' step is a transition: " + lines.get(0).shown(), StageTracker.isMove(lines.get(0)));
		StageTracker t = new StageTracker();
		assertEquals("far from the quay: the first step", 0, at(t, "S2-09", 1, lines, 3040, 3235));
		assertEquals("at the quay, talked to the sailor: the first step", 0, at(t, "S2-09", 1, lines, 3028, 3220));
		// The boat: in one tick to Karamja, to Musa Point (the point of the step "Return to Port Sarim" is there too - the cursor does not reach it).
		assertEquals("arrived: 'buy rum from Zembo'", 1, at(t, "S2-09", 1, lines, 2956, 3146));
		assertTrue(t.reason(), t.reason().startsWith("LEFT"));
		for (int i = 0; i < 100; i++)
		{
			assertEquals("on the shore the cursor does not return to the boat", 1, at(t, "S2-09", 1, lines, 2954 + i % 3, 3150));
		}
	}

	/** The live game: running past within seven tiles of Zembo and eight of Luthas, the player "visited" both, and the cursor jumped to "put the rum in the crate". */
	@Test
	public void s209_ranPastZemboAndLuthas_stepsAreNotSkipped()
	{
		List<ActiveTarget.StageLine> lines = stage("S2-09", 1);
		StageTracker t = new StageTracker();
		at(t, "S2-09", 1, lines, 3040, 3235);
		at(t, "S2-09", 1, lines, 3028, 3220);
		assertEquals("arrived: 'buy rum'", 1, at(t, "S2-09", 1, lines, 2956, 3146));
		assertEquals("13 tiles from Zembo: still 'buy rum'", 1, at(t, "S2-09", 1, lines, 2942, 3146));
		assertEquals("seven from Zembo, past: the rum is not bought, the cursor is on it", 1, at(t, "S2-09", 1, lines, 2936, 3146));
		assertTrue(t.reason(), t.reason().startsWith("BLOCK"));
		assertEquals("went to Zembo: the step stays, waits for the purchase", 1, at(t, "S2-09", 1, lines, 2930, 3145));
		assertEquals("rum not bought, to Luthas: the cursor stays on 'buy rum'", 1, at(t, "S2-09", 1, lines, 2938, 3154));
		ItemCounts rum = new ItemCounts();
		rum.add(431, ActiveTarget.nameKey("Karamjan rum"), 1);
		assertEquals("rum bought: 'pick bananas, talk to Luthas'", 2, t.update("S2-09", 1, lines, 2938, 3154, 0, rum));
		// Put the rum in the crate (the rum left the bag at the crate): the step is handed in by itself, the "done" button is not needed.
		assertEquals("at the crate with the rum in the bag: 'put the rum in the crate'", 3, t.update("S2-09", 1, lines, 2939, 3149, 0, rum));
		assertEquals("the rum lies in the crate: 'fill the crate'", 4, t.update("S2-09", 1, lines, 2939, 3149, 0, new ItemCounts()));
	}

	@Test
	public void s208_preparedAndEnteredTheHouse_arrowToTheBasementAtOnce()
	{
		List<ActiveTarget.StageLine> lines = stage("S2-08", 2);
		ActiveTarget.StageLine door = lines.get(2);
		assertTrue("'Prepare for combat and enter...' is a transition: " + door.shown(), StageTracker.isMove(door));
		// We start from this step: before it the player has already been to the bar and handed in the beer.
		List<ActiveTarget.StageLine> from = lines.subList(2, lines.size());
		StageTracker t = new StageTracker();
		assertEquals(0, at(t, "S2-08", 2, from, 3110, 3329));
		assertEquals(0, at(t, "S2-08", 2, from, door.getX(), door.getY() - 1));
		assertEquals("in the house, far from the basement: the 'enter' step is done", 1, at(t, "S2-08", 2, from, door.getX() - 6, door.getY() + 7));
	}

	/** For every transition step of the real data: visited the point, ended up at the next one (but a bit aside) - the cursor moved on. */
	@Test
	public void everyTransitionIsClosedWhenThePlayerEndsUpAtTheNextStep()
	{
		int checked = 0;
		List<String> bad = new ArrayList<>();
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			ActiveTarget.Stage st = s.target.getGuide() == null ? null : s.target.getGuide().getStage();
			if (st == null)
			{
				continue;
			}
			for (int idx = 0; idx < st.getStages().size(); idx++)
			{
				List<ActiveTarget.StageLine> lines = st.getStages().get(idx).getSteps();
				for (int i = 0; i < lines.size() - 1; i++)
				{
					ActiveTarget.StageLine cur = lines.get(i);
					ActiveTarget.StageLine nx = lines.get(i + 1);
					if (!StageTracker.isMove(cur) || !cur.hasPoint() || !nx.hasPoint() || cur.getPlane() != nx.getPlane() || cur.hasNeed() || cur.hasHas())
					{
						continue;
					}
					int d = Math.max(Math.abs(cur.getX() - nx.getX()), Math.abs(cur.getY() - nx.getY()));
					if (d < 40)
					{
						continue;
					}
					checked++;
					List<ActiveTarget.StageLine> from = lines.subList(i, lines.size());
					StageTracker t = new StageTracker();
					String id = s.target.getStepId();
					t.update(id, idx, from, cur.getX() + 60, cur.getY() + 60, cur.getPlane(), new ItemCounts());
					t.update(id, idx, from, cur.getX(), cur.getY(), cur.getPlane(), new ItemCounts());
					int c = t.update(id, idx, from, nx.getX() + 12, nx.getY(), nx.getPlane(), new ItemCounts());
					if (c < 1)
					{
						bad.add(id + " stage " + (idx + 1) + " step " + (i + 1) + " '" + cur.shown() + "' -> '" + nx.shown() + "': cursor " + (c + 1));
					}
				}
			}
		}
		assertTrue("too few transitions checked: " + checked, checked >= 20);
		assertFalse("transitions that did not close (" + bad.size() + "):\n" + String.join("\n", bad), !bad.isEmpty());
	}
}
