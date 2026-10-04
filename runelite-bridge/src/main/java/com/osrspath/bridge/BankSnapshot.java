package com.osrspath.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The last known bank contents: remembered so that after a RuneLite restart the bank is not "unknown" until
 * you open it again. Stored in the RuneLite profile settings (a separate one for each character) as the string
 * {@code {"v":1,"at":time,"items":{"ID":count,...}}}: only IDs and numbers, no names: the plugin takes the names from the game on loading.
 * Read with distrust: the settings can be edited by hand, so everything is validated and junk is discarded whole.
 */
final class BankSnapshot
{
	/** The bank has no more than 1410 cells; with a margin for different kinds of items. */
	static final int MAX_ITEMS = 2000;
	static final int MAX_ID = 100_000;
	static final String KEY = "bankSnapshot";

	/** A parsed snapshot: when it was written and what is in the bank (ID -> count). */
	static final class Loaded
	{
		final long at;
		final Map<Integer, Integer> items;

		Loaded(long at, Map<Integer, Integer> items)
		{
			this.at = at;
			this.items = items;
		}
	}

	private static final Gson GSON = new Gson();

	private BankSnapshot()
	{
	}

	/** The string for the settings. An empty bank is remembered too: it is "known". */
	static String write(ItemCounts bank, long at)
	{
		JsonObject o = new JsonObject();
		o.addProperty("v", 1);
		o.addProperty("at", at);
		JsonObject items = new JsonObject();
		Map<Integer, Integer> ids = new LinkedHashMap<>(bank.idCounts());
		int n = 0;
		for (Map.Entry<Integer, Integer> e : ids.entrySet())
		{
			if (++n > MAX_ITEMS)
			{
				break;
			}
			items.addProperty(String.valueOf(e.getKey()), e.getValue());
		}
		o.add("items", items);
		return GSON.toJson(o);
	}

	/** Parse a string from the settings; null means there is no snapshot or it is unusable. */
	static Loaded read(String raw)
	{
		if (raw == null || raw.isEmpty() || raw.length() > 400_000)
		{
			return null;
		}
		try
		{
			JsonElement root = new JsonParser().parse(raw);
			if (!root.isJsonObject())
			{
				return null;
			}
			JsonObject o = root.getAsJsonObject();
			if (!o.has("v") || o.get("v").getAsInt() != 1 || !o.has("items") || !o.get("items").isJsonObject())
			{
				return null;
			}
			long at = o.has("at") ? o.get("at").getAsLong() : 0;
			Map<Integer, Integer> items = new LinkedHashMap<>();
			for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("items").entrySet())
			{
				int id = Integer.parseInt(e.getKey());
				int count = e.getValue().getAsInt();
				if (id < 1 || id > MAX_ID || count < 1 || items.size() >= MAX_ITEMS)
				{
					return null;
				}
				items.put(id, count);
			}
			return new Loaded(Math.max(0, at), items);
		}
		catch (RuntimeException e)
		{
			return null;
		}
	}
}
