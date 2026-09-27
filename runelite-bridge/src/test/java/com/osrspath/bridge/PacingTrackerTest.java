package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import org.junit.Test;

public class PacingTrackerTest
{
	/** Креветки до 20 рыбалки: 4 470 опыта, 10 за улов. */
	private static ActiveTarget.Pacing shrimp(Double seconds)
	{
		ActiveTarget.Pacing p = new ActiveTarget.Pacing();
		p.setSkill("fishing");
		p.setTargetLevel(20);
		p.setTargetExp(4470);
		p.setActionName("креветка|креветки|креветок");
		p.setExpPerAction(10);
		p.setSecondsPerAction(seconds);
		return p;
	}

	@Test
	public void остатокОпытаИДействий()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		assertTrue(t.update(4130, 0));
		PacingTracker.Snapshot s = t.snapshot();
		assertEquals(340, s.getRemainingXp());
		assertEquals(34, s.getActionsLeft());
		assertFalse(s.isDone());
		assertEquals("34 креветки до 20 Fishing (время рассчитывается…)", t.hudLine(s));
	}

	@Test
	public void безИсторииВремяНеВыдумывается()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(1000, 0);
		t.update(1010, 5_000);
		t.update(1020, 10_000);
		// Две прибавки — ещё мало.
		assertNull(t.snapshot().getEtaSeconds());
		assertNull(t.snapshot().getActionsPerMinute());
	}

	@Test
	public void темпПоПоследнимПрибавкам()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(4000, 0);
		// Улов каждые 6 секунд: 10 уловов в минуту.
		for (int i = 1; i <= 5; i++)
		{
			t.update(4000 + i * 10, i * 6_000L);
		}
		PacingTracker.Snapshot s = t.snapshot();
		assertEquals(10.0, s.getActionsPerMinute(), 0.01);
		assertEquals(42, s.getActionsLeft());
		// 42 действия по 6 секунд.
		assertEquals(252L, (long) s.getEtaSeconds());
		assertFalse(s.isEstimated());
		assertEquals("42 креветки до 20 Fishing (~4 мин)", t.hudLine(s));
	}

	@Test
	public void перваяОценкаИзДанныхШагаПотомЗамер()
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
	public void паузаНачинаетЗамерЗаново()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(4000, 0);
		t.update(4010, 6_000);
		t.update(4020, 12_000);
		t.update(4030, 18_000);
		assertEquals(10.0, t.snapshot().getActionsPerMinute(), 0.01);
		// Сходил в банк на 5 минут — старый темп не смешивается с новым.
		t.update(4040, 18_000 + 5 * 60_000);
		assertNull(t.snapshot().getActionsPerMinute());
	}

	@Test
	public void историяОграниченаПятьюПрибавками()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(0, 0);
		// Сначала медленно, потом быстро: темп — по последним пяти.
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
	public void нольПриВходеНеСтановитсяПрибавкой()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		// Сразу после входа опыт ещё 0, потом приходит настоящий — это точка отсчёта, а не прибавка в 4 000.
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
	public void почтиГотовоИЦельДостигнута()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		t.update(4440, 0);
		PacingTracker.Snapshot almost = t.snapshot();
		assertTrue(almost.isAlmost());
		assertEquals("✓ Почти готово: 3 креветки до 20 Fishing", t.hudLine(almost));
		t.update(4475, 1_000);
		PacingTracker.Snapshot done = t.snapshot();
		assertTrue(done.isDone());
		assertFalse(done.isAlmost());
		assertEquals(0, done.getActionsLeft());
		assertNull(done.getEtaSeconds());
		assertEquals("✓ Целевой уровень достигнут: 20 Fishing", t.hudLine(done));
	}

	@Test
	public void опытНеУменьшаетсяИНеСчитаетсяДважды()
	{
		PacingTracker t = new PacingTracker(shrimp(null));
		assertTrue(t.update(4000, 0));
		assertFalse("то же значение — не изменение", t.update(4000, 1_000));
		assertFalse(t.update(-1, 2_000));
	}

	@Test
	public void формыСловаДляЧисла()
	{
		String f = "бревно|бревна|брёвен";
		assertEquals("бревно", PacingTracker.actionForm(f, 1));
		assertEquals("бревна", PacingTracker.actionForm(f, 3));
		assertEquals("брёвен", PacingTracker.actionForm(f, 5));
		assertEquals("брёвен", PacingTracker.actionForm(f, 11));
		assertEquals("брёвен", PacingTracker.actionForm(f, 12));
		assertEquals("бревно", PacingTracker.actionForm(f, 21));
		assertEquals("бревна", PacingTracker.actionForm(f, 34));
		assertEquals("улов", PacingTracker.actionForm("улов", 7));
	}

	@Test
	public void темпВЦелиШагаПроверяется()
	{
		Gson gson = new Gson();
		ActiveTarget ok = gson.fromJson("{\"stepId\":\"S1-11\",\"pacing\":{\"skill\":\"fishing\",\"targetLevel\":20,"
			+ "\"targetExp\":4470,\"actionName\":\"креветка\",\"expPerAction\":10}}", ActiveTarget.class);
		assertNull(ok.prepare());
		ActiveTarget badSkill = gson.fromJson("{\"stepId\":\"S1-11\",\"pacing\":{\"skill\":\"magic\",\"targetLevel\":20,"
			+ "\"targetExp\":4470,\"actionName\":\"x\",\"expPerAction\":10}}", ActiveTarget.class);
		assertEquals("неизвестный навык темпа", badSkill.prepare());
		ActiveTarget zero = gson.fromJson("{\"stepId\":\"S1-11\",\"pacing\":{\"skill\":\"fishing\",\"targetLevel\":20,"
			+ "\"targetExp\":4470,\"actionName\":\"x\",\"expPerAction\":0}}", ActiveTarget.class);
		assertEquals("неверное действие темпа", zero.prepare());
		ActiveTarget old = gson.fromJson("{\"stepId\":\"S1-11\"}", ActiveTarget.class);
		assertNull("старый клиент без темпа", old.prepare());
	}
}
