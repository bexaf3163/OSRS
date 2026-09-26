package com.osrspath.bridge;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.Test;

/**
 * Сверка маршрута приложения (src/data/steps.json) с этой версией RuneLite:
 * каждое название квеста для автоотметки есть в Quest, шаблоны сообщений компилируются,
 * а цели шагов проходят ту же проверку, что и запрос к /active-step.
 */
public class RouteTargetsTest
{
	/** Сообщение, которое распознаёт ScreenshotPlugin RuneLite 1.12.39: так выглядит повышение уровня в чате. */
	private static final Pattern RUNELITE_LEVEL_UP = Pattern.compile(
		"Congratulations, you've just advanced your (?<skill>[a-zA-Z]+) level\\. You are now level (?<level>\\d+)");

	private static List<JsonObject> targets() throws Exception
	{
		String path = System.getProperty("osrsPath.steps", "../src/data/steps.json");
		Path file = Paths.get(path);
		assertTrue("нет " + file.toAbsolutePath(), Files.exists(file));
		JsonArray steps = new Gson().fromJson(new String(Files.readAllBytes(file), StandardCharsets.UTF_8), JsonArray.class);
		List<JsonObject> out = new ArrayList<>();
		for (JsonElement e : steps)
		{
			JsonObject s = e.getAsJsonObject();
			if (s.has("inGame"))
			{
				JsonObject g = s.getAsJsonObject("inGame").deepCopy();
				g.addProperty("stepId", s.get("id").getAsString());
				g.addProperty("title", s.get("title").getAsString());
				out.add(g);
			}
		}
		assertTrue("в маршруте должны быть шаги с подсветкой", out.size() >= 5);
		return out;
	}

	@Test
	public void названияКвестовЕстьВRuneLite() throws Exception
	{
		int quests = 0;
		for (JsonObject g : targets())
		{
			JsonObject t = g.getAsJsonObject("completionTrigger");
			if (t == null || !"QUEST_COMPLETED".equals(t.get("type").getAsString()))
			{
				continue;
			}
			quests++;
			String name = t.get("questName").getAsString();
			assertNotNull("квест «" + name + "» (" + g.get("stepId").getAsString() + ") не найден в net.runelite.api.Quest",
				OsrsPathBridgePlugin.knownQuests().get(ActiveTarget.nameKey(name)));
		}
		assertTrue(quests >= 5);
	}

	@Test
	public void шаблоныСообщенийСовпадаютСНастоящимТекстомИгры() throws Exception
	{
		for (JsonObject g : targets())
		{
			JsonObject t = g.getAsJsonObject("completionTrigger");
			if (t == null || !"CHAT_MESSAGE".equals(t.get("type").getAsString()))
			{
				continue;
			}
			Pattern p = Pattern.compile(t.get("chatPattern").getAsString());
			// Пример сообщения строим по шаблону RuneLite: навык и уровень берём из самого шаблона шага.
			String skill = p.pattern().replaceAll(".*advanced your (\\w+) level.*", "$1");
			boolean matched = false;
			for (int level = 2; level <= 98; level++)
			{
				String msg = "Congratulations, you've just advanced your " + skill + " level. You are now level " + level + ".";
				assertTrue(RUNELITE_LEVEL_UP.matcher(msg).find());
				matched |= p.matcher(msg).find();
			}
			assertTrue("шаблон " + g.get("stepId").getAsString() + " ни разу не сработал", matched);
		}
	}

	@Test
	public void целиШаговПроходятПроверкуМоста() throws Exception
	{
		Gson gson = new Gson();
		for (JsonObject g : targets())
		{
			ActiveTarget t = gson.fromJson(g, ActiveTarget.class);
			String problem = t.prepare();
			if (problem != null)
			{
				fail(g.get("stepId").getAsString() + ": " + problem);
			}
			assertNull(problem);
		}
	}
}
