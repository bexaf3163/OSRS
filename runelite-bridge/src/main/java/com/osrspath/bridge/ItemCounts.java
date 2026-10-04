package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.function.IntUnaryOperator;

/**
 * How many of which items are in a container (bag, worn items, bank). Computed once per
 * ItemContainerChanged event, not every frame. An item is looked up by ID, and if there is no ID or it differs
 * (the wiki and the game sometimes have different variants of one item), by name; the larger is taken.
 */
final class ItemCounts
{
	static final ItemCounts EMPTY = new ItemCounts();

	private final Map<Integer, Integer> byId = new HashMap<>();
	private final Map<String, Integer> byName = new HashMap<>();

	/** name is already a comparison key (ActiveTarget.nameKey). Stacks are added. */
	void add(int id, String name, int quantity)
	{
		if (quantity <= 0)
		{
			return;
		}
		byId.merge(id, quantity, Integer::sum);
		if (name != null && !name.isEmpty())
		{
			byName.merge(name, quantity, Integer::sum);
		}
	}

	/** How many items with this ID. */
	int idCount(int id)
	{
		return byId.getOrDefault(id, 0);
	}

	/** The count by item ID, for saving the bank between sessions. A copy: the counters cannot be changed from outside. */
	Map<Integer, Integer> idCounts()
	{
		return new HashMap<>(byId);
	}

	/** Everything together: bag + notes + bank, how much of the item the player has at all. null ones are skipped. */
	static ItemCounts sum(ItemCounts... parts)
	{
		ItemCounts out = new ItemCounts();
		for (ItemCounts p : parts)
		{
			if (p == null)
			{
				continue;
			}
			p.byId.forEach((k, v) -> out.byId.merge(k, v, Integer::sum));
			p.byName.forEach((k, v) -> out.byName.merge(k, v, Integer::sum));
		}
		return out;
	}

	/** Tool tiers in ascending order: an Iron pickaxe will do instead of a Bronze pickaxe. */
	private static final String[] TIERS = {"bronze", "iron", "steel", "black", "mithril", "adamant", "rune", "dragon"};

	int count(Integer id, String name)
	{
		int n = id == null ? 0 : byId.getOrDefault(id, 0);
		String key = ActiveTarget.nameKey(name);
		int own = Math.max(n, byName.getOrDefault(key, 0));
		return Math.max(own, betterToolCount(key));
	}

	/**
	 * An axe or pickaxe no worse than the named one: if a Bronze pickaxe is needed, Iron, Steel and above also fit. The sum over tiers from
	 * the named one and up; a non-tool is 0. Combat "Black axe" and other names outside the pattern are not affected.
	 */
	private int betterToolCount(String key)
	{
		for (String kind : new String[]{" pickaxe", " axe"})
		{
			if (!key.endsWith(kind))
			{
				continue;
			}
			String tier = key.substring(0, key.length() - kind.length());
			int from = java.util.Arrays.asList(TIERS).indexOf(tier);
			if (from < 0)
			{
				return 0;
			}
			int total = 0;
			for (int i = from; i < TIERS.length; i++)
			{
				total += byName.getOrDefault(TIERS[i] + kind, 0);
			}
			return total;
		}
		return 0;
	}

	/**
	 * For auto-tick: with an ID, only that item (the Dragon Slayer I map pieces share one name among three),
	 * without an ID, all the names together.
	 */
	int count(ActiveTarget.ItemNeed need)
	{
		if (need.getId() != null)
		{
			return byId.getOrDefault(need.getId(), 0);
		}
		int n = 0;
		for (String name : need.getNames())
		{
			n += byName.getOrDefault(ActiveTarget.nameKey(name), 0);
		}
		return n;
	}

	boolean isEmpty()
	{
		return byId.isEmpty();
	}

	/** What changed since last time: name -> difference (positive means it increased). For the debug log. */
	Map<String, Integer> deltaFrom(ItemCounts before)
	{
		Map<String, Integer> out = new java.util.TreeMap<>();
		Map<String, Integer> prev = before == null ? Collections.emptyMap() : before.byName;
		for (Map.Entry<String, Integer> e : byName.entrySet())
		{
			int d = e.getValue() - prev.getOrDefault(e.getKey(), 0);
			if (d != 0)
			{
				out.put(e.getKey(), d);
			}
		}
		for (Map.Entry<String, Integer> e : prev.entrySet())
		{
			if (!byName.containsKey(e.getKey()))
			{
				out.put(e.getKey(), -e.getValue());
			}
		}
		return out;
	}

	/** A number that changes with the contents: the engine watchdog only needs to know "did the bag change". */
	int fingerprint()
	{
		return byName.hashCode();
	}

	/**
	 * A value estimate by exchange prices: price(id) is the price of one, 0 for untradeable ones. Coins (skip) are not included:
	 * they are counted separately, as exact money. Each item once: by ID, not by name.
	 */
	long value(IntUnaryOperator price, int skip)
	{
		long sum = 0;
		for (Map.Entry<Integer, Integer> e : byId.entrySet())
		{
			if (e.getKey() != skip)
			{
				sum += (long) Math.max(0, price.applyAsInt(e.getKey())) * e.getValue();
			}
		}
		return sum;
	}
}
