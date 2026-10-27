package com.osrspath.bridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;

/**
 * How much each food heals (the app's src/data/threats.json, from the OSRS Wiki food articles). A pre-entry guard that asks for "10 Trout or other
 * food" counts what is carried by healing: 10 Cooked meat (3 each) are 4 Trout (7 each), not 10. The same rule as countOf in src/lib/preflight.ts.
 */
@Slf4j
final class Foods
{
	private static volatile Map<String, Integer> loaded;

	private Foods()
	{
	}

	/** The healing of one piece by name key, or null when the table does not know it. */
	static Integer heals(String name)
	{
		Map<String, Integer> m = loaded;
		if (m == null)
		{
			m = parse(Foods.class.getResourceAsStream("threats.json"));
			loaded = m;
		}
		return m.get(ActiveTarget.nameKey(name));
	}

	/** Named-food equivalents; sum healing before rounding, never count an alias twice. */
	static int count(ItemCounts items, Integer id, String name, java.util.List<String> alternatives, int healing)
	{
		return count(items, id, name, alternatives, healing, Collections.emptyMap(), Collections.emptyMap());
	}

	static int count(ItemCounts items, Integer id, String name, java.util.List<String> alternatives, int healing,
		Map<String, Integer> used, Map<String, Integer> reserved)
	{
		int unit = ItemCounts.effectiveHeal(healing);
		if (unit <= 0)
		{
			return 0;
		}
		long health = 0;
		String primary = ActiveTarget.nameKey(name);
		for (Map.Entry<String, Integer> part : parts(name, alternatives, healing).entrySet())
		{
			health += (long) available(items, part.getKey().equals(primary) ? id : null, part.getKey(), used, reserved) * part.getValue();
		}
		return (int) Math.min(Integer.MAX_VALUE, health / unit);
	}

	/** Allocate whole physical pieces, never the same bite to two requirements. Returns health still needed. */
	static long reserve(ItemCounts items, Integer id, String name, java.util.List<String> alternatives, int healing,
		long health, Map<String, Integer> used, Map<String, Integer> reserved)
	{
		String primary = ActiveTarget.nameKey(name);
		for (Map.Entry<String, Integer> part : parts(name, alternatives, healing).entrySet())
		{
			if (health <= 0) break;
			int free = available(items, part.getKey().equals(primary) ? id : null, part.getKey(), used, reserved);
			int take = (int) Math.min(free, (health + part.getValue() - 1) / part.getValue());
			used.merge(part.getKey(), take, Integer::sum);
			health = Math.max(0, health - (long) take * part.getValue());
		}
		return health;
	}

	private static int available(ItemCounts items, Integer id, String name, Map<String, Integer> used, Map<String, Integer> reserved)
	{
		return (int) Math.max(0, (long) items.exact(id, name) - used.getOrDefault(name, 0) - reserved.getOrDefault(name, 0));
	}

	private static Map<String, Integer> parts(String name, java.util.List<String> alternatives, int healing)
	{
		Map<String, Integer> out = new java.util.LinkedHashMap<>();
		out.put(ActiveTarget.nameKey(name), ItemCounts.effectiveHeal(healing));
		if (alternatives != null)
		{
			for (String other : alternatives)
			{
				Integer heals = heals(other);
				if (heals != null && heals > 0)
				{
					out.putIfAbsent(ActiveTarget.nameKey(other), ItemCounts.effectiveHeal(heals));
				}
			}
		}
		return out;
	}

	static Map<String, Integer> parse(InputStream in)
	{
		if (in == null)
		{
			return Collections.emptyMap();
		}
		try (InputStreamReader r = new InputStreamReader(in, StandardCharsets.UTF_8))
		{
			JsonObject root = new JsonParser().parse(r).getAsJsonObject();
			Map<String, Integer> out = new HashMap<>();
			for (JsonElement e : root.getAsJsonArray("foods"))
			{
				JsonObject f = e.getAsJsonObject();
				out.put(ActiveTarget.nameKey(f.get("name").getAsString()), f.get("heals").getAsInt());
			}
			return out;
		}
		catch (Exception ex)
		{
			// No table is the old rule (pieces), never a broken guard.
			log.warn("threats.json not read: {}", ex.toString());
			return Collections.emptyMap();
		}
	}
}
