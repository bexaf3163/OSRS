package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.junit.After;
import org.junit.Test;

/** The same wire fixtures are consumed by the TypeScript preparation tests. */
public class ItemOwnershipContractTest
{
	@After
	public void resetLevels()
	{
		ItemCounts.setToolLevels(0, 0);
	}

	private static ItemCounts counts(JsonArray rows)
	{
		ItemCounts out = new ItemCounts();
		for (JsonElement value : rows)
		{
			JsonObject row = value.getAsJsonObject();
			out.add(row.get("id").getAsInt(), ActiveTarget.nameKey(row.get("name").getAsString()), row.get("count").getAsInt());
		}
		return out;
	}

	@Test
	public void physicalCountsAndLegacyFieldsMatchTheSharedWireFixtures()
	{
		Gson gson = new Gson();
		JsonArray cases = gson.fromJson(new InputStreamReader(getClass().getResourceAsStream("/item-ownership.json"), StandardCharsets.UTF_8), JsonArray.class);
		for (JsonElement value : cases)
		{
			JsonObject c = value.getAsJsonObject();
			ItemCounts.setToolLevels(c.get("mining").getAsInt(), c.get("woodcutting").getAsInt());
			ItemCounts bag = counts(c.getAsJsonArray("bag"));
			ItemCounts notes = counts(c.getAsJsonArray("notes"));
			ItemCounts bank = c.get("bank").isJsonNull() ? null : counts(c.getAsJsonArray("bank"));
			JsonArray actual = new JsonArray();
			for (JsonElement watched : c.getAsJsonArray("watch"))
			{
				JsonObject w = watched.getAsJsonObject();
				actual.add(gson.toJsonTree(ItemCounts.report(w.get("name").getAsString(), w.has("id") ? w.get("id").getAsInt() : null, bag, notes, bank)));
			}
			assertEquals(c.get("name").getAsString(), c.get("rows"), actual);
		}
	}
}
