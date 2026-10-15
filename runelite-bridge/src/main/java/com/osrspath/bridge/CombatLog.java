package com.osrspath.bridge;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.Value;

/**
 * What the fights of a combat training step really cost: for each opponent version (the name and combat level: the level 12 and the
 * level 27 Minotaur apart), the recent kills, the seconds between them and the damage taken. The app pulls its food and time estimate
 * towards these numbers, a little at a time.
 *
 * Only clean samples count: a kill whose time since the previous one is longer than PAUSE_MS (a bank trip, a break, the first kill of a
 * session) is not a sample, and the damage taken before it is dropped with it. A new step or another weapon starts over: the estimate is for
 * the gear in hand. The last WINDOW kills of each version are kept, so old levels fade out.
 * Without RuneLite: a pure calculation, checked by an ordinary test.
 */
final class CombatLog
{
	static final long PAUSE_MS = 60_000L;
	static final int WINDOW = 60;

	/** One opponent version's samples, summed. */
	@Value
	static class Entry
	{
		String name;
		int combat;
		int kills;
		double seconds;
		int damage;
	}

	private static final class Kill
	{
		final long ms;
		final int damage;

		Kill(long ms, int damage)
		{
			this.ms = ms;
			this.damage = damage;
		}
	}

	private final Map<String, Deque<Kill>> kills = new LinkedHashMap<>();
	private final Map<String, Entry> names = new LinkedHashMap<>();
	private String stepId;
	private int weaponId = Integer.MIN_VALUE;
	private long lastKillAt = -1;
	private int damage;

	/** The step and the weapon in hand; a change of either starts over. true — it was cleared. */
	boolean context(String step, int weapon)
	{
		if (Objects.equals(step, stepId) && weapon == weaponId)
		{
			return false;
		}
		boolean had = !kills.isEmpty();
		stepId = step;
		weaponId = weapon;
		kills.clear();
		names.clear();
		lastKillAt = -1;
		damage = 0;
		return had;
	}

	String getStepId()
	{
		return stepId;
	}

	/** Damage the player took (a hitsplat on them): it goes with the next kill, and is dropped with it if that kill is no sample. */
	void damage(int amount)
	{
		if (amount > 0)
		{
			damage += amount;
		}
	}

	/** An opponent the player fought died. true — a sample was added. */
	boolean kill(String name, int combat, long nowMs)
	{
		if (name == null || name.isEmpty())
		{
			return false;
		}
		boolean sample = lastKillAt >= 0 && nowMs - lastKillAt <= PAUSE_MS;
		long since = nowMs - lastKillAt;
		int taken = damage;
		lastKillAt = nowMs;
		damage = 0;
		if (!sample)
		{
			return false;
		}
		String key = name + "|" + combat;
		Deque<Kill> list = kills.computeIfAbsent(key, k -> new ArrayDeque<>());
		list.addLast(new Kill(since, taken));
		while (list.size() > WINDOW)
		{
			list.removeFirst();
		}
		names.put(key, new Entry(name, combat, 0, 0, 0));
		return true;
	}

	/** Per opponent version, in the order first met. */
	List<Entry> snapshot()
	{
		List<Entry> out = new ArrayList<>();
		for (Map.Entry<String, Deque<Kill>> e : kills.entrySet())
		{
			long ms = 0;
			int taken = 0;
			for (Kill k : e.getValue())
			{
				ms += k.ms;
				taken += k.damage;
			}
			Entry n = names.get(e.getKey());
			out.add(new Entry(n.getName(), n.getCombat(), e.getValue().size(), ms / 1000.0, taken));
		}
		return out;
	}
}
