package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

public class PacingSetTest
{
	/** Level 30 is 13,363 XP. */
	private static final int XP_30 = 13_363;

	/** S3-08: Al Kharid warriors, 19 health: 76 style XP per warrior. */
	private static ActiveTarget.Pacing warriors()
	{
		ActiveTarget.Pacing p = new ActiveTarget.Pacing();
		p.setSkill("attack");
		p.setAlso(List.of("strength", "defence"));
		p.setTargetLevel(30);
		p.setTargetExp(XP_30);
		p.setActionName("warrior|warriors");
		p.setExpPerAction(76);
		return p;
	}

	@Test
	public void withoutGainsTheFirstUnfinishedSkillIsShown()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", XP_30 + 100, 0);
		set.update("strength", 5_000, 0);
		set.update("defence", 1_000, 0);
		assertEquals("attack is already 30: strength is shown first", "strength", set.getActive());
		PacingTracker.Snapshot s = set.snapshot();
		assertEquals(XP_30 - 5_000, s.getRemainingXp());
		// 8,363 XP at 76 per warrior is 110.04: the 111th is needed to reach the target.
		assertEquals(111, s.getActionsLeft());
		assertEquals(List.of("defence"), set.left());
		assertEquals("111 warriors to 30 Strength on Aggressive (calculating the time...)", set.hudLine(s));
	}

	@Test
	public void theDisplayMovesToTheSkillThatIsGrowing()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", 2_000, 0);
		set.update("strength", 1_000, 0);
		set.update("defence", 1_000, 0);
		assertEquals("attack", set.getActive());
		// Training attack.
		set.update("attack", 2_020, 1_000);
		assertEquals("attack", set.getActive());
		// Switched the style to strength: while attack grew recently, the display does not jump.
		set.update("strength", 1_020, 5_000);
		assertEquals("attack", set.getActive());
		// Attack has not grown for over 10 seconds: strength is shown.
		set.update("strength", 1_040, 1_000 + PacingSet.SWITCH_MS + 1);
		assertEquals("strength", set.getActive());
	}

	@Test
	public void controlledStyleDoesNotFlicker()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", 1_000, 0);
		set.update("strength", 1_000, 0);
		set.update("defence", 1_000, 0);
		// Controlled: every hit gives XP to all three skills. The display is chosen by the first hit and does not jump after that.
		String shown = null;
		for (int i = 1; i <= 20; i++)
		{
			long t = i * 2_400L;
			set.update("defence", 1_000 + i * 5, t);
			set.update("strength", 1_000 + i * 5, t);
			set.update("attack", 1_000 + i * 5, t);
			if (shown == null)
			{
				shown = set.getActive();
			}
			assertEquals(shown, set.getActive());
		}
	}

	@Test
	public void theShownSkillsTargetIsDoneAndTheNextOneFollows()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", XP_30 - 10, 0);
		set.update("strength", 1_000, 0);
		set.update("defence", 1_000, 0);
		set.update("attack", XP_30 + 30, 2_400);
		PacingTracker.Snapshot s = set.snapshot();
		assertTrue(s.isDone());
		assertEquals("✓ 30 Attack - next Strength: switch to Aggressive", set.hudLine(s));
		// Changed the style: strength grows and is shown at once, there is no need to wait 10 seconds (attack is already done).
		set.update("strength", 1_040, 3_000);
		assertEquals("strength", set.getActive());
		assertEquals(List.of("defence"), set.left());
	}

	@Test
	public void allThreeAreDone()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", XP_30, 0);
		set.update("strength", XP_30 + 5, 0);
		set.update("defence", XP_30 + 9, 0);
		PacingTracker.Snapshot s = set.snapshot();
		assertTrue(s.isDone());
		assertTrue(set.left().isEmpty());
		assertEquals("✓ Target level reached: 30 Attack, Strength, Defence", set.hudLine(s));
	}

	@Test
	public void combatPaceWaitsForEightGains()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", 1_000, 0);
		// A hit every 2.4 s, 12 XP per hit (damage 3).
		for (int i = 1; i < PacingTracker.COMBAT_MIN_GAINS; i++)
		{
			set.update("attack", 1_000 + i * 12, i * 2_400L);
		}
		assertNull("seven hits are one fight, that is not a pace yet", set.snapshot().getActionsPerMinute());
		set.update("attack", 1_000 + PacingTracker.COMBAT_MIN_GAINS * 12, PacingTracker.COMBAT_MIN_GAINS * 2_400L);
		Double perMinute = set.snapshot().getActionsPerMinute();
		assertNotNull(perMinute);
		// 12 XP per 2.4 s = 300 XP a minute = 300 / 76 warriors a minute.
		assertEquals(300.0 / 76, perMinute, 0.01);
	}

	@Test
	public void oneSkillAsBefore()
	{
		ActiveTarget.Pacing p = new ActiveTarget.Pacing();
		p.setSkill("fishing");
		p.setTargetLevel(20);
		p.setTargetExp(4470);
		p.setActionName("shrimp|shrimps");
		p.setExpPerAction(10);
		PacingSet set = new PacingSet(p);
		assertFalse(set.tracks("attack"));
		set.update("fishing", 4475, 0);
		assertEquals("✓ Target level reached: 20 Fishing", set.hudLine(set.snapshot()));
		assertTrue(set.left().isEmpty());
	}

	/** S3-08 from 2.55.1: Strength to 20 first (4,470 XP), then Attack to 30; a Minotaur is 40 style XP. */
	private static ActiveTarget.Pacing minotaurs()
	{
		ActiveTarget.Pacing p = new ActiveTarget.Pacing();
		p.setSkill("strength");
		p.setAlso(List.of("attack"));
		p.setTargetLevel(20);
		p.setTargetExp(4_470);
		ActiveTarget.Pacing.Goal attack = new ActiveTarget.Pacing.Goal();
		attack.setLevel(30);
		attack.setExp(XP_30);
		p.setGoals(java.util.Map.of("attack", attack));
		p.setActionName("minotaur|minotaurs");
		p.setExpPerAction(40);
		return p;
	}

	@Test
	public void eachSkillCountsToItsOwnGoal()
	{
		ActiveTarget.Pacing p = minotaurs();
		assertNull(p.problem());
		assertFalse(p.oneGoal());
		PacingSet set = new PacingSet(p);
		// The live account on 2026-10-15: Attack 22 (5,937 XP), Strength 16 (3,070 XP).
		set.update("attack", 5_937, 0);
		set.update("strength", 3_070, 0);
		assertEquals("strength", set.getActive());
		PacingTracker.Snapshot s = set.snapshot();
		assertEquals(4_470 - 3_070, s.getRemainingXp());
		assertEquals(35, s.getActionsLeft());
		assertEquals("35 minotaurs to 20 Strength on Aggressive (calculating the time...)", set.hudLine(s));
		assertEquals("attack is 22, short of its own 30: it is still to train", List.of("attack"), set.left());
	}

	@Test
	public void strengthDoneNamesTheStyleForAttack()
	{
		PacingSet set = new PacingSet(minotaurs());
		set.update("attack", 5_937, 0);
		set.update("strength", 4_460, 0);
		set.update("strength", 4_480, 2_400);
		PacingTracker.Snapshot s = set.snapshot();
		assertTrue(s.isDone());
		assertEquals("✓ 20 Strength - next Attack: switch to Accurate", set.hudLine(s));
		set.update("attack", 5_977, 4_800);
		assertEquals("attack", set.getActive());
		assertEquals(XP_30 - 5_977, set.snapshot().getRemainingXp());
		assertEquals("185 minotaurs to 30 Attack on Accurate (calculating the time...)", set.hudLine(set.snapshot()));
	}

	@Test
	public void bothGoalsDoneAreNamedEach()
	{
		PacingSet set = new PacingSet(minotaurs());
		set.update("attack", XP_30, 0);
		set.update("strength", 4_470, 0);
		assertEquals("✓ Target levels reached: 20 Strength, 30 Attack", set.hudLine(set.snapshot()));
	}

	@Test
	public void trainingLastsTwoMinutesAfterTheLastGain_andProgressIsTheShareOfTheGoal()
	{
		PacingSet set = new PacingSet(minotaurs());
		set.update("attack", 5_937, 0);
		set.update("strength", 3_070, 0);
		assertFalse("the first reading is not a gain", set.trainingAt(0));
		set.update("strength", 3_090, 10_000);
		assertTrue(set.trainingAt(10_000 + PacingSet.TRAINING_MS));
		assertFalse(set.trainingAt(10_001 + PacingSet.TRAINING_MS));
		// Strength 3,090 of the 4,470 of level 20.
		assertEquals(3_090 / 4_470.0, set.progress(), 1e-9);
		// An Attack hit counts as training too; Strength has been still for long, so Attack is shown and its own goal is the measure.
		set.update("attack", 5_941, 200_000);
		assertTrue(set.trainingAt(250_000));
		assertEquals("attack", set.getActive());
		assertEquals(5_941 / (double) XP_30, set.progress(), 1e-9);
	}

	@Test
	public void goalsAreChecked()
	{
		ActiveTarget.Pacing defence = minotaurs();
		ActiveTarget.Pacing.Goal g = new ActiveTarget.Pacing.Goal();
		g.setLevel(30);
		g.setExp(XP_30);
		defence.setGoals(java.util.Map.of("defence", g));
		assertEquals("a goal for a skill the step does not train", "invalid pacing target", defence.problem());
		ActiveTarget.Pacing silly = minotaurs();
		ActiveTarget.Pacing.Goal bad = new ActiveTarget.Pacing.Goal();
		bad.setLevel(120);
		bad.setExp(XP_30);
		silly.setGoals(java.util.Map.of("attack", bad));
		assertEquals("invalid pacing target", silly.problem());
		// Without goals (an app before 2.55.1) every skill has the one goal, as before.
		ActiveTarget.Pacing old = minotaurs();
		old.setGoals(null);
		assertTrue(old.oneGoal());
		assertEquals(20, old.targetLevelOf("attack"));
	}

	@Test
	public void severalSkillsOnlyInCombat()
	{
		ActiveTarget.Pacing ok = warriors();
		assertNull(ok.problem());
		ActiveTarget.Pacing fishing = warriors();
		fishing.setSkill("fishing");
		assertEquals("invalid pacing skill list", fishing.problem());
		ActiveTarget.Pacing repeat = warriors();
		repeat.setAlso(List.of("attack"));
		assertEquals("invalid pacing skill list", repeat.problem());
		ActiveTarget.Pacing magic = warriors();
		magic.setAlso(List.of("magic"));
		assertEquals("invalid pacing skill list", magic.problem());
	}
}
