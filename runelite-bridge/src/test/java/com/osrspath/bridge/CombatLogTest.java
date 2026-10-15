package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

public class CombatLogTest
{
	private static final int SCIMITAR = 1329;

	@Test
	public void theFirstKillIsTheReferenceAndEachNextOneIsASample()
	{
		CombatLog log = new CombatLog();
		log.context("S3-08", SCIMITAR);
		log.damage(3);
		assertFalse(log.kill("Minotaur", 12, 0));
		log.damage(2);
		assertTrue(log.kill("Minotaur", 12, 9_000));
		log.damage(1);
		log.damage(4);
		assertTrue(log.kill("Minotaur", 12, 17_000));
		List<CombatLog.Entry> s = log.snapshot();
		assertEquals(1, s.size());
		assertEquals(new CombatLog.Entry("Minotaur", 12, 2, 17.0, 7), s.get(0));
	}

	@Test
	public void theTwoMinotaurVersionsAreApart()
	{
		CombatLog log = new CombatLog();
		log.context("S3-08", SCIMITAR);
		log.kill("Minotaur", 12, 0);
		log.kill("Minotaur", 27, 10_000);
		log.kill("Minotaur", 12, 18_000);
		List<CombatLog.Entry> s = log.snapshot();
		assertEquals(27, s.get(0).getCombat());
		assertEquals(10.0, s.get(0).getSeconds(), 1e-9);
		assertEquals(12, s.get(1).getCombat());
		assertEquals(8.0, s.get(1).getSeconds(), 1e-9);
	}

	@Test
	public void aPauseIsNoSampleAndTheDamageBeforeItGoesWithIt()
	{
		CombatLog log = new CombatLog();
		log.context("S3-08", SCIMITAR);
		log.kill("Minotaur", 12, 0);
		log.kill("Minotaur", 12, 8_000);
		// To the bank and back: hit on the way, then 4 minutes.
		log.damage(6);
		assertFalse(log.kill("Minotaur", 12, 8_000 + 240_000));
		log.damage(2);
		log.kill("Minotaur", 12, 8_000 + 240_000 + 9_000);
		CombatLog.Entry e = log.snapshot().get(0);
		assertEquals(2, e.getKills());
		assertEquals(17.0, e.getSeconds(), 1e-9);
		assertEquals(2, e.getDamage());
	}

	@Test
	public void anotherWeaponOrStepStartsOver()
	{
		CombatLog log = new CombatLog();
		log.context("S3-08", SCIMITAR);
		log.kill("Minotaur", 12, 0);
		log.kill("Minotaur", 12, 8_000);
		assertFalse(log.context("S3-08", SCIMITAR));
		assertTrue(log.context("S3-08", 1331));
		assertTrue(log.snapshot().isEmpty());
		log.kill("Minotaur", 12, 9_000);
		log.kill("Minotaur", 12, 16_000);
		assertTrue(log.context("S4-03", 1331));
		assertTrue(log.snapshot().isEmpty());
	}

	@Test
	public void onlyTheLastWindowOfKillsIsKept()
	{
		CombatLog log = new CombatLog();
		log.context("S3-08", SCIMITAR);
		for (int i = 0; i <= CombatLog.WINDOW + 10; i++)
		{
			log.damage(i < 10 ? 50 : 1);
			log.kill("Minotaur", 12, i * 10_000L);
		}
		CombatLog.Entry e = log.snapshot().get(0);
		assertEquals(CombatLog.WINDOW, e.getKills());
		assertEquals(CombatLog.WINDOW, e.getDamage());
	}
}
