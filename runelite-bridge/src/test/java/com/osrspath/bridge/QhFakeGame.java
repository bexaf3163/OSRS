package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A game for the scenario tests of the Quest Helper machine: mutable facts - bag, worn, bank, place, messages, widgets, variables.
 * Messages like "Luthas hands you 30 coins." and dialogues like "Luthas|If you could fill it up…" are recorded the way the plugin sees them.
 */
final class QhFakeGame implements QhMachine.Facts
{
	final Map<Integer, Integer> bag = new HashMap<>();
	final Map<Integer, Integer> worn = new HashMap<>();
	final Map<Integer, Integer> bank = new HashMap<>();
	final Map<Integer, Integer> varbits = new HashMap<>();
	final Map<Integer, Integer> varps = new HashMap<>();
	final Map<String, List<String>> widgets = new HashMap<>();
	final Map<String, Integer> skills = new HashMap<>();
	final Map<String, String> quests = new HashMap<>();
	final List<int[]> npcs = new ArrayList<>();
	final List<QhMachine.Event> events = new ArrayList<>();
	int[] pos = {3028, 3220, 0};

	QhFakeGame at(int x, int y)
	{
		pos = new int[] {x, y, 0};
		return this;
	}

	QhFakeGame give(int id, int n)
	{
		bag.merge(id, n, Integer::sum);
		return this;
	}

	QhFakeGame take(int id)
	{
		bag.remove(id);
		return this;
	}

	QhFakeGame chat(String text)
	{
		events.add(new QhMachine.Event("GAMEMESSAGE", text));
		return this;
	}

	QhFakeGame mes(String text)
	{
		events.add(new QhMachine.Event("MESBOX", text));
		return this;
	}

	QhFakeGame say(String who, String text)
	{
		events.add(new QhMachine.Event("DIALOG", who + "|" + text));
		return this;
	}

	/** The quest journal window: the heading (119:5) and the text lines (119:6, the widget itself comes first). */
	QhFakeGame journal(String title, String... lines)
	{
		widgets.put("119:5", Arrays.asList(title));
		List<String> all = new ArrayList<>();
		all.add("");
		all.addAll(Arrays.asList(lines));
		widgets.put("119:6", all);
		return this;
	}

	QhFakeGame closeJournal()
	{
		widgets.remove("119:5");
		widgets.remove("119:6");
		return this;
	}

	private static int sum(Map<Integer, Integer> table, int[] ids)
	{
		int total = 0;
		for (int id : ids)
		{
			total += table.getOrDefault(id, 0);
		}
		return total;
	}

	@Override
	public int items(int[] ids, boolean onlyWorn, boolean withBank)
	{
		int total = sum(worn, ids) + (onlyWorn ? 0 : sum(bag, ids));
		return withBank ? total + sum(bank, ids) : total;
	}

	@Override
	public int[] position()
	{
		return pos;
	}

	@Override
	public int varbit(int id)
	{
		return varbits.getOrDefault(id, 0);
	}

	@Override
	public int varp(int id)
	{
		return varps.getOrDefault(id, 0);
	}

	@Override
	public List<QhMachine.Event> events()
	{
		return events;
	}

	@Override
	public List<String> widget(int group, int child, boolean children)
	{
		List<String> w = widgets.get(group + ":" + child);
		if (w == null)
		{
			return null;
		}
		return children ? w : w.subList(0, 1);
	}

	@Override
	public Boolean npc(int id, int[] zone)
	{
		for (int[] n : npcs)
		{
			if (n[0] == id && (zone == null || QhMachine.inZone(zone, n[1], n[2], n[3])))
			{
				return Boolean.TRUE;
			}
		}
		return Boolean.FALSE;
	}

	@Override
	public Boolean object(int[] ids, int[] zone)
	{
		return Boolean.FALSE;
	}

	@Override
	public int skill(String name)
	{
		return skills.getOrDefault(name, 1);
	}

	@Override
	public String quest(String name)
	{
		return quests.get(name);
	}
}
