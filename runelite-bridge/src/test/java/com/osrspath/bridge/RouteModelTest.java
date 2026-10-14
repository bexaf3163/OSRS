package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * The route model of 2.49 as the plugin sees it: a milestone varbit that counts from a value upwards, a tool that counts in any tier,
 * and the maximum hit a stage line names for itself.
 */
public class RouteModelTest
{
	private static final Gson GSON = new Gson();

	private final List<String> completed = new ArrayList<>();
	private final Map<Integer, Integer> varbits = new HashMap<>();
	private final AutoCompletionManager manager = new AutoCompletionManager(name -> null, skill -> null, need -> 0, completed::add);

	private static ActiveTarget milestone(boolean atLeast)
	{
		ActiveTarget t = new ActiveTarget();
		t.setStepId("S9-03");
		ActiveTarget.Trigger tr = new ActiveTarget.Trigger();
		tr.setType("VARBIT_CHANGED");
		tr.setVarbitId(2326);
		tr.setTargetValue(40);
		tr.setAtLeast(atLeast);
		t.setCompletionTrigger(tr);
		return t;
	}

	private static ItemCounts bag(Object... idNameCount)
	{
		ItemCounts c = new ItemCounts();
		for (int i = 0; i < idNameCount.length; i += 3)
		{
			c.add((Integer) idNameCount[i], ActiveTarget.nameKey((String) idNameCount[i + 1]), (Integer) idNameCount[i + 2]);
		}
		return c;
	}

	// ---- the milestone: "the fairies talked to you" is a state, not only an event

	@Test
	public void aMilestoneAlreadyReachedFiresWhenTheStepIsShown()
	{
		varbits.put(2326, 45);
		manager.setVarbitReader(varbits::get);
		manager.setTarget(milestone(true));
		assertTrue(manager.isArmed());
		manager.onGameTick();
		assertEquals(List.of("S9-03"), completed);
	}

	@Test
	public void aMilestoneBelowTheValueWaitsAndFiresOnTheChange()
	{
		varbits.put(2326, 20);
		manager.setVarbitReader(varbits::get);
		manager.setTarget(milestone(true));
		manager.onGameTick();
		assertTrue(completed.isEmpty());
		manager.onVarbitChanged(2326, 30);
		assertTrue("30 is below 40", completed.isEmpty());
		manager.onVarbitChanged(2326, 40);
		assertEquals(List.of("S9-03"), completed);
	}

	@Test
	public void aValueAboveTheMilestoneCounts()
	{
		manager.setVarbitReader(varbits::get);
		manager.setTarget(milestone(true));
		manager.onVarbitChanged(2326, 100);
		assertEquals(List.of("S9-03"), completed);
	}

	@Test
	public void anUnknownVarbitIsNotDone()
	{
		// Not in the game: the reader says null. Unknown never becomes done.
		manager.setVarbitReader(id -> null);
		manager.setTarget(milestone(true));
		for (int i = 0; i < 20; i++)
		{
			manager.onGameTick();
		}
		assertTrue(completed.isEmpty());
		assertTrue(manager.describe().get(0).contains("?"));
	}

	@Test
	public void withoutAtLeastTheValueIsExactAndTheTickReadsNothing()
	{
		varbits.put(2326, 45);
		manager.setVarbitReader(varbits::get);
		manager.setTarget(milestone(false));
		manager.onGameTick();
		assertTrue("an exact value is an event, not a state", completed.isEmpty());
		manager.onVarbitChanged(2326, 41);
		assertTrue(completed.isEmpty());
		manager.onVarbitChanged(2326, 40);
		assertEquals(1, completed.size());
	}

	@Test
	public void theBadgeShowsTheComparison()
	{
		varbits.put(2326, 12);
		manager.setVarbitReader(varbits::get);
		manager.setTarget(milestone(true));
		assertEquals("Varbit(2326 >= 40) = FALSE (12)", manager.describe().get(0));
		varbits.put(2326, 40);
		assertEquals("Varbit(2326 >= 40) = TRUE", manager.describe().get(0));
	}

	// ---- a tool counts in any tier

	private static ActiveTarget.StageLine pickaxeLine(String alt)
	{
		ActiveTarget.StageLine l = GSON.fromJson("{\"t\":\"Mine a Structural pillar.\",\"x\":3050,\"y\":9570,\"plane\":0,\"k\":\"defeatGuardian\",\"mh\":7,"
			+ "\"pre\":[{\"item\":\"Bronze pickaxe\",\"id\":1265" + alt + "}]}", ActiveTarget.StageLine.class);
		assertNull(ActiveTarget.Pre.problem(l.getPre()));
		return l;
	}

