package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

/**
 * The dialogue options of a stage line are framed in the game's menu (live game, Shield of Arrav: the card said "pay Baraek", the player chose
 * "Can you sell me some furs?" and bought furs, because only the step's first conversation had a highlight).
 */
public class DialogKeysTest
{
	@Test public void theAnswersAfterDialogueAreTheKeys()
	{
		Set<String> keys = ActiveTarget.dialogKeysOf("Talk to Baraek in Varrock Square: ask about the Phoenix Gang, not furs. Dialogue: “Can you tell me where I can find the Phoenix Gang?”"
			+ " → “Okay. Have 20 gold coins.”.");
		assertEquals(Set.of("can you tell me where i can find the phoenix gang", "okay. have 20 gold coins"), keys);
	}

	@Test public void quotesBeforeTheWordDialogueAreNotAnswers_andNoDialogueIsNoKeys()
	{
		assertEquals(Set.of(), ActiveTarget.dialogKeysOf("Talk to him (not “Can you sell me some furs?”)."));
		assertEquals(Set.of("yes"), ActiveTarget.dialogKeysOf("Ask (not “No”). Dialogue: “Yes.”."));
		assertEquals(Set.of(), ActiveTarget.dialogKeysOf(null));
	}

	@Test public void theMenuTextOfTheGameMatchesTheKey()
	{
		// The menu shows the option with its punctuation and sometimes with tags; both sides go through dialogKey.
		Set<String> keys = ActiveTarget.dialogKeysOf("Dialogue: “I'm in search of a quest.” → “Yes.”.");
		assertTrue(keys.contains(ActiveTarget.dialogKey("I'm in search of a quest.")));
		assertTrue(keys.contains(ActiveTarget.dialogKey("<col=ffffff>I’m in search of a quest</col>")));
		assertTrue(keys.contains(ActiveTarget.dialogKey("Yes")));
	}

	@Test public void everyDialogueLineOfTheRouteYieldsItsAnswers_andShieldOfArravNamesBaraeksOption()
	{
		int lines = 0;
		Set<String> arravRow = new HashSet<>();
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			ActiveTarget.Stage st = s.target.getGuide() == null ? null : s.target.getGuide().getStage();
			if (st == null)
			{
				continue;
			}
			for (ActiveTarget.StageStep row : st.getStages())
			{
				for (ActiveTarget.StageLine l : row.getSteps())
				{
					if (l.getT() != null && l.getT().contains("Dialogue:"))
					{
						lines++;
						assertTrue(s.name + ": " + l.getT(), !ActiveTarget.dialogKeysOf(l.getT()).isEmpty());
					}
					if (s.name.equals("S3-05") && row.getAt() == 3)
					{
						arravRow.addAll(ActiveTarget.dialogKeysOf(l.getT()));
					}
				}
			}
		}
		assertTrue("many lines carry a dialogue: " + lines, lines > 100);
		assertTrue(arravRow.toString(), arravRow.contains("can you tell me where i can find the phoenix gang"));
		assertTrue(arravRow.toString(), arravRow.contains("i want to become a member of your gang"));
	}
}
