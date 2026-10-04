package com.osrspath.bridge;

import java.util.ArrayDeque;
import java.util.Deque;
import lombok.Value;

/**
 * Training pace: how much XP and how many actions are left to the step's goal and about how long that will take.
 *
 * The pace is measured over the last five XP gains: the XP between the first and the last of them, divided by the time.
 * While there are fewer than three gains, no time is made up: only the first estimate from the step's data (secondsPerAction),
 * if there is one. A pause longer than three minutes starts the measurement again: a bank break is not pace.
 * In combat XP comes for every hit and an action is a whole enemy, so the window is wider there: the last
 * 30 gains, and the measurement starts from eight; otherwise the pace of a single fight, without walking between enemies, would come out
 * too fast.
 * Without RuneLite: a pure calculation, checked by an ordinary test.
 */
final class PacingTracker
{
	static final int HISTORY = 5;
	static final int MIN_GAINS = 3;
	static final int COMBAT_HISTORY = 30;
	static final int COMBAT_MIN_GAINS = 8;
	static final long PAUSE_MS = 3 * 60_000L;
	/** Fewer than this many actions means "almost done". */
	static final int ALMOST = 5;

	/** What to show: XP and actions to the goal, the pace and the time. actionsPerMinute and etaSeconds are null until we know them. */
	@Value
	static class Snapshot
	{
		int xp;
		int remainingXp;
		int actionsLeft;
		Double actionsPerMinute;
		Long etaSeconds;
		/** The time is an estimate from the step's data, not a measurement. */
		boolean estimated;
		boolean almost;
		boolean done;
	}

	private final ActiveTarget.Pacing pacing;
	/** The skill of this measurement: a combat step has several, each with its own. */
	private final String skill;
	private final int history;
	private final int minGains;
	private final Deque<long[]> gains = new ArrayDeque<>();
	private int xp = -1;

	PacingTracker(ActiveTarget.Pacing pacing)
	{
		this(pacing, pacing.getSkill());
	}

	PacingTracker(ActiveTarget.Pacing pacing, String skill)
	{
		this.pacing = pacing;
		this.skill = skill;
		boolean combat = ActiveTarget.Pacing.COMBAT.contains(skill);
		history = combat ? COMBAT_HISTORY : HISTORY;
		minGains = combat ? COMBAT_MIN_GAINS : MIN_GAINS;
	}

	String getSkill()
	{
		return skill;
	}

	/** The skill's XP; -1 means not known yet. */
	int getXp()
	{
		return xp;
	}

	ActiveTarget.Pacing getPacing()
	{
		return pacing;
	}

	/**
	 * A new XP value for a skill. true means something changed. The first non-zero value is the reference point, not a gain:
	 * right after login RuneLite still returns 0, and all the accumulated XP would otherwise be counted as one gain,
	 * the pace would shoot up and the time would show "~0 min" until the spike left the last five.
	 */
	boolean update(int currentXp, long nowMs)
	{
		if (currentXp < 0 || currentXp == xp)
		{
			return false;
		}
		if (xp > 0 && currentXp > xp)
		{
			long[] last = gains.peekLast();
			if (last != null && nowMs - last[0] > PAUSE_MS)
			{
				gains.clear();
			}
			gains.addLast(new long[]{nowMs, currentXp - xp});
			while (gains.size() > history)
			{
				gains.removeFirst();
			}
		}
		xp = currentXp;
		return true;
	}

	boolean hasXp()
	{
		return xp > 0;
	}

	Snapshot snapshot()
	{
		int remaining = Math.max(pacing.getTargetExp() - Math.max(xp, 0), 0);
		int actions = (int) Math.ceil(remaining / pacing.getExpPerAction());
		boolean done = xp >= 0 && remaining == 0;
		Double perMinute = null;
		boolean estimated = false;
		if (gains.size() >= minGains)
		{
			long span = gains.peekLast()[0] - gains.peekFirst()[0];
			long gained = 0;
			boolean first = true;
			for (long[] g : gains)
			{
				// The XP of the first gain was received before the interval began: it is not part of the pace.
				if (!first)
				{
					gained += g[1];
				}
				first = false;
			}
			if (span > 0 && gained > 0)
			{
				perMinute = gained / pacing.getExpPerAction() / (span / 60_000.0);
			}
		}
		if (perMinute == null && pacing.getSecondsPerAction() != null)
		{
			perMinute = 60.0 / pacing.getSecondsPerAction();
			estimated = true;
		}
		Long eta = perMinute == null || done ? null : Math.round(actions / perMinute * 60);
		return new Snapshot(Math.max(xp, 0), remaining, actions, perMinute, eta, estimated, !done && actions < ALMOST, done);
	}

	/** The HUD line: "34 shrimps to 20 Fishing (~7 min)", "Almost done", "Target level reached". */
	String hudLine(Snapshot s)
	{
		String name = skillName(skill);
		if (s.isDone())
		{
			return "✓ Target level reached: " + pacing.getTargetLevel() + " " + name;
		}
		String line = s.getActionsLeft() + " " + actionForm(pacing.getActionName(), s.getActionsLeft())
			+ " to " + pacing.getTargetLevel() + " " + name;
		if (s.isAlmost())
		{
			return "✓ Almost done: " + line;
		}
		return line + " (" + eta(s) + ")";
	}

	/** "fishing" -> "Fishing": how the skill is called in the game's skills tab. */
	static String skillName(String skill)
	{
		return Character.toUpperCase(skill.charAt(0)) + skill.substring(1);
	}

	static String eta(Snapshot s)
	{
		if (s.getEtaSeconds() == null)
		{
			return "calculating the time...";
		}
		long min = Math.round(s.getEtaSeconds() / 60.0);
		String time = min < 1 ? "<1 min" : "~" + min + " min";
		// An estimate from the step's data, not a measurement, and it says so: in combat it does not account for walking between enemies.
		return s.isEstimated() ? "estimate " + time : time;
	}

	/** The word form for a number: "shrimp|shrimps". */
	static String actionForm(String forms, int n)
	{
		String[] f = forms.split("\\|");
		return n == 1 ? f[0] : f[f.length - 1];
	}
}