	@Test
	public void aBetterPickaxeSatisfiesThePreflight()
	{
		ActiveTarget.StageLine l = pickaxeLine(",\"alt\":[\"Iron pickaxe\",\"Rune pickaxe\"]");
		assertNotNull("no pickaxe at all is missing", Preflight.check("S3-04", l, true, new ItemCounts(), null, 3050, 9570, 0, Collections.emptyList()));
		assertNull("a rune pickaxe does the job", Preflight.check("S3-04", l, true, bag(1275, "Rune pickaxe", 1), null, 3050, 9570, 0, Collections.emptyList()));
		assertNull("the named one still counts", Preflight.check("S3-04", l, true, bag(1265, "Bronze pickaxe", 1), null, 3050, 9570, 0, Collections.emptyList()));
	}

	@Test
	public void withoutAltOnlyTheNamedItemCounts()
	{
		ActiveTarget.StageLine l = pickaxeLine("");
		assertNotNull(Preflight.check("S3-04", l, true, bag(1275, "Rune pickaxe", 1), null, 3050, 9570, 0, Collections.emptyList()));
	}

	@Test
	public void aTooLongOrEmptyAltIsRefused()
	{
		ActiveTarget.StageLine empty = GSON.fromJson("{\"t\":\"x\",\"pre\":[{\"item\":\"Bronze pickaxe\",\"alt\":[\"\"]}]}", ActiveTarget.StageLine.class);
		assertNotNull(ActiveTarget.Pre.problem(empty.getPre()));
		StringBuilder many = new StringBuilder("[");
		for (int i = 0; i < 17; i++)
		{
			many.append(i == 0 ? "" : ",").append("\"Pickaxe ").append(i).append('"');
		}
		ActiveTarget.StageLine tooMany = GSON.fromJson("{\"t\":\"x\",\"pre\":[{\"item\":\"Bronze pickaxe\",\"alt\":" + many + "]}]}", ActiveTarget.StageLine.class);
		assertNotNull(ActiveTarget.Pre.problem(tooMany.getPre()));
	}

	@Test
	public void theChecklistAndThePanelCountAlternativesToo()
	{
		ActiveTarget.ChecklistItem pick = new ActiveTarget.ChecklistItem();
		pick.setName("Bronze pickaxe");
		pick.setId(1265);
		pick.setCount(1);
		pick.setAlt(List.of("Rune pickaxe"));
		Checklist.Result r = Checklist.evaluate(Collections.singletonList(pick), bag(1275, "Rune pickaxe", 1), null);
		assertTrue(r.isReady());
		assertEquals(1, r.getRows().get(0).getHave());

		ActiveTarget.GuideItem g = GSON.fromJson("{\"name\":\"Bronze pickaxe\",\"id\":1265,\"alt\":[\"Rune pickaxe\"]}", ActiveTarget.GuideItem.class);
		assertEquals(StepGuide.Have.BAG, StepGuide.item(g, Collections.emptyList(), bag(1275, "Rune pickaxe", 1), null).getHave());
		assertFalse(StepGuide.item(g, Collections.emptyList(), new ItemCounts(), null).getHave() == StepGuide.Have.BAG);
	}

	// ---- a stage line may name its attacker's hit

	private static ActiveTarget withHit(String mh)
	{
		return GSON.fromJson("{\"stepId\":\"S3-04\",\"title\":\"Below Ice Mountain\","
			+ "\"completionTrigger\":{\"type\":\"QUEST_COMPLETED\",\"questName\":\"Below Ice Mountain\"},"
			+ "\"guide\":{\"items\":[],\"places\":[{\"x\":3050,\"y\":9570,\"plane\":0,\"label\":\"Ancient Guardian room\"}],"
			+ "\"stage\":{\"kind\":\"varbit\",\"id\":12063,\"stages\":["
			+ "{\"at\":0,\"steps\":[{\"t\":\"Defeat the Ancient Guardian.\"" + mh + "}],\"go\":0,\"items\":[]}]}}}", ActiveTarget.class);
	}

	@Test
	public void aStageLineMaxHitIsValidated()
	{
		assertNull(withHit(",\"mh\":7").prepare());
		assertNull("a line without one is as before", withHit("").prepare());
		assertEquals("invalid quest stage step", withHit(",\"mh\":0").prepare());
		assertEquals("invalid quest stage step", withHit(",\"mh\":500").prepare());
	}

	@Test
	public void theHealthWarningFollowsTheLineFigure()
	{
		// The Ancient Guardian hits up to 7: warn from 14 down, not from 2x the step's general figure.
		assertNull(OsrsPathBridgePlugin.healthLine(14, 30, 7));
		assertNotNull(OsrsPathBridgePlugin.healthLine(13, 30, 7));
		assertNull("no figure, no warning", OsrsPathBridgePlugin.healthLine(5, 30, null));
	}
}
