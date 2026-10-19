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
	/** The level each tier needs to be used for its skill (OSRS Wiki, "Pickaxe" and "Axe"); the same table as toolTiers.ts in the app. */
	private static final int[] TIER_LEVEL = {1, 1, 6, 11, 21, 31, 41, 61};
	/** The player's real Mining and Woodcutting levels; 0 while unknown, and then every tier counts (unknown is not missing). */
	private static volatile int miningLevel;
	private static volatile int woodcuttingLevel;

	/** A better tier the player cannot use yet (a Rune pickaxe at Mining 10) does not stand in for the named one. Set from the game's levels. */
	static void setToolLevels(int mining, int woodcutting)
	{
		miningLevel = mining;
		woodcuttingLevel = woodcutting;
	}

	/** Whether the player can use this item for its skill: false only for a pickaxe or axe tier above a known level. */
	static boolean usable(String name)
	{
		String key = ActiveTarget.nameKey(name);
		for (String kind : new String[]{" pickaxe", " axe"})
		{
			if (key.endsWith(kind))
			{
				int i = java.util.Arrays.asList(TIERS).indexOf(key.substring(0, key.length() - kind.length()));
				int level = " pickaxe".equals(kind) ? miningLevel : woodcuttingLevel;
				return i < 0 || level <= 0 || TIER_LEVEL[i] <= level;
			}
		}
		return true;
	}

	int count(Integer id, String name)
	{
		int n = id == null ? 0 : byId.getOrDefault(id, 0);
		String key = ActiveTarget.nameKey(name);
		int own = Math.max(n, byName.getOrDefault(key, 0));
		return Math.max(own, betterToolCount(key));
	}

	/**
	 * The item and the items that do the same job (the step's alt list), together. A tool tier that count() already takes as a better tool of
	 * the named one is not added a second time.
	 */
	int countWithAlt(Integer id, String name, java.util.List<String> alt)
	{
		int n = count(id, name);
		if (alt == null)
		{
			return n;
		}
		String key = ActiveTarget.nameKey(name);
		for (String other : alt)
		{
			String otherKey = ActiveTarget.nameKey(other);
			if (!otherKey.equals(key) && !isBetterTool(key, otherKey))
			{
				n += byName.getOrDefault(otherKey, 0);
			}
		}
		return n;
	}

	/** Whether "other" is a tier of the same tool at or above the named one (count() already includes it). */
	private static boolean isBetterTool(String key, String other)
	{
		for (String kind : new String[]{" pickaxe", " axe"})
		{
			if (key.endsWith(kind) && other.endsWith(kind))
			{
				int from = java.util.Arrays.asList(TIERS).indexOf(key.substring(0, key.length() - kind.length()));
				int to = java.util.Arrays.asList(TIERS).indexOf(other.substring(0, other.length() - kind.length()));
				return from >= 0 && to >= from;
			}
		}
		return false;
	}

	/** A potion with a dose count in its name: "Strength potion(4)". The same test as doseKind.ts in the app. */
	private static final java.util.regex.Pattern SIZED = java.util.regex.Pattern.compile("^(.*\\S)\\s*\\(([1-4])\\)$");
	private static final java.util.regex.Pattern POTION = java.util.regex.Pattern.compile(
		"(potion|brew|restore|antipoison|antidote\\+*|serum|balm|guthix rest|super (attack|strength|defence|energy|combat))$", java.util.regex.Pattern.CASE_INSENSITIVE);

	/** The potion's name without its size ("Strength potion" for "Strength potion(4)"); null for anything that is not a potion counted in doses. */
	static String doseBase(String name)
	{
		if (name == null)
		{
			return null;
		}
		java.util.regex.Matcher m = SIZED.matcher(name.trim());
		return m.matches() && POTION.matcher(m.group(1)).find() ? m.group(1) : null;
	}

	/** The four sizes of the potion a name belongs to, (1) to (4); empty for anything else. */
	static java.util.List<String> doseNames(String name)
	{
		String base = doseBase(name);
		if (base == null)
		{
			return java.util.Collections.emptyList();
		}
		java.util.List<String> out = new java.util.ArrayList<>(4);
		for (int d = 1; d <= 4; d++)
		{
			out.add(base + "(" + d + ")");
		}
		return out;
	}

	/**
	 * Doses of a potion across its four sizes: a (3) and a (1) are 4 doses of "Strength potion(4)". Counted by name, every size by its own doses
	 * (doses.ts in the app counts the same way). 0 for anything that is not a potion.
	 */
	int doses(String name)
	{
		String base = doseBase(name);
		if (base == null)
		{
			return 0;
		}
		String key = ActiveTarget.nameKey(base);
		int n = 0;
		for (int d = 1; d <= 4; d++)
		{
			n += d * byName.getOrDefault(key + "(" + d + ")", 0);
		}
		return n;
	}

	/** Exactly this item: by ID when there is one (two items can share a name), else by name; no better-tool substitutes. */
	int exact(Integer id, String name)
	{
		return id != null ? byId.getOrDefault(id, 0) : byName.getOrDefault(ActiveTarget.nameKey(name), 0);
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
			int level = " pickaxe".equals(kind) ? miningLevel : woodcuttingLevel;
			int total = 0;
			for (int i = from; i < TIERS.length; i++)
			{
				if (i > from && level > 0 && TIER_LEVEL[i] > level)
				{
					continue;
				}
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
