package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The pace of a step by one skill or by several with one goal, in combat: Attack, Strength, Defence to 30.
 * They are trained in turn, switching the attack style, so the skill that is growing now is shown.
 * While no XP has been gained, the first in the step's order that has not reached the goal. The Controlled style gives XP
 * to all three at once: the display does not jump while the shown skill is growing too.
 * Without RuneLite: a pure calculation, checked by an ordinary test.
 */
final class PacingSet
{
	/** This long without XP in the shown skill, and the pace moves to the skill that is growing. */
	static final long SWITCH_MS = 10_000L;

	private final ActiveTarget.Pacing pacing;
	private final Map<String, PacingTracker> trackers = new LinkedHashMap<>();
	private String active;
	/** When the shown skill last got XP; null means there have been no gains yet. */
	private Long activeGainAt;

	PacingSet(ActiveTarget.Pacing pacing)
	{
		this.pacing = pacing;
		for (String skill : pacing.skills())
		{
			trackers.put(skill, new PacingTracker(pacing, skill));
		}
		active = pacing.getSkill();
	}

	ActiveTarget.Pacing getPacing()
	{
		return pacing;
	}

	Set<String> skills()
	{
		return trackers.keySet();
	}

	boolean tracks(String skill)
	{
		return trackers.containsKey(skill);
	}

	/** The skill shown now. */
	String getActive()
	{
		return active;
	}

	/** A new XP value for a skill. true means something changed. */
	boolean update(String skill, int xp, long nowMs)
	{
		PacingTracker t = trackers.get(skill);
		if (t == null)
		{
			return false;
		}
		int before = t.getXp();
		if (!t.update(xp, nowMs))
		{
			return false;
		}
		if (before > 0 && xp > before)
		{
			if (skill.equals(active))
			{
				activeGainAt = nowMs;
			}
			else if (activeGainAt == null || nowMs - activeGainAt > SWITCH_MS || trackers.get(active).snapshot().isDone())
			{
				active = skill;
				activeGainAt = nowMs;
			}
		}
		else if (activeGainAt == null)
		{
			active = firstUnfinished();
		}
		return true;
	}

	boolean hasXp()
	{
		return trackers.get(active).hasXp();
	}

	PacingTracker.Snapshot snapshot()
	{
		return trackers.get(active).snapshot();
	}

	/** The skills that have not reached the goal yet, besides the shown one, in the step's order. */
	List<String> left()
	{
		List<String> out = new ArrayList<>();
		for (PacingTracker t : trackers.values())
		{
			if (!t.getSkill().equals(active) && !t.snapshot().isDone())
			{
				out.add(t.getSkill());
			}
		}
		return out;
	}

	/**
	 * The HUD line. For one skill, like PacingTracker. In combat, when the shown skill reached the goal
	 * and others did not: "✓ 30 Attack - next Strength: change attack style".
	 */
	String hudLine(PacingTracker.Snapshot s)
	{
		PacingTracker t = trackers.get(active);
		if (!s.isDone() || trackers.size() == 1)
		{
			return t.hudLine(s);
		}
		List<String> left = left();
		if (left.isEmpty())
		{
			List<String> names = new ArrayList<>();
			for (String skill : trackers.keySet())
			{
				names.add(PacingTracker.skillName(skill));
			}
			return "✓ Target level reached: " + pacing.getTargetLevel() + " " + String.join(", ", names);
		}
		return "✓ " + pacing.getTargetLevel() + " " + PacingTracker.skillName(active)
			+ " - next " + PacingTracker.skillName(left.get(0)) + ": change attack style";
	}

	private String firstUnfinished()
	{
		for (PacingTracker t : trackers.values())
		{
			if (t.hasXp() && !t.snapshot().isDone())
			{
				return t.getSkill();
			}
		}
		return pacing.getSkill();
	}
}
