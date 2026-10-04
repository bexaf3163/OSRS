package com.osrspath.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import lombok.Value;

/**
 * Машина состояний квеста — условия, по которым Quest Helper выбирает текущий шаг этапа. Данные (src/data/questMachines.json)
 * собраны из его исходников; здесь они выполняются так же: условия проверяются подряд, первое выполненное выбирает шаг, иначе
 * шаг по умолчанию; «защёлки» Conditions(true, …) помнят, что условие хоть раз выполнялось.
 *
 * Условие даёт один из трёх ответов: да, нет, «не знаю» (null) — когда в нём то, чего плагин не видит (настройки Quest Helper,
 * предмет на земле). Если «не знаю» встретилось раньше выполненного условия, машина не решает: шаг определит прежняя логика.
 *
 * Чистая логика: игру читают через {@link Facts}, поэтому всё проверяется тестами без клиента.
 */
final class QhMachine
{
	/** Что плагин знает об игре. null в ответе — «не знаю». */
	interface Facts
	{
		/** Сколько предметов с этими ID: onlyWorn — только надетое; иначе сумка и надетое; bank — ещё и банк. */
		int items(int[] ids, boolean onlyWorn, boolean bank);

		/** Клетка игрока {x, y, plane} или null, если игрока нет. */
		int[] position();

		int varbit(int id);

		int varp(int id);

		/** Сообщения с начала наблюдения: тип (GAMEMESSAGE, ENGINE, SPAM, MESBOX, DIALOG), текст. */
		List<Event> events();

		/** Тексты виджета (сам виджет первым, дети следом) или null, если его нет на экране. */
		List<String> widget(int group, int child, boolean children);

		/** Есть ли в сцене NPC с этим ID (и в зоне, если задана {x1,y1,x2,y2,plane1,plane2}). null — не знаю. */
		Boolean npc(int id, int[] zone);

		Boolean object(int[] ids, int[] zone);

		int skill(String name);

		/** Состояние квеста по названию из Quest Helper (PIRATES_TREASURE): "FINISHED", "IN_PROGRESS", "NOT_STARTED"; null — не знаю. */
		String quest(String name);
	}

	@Value
	static class Event
	{
		String type;
		String text;
	}

	/** Что выбрала машина. leaf — шаг Quest Helper; path — имена вложенных условных шагов и сам лист (от внешнего к внутреннему). */
	@Value
	static class Verdict
	{
		static final Verdict UNDECIDED = new Verdict(null, Collections.<String>emptyList(), false, true);

		String leaf;
		List<String> path;
		/** Выбор сделало выполненное условие, а не шаг «по умолчанию». */
		boolean strong;
		/** Встретилось «не знаю» раньше выполненного условия: машина не решает. */
		boolean undecided;
	}

	/** Защёлки условий: состояние живёт, пока игрок не сменил квест или не вышел из игры. */
	static final class Session
	{
		private final IdentityHashMap<Object, Boolean> latched = new IdentityHashMap<>();

		void reset()
		{
			latched.clear();
		}
	}

	private final JsonObject stages;
	private final JsonObject nodes;
	private final JsonObject reqs;
	private final Map<String, List<String>> alias = new HashMap<>();

	QhMachine(JsonObject quest)
	{
		stages = quest.has("stages") ? quest.getAsJsonObject("stages") : new JsonObject();
		nodes = quest.has("nodes") ? quest.getAsJsonObject("nodes") : new JsonObject();
		reqs = quest.has("reqs") ? quest.getAsJsonObject("reqs") : new JsonObject();
		if (quest.has("alias"))
		{
			for (Map.Entry<String, JsonElement> e : quest.getAsJsonObject("alias").entrySet())
			{
				List<String> parents = new ArrayList<>();
				for (JsonElement p : e.getValue().getAsJsonArray())
				{
					parents.add(p.getAsString());
				}
				alias.put(e.getKey(), parents);
			}
		}
	}

	/** Есть ли у Quest Helper шаг для этого значения переменной квеста. */
	boolean hasStage(int varValue)
	{
		return stages.has(String.valueOf(varValue));
	}

