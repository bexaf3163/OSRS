package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;

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
}
