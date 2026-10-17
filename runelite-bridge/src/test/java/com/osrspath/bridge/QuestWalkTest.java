package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.junit.Test;

/**
 * Every quest of the route, every stage, every step Quest Helper can pick: where does the plugin send the player, and can the player get there?
 * The owner, 2026-10-17: three stops in one quest (The Corsair Curse) — a step with no line froze the list, "Target is underground" with no way
 * down. This walks the real data (questMachines.json, qh-steps.json, questStages.json, portals.json, steps.json) and fails on:
 *
 *  - a step Quest Helper can pick that has neither a line in our list nor a tile of its own: the guide has nothing to show;
 *  - a place in a dungeon or a separate area with no known way in from the surface;
 *  - a place on the surface, in a stage that also has steps underground, with no known way back up from them;
 *  - a route step whose place is underground with no way in.
 */
public class QuestWalkTest
{
	private static JsonObject read(String prop, String fallback) throws Exception
	{
		Path file = Paths.get(System.getProperty(prop, fallback));
		assertTrue("not found " + file.toAbsolutePath(), Files.exists(file));
		return new Gson().fromJson(new String(Files.readAllBytes(file), StandardCharsets.UTF_8), JsonElement.class).isJsonObject()
			? new Gson().fromJson(new String(Files.readAllBytes(file), StandardCharsets.UTF_8), JsonObject.class) : null;
	}

	private static List<ActiveTarget.StageLine> lines(JsonObject stage)
	{
		List<ActiveTarget.StageLine> out = new ArrayList<>();
		for (JsonElement l : stage.getAsJsonArray("do"))
		{
			JsonObject o = l.getAsJsonObject();
			ActiveTarget.StageLine line = new ActiveTarget.StageLine();
			line.setT(o.get("t").getAsString());
			if (o.has("k"))
			{
				line.setK(o.get("k").getAsString());
			}
			if (o.has("at"))
			{
				JsonArray at = o.getAsJsonArray("at");
				line.setX(at.get(0).getAsInt());
				line.setY(at.get(1).getAsInt());
				line.setPlane(at.get(2).getAsInt());
			}
			out.add(line);
		}
		return out;
	}

	private static JsonObject stageFor(JsonObject quest, int value)
	{
		JsonObject pick = null;
		for (JsonElement e : quest.getAsJsonArray("stages"))
		{
			JsonObject st = e.getAsJsonObject();
			if (st.get("at").getAsInt() <= value && (pick == null || st.get("at").getAsInt() >= pick.get("at").getAsInt()))
			{
				pick = st;
			}
		}
		return pick != null ? pick : quest.getAsJsonArray("stages").get(0).getAsJsonObject();
	}

	/** A place the player is sent to in another layer than the surface, and no way in is known. */
	private static boolean noWayIn(int x, int y)
	{
		return Navigation.layer(y) != 0 && !Navigation.isInstanced(x, y) && Portals.pick(3222, 3218, x, y) == null;
	}

