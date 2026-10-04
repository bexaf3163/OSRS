package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Before;
import org.junit.Test;

/** The engine watchdog notices states that must not exist and stays silent while all is well. */
public class EngineWatchdogTest
{
	private EngineWatchdog w;

	@Before
	public void setUp()
	{
		w = new EngineWatchdog();
	}

	/** The player is in the game on a step with a stage: cursor `cursor` of `size`, bag `bag`, tile (x, y). */
	private static EngineWatchdog.Observation at(long now, int cursor, int size, boolean manual, int x, int y, int bag, boolean hud, boolean guide)
	{
		return new EngineWatchdog.Observation(now, "S2-07", "S2-07#3", cursor, size, manual, false, false, x, y, 0, bag, hud, guide, false, false, true);
	}

	private static EngineWatchdog.Observation ok(long now, int cursor, int x, int y, int bag)
	{
		return at(now, cursor, 5, false, x, y, bag, true, true);
	}

	private static boolean has(List<EngineWatchdog.Finding> f, String code)
	{
		return f.stream().anyMatch(x -> x.getCode().equals(code));
	}

	@Test
	public void nothingFoundWhenAllIsWell()
	{
		for (int i = 0; i < 100; i++)
		{
			assertTrue(w.observe(ok(i * 1_000L, i / 20, 3000 + i, 3000, i)).isEmpty());
		}
	}

	@Test
	public void cursorStandsAndPlayerWalksAndChangesTheBagButItDoesNotMove()
	{
		assertTrue(w.observe(ok(0, 1, 3000, 3000, 1)).isEmpty());
		List<EngineWatchdog.Finding> last = null;
		for (long t = 5_000; t <= EngineWatchdog.STUCK_MS + 5_000; t += 5_000)
		{
			last = w.observe(ok(t, 1, 3000 + (int) (t / 1000), 3000, (int) t));
		}
		assertTrue(has(last, "STUCK"));
		assertTrue(last.get(0).getMessage().contains("2/5"));
	}

	@Test
	public void standingStillDoesNothing_thatIsNotBeingStuck()
	{
		w.observe(ok(0, 1, 3000, 3000, 7));
		for (long t = 5_000; t <= 2 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			assertTrue("AFK is not an oddity", w.observe(ok(t, 1, 3000, 3000, 7)).isEmpty());
		}
	}

	@Test
	public void walkedThenWentAway_isNotBeingStuck()
	{
		w.observe(ok(0, 1, 3000, 3000, 1));
		// For the first two minutes the player walks and changes the bag, then freezes and stands; the watchdog must not spam findings for the whole idle time.
		for (long t = 5_000; t <= 120_000; t += 5_000)
		{
			w.observe(ok(t, 1, 3000 + (int) (t / 1000), 3000, (int) t));
		}
		for (long t = 125_000; t <= 4 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			List<EngineWatchdog.Finding> f = w.observe(ok(t, 1, 3120, 3000, 120_000));
			if (t - 120_000 >= EngineWatchdog.IDLE_MS)
			{
				assertTrue("the player went away: not an oddity, t=" + t, f.isEmpty());
			}
		}
	}

	@Test
	public void aStepOnAManualMarkAndAViewBackAreNotBeingStuck()
	{
		w.observe(at(0, 1, 5, true, 3000, 3000, 0, true, true));
		for (long t = 5_000; t <= 2 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			assertTrue("a 'manual' step can be waited on for long", w.observe(at(t, 1, 5, true, 3000 + (int) (t / 1000), 3000, (int) t, true, true)).isEmpty());
		}
		EngineWatchdog w2 = new EngineWatchdog();
		w2.observe(ok(0, 1, 3000, 3000, 0));
		for (long t = 5_000; t <= 2 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(t, "S2-07", "S2-07#3", 1, 5, false, true, false, 3000 + (int) (t / 1000), 3000, 0, (int) t,
				true, true, false, false, true);
			assertTrue("viewing is not being stuck", w2.observe(o).isEmpty());
		}
	}

	@Test
	public void theLastLineIsNotBeingStuck()
	{
		w.observe(ok(0, 4, 3000, 3000, 0));
		for (long t = 5_000; t <= 2 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			assertTrue(w.observe(ok(t, 4, 3000 + (int) (t / 1000), 3000, (int) t)).isEmpty());
		}
	}

	@Test
	public void aCursorShiftResetsTheCount()
	{
		w.observe(ok(0, 1, 3000, 3000, 0));
		for (long t = 5_000; t < EngineWatchdog.STUCK_MS; t += 5_000)
		{
			w.observe(ok(t, 1, 3000 + (int) (t / 1000), 3000, (int) t));
		}
		// The cursor moved shortly before the threshold: the count starts again.
		long now = EngineWatchdog.STUCK_MS;
		assertTrue(w.observe(ok(now, 2, 3100, 3000, 1)).isEmpty());
		assertTrue(w.observe(ok(now + 5_000, 2, 3105, 3000, 2)).isEmpty());
	}

