package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Before;
import org.junit.Test;

/** Сторож движка замечает состояния, которых быть не должно, и молчит, пока всё в порядке. */
public class EngineWatchdogTest
{
	private EngineWatchdog w;

	@Before
	public void setUp()
	{
		w = new EngineWatchdog();
	}

	/** Игрок в игре на шаге с этапом: курсор cursor из size, сумка bag, клетка (x, y). */
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
	public void вПорядкеНичегоНеНаходит()
	{
		for (int i = 0; i < 100; i++)
		{
			assertTrue(w.observe(ok(i * 1_000L, i / 20, 3000 + i, 3000, i)).isEmpty());
		}
	}

	@Test
	public void курсорСтоитХодитьИМеняетСумкуНоНеДвигается()
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
	public void стоитНаМестеНичегоНеДелает_этоНеЗастревание()
	{
		w.observe(ok(0, 1, 3000, 3000, 7));
		for (long t = 5_000; t <= 2 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			assertTrue("AFK не странность", w.observe(ok(t, 1, 3000, 3000, 7)).isEmpty());
		}
	}

	@Test
	public void шагНаРучнойОтметкеИПросмотрНазадНеСчитаютсяЗастреванием()
	{
		w.observe(at(0, 1, 5, true, 3000, 3000, 0, true, true));
		for (long t = 5_000; t <= 2 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			assertTrue("«ручной» шаг ждать можно долго", w.observe(at(t, 1, 5, true, 3000 + (int) (t / 1000), 3000, (int) t, true, true)).isEmpty());
		}
		EngineWatchdog w2 = new EngineWatchdog();
		w2.observe(ok(0, 1, 3000, 3000, 0));
		for (long t = 5_000; t <= 2 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(t, "S2-07", "S2-07#3", 1, 5, false, true, false, 3000 + (int) (t / 1000), 3000, 0, (int) t,
				true, true, false, false, true);
			assertTrue("просмотр — не застревание", w2.observe(o).isEmpty());
		}
	}

	@Test
	public void последняяСтрокаНеСчитаетсяЗастреванием()
	{
		w.observe(ok(0, 4, 3000, 3000, 0));
		for (long t = 5_000; t <= 2 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			assertTrue(w.observe(ok(t, 4, 3000 + (int) (t / 1000), 3000, (int) t)).isEmpty());
		}
	}

	@Test
	public void сдвигКурсораСбрасываетСчёт()
	{
		w.observe(ok(0, 1, 3000, 3000, 0));
		for (long t = 5_000; t < EngineWatchdog.STUCK_MS; t += 5_000)
		{
			w.observe(ok(t, 1, 3000 + (int) (t / 1000), 3000, (int) t));
		}
		// Курсор сдвинулся незадолго до порога: отсчёт начинается заново.
		long now = EngineWatchdog.STUCK_MS;
		assertTrue(w.observe(ok(now, 2, 3100, 3000, 1)).isEmpty());
		assertTrue(w.observe(ok(now + 5_000, 2, 3105, 3000, 2)).isEmpty());
	}

	@Test
	public void предупреждениеОПредметеДержитсяДолго()
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
	public void предупреждениеСнялосьСчётСброшен()
	{
		for (long t = 0; t < EngineWatchdog.CLAMP_MS; t += 5_000)
		{
			w.observe(new EngineWatchdog.Observation(t, "S2-08", "S2-08#2", 2, 5, false, false, true, 3000, 3000, 0, 1, true, true, false, false, true));
		}
		w.observe(ok(EngineWatchdog.CLAMP_MS, 2, 3000, 3000, 1));
		assertTrue(w.observe(new EngineWatchdog.Observation(EngineWatchdog.CLAMP_MS + 5_000, "S2-08", "S2-08#2", 2, 5, false, false, true, 3000, 3000, 0, 1, true, true, false, false, true)).isEmpty());
	}

	@Test
	public void шагЕстьаНаЭкранеПусто()
	{
		assertTrue(w.observe(at(0, 0, 5, false, 3000, 3000, 0, false, false)).isEmpty());
		assertTrue("пока рано", w.observe(at(EngineWatchdog.EMPTY_MS - 1_000, 0, 5, false, 3000, 3000, 0, false, false)).isEmpty());
		assertTrue(has(w.observe(at(EngineWatchdog.EMPTY_MS, 0, 5, false, 3000, 3000, 0, false, false)), "EMPTY"));
	}

	@Test
	public void пустоНоХотяБыОднаПлашкаЕсть_нормально()
	{
		for (long t = 0; t <= 3 * EngineWatchdog.EMPTY_MS; t += 5_000)
		{
			assertTrue(w.observe(at(t, 0, 5, false, 3000, 3000, 0, true, false)).isEmpty());
			assertTrue(w.observe(at(t + 1, 0, 5, false, 3000, 3000, 0, false, true)).isEmpty());
		}
	}

	@Test
	public void безШагаПустойЭкран_нормально()
	{
		for (long t = 0; t <= 3 * EngineWatchdog.EMPTY_MS; t += 5_000)
		{
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(t, null, null, 0, 0, false, false, false, 3000, 3000, 0, 0, false, false, false, false, true);
			assertTrue(w.observe(o).isEmpty());
		}
	}

	@Test
	public void квестПройденАСписокЭтогоНеПоказывает()
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
			assertTrue("список показал «пройден» — всё хорошо", w2.observe(o).isEmpty());
		}
	}

	@Test
	public void вЛогинеИГдеЭкранаНет_молчит()
	{
		for (long t = 0; t <= 3 * EngineWatchdog.STUCK_MS; t += 5_000)
		{
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(t, "S2-07", "S2-07#3", 1, 5, false, false, true, 3000, 3000, 0, (int) t, false, false, true, false, false);
			assertTrue("не в игре — не наблюдаем", w.observe(o).isEmpty());
		}
	}

	@Test
	public void ключНаходкиСовпадаетСОкномЖурнала()
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
