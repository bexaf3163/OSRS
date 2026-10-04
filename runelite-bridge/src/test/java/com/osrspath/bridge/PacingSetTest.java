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
		assertEquals("111 warriors to 30 Strength (calculating the time...)", set.hudLine(s));
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
		assertEquals("✓ 30 Attack - next Strength: change attack style", set.hudLine(s));
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
