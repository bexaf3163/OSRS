package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Collections;
import org.junit.After;
import org.junit.Test;

/** A pickaxe or axe tier above the player's level does not do the job (2.62.0): a Rune pickaxe at Mining 10 is not "a pickaxe" for the step. */
public class ToolLevelTest
{
	private static final Gson GSON = new Gson();

	@After
	public void unknownAgain()
	{
		ItemCounts.setToolLevels(0, 0);
		ItemCounts.setMembersWorld(null);
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

	@Test
	public void aTierAboveTheLevelIsNotCounted_aLowerOneIs()
	{
		ItemCounts rune = bag(1275, "Rune pickaxe", 1);
		assertEquals("unknown level: any tier counts", 1, rune.count(1265, "Bronze pickaxe"));
		ItemCounts.setToolLevels(10, 1);
		assertEquals(0, rune.count(1265, "Bronze pickaxe"));
		assertEquals(1, bag(1275, "Rune pickaxe", 1, 1267, "Iron pickaxe", 1).count(1265, "Bronze pickaxe"));
		ItemCounts.setToolLevels(41, 1);
		assertEquals(1, rune.count(1265, "Bronze pickaxe"));
	}

	/** T03: a Dragon pickaxe kept from an old membership does not do the job on a free world, at any level; unknown world: it counts. */
	@Test
	public void aMembersTierIsNotTheToolOnAFreeWorld()
	{
		ItemCounts dragon = bag(11920, "Dragon pickaxe", 1);
		ItemCounts.setToolLevels(70, 70);
		assertEquals("no world yet: it counts", 1, dragon.count(1265, "Bronze pickaxe"));
		ItemCounts.setMembersWorld(false);
		assertEquals(0, dragon.count(1265, "Bronze pickaxe"));
		assertFalse(ItemCounts.usable("Dragon pickaxe"));
		assertFalse(ItemCounts.usable("Dragon axe"));
		assertTrue(ItemCounts.usable("Rune pickaxe"));
		assertEquals("a usable tier beside it still counts", 1, bag(11920, "Dragon pickaxe", 1, 1275, "Rune pickaxe", 1).count(1265, "Bronze pickaxe"));
		ItemCounts.setMembersWorld(true);
		assertEquals(1, dragon.count(1265, "Bronze pickaxe"));
	}

	@Test
	public void axesGoByWoodcutting()
	{
		ItemCounts.setToolLevels(99, 5);
		assertEquals(0, bag(1359, "Rune axe", 1).count(1351, "Bronze axe"));
		assertEquals("Steel needs Woodcutting 6", 0, bag(1353, "Steel axe", 1).count(1351, "Bronze axe"));
		assertEquals(1, bag(1349, "Iron axe", 1).count(1351, "Bronze axe"));
		assertFalse(ItemCounts.usable("Steel axe"));
		assertTrue(ItemCounts.usable("Iron axe"));
		assertTrue("not a tool", ItemCounts.usable("Rune scimitar"));
	}

	/** The Ancient Guardian's entry asks for "10 Trout" (70 health): 8 Salmon (72) do it, 7 (63) do not, 10 Cooked meat (30) are far from it. */
	@Test
	public void thePreflightCountsFoodByHealing()
	{
		ActiveTarget.StageLine l = GSON.fromJson("{\"t\":\"Re-enter the dungeon.\",\"x\":3000,\"y\":3494,\"plane\":0,\"k\":\"reenterDungeon\","
			+ "\"pre\":[{\"item\":\"Trout\",\"n\":10,\"alt\":[\"Salmon\",\"Cooked meat\",\"Shark\"]}]}", ActiveTarget.StageLine.class);
		assertNull(ActiveTarget.Pre.problem(l.getPre()));
		assertNull(Preflight.check("S3-04", l, true, bag(329, "Salmon", 8), null, 3000, 3494, 0, Collections.emptyList()));
		Preflight.Block seven = Preflight.check("S3-04", l, true, bag(329, "Salmon", 7), null, 3000, 3494, 0, Collections.emptyList());
		assertNotNull(seven);
		assertEquals(9, seven.getHave());
		Preflight.Block meat = Preflight.check("S3-04", l, true, bag(2142, "Cooked meat", 10), null, 3000, 3494, 0, Collections.emptyList());
		assertEquals(4, meat.getHave());
		assertTrue(meat.reason(), meat.reason().startsWith("Guidance paused: bring food before entering — 70 health (10 Trout or food that heals as much); you carry 28."));
		assertNotNull("unverified healing must not satisfy a food safety guard", Preflight.check("S3-04", l, true, bag(385, "Shark", 10), null, 3000, 3494, 0, Collections.emptyList()));
		assertEquals(Integer.valueOf(7), Foods.heals("Trout"));
	}

	@Test
	public void thePreflightDoesNotTakeAToolTheLevelCannotUse()
	{
		ActiveTarget.StageLine l = GSON.fromJson("{\"t\":\"Mine a Structural pillar.\",\"x\":3050,\"y\":9570,\"plane\":0,\"k\":\"defeatGuardian\",\"mh\":7,"
			+ "\"pre\":[{\"item\":\"Bronze pickaxe\",\"id\":1265,\"alt\":[\"Iron pickaxe\",\"Rune pickaxe\"]}]}", ActiveTarget.StageLine.class);
		assertNull(ActiveTarget.Pre.problem(l.getPre()));
		ItemCounts.setToolLevels(10, 1);
		assertNotNull("a Rune pickaxe at Mining 10 is turned back", Preflight.check("S3-04", l, true, bag(1275, "Rune pickaxe", 1), null, 3050, 9570, 0, Collections.emptyList()));
		assertNull("an Iron one does the job", Preflight.check("S3-04", l, true, bag(1267, "Iron pickaxe", 1), null, 3050, 9570, 0, Collections.emptyList()));
	}
}
