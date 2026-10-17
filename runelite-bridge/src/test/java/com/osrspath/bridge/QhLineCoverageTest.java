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
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.junit.Test;

/**
 * A Quest Helper step that has no line in our stage list used to freeze the guide on the line the player had just finished (The Corsair Curse,
 * 2026-10-17: after "Talk to Colin" the machine picked goDownFromArsen, which is not a line, and "Talk to Colin" stayed until the player went down the
 * stairs). Steps that only move the player now borrow the line of the step next to them. This walks every quest, every stage and every leaf of the
 * real data and fails when a moving step maps to nothing in a stage that has several lines.
 */
public class QhLineCoverageTest
{
	private static final Pattern MOVEMENT = Pattern.compile("^(go|climb|enter|leave|walk|exit|cross|swim|sail|board|descend|ascend)[A-Z0-9]");

	private static JsonObject stagesData() throws Exception
	{
		Path file = Paths.get(System.getProperty("osrsPath.stages", "../src/data/questStages.json"));
		assertTrue("not found " + file.toAbsolutePath(), Files.exists(file));
		return new Gson().fromJson(new String(Files.readAllBytes(file), StandardCharsets.UTF_8), JsonObject.class).getAsJsonObject("quests");
	}

	/** The lines of the stage the plugin uses for a variable value: the last one whose "at" is not above it. */
	private static List<ActiveTarget.StageLine> linesFor(JsonObject quest, int value)
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
		List<ActiveTarget.StageLine> out = new ArrayList<>();
		if (pick != null)
		{
			JsonArray lines = pick.getAsJsonArray("do");
			for (JsonElement l : lines)
			{
				ActiveTarget.StageLine line = new ActiveTarget.StageLine();
				JsonObject o = l.getAsJsonObject();
				line.setT(o.get("t").getAsString());
				if (o.has("k"))
				{
					line.setK(o.get("k").getAsString());
				}
				out.add(line);
			}
		}
		return out;
	}

	@Test
	public void theCorsairCurseDoesNotStayOnColinAfterHeIsTalkedTo()
	{
		QhMachine m = QhMachine.all().get("S4-01");
		List<ActiveTarget.StageLine> lines = new ArrayList<>();
		for (String k : Arrays.asList("talkToIthoi", "talkToGnocci", "talkToArsen", "talkToColin", "grabTinderbox"))
		{
			ActiveTarget.StageLine l = new ActiveTarget.StageLine();
			l.setT(k);
			l.setK(k);
			lines.add(l);
		}
		QhMachine.Verdict v = new QhMachine.Verdict("goDownFromArsen", Arrays.asList("solveCurses", "goDownFromArsen"), true, false);
		int line = m.lineFor(v, lines);
		assertEquals("the guide moves on to Gnocci", "talkToGnocci", lines.get(line).getK());
	}

	@Test
	public void aStepThatIsNotAMoveKeepsItsOldBehaviour()
	{
		QhMachine m = QhMachine.all().get("S4-01");
		List<ActiveTarget.StageLine> lines = new ArrayList<>();
		ActiveTarget.StageLine l = new ActiveTarget.StageLine();
		l.setT("x");
		l.setK("talkToIthoi");
		lines.add(l);
		assertEquals(-1, m.lineFor(new QhMachine.Verdict("somethingElse", Arrays.asList("solveCurses", "somethingElse"), true, false), lines));
		assertEquals(0, m.lineFor(new QhMachine.Verdict("talkToIthoi", Arrays.asList("solveCurses", "talkToIthoi"), true, false), lines));
	}

	@Test
	public void everyMovingStepInEveryQuestMapsToALineWhenTheStageHasSeveral() throws Exception
	{
		JsonObject quests = stagesData();
		TreeSet<String> unmapped = new TreeSet<>();
		int checked = 0;
		for (Map.Entry<String, QhMachine> e : QhMachine.all().entrySet())
		{
			if (!quests.has(e.getKey()))
			{
				continue;
			}
			JsonObject quest = quests.getAsJsonObject(e.getKey());
			for (int value : e.getValue().stageValues())
			{
				List<ActiveTarget.StageLine> lines = linesFor(quest, value);
				if (lines.size() < 2)
				{
					continue;
				}
				for (List<String> path : e.getValue().leafPaths(value))
				{
					String leaf = path.get(path.size() - 1);
					if (!MOVEMENT.matcher(leaf).find())
					{
						continue;
					}
					checked++;
					if (e.getValue().lineFor(new QhMachine.Verdict(leaf, path, true, false), lines) < 0)
					{
						unmapped.add(e.getKey() + "@" + value + " " + leaf);
					}
				}
			}
		}
		assertTrue("moving steps were checked: " + checked, checked > 20);
		// Known: The Grand Tree's way back into the tunnels after the fight (stage 150 lines are the daconia rock and the king); the arrow reaches the king through a way in (QuestWalkTest).
		// The place-and-items logic decides there. A new name in this list is a gap to close, not a thing to add here.
		assertEquals("moving steps with no line to show", new TreeSet<String>(Arrays.asList(
			"S7-05@150 climbDownTrapDoorAfterFight", "S7-05@150 climbUpToWatchtower")), unmapped);
	}
}
