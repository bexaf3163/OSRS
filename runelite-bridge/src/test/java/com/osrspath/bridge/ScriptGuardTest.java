package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class ScriptGuardTest
{
	@Test
	public void aReadOutsideTheTickNeverRunsTheScript()
	{
		ScriptGuard g = new ScriptGuard();
		AtomicInteger runs = new AtomicInteger();
		assertNull("nothing known yet", g.read("q", () -> { runs.incrementAndGet(); return true; }));
		assertEquals("the script was not started", 0, runs.get());
	}

	@Test
	public void inTheTickItRunsAndTheValueIsKeptForTheEventHandlers()
	{
		ScriptGuard g = new ScriptGuard();
		AtomicInteger runs = new AtomicInteger();
		g.safe(true);
		assertTrue(g.read("q", () -> { runs.incrementAndGet(); return true; }));
		g.safe(false);
		assertEquals(Boolean.TRUE, g.read("q", () -> { runs.incrementAndGet(); return false; }));
		assertEquals("only the tick read ran", 1, runs.get());
		assertNull("another quest is still unknown", g.read("other", () -> true));
	}

	@Test
	public void theGameRefusingAScriptInsideAScriptIsSwallowedAndTheOldValueStands()
	{
		ScriptGuard g = new ScriptGuard();
		g.safe(true);
		assertFalse(g.read("q", () -> false));
		// The game says "scripts are not reentrant" (an AssertionError with -ea): it must not reach the client thread.
		assertEquals(Boolean.FALSE, g.read("q", () -> { throw new AssertionError("scripts are not reentrant"); }));
		assertNull("no old value: unknown, not a crash", g.read("new", () -> { throw new AssertionError("scripts are not reentrant"); }));
	}

	@Test
	public void theSafeFlagIsOffByDefault()
	{
		assertFalse(new ScriptGuard().isSafe());
	}
}
