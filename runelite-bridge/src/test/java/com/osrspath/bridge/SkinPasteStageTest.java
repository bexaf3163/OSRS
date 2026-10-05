package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

/**
 * Prince Ali Rescue (S2-10), live report: "got the paste after talking to Aggie, but the stage does not advance". With the wig and the paste in
 * the bag, Quest Helper's first two conditions depend on a flag the plugin cannot read, so the machine does not decide and the old logic
 * (place and items) must carry the cursor. "Talk to Aggie" had no item, so nothing moved it. The lines are real.
 */
public class SkinPasteStageTest
{
	private static final String ID = "S2-10";
	private static final int AGGIE_X = 3086;
	private static final int AGGIE_Y = 3257;

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
						if ("talkToAggie".equals(l.getK()))
						{
							return st.getSteps();
						}
					}
				}
			}
		}
		throw new AssertionError("no S2-10 stage with the Aggie step");
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

	private static ItemCounts bag(boolean wig, boolean paste)
	{
		ItemCounts b = new ItemCounts();
		if (wig)
		{
			b.add(2419, ActiveTarget.nameKey("Wig"), 1);
		}
		if (paste)
		{
			b.add(2424, ActiveTarget.nameKey("Paste"), 1);
		}
		return b;
	}

	@Test
	public void pasteInTheBagAtAggie_thePasteStepIsDone_nextIsTheKeyPrint()
	{
		List<ActiveTarget.StageLine> lines = lines();
		int aggie = indexOf(lines, "talkToAggie");
		int keli = indexOf(lines, "talkToKeli");
		StageTracker t = new StageTracker();
		assertEquals("the dyed wig is in the bag, no paste yet: Aggie", aggie, t.update(ID, 20, lines, AGGIE_X, AGGIE_Y, 0, bag(true, false)));
		assertEquals("Aggie hands over the paste: the next step", keli, t.update(ID, 20, lines, AGGIE_X, AGGIE_Y, 0, bag(true, true)));
		assertEquals("and it stays there while the player walks to the jail", keli, t.update(ID, 20, lines, 3110, 3250, 0, bag(true, true)));
	}

	private static ActiveTarget target()
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (ID.equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target;
			}
		}
		throw new AssertionError("no S2-10");
	}

	@Test
	public void keyPrintInTheBag_theKeliStepIsDone_nextIsTheFurnace()
	{
		List<ActiveTarget.StageLine> lines = lines();
		int keli = indexOf(lines, "talkToKeli");
		int key = indexOf(lines, "makeKey");
		StageTracker t = new StageTracker();
		ItemCounts noPrint = bag(true, true);
		assertEquals("at Keli with soft clay", keli, t.update(ID, 20, lines, 3127, 3244, 0, noPrint));
		ItemCounts print = bag(true, true);
		print.add(2423, ActiveTarget.nameKey("Key print"), 1);
		assertEquals("the print was taken: the key at the furnace", key, t.update(ID, 20, lines, 3127, 3244, 0, print));
	}

	@Test
	public void machineThatCannotDecide_alwaysOffersDone()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		t.update(ID, 20, lines, 3127, 3244, 0, bag(true, true));
		assertFalse("no flag from the machine: only the steps the game cannot see", t.canStepForward(lines) && !StageTracker.needsManualStep(lines, t.cursor()));
		t.qhUndecided(true);
		assertTrue(t.canStepForward(lines));
		int before = t.cursor();
		assertTrue(t.forward(lines));
		assertEquals(before + 1, t.cursor());
		t.qhUndecided(false);
		assertEquals("decided again: back to the old rule", StageTracker.needsManualStep(lines, t.cursor()), t.canStepForward(lines));
	}

	@Test
	public void itemsTheFinishedLinesUsedUp_areNotNeededNow()
	{
		ActiveTarget t = target();
		List<ActiveTarget.StageLine> lines = lines();
		int keli = indexOf(lines, "talkToKeli");
		StepGuide.View v = StepGuide.view(t, new ItemCounts(), ItemCounts.EMPTY, null, 0, 0, 0, new java.util.HashSet<String>(), 20, false, keli);
		for (StepGuide.ItemLine i : v.getItems())
		{
			String n = i.getName();
			if (n.startsWith("Ball of wool") || n.equals("Ashes") || n.equals("Redberries") || n.equals("Pot of flour") || n.equals("Bucket of water"))
			{
				assertEquals(n + " was used up by the wig and the paste", StepGuide.Have.DONE, i.getHave());
			}
		}
		StepGuide.View start = StepGuide.view(t, new ItemCounts(), ItemCounts.EMPTY, null, 0, 0, 0, new java.util.HashSet<String>(), 20, false, 0);
		for (StepGuide.ItemLine i : start.getItems())
		{
			assertFalse(i.getName() + " is still needed at the first line", i.getHave() == StepGuide.Have.DONE);
		}
	}

	@Test
	public void gameRestartedWithTheKeyAlreadyMade_theListDoesNotRollBackToKeli()
	{
		List<ActiveTarget.StageLine> lines = lines();
		int leela = indexOf(lines, "talkToLeela");
		// The key print was used up making the key, so only the key is left in the bag (live report: the list went back to "Lady Keli").
		ItemCounts bag = bag(true, true);
		bag.add(2418, ActiveTarget.nameKey("Bronze key"), 1);
		StageTracker t = new StageTracker();
		assertEquals("a fresh start in the furnace hut", leela, t.update(ID, 20, lines, 3227, 3255, 0, bag));
		assertEquals("and anywhere else", leela, new StageTracker().update(ID, 20, lines, 3127, 3244, 0, bag));
	}
}
