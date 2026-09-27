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
	/** 30 уровень — 13 363 опыта. */
	private static final int XP_30 = 13_363;

	/** S3-08: воины Al Kharid, 19 здоровья — 76 опыта навыка стиля за воина. */
	private static ActiveTarget.Pacing warriors()
	{
		ActiveTarget.Pacing p = new ActiveTarget.Pacing();
		p.setSkill("attack");
		p.setAlso(List.of("strength", "defence"));
		p.setTargetLevel(30);
		p.setTargetExp(XP_30);
		p.setActionName("воин|воина|воинов");
		p.setExpPerAction(76);
		return p;
	}

	@Test
	public void безПрибавокПоказанПервыйНедокачанный()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", XP_30 + 100, 0);
		set.update("strength", 5_000, 0);
		set.update("defence", 1_000, 0);
		assertEquals("атака уже 30 — первой показана сила", "strength", set.getActive());
		PacingTracker.Snapshot s = set.snapshot();
		assertEquals(XP_30 - 5_000, s.getRemainingXp());
		// 8 363 опыта по 76 за воина — 110,04: до цели нужен 111-й.
		assertEquals(111, s.getActionsLeft());
		assertEquals(List.of("defence"), set.left());
		assertEquals("111 воинов до 30 Strength (время рассчитывается…)", set.hudLine(s));
	}

	@Test
	public void показПереходитНаНавыкКоторыйРастёт()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", 2_000, 0);
		set.update("strength", 1_000, 0);
		set.update("defence", 1_000, 0);
		assertEquals("attack", set.getActive());
		// Качает атаку.
		set.update("attack", 2_020, 1_000);
		assertEquals("attack", set.getActive());
		// Переключил стиль на силу: пока атака росла недавно, показ не прыгает.
		set.update("strength", 1_020, 5_000);
		assertEquals("attack", set.getActive());
		// Атака не растёт дольше 10 секунд — показывается сила.
		set.update("strength", 1_040, 1_000 + PacingSet.SWITCH_MS + 1);
		assertEquals("strength", set.getActive());
	}

	@Test
	public void стильControlledНеМигает()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", 1_000, 0);
		set.update("strength", 1_000, 0);
		set.update("defence", 1_000, 0);
		// Controlled: каждый удар даёт опыт во все три навыка. Показ выбирается первым ударом и дальше не прыгает.
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
	public void цельПоказанногоНавыкаЕстьДальшеСледующий()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", XP_30 - 10, 0);
		set.update("strength", 1_000, 0);
		set.update("defence", 1_000, 0);
		set.update("attack", XP_30 + 30, 2_400);
		PacingTracker.Snapshot s = set.snapshot();
		assertTrue(s.isDone());
		assertEquals("✓ 30 Attack — дальше Strength: смени стиль атаки", set.hudLine(s));
		// Сменил стиль: сила растёт — и сразу показана она, ждать 10 секунд не нужно (атака уже готова).
		set.update("strength", 1_040, 3_000);
		assertEquals("strength", set.getActive());
		assertEquals(List.of("defence"), set.left());
	}

	@Test
	public void всеТриГотовы()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", XP_30, 0);
		set.update("strength", XP_30 + 5, 0);
		set.update("defence", XP_30 + 9, 0);
		PacingTracker.Snapshot s = set.snapshot();
		assertTrue(s.isDone());
		assertTrue(set.left().isEmpty());
		assertEquals("✓ Целевой уровень достигнут: 30 Attack, Strength, Defence", set.hudLine(s));
	}

	@Test
	public void боевойТемпЖдётВосьмиПрибавок()
	{
		PacingSet set = new PacingSet(warriors());
		set.update("attack", 1_000, 0);
		// Удар раз в 2,4 с, 12 опыта за удар (урон 3).
		for (int i = 1; i < PacingTracker.COMBAT_MIN_GAINS; i++)
		{
			set.update("attack", 1_000 + i * 12, i * 2_400L);
		}
		assertNull("семь ударов — один бой, это ещё не темп", set.snapshot().getActionsPerMinute());
		set.update("attack", 1_000 + PacingTracker.COMBAT_MIN_GAINS * 12, PacingTracker.COMBAT_MIN_GAINS * 2_400L);
		Double perMinute = set.snapshot().getActionsPerMinute();
		assertNotNull(perMinute);
		// 12 опыта за 2,4 с = 300 опыта в минуту = 300 / 76 воинов в минуту.
		assertEquals(300.0 / 76, perMinute, 0.01);
	}

	@Test
	public void одинНавыкКакРаньше()
	{
		ActiveTarget.Pacing p = new ActiveTarget.Pacing();
		p.setSkill("fishing");
		p.setTargetLevel(20);
		p.setTargetExp(4470);
		p.setActionName("креветка|креветки|креветок");
		p.setExpPerAction(10);
		PacingSet set = new PacingSet(p);
		assertFalse(set.tracks("attack"));
		set.update("fishing", 4475, 0);
		assertEquals("✓ Целевой уровень достигнут: 20 Fishing", set.hudLine(set.snapshot()));
		assertTrue(set.left().isEmpty());
	}

	@Test
	public void несколькоНавыковТолькоВБою()
	{
		ActiveTarget.Pacing ok = warriors();
		assertNull(ok.problem());
		ActiveTarget.Pacing fishing = warriors();
		fishing.setSkill("fishing");
		assertEquals("неверный список навыков темпа", fishing.problem());
		ActiveTarget.Pacing repeat = warriors();
		repeat.setAlso(List.of("attack"));
		assertEquals("неверный список навыков темпа", repeat.problem());
		ActiveTarget.Pacing magic = warriors();
		magic.setAlso(List.of("magic"));
		assertEquals("неверный список навыков темпа", magic.problem());
	}
}