	@Test
	public void everyStepOfEveryQuestHasAPlaceAndAWayThere() throws Exception
	{
		JsonObject quests = read("osrsPath.stages", "../src/data/questStages.json").getAsJsonObject("quests");
		TreeSet<String> nothingToShow = new TreeSet<>();
		TreeSet<String> noWayIn = new TreeSet<>();
		TreeSet<String> noWayOut = new TreeSet<>();
		int picks = 0;
		for (Map.Entry<String, QhMachine> e : QhMachine.all().entrySet())
		{
			String id = e.getKey();
			if (!quests.has(id))
			{
				continue;
			}
			JsonObject quest = quests.getAsJsonObject(id);
			for (int value : e.getValue().stageValues())
			{
				List<ActiveTarget.StageLine> ls = lines(stageFor(quest, value));
				List<int[]> places = new ArrayList<>();
				for (List<String> path : e.getValue().leafPaths(value))
				{
					picks++;
					String leaf = path.get(path.size() - 1);
					int at = e.getValue().lineFor(new QhMachine.Verdict(leaf, path, true, false), ls);
					ActiveTarget.StageLine line = at < 0 ? null : ls.get(at);
					QhSteps.Tile tile = QhSteps.tile(id, leaf);
					QhVia.Via via = QhVia.of(leaf, tile, line, null, Collections.<String>emptySet());
					int[] place = via != null ? new int[] {via.getX(), via.getY(), via.getPlane()}
						: line != null && line.hasPoint() ? new int[] {line.getX(), line.getY(), line.getPlane()}
						: tile != null ? new int[] {tile.getX(), tile.getY(), tile.getPlane()} : null;
					if (line == null && tile == null)
					{
						nothingToShow.add(id + "@" + value + " " + leaf);
						continue;
					}
					if (place == null)
					{
						continue;
					}
					places.add(place);
					// A way out (exit the basement, leave the ship) is taken from inside: there is nothing to enter.
					if (!leaf.matches("^(exit|leave)[A-Z].*") && noWayIn(place[0], place[1]))
					{
						noWayIn.add(id + "@" + value + " " + leaf + " [" + place[0] + "," + place[1] + "," + place[2] + "]");
					}
				}
				// A surface place in a stage that also sends the player underground: from there a way back up must be known.
				for (int[] up : places)
				{
					if (Navigation.layer(up[1]) != 0)
					{
						continue;
					}
					for (int[] down : places)
					{
						if (Navigation.layer(down[1]) == 0 || Navigation.isInstanced(down[0], down[1]))
						{
							continue;
						}
						if (Portals.pick(down[0], down[1], up[0], up[1]) == null)
						{
							noWayOut.add(id + "@" + value + " from [" + down[0] + "," + down[1] + "] to [" + up[0] + "," + up[1] + "]");
						}
					}
				}
			}
		}
		// The quests the app has stages for but Quest Helper's machine does not cover: their lines are walked in order.
		for (Map.Entry<String, JsonElement> q : quests.entrySet())
		{
			if (QhMachine.all().containsKey(q.getKey()))
			{
				continue;
			}
			for (JsonElement st : q.getValue().getAsJsonObject().getAsJsonArray("stages"))
			{
				for (ActiveTarget.StageLine l : lines(st.getAsJsonObject()))
				{
					if (l.hasPoint() && noWayIn(l.getX(), l.getY()))
					{
						noWayIn.add(q.getKey() + "#" + st.getAsJsonObject().get("at").getAsInt() + " " + (l.getK() == null ? l.getT() : l.getK())
							+ " [" + l.getX() + "," + l.getY() + "," + l.getPlane() + "]");
					}
				}
			}
		}
		System.out.println("quest walk: " + picks + " Quest Helper picks in " + QhMachine.all().size() + " quests; steps with no line or tile: " + nothingToShow.size()
			+ "; places with no way in: " + noWayIn.size() + "; surface places with no way up: " + noWayOut.size());
		assertTrue("picks walked: " + picks, picks > 500);
		// Known: The Grand Tree's way back into the tunnels after the Black demon (Quest Helper's object steps there have no tile). The line stays on King
		// Narnode, whose cave the arrow reaches through the trapdoor at the foot of the Grand Tree (checked below).
		TreeSet<String> known = new TreeSet<>(java.util.Arrays.asList(
			"S7-05@140 climbUpToWatchtower", "S7-05@150 climbDownTrapDoorAfterFight", "S7-05@150 climbUpToWatchtower"));
		assertEquals("Quest Helper steps with neither a line nor a tile", known, nothingToShow);
		Portals.Portal king = Portals.pick(2476, 3463, 2465, 9895);
		assertTrue("King Narnode's cave has a way in: " + king, king != null && Math.abs(king.getX() - 2464) <= 3 && Math.abs(king.getY() - 3497) <= 3);
		assertEquals("places in a dungeon or area with no known way in", new TreeSet<String>(), noWayIn);
		assertEquals("surface places with no known way back up", new TreeSet<String>(), noWayOut);
	}

	@Test
	public void everyRouteStepUndergroundHasAWayIn() throws Exception
	{
		Path file = Paths.get(System.getProperty("osrsPath.steps", "../src/data/steps.json"));
		JsonArray steps = new Gson().fromJson(new String(Files.readAllBytes(file), StandardCharsets.UTF_8), JsonArray.class);
		TreeSet<String> missing = new TreeSet<>();
		int off = 0;
		for (JsonElement e : steps)
		{
			JsonObject s = e.getAsJsonObject();
			List<JsonObject> points = new ArrayList<>();
			if (s.has("mapLocation") && s.get("mapLocation").isJsonObject())
			{
				points.add(s.getAsJsonObject("mapLocation"));
			}
			if (s.has("inGame") && s.getAsJsonObject("inGame").has("pathWaypoints"))
			{
				for (JsonElement w : s.getAsJsonObject("inGame").getAsJsonArray("pathWaypoints"))
				{
					points.add(w.getAsJsonObject());
				}
			}
			for (JsonObject p : points)
			{
				int x = p.get("x").getAsInt();
				int y = p.get("y").getAsInt();
				if (Navigation.layer(y) != 0)
				{
					off++;
					if (noWayIn(x, y))
					{
						missing.add(s.get("id").getAsString() + " [" + x + "," + y + "]");
					}
				}
			}
		}
		System.out.println("route walk: " + off + " places off the surface; with no way in: " + missing.size());
		assertTrue("off-surface places walked: " + off, off > 3);
		assertEquals("route places underground with no known way in", new TreeSet<String>(), missing);
	}
}
