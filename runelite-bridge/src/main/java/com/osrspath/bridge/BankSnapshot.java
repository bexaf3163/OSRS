package com.osrspath.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Последнее известное содержимое банка: запоминается, чтобы после перезапуска RuneLite банк не был «неизвестен», пока
 * его снова не откроешь. Хранится в настройках профиля RuneLite (на каждого персонажа свой), строкой
 * {@code {"v":1,"at":время,"items":{"ID":число,…}}} — только ID и числа, без имён: имена плагин берёт у игры при загрузке.
 * Читается с недоверием: настройки можно править руками, поэтому всё проверяется и мусор отбрасывается целиком.
 */
final class BankSnapshot
{
	/** В банке не больше 1410 ячеек; с запасом на разные виды предметов. */
	static final int MAX_ITEMS = 2000;
	static final int MAX_ID = 100_000;
	static final String KEY = "bankSnapshot";

	/** Разобранный снимок: когда записан и что в банке (ID → число). */
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

	/** Строка для настроек. Пустой банк тоже запоминается — он «известен». */
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

	/** Разобрать строку из настроек; null — нет снимка или он негоден. */
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
