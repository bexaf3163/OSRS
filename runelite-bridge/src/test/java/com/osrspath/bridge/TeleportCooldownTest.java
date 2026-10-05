package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The Home Teleport and minigame cooldowns from the game's last-teleport marks (minutes since the epoch). */
public class TeleportCooldownTest
{
	/** 2026-10-05 16:00:00 UTC. */
	private static final long NOW = 1_791_216_000L;
	private static final int NOW_MIN = (int) (NOW / 60);

	@Test
	public void justUsed_theWholeCooldownIsLeft()
	{
		assertEquals(30 * 60, TeleportCooldown.remainingSeconds(NOW_MIN, NOW, TeleportCooldown.HOME_MINUTES));
		assertEquals(20 * 60, TeleportCooldown.remainingSeconds(NOW_MIN, NOW, TeleportCooldown.MINIGAME_MINUTES));
	}

	@Test
	public void partWayThrough_theRestIsLeft()
	{
		assertEquals("10 minutes ago: 20 left", 20 * 60, TeleportCooldown.remainingSeconds(NOW_MIN - 10, NOW, TeleportCooldown.HOME_MINUTES));
		long left = TeleportCooldown.remainingSeconds(NOW_MIN - 29, NOW + 30, TeleportCooldown.HOME_MINUTES);
		assertTrue("under a minute and a half: " + left, left > 0 && left < 90);
	}

	@Test
	public void afterTheCooldownOrNeverUsed_itIsReady()
	{
		assertEquals(0, TeleportCooldown.remainingSeconds(NOW_MIN - 31, NOW, TeleportCooldown.HOME_MINUTES));
		assertEquals(0, TeleportCooldown.remainingSeconds(NOW_MIN - 6 * 60, NOW, TeleportCooldown.HOME_MINUTES));
		assertEquals("never used", 0, TeleportCooldown.remainingSeconds(0, NOW, TeleportCooldown.HOME_MINUTES));
		assertEquals(0, TeleportCooldown.remainingSeconds(-5, NOW, TeleportCooldown.HOME_MINUTES));
	}

	@Test
	public void aValueThatIsNotATimeNearNow_isUnknown_neverAnInventedTimer()
	{
		assertEquals("a small counter, not minutes since the epoch", -1, TeleportCooldown.remainingSeconds(1234, NOW, TeleportCooldown.HOME_MINUTES));
		assertEquals("far in the future", -1, TeleportCooldown.remainingSeconds(NOW_MIN + 600, NOW, TeleportCooldown.HOME_MINUTES));
		assertEquals("older than a week", -1, TeleportCooldown.remainingSeconds(NOW_MIN - 8 * 24 * 60, NOW, TeleportCooldown.HOME_MINUTES));
		assertEquals("a few minutes of clock difference is allowed, and never more than the full cooldown", 30 * 60, TeleportCooldown.remainingSeconds(NOW_MIN + 3, NOW, TeleportCooldown.HOME_MINUTES));
	}

	@Test
	public void theVariablesAreTheOnesInTheRuneLiteApi()
	{
		assertEquals(892, TeleportCooldown.VARP_HOME);
		assertEquals(888, TeleportCooldown.VARP_MINIGAME);
	}
}
