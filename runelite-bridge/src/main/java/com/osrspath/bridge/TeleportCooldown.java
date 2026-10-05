package com.osrspath.bridge;

/**
 * The cooldown of the Home Teleport and the minigame teleport. The game keeps the moment of the last one in a player variable as MINUTES since the Unix
 * epoch (the same values RuneLite's own timers read); the cooldown is 30 minutes for the home teleport and 20 for the minigame one.
 *
 * Pure, so a test can check it. The value is read against the clock before it is believed: a number that is not a time near now (a changed game,
 * a different unit) gives "unknown" and the app shows nothing, never an invented timer.
 */
final class TeleportCooldown
{
	/** VarPlayer.LAST_HOME_TELEPORT and VarPlayer.LAST_MINIGAME_TELEPORT in the RuneLite API. */
	static final int VARP_HOME = 892;
	static final int VARP_MINIGAME = 888;
	static final int HOME_MINUTES = 30;
	static final int MINIGAME_MINUTES = 20;
	/** A mark in the future by more than this is not a time (a small clock difference between the PC and the game is allowed). */
	private static final long FUTURE_SLACK_SECONDS = 300;
	/** A mark older than this cannot matter for a cooldown of half an hour. */
	private static final long PAST_LIMIT_SECONDS = 7L * 24 * 3600;

	private TeleportCooldown()
	{
	}

	/**
	 * The seconds left before the teleport can be cast again: 0 means it is ready (or was never used), -1 means the value does not look like a time and
	 * nothing is known. lastMinutes is the variable's value.
	 */
	static int remainingSeconds(int lastMinutes, long nowEpochSeconds, int cooldownMinutes)
	{
		if (lastMinutes <= 0)
		{
			return 0;
		}
		long last = lastMinutes * 60L;
		if (last > nowEpochSeconds + FUTURE_SLACK_SECONDS || last < nowEpochSeconds - PAST_LIMIT_SECONDS)
		{
			return -1;
		}
		long left = last + cooldownMinutes * 60L - nowEpochSeconds;
		return left > 0 ? (int) Math.min(left, cooldownMinutes * 60L) : 0;
	}
}
