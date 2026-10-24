package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** A fallback shortening of a step line when the app did not send a short text: the same rules as in src/lib/shortText.ts. */
public class ShortTextTest
{
	@Test
	public void dialogueAtTheEndIsDropped()
	{
		assertEquals("Talk to Reldo in the Varrock Palace library",
			ShortText.of("Talk to Reldo in the Varrock Palace library. Dialogue: 'What do you know about the Imcando dwarves?'."));
	}

	@Test
	public void theFirstSentenceIsTaken()
	{
		assertEquals("Take an Egg at the farm north of Lumbridge", ShortText.of("Take an Egg at the farm north of Lumbridge. The egg lies by the chicken coop, there are plenty of them."));
	}

	@Test
	public void shortIsUnchanged_theFinalPeriodIsRemoved()
	{
		assertEquals("Pull the Hopper controls", ShortText.of("Pull the Hopper controls."));
		assertEquals("Go", ShortText.of("Go"));
	}

	@Test
	public void longIsCutByDashOrCommaOrWordWithAnEllipsis()
	{
		String byDash = ShortText.of("Talk to Thurgo at his house south of Port Sarim — he has been waiting for you there for a long time and will tell you everything in detail");
		assertEquals("Talk to Thurgo at his house south of Port Sarim", byDash);
		String byComma = ShortText.of("Go up to the second floor of Falador Castle, then go west and look for the right cupboard in the far room");
		assertEquals("Go up to the second floor of Falador Castle", byComma);
		String byWord = ShortText.of("Gouptothesecondfloorofthecastlefaladorthengowestandlookfortherightcupboardinthefarroom and something else");
		assertTrue(byWord, byWord.endsWith("…") && byWord.length() <= ShortText.MAX);
	}

	@Test
	public void notMoreThanTheLimit_andEmptyWithoutCrash()
	{
		for (String s : new String[] {"A".repeat(300), "Word ".repeat(80), "x"})
		{
			assertTrue(s.length() > 0 && ShortText.of(s).length() <= ShortText.MAX);
		}
		assertEquals("", ShortText.of(null));
		assertFalse(ShortText.of("   ").contains("null"));
	}

	@Test
	public void aReadyShortTextOfTheStepWins_anEmptyOneFallsBackToShortening()
	{
		ActiveTarget.StageLine l = new ActiveTarget.StageLine();
		l.setT("Take the sword to the Squire — quest complete. Dialogue: 'x'.");
		assertEquals("Take the sword to the Squire — quest complete", l.shown());
		l.setS("Take the sword to the Squire");
		assertEquals("Take the sword to the Squire", l.shown());
		l.setS("  ");
		assertEquals("Take the sword to the Squire — quest complete", l.shown());
	}

	@Test
	public void theCardLeavesTheDialogueToTheGame_andKeepsTheRest()
	{
		assertEquals("Talk to the Oracle on top of Ice Mountain.",
			ShortText.withoutDialogue("Talk to the Oracle on top of Ice Mountain. Dialogue: “I seek a piece of the map to the island of Crandor.”."));
		// In brackets mid-sentence: the brackets go, the sentence after them stays.
		assertEquals("Go to Port Sarim Jail and pay Wormbrain 10,000 coins.",
			ShortText.withoutDialogue("Go to Port Sarim Jail and pay Wormbrain 10,000 coins (Dialogue: “I believe you've got a piece of a map that I need.” → “Alright then, 10,000 it is.”)."));
		// Not in brackets: the answers go, the instruction after them stays.
		assertEquals("Talk to Klarense and buy his boat. It costs 2,000 coins.",
			ShortText.withoutDialogue("Talk to Klarense and buy his boat. Dialogue: “I'd like to buy her.” → “Yep, sounds good.”. It costs 2,000 coins."));
		assertEquals("Kill Elvarg.", ShortText.withoutDialogue("Kill Elvarg."));
		assertEquals("", ShortText.withoutDialogue(null));
	}

	@Test
	public void everyRouteLineLosesOnlyItsDialogueOnTheCard()
	{
		int seen = 0;
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (s.target.getGuide() == null || s.target.getGuide().getStage() == null)
			{
				continue;
			}
			for (ActiveTarget.StageStep st : s.target.getGuide().getStage().getStages())
			{
				for (ActiveTarget.StageLine l : st.getSteps())
				{
					if (l.getT() == null || !l.getT().contains("Dialogue:"))
					{
						continue;
					}
					seen++;
					String card = ShortText.withoutDialogue(l.getT());
					String where = s.target.getStepId() + " " + l.getK() + ": " + card;
					// The first answer is gone; a quote before the dialogue (a chat channel's name) is the instruction's own and stays.
					String after = l.getT().substring(l.getT().indexOf("Dialogue:"));
					int q = after.indexOf('“');
					String answer = q < 0 ? null : after.substring(q, Math.max(q + 1, after.indexOf('”', q) + 1));
					assertFalse(where, card.contains("Dialogue:") || (answer != null && card.contains(answer)));
					assertTrue(where, card.length() >= 8 && card.length() < l.getT().length());
				}
			}
		}
		assertTrue("the route has dialogue lines", seen > 50);
	}

	/** The card shows a line's whole text under its headline: a paragraph there pushed the rest of the card off screen (Elvarg, 328 characters). */
	@Test
	public void everyRouteLineFitsTheCard()
	{
		int seen = 0;
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (s.target.getGuide() == null || s.target.getGuide().getStage() == null)
			{
				continue;
			}
			for (ActiveTarget.StageStep st : s.target.getGuide().getStage().getStages())
			{
				for (ActiveTarget.StageLine l : st.getSteps())
				{
					if (l.getT() == null)
					{
						continue;
					}
					seen++;
					String card = ShortText.withoutDialogue(l.getT());
					assertTrue(s.target.getStepId() + " " + l.getK() + " (" + card.length() + "): " + card, card.length() <= 225);
				}
			}
		}
		assertTrue("the route has lines", seen > 500);
	}
}
