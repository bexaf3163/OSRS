package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import org.junit.Test;

/** Stage step highlight (as in Quest Helper): parsing, validation and what the plugin compares NPCs, objects and items with. */
public class LineHighlightTest
{
	private static final Gson GSON = new Gson();

	private static ActiveTarget.StageLine line(String json)
	{
		return GSON.fromJson(json, ActiveTarget.StageLine.class);
	}

	@Test
	public void highlightIsParsedAndComparedByIdAndName()
	{
		ActiveTarget.StageLine l = line("{\"t\":\"Put the rum\",\"hl\":{\"npc\":[3647],\"obj\":[2072],\"on\":[\"Banana tree\"],\"item\":[\"Karamjan rum\"]}}");
		assertNotNull(l.getHl());
		assertNull(l.getHl().problem());
		ActiveTarget.LineHighlight h = new ActiveTarget.LineHighlight(l.getHl());
		assertTrue(h.npcIds.contains(3647));
		assertTrue(h.objectIds.contains(2072));
		assertTrue("names are compared without case, like the other highlights", h.objectNames.contains(ActiveTarget.nameKey("BANANA TREE")));
		assertTrue(h.itemNames.contains(ActiveTarget.nameKey("karamjan rum")));
		assertFalse(h.isEmpty());
	}

	@Test
	public void withoutHighlight_empty()
	{
		assertTrue(ActiveTarget.LineHighlight.NONE.isEmpty());
		assertTrue(new ActiveTarget.LineHighlight(null).isEmpty());
		assertNull(line("{\"t\":\"Talk\"}").getHl());
	}

	@Test
	public void aBadHighlightIsRejectedWhole()
	{
		String[] bad = {"{\"npc\":[0]}", "{\"npc\":[300000]}", "{\"obj\":[-1]}", "{\"npc\":[1,2,3,4,5,6,7,8,9]}", "{\"on\":[\"\"]}", "{\"item\":[null]}",
			"{\"on\":[\"" + "x".repeat(500) + "\"]}"};
		for (String h : bad)
		{
			ActiveTarget.StageLine l = line("{\"t\":\"x\",\"hl\":" + h + "}");
			assertNotNull(h, l.getHl().problem());
		}
	}

	@Test
	public void aStageWithABadStepHighlightIsNotAccepted()
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-09\",\"title\":\"x\",\"guide\":{\"items\":[],\"places\":[],\"stage\":{\"kind\":\"varp\",\"id\":71,\"stages\":["
			+ "{\"at\":0,\"steps\":[{\"t\":\"Talk\",\"hl\":{\"npc\":[0]}}]}]}}}", ActiveTarget.class);
		assertNotNull(t.prepare());
		ActiveTarget ok = GSON.fromJson("{\"stepId\":\"S2-09\",\"title\":\"x\",\"guide\":{\"items\":[],\"places\":[],\"stage\":{\"kind\":\"varp\",\"id\":71,\"stages\":["
			+ "{\"at\":0,\"steps\":[{\"t\":\"Talk\",\"hl\":{\"npc\":[3647]}}]}]}}}", ActiveTarget.class);
		assertNull(ok.prepare());
	}

	@Test
	public void aTransitionWithCursorMovementChangesTheHighlight_inTheData()
	{
		// Pirate's Treasure lines from the app's data: each has its own highlight, not one for the whole step.
		ActiveTarget.StageLine rum = line("{\"t\":\"Put the rum\",\"hl\":{\"obj\":[2072],\"item\":[\"Karamjan rum\"]}}");
		ActiveTarget.StageLine luthas = line("{\"t\":\"Tell Luthas\",\"hl\":{\"npc\":[3647]}}");
		assertTrue(new ActiveTarget.LineHighlight(rum.getHl()).npcIds.isEmpty());
		assertEquals(1, new ActiveTarget.LineHighlight(luthas.getHl()).npcIds.size());
		assertTrue(new ActiveTarget.LineHighlight(luthas.getHl()).objectIds.isEmpty());
	}
}
