package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

/**
 * The "OSRS Path" side panel: what the step needs (have, in bank, missing, in step), where to get it, "Go here" to a point,
 * and the HUD line that names what is missing, not "missing 1 of 1".
 */
public class StepGuideTest
{
	private static final Gson GSON = new Gson();

	/** S2-03 Witch's Potion, as the app 2.10 sends it (stepGuide in runeliteBridge.ts). */
	static ActiveTarget witchsPotion()
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-03\",\"title\":\"Witch's Potion\",\"goal\":\"Witch Hetty's house\","
			+ "\"guide\":{\"items\":["
			+ "{\"name\":\"Onion\",\"id\":1957,\"count\":1,\"where\":\"Pick from the onion patch north of Rimmington.\",\"inStep\":true},"
			+ "{\"name\":\"Eye of newt\",\"id\":221,\"count\":1,\"where\":\"Buy from Betty in Port Sarim for 3 gp.\",\"inStep\":true},"
			+ "{\"name\":\"Lobster\",\"id\":379,\"count\":5,\"where\":\"Buy on the Grand Exchange.\"}],"
			+ "\"places\":["
			+ "{\"x\":2968,\"y\":3204,\"plane\":0,\"label\":\"Hetty — house in Rimmington\",\"npc\":\"Hetty\"},"
			+ "{\"x\":2950,\"y\":3251,\"plane\":0,\"label\":\"Onion — patch north of Rimmington\",\"items\":[\"Onion\"]},"
			+ "{\"x\":3014,\"y\":3259,\"plane\":0,\"label\":\"Eye of newt — Betty, Port Sarim\",\"npc\":\"Betty\",\"items\":[\"Eye of newt\"]}]}}",
			ActiveTarget.class);
		assertNull(t.prepare());
		return t;
	}

	static ItemCounts counts(Object... idNameQty)
	{
		ItemCounts c = new ItemCounts();
		for (int i = 0; i < idNameQty.length; i += 3)
		{
			c.add((Integer) idNameQty[i], ActiveTarget.nameKey((String) idNameQty[i + 1]), (Integer) idNameQty[i + 2]);
		}
		return c;
	}

	@Test
	public void whatIsNeededAndWhereToGet()
	{
		StepGuide.View v = StepGuide.view(witchsPotion(), counts(1957, "Onion", 1), counts(379, "Lobster", 2), null, 0, 0, 0);
		assertEquals("[S2-03] Witch's Potion", v.getTitle());
		StepGuide.ItemLine onion = v.getItems().get(0);
		assertEquals(StepGuide.Have.BAG, onion.getHave());
		assertEquals("Onion", onion.getTitle());
		StepGuide.ItemLine newt = v.getItems().get(1);
		assertEquals(StepGuide.Have.IN_STEP, newt.getHave());
		assertEquals("Buy from Betty in Port Sarim for 3 gp.", newt.getWhere());
		assertEquals("the point where the eye of newt is obtained", 2, newt.getPlace());
		StepGuide.ItemLine lobster = v.getItems().get(2);
		assertEquals(StepGuide.Have.NONE, lobster.getHave());
		assertEquals("Lobster ×5", lobster.getTitle());
		assertEquals("missing - have 2 of 5", lobster.getStatus());
		assertEquals(-1, lobster.getPlace());
	}

	@Test
	public void bankNotOpened_unknown_andBankHasEnough_takeIt()
	{
		ActiveTarget t = witchsPotion();
		assertEquals(StepGuide.Have.UNKNOWN, StepGuide.view(t, counts(), null, null, 0, 0, 0).getItems().get(2).getHave());
		StepGuide.ItemLine inBank = StepGuide.view(t, counts(379, "Lobster", 1), counts(379, "Lobster", 9), null, 0, 0, 0).getItems().get(2);
		assertEquals(StepGuide.Have.BANK, inBank.getHave());
		assertEquals("in bank - take it (1+9/5)", inBank.getStatus());
	}

	@Test
	public void goHere_targetToPointWithNpc_andActivePointIsMarked()
	{
		ActiveTarget t = witchsPotion();
		NavTarget n = StepGuide.navTo(t, 2);
		assertNotNull(n);
		assertEquals("Eye of newt — Betty, Port Sarim", n.getLabel());
		assertEquals(3014, n.getX());
		assertEquals(Collections.singletonList("Betty"), n.getNpcNames());
		assertTrue("the point's NPC will be highlighted", n.getNpcNameSet().contains("betty"));
		assertEquals("S2-03", n.getStepId());
		// Not a purchase: the target is cleared when the player arrives, and the arrow returns to the step.
		assertEquals(false, n.isPurchase());
		assertNull(StepGuide.navTo(t, 9));
		assertNull(StepGuide.navTo(null, 0));

		StepGuide.View v = StepGuide.view(t, counts(), null, n.getLabel(), 3014, 3259, 0);
		assertEquals("Eye of newt — Betty, Port Sarim", v.getDetour());
		assertTrue(v.getPlaces().get(2).isActive());
		assertEquals(false, v.getPlaces().get(0).isActive());
	}

	@Test
	public void noStepAndFromOldApp_clearMessage()
	{
		assertEquals(StepGuide.EMPTY, StepGuide.view(null, counts(), null, null, 0, 0, 0));
		ActiveTarget old = GSON.fromJson("{\"stepId\":\"S1-03\",\"title\":\"Cook's Assistant\"}", ActiveTarget.class);
		assertNull(old.prepare());
		assertTrue(StepGuide.view(old, counts(), null, null, 0, 0, 0).getNote().contains("Update the OSRS Path app"));
	}

	@Test
	public void invalidPanelListIsRejected()
	{
		ActiveTarget bad = GSON.fromJson("{\"stepId\":\"S2-03\",\"guide\":{\"places\":[{\"x\":-5,\"y\":3204,\"plane\":0,\"label\":\"x\"}]}}", ActiveTarget.class);
		assertEquals("invalid panel point", bad.prepare());
		ActiveTarget noName = GSON.fromJson("{\"stepId\":\"S2-03\",\"guide\":{\"items\":[{\"name\":\"\"}]}}", ActiveTarget.class);
		assertEquals("invalid panel item", noName.prepare());
	}

	@Test
	public void hudLineNamesWhatIsMissing()
	{
		ActiveTarget.ChecklistItem meat = new ActiveTarget.ChecklistItem();
		meat.setName("Burnt meat");
		meat.setCount(1);
		ActiveTarget.ChecklistItem lobster = new ActiveTarget.ChecklistItem();
		lobster.setName("Lobster");
		lobster.setCount(20);
		ActiveTarget.ChecklistItem rope = new ActiveTarget.ChecklistItem();
		rope.setName("Rope");
		rope.setCount(1);

		assertEquals("Bag: missing Burnt meat",
			Checklist.hudLine(Checklist.evaluate(Collections.singletonList(meat), counts(), counts())));
		assertEquals("Bag: Burnt meat - take it from the bank",
			Checklist.hudLine(Checklist.evaluate(Collections.singletonList(meat), counts(), counts(2146, "Burnt meat", 1))));
		assertEquals("Bag: missing Burnt meat, Lobster 13/20",
			Checklist.hudLine(Checklist.evaluate(Arrays.asList(meat, lobster), counts(379, "Lobster", 13), counts())));
		assertEquals("Bag: missing Burnt meat, Lobster 0/20 and 1 more",
			Checklist.hudLine(Checklist.evaluate(Arrays.asList(meat, lobster, rope), counts(), counts())));
	}

	@Test
	public void panelDoesNotCrashWhenPlaceNumberIsNotInThePlacesList()
	{
		// In a live game (S2-08, 2.23.0) an item had place number 1 while the shown list had one place: the panel crashed with IndexOutOfBounds.
		StepGuide.ItemLine item = new StepGuide.ItemLine("Beer", "missing", StepGuide.Have.NONE, null, 1, "Beer", "none");
		StepGuide.PlaceLine place = new StepGuide.PlaceLine("Blue Moon Inn", 0, false, null, true);
		StepGuide.View v = new StepGuide.View("t", "g", Collections.singletonList(item), Collections.singletonList(place), null, null, null, null);
		assertNull(OsrsPathPanel.placeFor(v, item));
		StepGuide.ItemLine ok = new StepGuide.ItemLine("Beer", "missing", StepGuide.Have.NONE, null, 0, "Beer", "none");
		assertEquals("Blue Moon Inn", OsrsPathPanel.placeFor(v, ok).getLabel());
		StepGuide.ItemLine none = new StepGuide.ItemLine("Beer", "missing", StepGuide.Have.NONE, null, -1, "Beer", "none");
		assertNull(OsrsPathPanel.placeFor(v, none));
	}

	@Test
	public void panelIconIsDrawn()
	{
		assertEquals(16, OsrsPathPanel.icon().getWidth());
	}
}