	/** Выбор машины для значения переменной квеста. */
	Verdict resolve(int varValue, Facts facts, Session session)
	{
		JsonElement root = stages.get(String.valueOf(varValue));
		if (root == null)
		{
			return Verdict.UNDECIDED;
		}
		return resolveNode(root, facts, session, new ArrayList<String>(), false, 0);
	}

	/** Шаги, в которые «входит» лист: он сам и родители из addSubSteps. */
	List<String> aliases(String leaf)
	{
		List<String> out = alias.get(leaf);
		return out == null ? Collections.<String>emptyList() : out;
	}

	// ---------------------------------------------------------------- узлы

	private JsonObject node(JsonElement ref)
	{
		if (ref.isJsonPrimitive())
		{
			JsonObject n = nodes.getAsJsonObject(ref.getAsString());
			return n == null ? new JsonObject() : n;
		}
		return ref.getAsJsonObject();
	}

	private Verdict resolveNode(JsonElement ref, Facts f, Session s, List<String> path, boolean strong, int depth)
	{
		if (depth > 40)
		{
			return Verdict.UNDECIDED;
		}
		JsonObject n = node(ref);
		List<String> here = new ArrayList<>(path);
		if (n.has("n"))
		{
			here.add(n.get("n").getAsString());
		}
		if (n.has("s"))
		{
			here.add(n.get("s").getAsString());
			return new Verdict(n.get("s").getAsString(), here, strong, false);
		}
		JsonElement lastPossible = null;
		JsonArray entries = n.has("c") ? n.getAsJsonArray("c") : new JsonArray();
		for (JsonElement entry : entries)
		{
			JsonArray pair = entry.getAsJsonArray();
			JsonElement child = pair.get(1);
			boolean locked = locked(node(child), f, s);
			Boolean r = ev(pair.get(0), f, s);
			if (Boolean.TRUE.equals(r) && !locked)
			{
				return resolveNode(child, f, s, here, true, depth + 1);
			}
			if (r == null && !locked)
			{
				return Verdict.UNDECIDED;
			}
			if (!locked)
			{
				lastPossible = child;
			}
		}
		JsonElement def = n.get("d");
		if (def == null)
		{
			return Verdict.UNDECIDED;
		}
		if (locked(node(def), f, s) && lastPossible != null)
		{
			return resolveNode(lastPossible, f, s, here, strong, depth + 1);
		}
		return resolveNode(def, f, s, here, strong, depth + 1);
	}

	private boolean locked(JsonObject n, Facts f, Session s)
	{
		return n.has("l") && Boolean.TRUE.equals(ev(n.get("l"), f, s));
	}

	// ---------------------------------------------------------------- условия

	private static final String[] NO_TEXT = new String[0];

	Boolean ev(JsonElement ref, Facts f, Session s)
	{
		JsonObject n;
		Object key;
		if (ref.isJsonPrimitive())
		{
			String k = ref.getAsString();
			n = reqs.getAsJsonObject(k);
			key = n;
		}
		else
		{
			n = ref.getAsJsonObject();
			key = n;
		}
		if (n == null)
		{
			return null;
		}
		boolean latch = n.has("latch");
		if (latch && Boolean.TRUE.equals(s.latched.get(key)))
		{
			return Boolean.TRUE;
		}
		Boolean v = evNode(n, f, s);
		if (latch && Boolean.TRUE.equals(v))
		{
			s.latched.put(key, Boolean.TRUE);
		}
		return v;
	}

