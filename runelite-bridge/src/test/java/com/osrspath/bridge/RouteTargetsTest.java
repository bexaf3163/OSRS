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
 * A check of the app's route (src/data/steps.json) against this version of RuneLite:
 * every quest name for auto-tick is in Quest, the message patterns compile,
 * and the step targets pass the same check as the request to /active-step.
 */
public class RouteTargetsTest
{
	/** The message recognised by RuneLite 1.12.39's ScreenshotPlugin: this is what a level-up looks like in chat. */
	private static final Pattern RUNELITE_LEVEL_UP = Pattern.compile(
		"Congratulations, you've just advanced your (?<skill>[a-zA-Z]+) level\\. You are now level (?<level>\\d+)");

	private static List<JsonObject> targets() throws Exception
	{
		String path = System.getProperty("osrsPath.steps", "../src/data/steps.json");
		Path file = Paths.get(path);
		assertTrue("not found " + file.toAbsolutePath(), Files.exists(file));
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
		assertTrue("the route must have steps with a highlight", out.size() >= 5);
		return out;
	}

	@Test
	public void questNamesAreInRuneLite() throws Exception
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
			assertNotNull("quest '" + name + "' (" + g.get("stepId").getAsString() + ") is not found in net.runelite.api.Quest",
				OsrsPathBridgePlugin.knownQuests().get(ActiveTarget.nameKey(name)));
		}
		// 34 route quests are counted by themselves (2.7); fewer means auto-tick went missing from the data.
		assertTrue("quests with auto-tick " + quests, quests >= 30);
	}

	@Test
	public void messagePatternsMatchTheRealGameText() throws Exception
	{
		for (JsonObject g : targets())
		{
			JsonObject t = g.getAsJsonObject("completionTrigger");
			if (t == null || !"CHAT_MESSAGE".equals(t.get("type").getAsString()))
			{
				continue;
			}
			Pattern p = Pattern.compile(t.get("chatPattern").getAsString());
			// We build an example message from the RuneLite pattern: the skill and the level are taken from the step's own template.
			String skill = p.pattern().replaceAll(".*advanced your (\\w+) level.*", "$1");
			boolean matched = false;
			for (int level = 2; level <= 98; level++)
			{
				String msg = "Congratulations, you've just advanced your " + skill + " level. You are now level " + level + ".";
				assertTrue(RUNELITE_LEVEL_UP.matcher(msg).find());
				matched |= p.matcher(msg).find();
			}
			assertTrue("the pattern of " + g.get("stepId").getAsString() + " never matched", matched);
		}
	}

	@Test
	public void stepTargetsPassTheBridgeCheck() throws Exception
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
