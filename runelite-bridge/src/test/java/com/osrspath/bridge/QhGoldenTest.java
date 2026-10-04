package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * Эталон и плагин обязаны отвечать одинаково: тысячи наборов фактов игры (случайных и подобранных под условия) прогоняются через
 * все машины квестов. Ответы эталона (Python, как в Quest Helper) записаны в qh-golden.json; здесь тот же набор идёт через QhMachine.
 */
public class QhGoldenTest
{
	/** Факты из JSON-вектора. */
	static final class JsonFacts implements QhMachine.Facts
	{
		private final JsonObject f;
		private final List<QhMachine.Event> events = new ArrayList<>();

		JsonFacts(JsonObject f)
		{
			this.f = f;
			for (JsonElement e : f.getAsJsonArray("events"))
			{
				JsonArray a = e.getAsJsonArray();
				events.add(new QhMachine.Event(a.get(0).getAsString(), a.get(2).getAsString()));
			}
		}

		private static int sum(JsonObject table, int[] ids)
		{
			int total = 0;
			for (int id : ids)
			{
				JsonElement v = table.get(String.valueOf(id));
				total += v == null ? 0 : v.getAsInt();
			}
			return total;
		}

		@Override
		public int items(int[] ids, boolean onlyWorn, boolean bank)
		{
			int total = sum(f.getAsJsonObject("equip"), ids);
			if (!onlyWorn)
			{
				total += sum(f.getAsJsonObject("items"), ids);
			}
			if (bank)
			{
				total += sum(f.getAsJsonObject("bank"), ids);
			}
			return total;
		}

		@Override
		public int[] position()
		{
			if (f.get("pos").isJsonNull())
			{
				return null;
			}
			JsonArray p = f.getAsJsonArray("pos");
			return new int[] {p.get(0).getAsInt(), p.get(1).getAsInt(), p.get(2).getAsInt()};
		}

		@Override
		public int varbit(int id)
		{
			JsonElement v = f.getAsJsonObject("vb").get(String.valueOf(id));
			return v == null ? 0 : v.getAsInt();
		}

		@Override
		public int varp(int id)
		{
			JsonElement v = f.getAsJsonObject("vp").get(String.valueOf(id));
			return v == null ? 0 : v.getAsInt();
		}

		@Override
		public List<QhMachine.Event> events()
		{
			return events;
		}

		@Override
		public List<String> widget(int group, int child, boolean children)
		{
			JsonElement w = f.getAsJsonObject("widgets").get(group + ":" + child);
			if (w == null)
			{
				return null;
			}
			List<String> all = new ArrayList<>();
			for (JsonElement t : w.getAsJsonArray())
			{
				all.add(t.getAsString());
			}
			return children ? all : all.subList(0, 1);
		}

		@Override
		public Boolean npc(int id, int[] zone)
		{
			for (JsonElement e : f.getAsJsonArray("npcs"))
			{
				JsonArray a = e.getAsJsonArray();
				if (a.get(0).getAsInt() == id && (zone == null || QhMachine.inZone(zone, a.get(1).getAsInt(), a.get(2).getAsInt(), a.get(3).getAsInt())))
				{
					return Boolean.TRUE;
				}
			}
			return Boolean.FALSE;
		}

		@Override
		public Boolean object(int[] ids, int[] zone)
		{
			for (JsonElement e : f.getAsJsonArray("objs"))
			{
				JsonArray a = e.getAsJsonArray();
				for (int id : ids)
				{
					if (a.get(0).getAsInt() == id && (zone == null || QhMachine.inZone(zone, a.get(1).getAsInt(), a.get(2).getAsInt(), a.get(3).getAsInt())))
					{
						return Boolean.TRUE;
					}
				}
			}
			return Boolean.FALSE;
		}

		@Override
		public int skill(String name)
		{
			JsonElement v = f.getAsJsonObject("skills").get(name);
			return v == null ? 1 : v.getAsInt();
		}

		@Override
		public String quest(String name)
		{
			JsonElement v = f.getAsJsonObject("quests").get(name);
			return v == null ? null : v.getAsString();
		}
	}

	@Test
	public void ресурсМашинЗагружается_ивНёмВсеКвестыМаршрута()
	{
		Map<String, QhMachine> all = QhMachine.all();
		assertTrue("машин мало: " + all.size(), all.size() >= 30);
		assertNotNull(all.get("S2-09"));
		assertTrue(all.get("S2-09").hasStage(1));
	}

	@Test
	public void плагинОтвечаетКакЭталон_наВсехВекторах()
	{
		JsonObject root = new JsonParser().parse(new InputStreamReader(getClass().getResourceAsStream("/qh-golden.json"), StandardCharsets.UTF_8)).getAsJsonObject();
		Map<String, QhMachine> all = QhMachine.all();
		int checked = 0;
		int strong = 0;
		int undecided = 0;
		List<String> bad = new ArrayList<>();
		for (JsonElement ve : root.getAsJsonArray("vectors"))
		{
			JsonObject v = ve.getAsJsonObject();
			String quest = v.get("quest").getAsString();
			int var = v.get("var").getAsInt();
			QhMachine m = all.get(quest);
			assertNotNull(quest, m);
			QhMachine.Session session = new QhMachine.Session();
			int stepNo = 0;
			for (JsonElement se : v.getAsJsonArray("steps"))
			{
				JsonObject step = se.getAsJsonObject();
				JsonObject expect = step.getAsJsonObject("expect");
				QhMachine.Verdict got = m.resolve(var, new JsonFacts(step.getAsJsonObject("facts")), session);
				checked++;
				boolean wantUndecided = expect.get("undecided").getAsBoolean();
				if (wantUndecided != got.isUndecided())
				{
					bad.add(quest + "@" + var + " шаг " + stepNo + ": ждали undecided=" + wantUndecided + ", получили " + got.isUndecided());
				}
				else if (!wantUndecided)
				{
					String wantLeaf = expect.get("leaf").getAsString();
					List<String> wantPath = new ArrayList<>();
					for (JsonElement p : expect.getAsJsonArray("path"))
					{
						wantPath.add(p.getAsString());
					}
					if (!wantLeaf.equals(got.getLeaf()) || expect.get("strong").getAsBoolean() != got.isStrong() || !wantPath.equals(got.getPath()))
					{
						bad.add(quest + "@" + var + " шаг " + stepNo + ": ждали " + wantLeaf + " strong=" + expect.get("strong").getAsBoolean() + " " + wantPath
							+ ", получили " + got.getLeaf() + " strong=" + got.isStrong() + " " + got.getPath());
					}
					if (got.isStrong())
					{
						strong++;
					}
				}
				else
				{
					undecided++;
				}
				stepNo++;
			}
		}
		assertTrue("векторов мало: " + checked, checked > 1500);
		assertTrue("сильных ответов мало — тест ничего не проверяет: " + strong, strong > 500);
		assertTrue("«не знаю» ни разу — вектора не задевают неизвестные условия: " + undecided, undecided > 20);
		assertTrue("расхождений с эталоном: " + bad.size() + "\n" + String.join("\n", bad.subList(0, Math.min(15, bad.size()))), bad.isEmpty());
		assertFalse(bad.size() > 0);
	}
}