	private Boolean evNode(JsonObject n, Facts f, Session s)
	{
		String o = n.get("o").getAsString();
		switch (o)
		{
			case "and":
			case "or":
			case "nor":
			case "nand":
				return logic(o, n.getAsJsonArray("a"), f, s);
			case "count":
			{
				int passed = 0;
				for (JsonElement a : n.getAsJsonArray("a"))
				{
					Boolean v = ev(a, f, s);
					if (v == null)
					{
						return null;
					}
					if (v)
					{
						passed++;
					}
				}
				return compare(passed, n.get("op").getAsString(), n.get("q").getAsInt());
			}
			case "true":
				return Boolean.TRUE;
			case "item":
			{
				if (!n.has("ids"))
				{
					return null;
				}
				int need = n.has("q") ? n.get("q").getAsInt() : 1;
				return f.items(ints(n.getAsJsonArray("ids")), n.has("eq"), n.has("bank")) >= need;
			}
			case "zone":
			{
				int[] p = f.position();
				if (p == null)
				{
					return Boolean.FALSE;
				}
				boolean inside = false;
				for (JsonElement z : n.getAsJsonArray("z"))
				{
					if (inZone(ints(z.getAsJsonArray()), p[0], p[1], p[2]))
					{
						inside = true;
						break;
					}
				}
				return inside != n.has("out");
			}
			case "vb":
				return varCondition(f.varbit(n.get("id").getAsInt()), n);
			case "vp":
				return varCondition(f.varp(n.get("id").getAsInt()), n);
			case "chat":
				return seen(f, n, "GAMEMESSAGE", "ENGINE", "SPAM");
			case "mes":
				return seen(f, n, "MESBOX");
			case "dlg":
				return dialog(f, n);
			case "wt":
			{
				List<String> texts = f.widget(n.get("g").getAsInt(), n.get("c").getAsInt(), n.has("ch"));
				if (texts == null)
				{
					return Boolean.FALSE;
				}
				for (String m : strings(n.getAsJsonArray("m")))
				{
					for (String t : texts)
					{
						if (t != null && t.contains(m))
						{
							return Boolean.TRUE;
						}
					}
				}
				return Boolean.FALSE;
			}
			case "npc":
				return f.npc(n.get("id").getAsInt(), n.has("z") ? ints(n.getAsJsonArray("z")) : null);
			case "obj":
				return f.object(ints(n.getAsJsonArray("ids")), n.has("z") ? ints(n.getAsJsonArray("z")) : null);
			case "skill":
				return f.skill(n.get("s").getAsString()) >= n.get("l").getAsInt();
			case "quest":
			{
				String st = f.quest(n.get("q").getAsString());
				return st == null ? null : st.equals(n.get("st").getAsString());
			}
			default:
				return null;
		}
	}

	private Boolean logic(String op, JsonArray args, Facts f, Session s)
	{
		boolean anyTrue = false;
		boolean anyFalse = false;
		boolean anyUnknown = false;
		for (JsonElement a : args)
		{
			Boolean v = ev(a, f, s);
			if (v == null)
			{
				anyUnknown = true;
			}
			else if (v)
			{
				anyTrue = true;
			}
			else
			{
				anyFalse = true;
			}
		}
		switch (op)
		{
			case "and":
				return anyFalse ? Boolean.FALSE : anyUnknown ? null : Boolean.TRUE;
			case "or":
				return anyTrue ? Boolean.TRUE : anyUnknown ? null : Boolean.FALSE;
			case "nor":
				return anyTrue ? Boolean.FALSE : anyUnknown ? null : Boolean.TRUE;
			default:
				return anyFalse ? Boolean.TRUE : anyUnknown ? null : Boolean.FALSE;
		}
	}

	private static boolean compare(int a, String op, int b)
	{
		switch (op)
		{
			case ">":
				return a > b;
			case "<":
				return a < b;
			case "<=":
				return a <= b;
			case ">=":
				return a >= b;
			case "!=":
				return a != b;
			default:
				return a == b;
		}
	}

	private static Boolean varCondition(int value, JsonObject n)
	{
		if (n.has("bit"))
		{
			boolean set = ((value >> n.get("bit").getAsInt()) & 1) == 1;
			return set == (n.get("set").getAsInt() == 1);
		}
		if (n.has("vs"))
		{
			int v = n.has("sh") ? value >> n.get("sh").getAsInt() : value;
			for (int x : ints(n.getAsJsonArray("vs")))
			{
				if (v == x)
				{
					return Boolean.TRUE;
				}
			}
			return Boolean.FALSE;
		}
		String op = n.has("op") ? n.get("op").getAsString() : "==";
		int want = n.has("v") ? n.get("v").getAsInt() : 0;
		return compare(value, op, want);
	}

