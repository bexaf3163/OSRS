package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Темп шага по одному навыку или по нескольким с одной целью — в бою: атака, сила, защита до 30.
 * Их качают по очереди, переключая стиль атаки, поэтому показывается навык, который сейчас растёт.
 * Пока опыт не прибавлялся — первый по порядку шага, ещё не достигший цели. Стиль Controlled даёт опыт
 * во все три сразу: показ не прыгает, пока растёт и показанный навык.
 * Без RuneLite: чистый расчёт, проверяется обычным тестом.
 */
final class PacingSet
{
	/** Столько без опыта в показанном навыке — и темп переходит на навык, который растёт. */
	static final long SWITCH_MS = 10_000L;

	private final ActiveTarget.Pacing pacing;
	private final Map<String, PacingTracker> trackers = new LinkedHashMap<>();
	private String active;
	/** Когда показанный навык последний раз получил опыт; null — прибавок ещё не было. */
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

	/** Навык, который показывается сейчас. */
	String getActive()
	{
		return active;
	}

	/** Новый опыт навыка. true — что-то изменилось. */
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

	/** Навыки, которые ещё не дошли до цели, кроме показанного, — по порядку шага. */
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
	 * Строка для HUD. У одного навыка — как у PacingTracker. В бою, когда показанный навык дошёл до цели,
	 * а другие нет: «✓ 30 Attack — дальше Strength: смени стиль атаки».
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
			return "✓ Целевой уровень достигнут: " + pacing.getTargetLevel() + " " + String.join(", ", names);
		}
		return "✓ " + pacing.getTargetLevel() + " " + PacingTracker.skillName(active)
			+ " — дальше " + PacingTracker.skillName(left.get(0)) + ": смени стиль атаки";
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
