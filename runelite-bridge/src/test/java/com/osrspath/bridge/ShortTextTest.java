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
}