	static boolean inZone(int[] z, int x, int y, int plane)
	{
		return z[0] <= x && x <= z[2] && z[1] <= y && y <= z[3] && z[4] <= plane && plane <= z[5];
	}

	private Boolean seen(Facts f, JsonObject n, String... types)
	{
		List<String> msgs = strings(n.getAsJsonArray("m"));
		for (Event e : f.events())
		{
			boolean typeOk = false;
			for (String t : types)
			{
				typeOk |= t.equals(e.getType());
			}
			if (!typeOk)
			{
				continue;
			}
			String clean = sanitize(e.getText());
			for (String m : msgs)
			{
				if (e.getText().contains(m) || clean.contains(m))
				{
					return Boolean.TRUE;
				}
			}
		}
		return Boolean.FALSE;
	}

	private Boolean dialog(Facts f, JsonObject n)
	{
		List<String> msgs = strings(n.getAsJsonArray("m"));
		String who = n.has("who") ? n.get("who").getAsString() : null;
		for (Event e : f.events())
		{
			if (!"DIALOG".equals(e.getType()))
			{
				continue;
			}
			String s = sanitize(e.getText());
			if (who != null && !s.contains(who + "|"))
			{
				continue;
			}
			for (String m : msgs)
			{
				if (s.contains(m))
				{
					return Boolean.TRUE;
				}
			}
		}
		return Boolean.FALSE;
	}

	/** Как Text.sanitize у RuneLite: без тегов <…>, неразрывный пробел — пробел. */
	static String sanitize(String s)
	{
		return s.replaceAll("<[^>]*>", "").replace(' ', ' ');
	}

	private static int[] ints(JsonArray a)
	{
		int[] out = new int[a.size()];
		for (int i = 0; i < out.length; i++)
		{
			out[i] = a.get(i).getAsInt();
		}
		return out;
	}

	private static List<String> strings(JsonArray a)
	{
		List<String> out = new ArrayList<>();
		if (a != null)
		{
			for (JsonElement e : a)
			{
				out.add(e.getAsString());
			}
		}
		return out;
	}

	// ---------------------------------------------------------------- загрузка

	private static volatile Map<String, QhMachine> loaded;

	/** Машины всех квестов маршрута, ключ — шаг маршрута (S2-09). Из ресурса плагина; нет ресурса — пусто. */
	static Map<String, QhMachine> all()
	{
		Map<String, QhMachine> m = loaded;
		if (m == null)
		{
			m = parse(QhMachine.class.getResourceAsStream("questMachines.json"));
			loaded = m;
		}
		return m;
	}

	static Map<String, QhMachine> parse(InputStream in)
	{
		Map<String, QhMachine> out = new HashMap<>();
		if (in == null)
		{
			return out;
		}
		try (InputStreamReader r = new InputStreamReader(in, StandardCharsets.UTF_8))
		{
			JsonObject root = new JsonParser().parse(r).getAsJsonObject();
			for (Map.Entry<String, JsonElement> e : root.getAsJsonObject("quests").entrySet())
			{
				out.put(e.getKey(), new QhMachine(e.getValue().getAsJsonObject()));
			}
		}
		catch (IOException | RuntimeException ex)
		{
			// Без машин плагин работает по прежним правилам (место, предметы).
			return new HashMap<>();
		}
		return out;
	}

	/** Строка этапа, которую выбрал лист: по ключу строки (k) — лист, его родители из addSubSteps или вложенные условные шаги. -1 — нет такой. */
	int lineFor(Verdict v, List<ActiveTarget.StageLine> lines)
	{
		if (v == null || v.getLeaf() == null)
		{
			return -1;
		}
		List<String> names = new ArrayList<>();
		for (int i = v.getPath().size() - 1; i >= 0; i--)
		{
			String name = v.getPath().get(i);
			names.add(name);
			names.addAll(aliases(name));
		}
		for (String name : names)
		{
			for (int i = 0; i < lines.size(); i++)
			{
				if (name.equals(lines.get(i).getK()))
				{
					return i;
				}
			}
		}
		return -1;
	}
}
