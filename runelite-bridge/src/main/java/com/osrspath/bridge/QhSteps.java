package com.osrspath.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import lombok.Value;
import lombok.extern.slf4j.Slf4j;

/**
 * Where each Quest Helper step points: the tile, the kind (NpcStep, ObjectStep, ...) and the NPC or object id, extracted from its sources
 * (tests/fixtures/qh-steps.json, the same file the app's tests check our lines against). The plugin uses it for a step that has no line of its own
 * or only moves the player: "go down to Tess" is the hole on the beach, not Chief Tess's cave.
 */
@Slf4j
final class QhSteps
{
	@Value
	static class Tile
	{
		String typ;
		int x;
		int y;
		int plane;
		/** The NPC or object id; 0 when the step has none. */
		int id;

		boolean isNpc()
		{
			return "NpcStep".equals(typ);
		}

		boolean isObject()
		{
			return "ObjectStep".equals(typ);
		}
	}

	private static volatile Map<String, Map<String, Tile>> loaded;

	private QhSteps()
	{
	}

	static Map<String, Map<String, Tile>> all()
	{
		Map<String, Map<String, Tile>> m = loaded;
		if (m == null)
		{
			m = parse(QhSteps.class.getResourceAsStream("qh-steps.json"));
			loaded = m;
		}
		return m;
	}

	static Map<String, Map<String, Tile>> parse(InputStream in)
	{
		Map<String, Map<String, Tile>> out = new HashMap<>();
		if (in == null)
		{
			return out;
		}
		try (InputStreamReader r = new InputStreamReader(in, StandardCharsets.UTF_8))
		{
			JsonObject steps = new JsonParser().parse(r).getAsJsonObject().getAsJsonObject("steps");
			for (Map.Entry<String, JsonElement> q : steps.entrySet())
			{
				Map<String, Tile> tiles = new HashMap<>();
				for (Map.Entry<String, JsonElement> s : q.getValue().getAsJsonObject().entrySet())
				{
					JsonObject o = s.getValue().getAsJsonObject();
					if (!o.has("wp") || !o.get("wp").isJsonArray())
					{
						continue;
					}
					JsonArray wp = o.getAsJsonArray("wp");
					tiles.put(s.getKey(), new Tile(o.has("typ") ? o.get("typ").getAsString() : "", wp.get(0).getAsInt(), wp.get(1).getAsInt(),
						wp.get(2).getAsInt(), o.has("id") && o.get("id").isJsonPrimitive() ? o.get("id").getAsInt() : 0));
				}
				out.put(q.getKey(), tiles);
			}
		}
		catch (Exception ex)
		{
			log.warn("qh-steps.json not read: {}", ex.toString());
			return Collections.emptyMap();
		}
		return out;
	}

	/** The tile of a Quest Helper step of a route quest (S4-01, goDownToTess), or null. */
	static Tile tile(String stepId, String leaf)
	{
		if (stepId == null || leaf == null)
		{
			return null;
		}
		Map<String, Tile> q = all().get(stepId);
		return q == null ? null : q.get(leaf);
	}
}
