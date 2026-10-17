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