	@Test
	public void anItemWarningHoldsForLong()
	{
		List<EngineWatchdog.Finding> f = null;
		for (long t = 0; t <= EngineWatchdog.CLAMP_MS + 5_000; t += 5_000)
		{
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(t, "S2-08", "S2-08#2", 2, 5, false, false, true, 3000, 3000, 0, 1, true, true, false, false, true);
			f = w.observe(o);
		}
		assertTrue(has(f, "CLAMP"));
	}

	@Test
	public void theWarningWentAwayTheCountIsReset()
	{
		for (long t = 0; t < EngineWatchdog.CLAMP_MS; t += 5_000)
		{
			w.observe(new EngineWatchdog.Observation(t, "S2-08", "S2-08#2", 2, 5, false, false, true, 3000, 3000, 0, 1, true, true, false, false, true));
		}
		w.observe(ok(EngineWatchdog.CLAMP_MS, 2, 3000, 3000, 1));
		assertTrue(w.observe(new EngineWatchdog.Observation(EngineWatchdog.CLAMP_MS + 5_000, "S2-08", "S2-08#2", 2, 5, false, false, true, 3000, 3000, 0, 1, true, true, false, false, true)).isEmpty());
	}

	@Test
	public void aStepExistsButTheScreenIsEmpty()
	{
		assertTrue(w.observe(at(0, 0, 5, false, 3000, 3000, 0, false, false)).isEmpty());
		assertTrue("too early yet", w.observe(at(EngineWatchdog.EMPTY_MS - 1_000, 0, 5, false, 3000, 3000, 0, false, false)).isEmpty());
		assertTrue(has(w.observe(at(EngineWatchdog.EMPTY_MS, 0, 5, false, 3000, 3000, 0, false, false)), "EMPTY"));
	}

	@Test
	public void emptyButAtLeastOneCardIsThere_normal()
	{
		for (long t = 0; t <= 3 * EngineWatchdog.EMPTY_MS; t += 5_000)
		{
			assertTrue(w.observe(at(t, 0, 5, false, 3000, 3000, 0, true, false)).isEmpty());
			assertTrue(w.observe(at(t + 1, 0, 5, false, 3000, 3000, 0, false, true)).isEmpty());
		}
	}

	@Test
	public void noStepEmptyScreen_normal()
	{
		for (long t = 0; t <= 3 * EngineWatchdog.EMPTY_MS; t += 5_000)
		{
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(t, null, null, 0, 0, false, false, false, 3000, 3000, 0, 0, false, false, false, false, true);
			assertTrue(w.observe(o).isEmpty());
		}
	}

	@Test
	public void questCompletedButTheListDoesNotShowIt()
	{
		List<EngineWatchdog.Finding> f = null;
		for (long t = 0; t <= EngineWatchdog.QUEST_DONE_MS + 1_000; t += 1_000)
		{
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(t, "S2-07", "S2-07#3", 1, 5, false, false, false, 3000, 3000, 0, 0, true, true, true, false, true);
			f = w.observe(o);
		}
		assertTrue(has(f, "QUEST_DONE"));
		EngineWatchdog w2 = new EngineWatchdog();
		for (long t = 0; t <= 3 * EngineWatchdog.QUEST_DONE_MS; t += 1_000)
		{
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(t, "S2-07", "S2-07#3", 1, 5, false, false, false, 3000, 3000, 0, 0, true, true, true, true, true);
			assertTrue("the list showed 'completed': all is well", w2.observe(o).isEmpty());
		}
	}

	@Test
	public void inLoginAndWhereThereIsNoScreen_silent()
	{
		for (long t = 0; t <= 3 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(t, "S2-07", "S2-07#3", 1, 5, false, false, true, 3000, 3000, 0, (int) t, false, false, true, false, false);
			assertTrue("not in the game: we do not observe", w.observe(o).isEmpty());
		}
	}

	@Test
	public void theFindingKeyMatchesTheJournalWindow()
	{
		w.observe(ok(0, 1, 3000, 3000, 0));
		List<EngineWatchdog.Finding> f = null;
		for (long t = 5_000; t <= EngineWatchdog.STUCK_MS + 5_000; t += 5_000)
		{
			f = w.observe(ok(t, 1, 3000 + (int) (t / 1000), 3000, (int) t));
		}
		assertEquals("S2-07#3@1", f.get(0).getKey());
	}
}
