package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import org.junit.Test;

public class PacingTrackerTest
{
	/** Shrimp to Fishing 20: 4,470 XP, 10 per catch. */
	private static ActiveTarget.Pacing shrimp(Double seconds)
	{
		ActiveTarget.Pacing p = new ActiveTarget.Pacing();
		p.setSkill("fishing");
		p.setTargetLevel(20);
		p.setTargetExp(4470);
		p.setActionName("shrimp|shrimps");
		p.setExpPerAction(10);
		p.setSecondsPerAction(seconds);
		return p;
	}

	@Test
	public void remainingXpAndActions()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		assertTrue(t.update(4130, 0));
		PacingTracker.Snapshot s = t.snapshot();
		assertEquals(340, s.getRemainingXp());
		assertEquals(34, s.getActionsLeft());
		assertFalse(s.isDone());
		assertEquals("34 shrimps to 20 Fishing (calculating the time...)", t.hudLine(s));
	}

	@Test
	public void withoutHistoryTheTimeIsNotInvented()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(1000, 0);
		t.update(1010, 5_000);
		t.update(1020, 10_000);
		// Two gains are still too few.
		assertNull(t.snapshot().getEtaSeconds());
		assertNull(t.snapshot().getActionsPerMinute());
	}

	@Test
	public void paceFromTheLastGains()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(4000, 0);
		// A catch every 6 seconds: 10 catches a minute.
		for (int i = 1; i <= 5; i++)
		{
			t.update(4000 + i * 10, i * 6_000L);
		}
		PacingTracker.Snapshot s = t.snapshot();
		assertEquals(10.0, s.getActionsPerMinute(), 0.01);
		assertEquals(42, s.getActionsLeft());
		// 42 actions of 6 seconds.
		assertEquals(252L, (long) s.getEtaSeconds());
		assertFalse(s.isEstimated());
		assertEquals("42 shrimps to 20 Fishing (~4 min)", t.hudLine(s));
	}

	@Test
	public void firstEstimateFromTheStepDataThenAMeasurement()
	{
		PacingTracker t = new PacingTracker(shrimp(4.0));
		t.update(4000, 0);
		PacingTracker.Snapshot first = t.snapshot();
		assertTrue(first.isEstimated());
		assertEquals(15.0, first.getActionsPerMinute(), 0.01);
		for (int i = 1; i <= 4; i++)
		{
			t.update(4000 + i * 10, i * 12_000L);
		}
		PacingTracker.Snapshot measured = t.snapshot();
		assertFalse(measured.isEstimated());
		assertEquals(5.0, measured.getActionsPerMinute(), 0.01);
	}

	@Test
	public void aPauseStartsMeasuringAgain()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(4000, 0);
		t.update(4010, 6_000);
		t.update(4020, 12_000);
		t.update(4030, 18_000);
		assertEquals(10.0, t.snapshot().getActionsPerMinute(), 0.01);
		// Went to the bank for 5 minutes: the old pace is not mixed with the new one.
		t.update(4040, 18_000 + 5 * 60_000);
		assertNull(t.snapshot().getActionsPerMinute());
	}

	@Test
	public void historyIsLimitedToFiveGains()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(0, 0);
		// First slowly, then fast: the pace comes from the last five.
		for (int i = 1; i <= 5; i++)
		{
			t.update(i * 10, i * 30_000L);
		}
		for (int i = 6; i <= 10; i++)
		{
			t.update(i * 10, 150_000L + (i - 5) * 3_000L);
		}
		assertEquals(20.0, t.snapshot().getActionsPerMinute(), 0.01);
	}

	@Test
	public void zeroOnLoginIsNotAGain()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		// Right after login the XP is still 0, then the real value arrives: that is a reference point, not a gain of 4,000.
		t.update(0, 0);
		assertFalse(t.hasXp());
		t.update(4000, 600);
		assertTrue(t.hasXp());
		for (int i = 1; i <= 3; i++)
		{
			t.update(4000 + i * 10, 600 + i * 6_000L);
		}
		assertEquals(10.0, t.snapshot().getActionsPerMinute(), 0.01);
	}

	@Test
	public void almostDoneAndTargetReached()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(4440, 0);
		PacingTracker.Snapshot almost = t.snapshot();
		assertTrue(almost.isAlmost());
		assertEquals("✓ Almost done: 3 shrimps to 20 Fishing", t.hudLine(almost));
		t.update(4475, 1_000);
		PacingTracker.Snapshot done = t.snapshot();
		assertTrue(done.isDone());
		assertFalse(done.isAlmost());
		assertEquals(0, done.getActionsLeft());
		assertNull(done.getEtaSeconds());
		assertEquals("✓ Target level reached: 20 Fishing", t.hudLine(done));
	}

	@Test
	public void xpNeverDecreasesAndIsNotCountedTwice()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		assertTrue(t.update(4000, 0));
		assertFalse("the same value is not a change", t.update(4000, 1_000));
		assertFalse(t.update(-1, 2_000));
	}

	@Test
	public void wordFormForANumber()
	{
		String f = "log|logs";
		assertEquals("log", PacingTracker.actionForm(f, 1));
		assertEquals("logs", PacingTracker.actionForm(f, 3));
		assertEquals("logs", PacingTracker.actionForm(f, 5));
		assertEquals("logs", PacingTracker.actionForm(f, 11));
		assertEquals("logs", PacingTracker.actionForm(f, 12));
		assertEquals("logs", PacingTracker.actionForm(f, 21));
		assertEquals("logs", PacingTracker.actionForm(f, 34));
		assertEquals("catch", PacingTracker.actionForm("catch", 7));
	}

	@Test
	public void paceInTheStepTargetIsValidated()
	{
		Gson gson = new Gson();
		ActiveTarget ok = gson.fromJson("{\"stepId\":\"S1-11\",\"pacing\":{\"skill\":\"fishing\",\"targetLevel\":20,"
			+ "\"targetExp\":4470,\"actionName\":\"shrimp\",\"expPerAction\":10}}", ActiveTarget.class);
		assertNull(ok.prepare());
		ActiveTarget badSkill = gson.fromJson("{\"stepId\":\"S1-11\",\"pacing\":{\"skill\":\"magic\",\"targetLevel\":20,"
			+ "\"targetExp\":4470,\"actionName\":\"x\",\"expPerAction\":10}}", ActiveTarget.class);
		assertEquals("unknown pacing skill", badSkill.prepare());
		ActiveTarget zero = gson.fromJson("{\"stepId\":\"S1-11\",\"pacing\":{\"skill\":\"fishing\",\"targetLevel\":20,"
			+ "\"targetExp\":4470,\"actionName\":\"x\",\"expPerAction\":0}}", ActiveTarget.class);
		assertEquals("invalid pacing action", zero.prepare());
		ActiveTarget old = gson.fromJson("{\"stepId\":\"S1-11\"}", ActiveTarget.class);
		assertNull("old client without a pace", old.prepare());
	}
}
