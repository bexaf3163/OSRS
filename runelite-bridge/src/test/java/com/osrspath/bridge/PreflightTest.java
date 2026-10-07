package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** The item pre-flight guard: the arrow turns to where a missing item is instead of the step, and the HUD says to turn back. */
public class PreflightTest
{
	private static final String DOOR = "{\"t\":\"Enter the Black Knights' Fortress.\",\"x\":3016,\"y\":3514,\"plane\":0,\"k\":\"enterFortress\","
		+ "\"pre\":[{\"item\":\"Cabbage\",\"id\":1965,\"at\":[3058,3290,0],\"t\":\"Pick Cabbage south of Falador (do NOT pick Draynor cabbage)\",\"on\":[\"Cabbage\"]}]}";
	private static final String PIE = "{\"t\":\"Talk to Thurgo.\",\"x\":3000,\"y\":3145,\"plane\":0,\"pre\":[{\"item\":\"Redberry pie\",\"id\":2325}]}";
	private static final String BARS = "{\"t\":\"Return to Thurgo.\",\"x\":3000,\"y\":3145,\"plane\":0,\"pre\":[{\"item\":\"Blurite ore\"},{\"item\":\"Iron bar\",\"n\":2}]}";

	private static final List<ActiveTarget.Spot> BANKS = List.of(spot(3185, 3436, "Varrock West"), spot(2946, 3368, "Falador West"), spot(3165, 3490, "Grand Exchange"));

	private static ActiveTarget.Spot spot(int x, int y, String label)
	{
		ActiveTarget.Spot s = new ActiveTarget.Spot();
		s.setX(x);
		s.setY(y);
		s.setPlane(0);
		s.setLabel(label);
		return s;
	}

	private static ActiveTarget.StageLine line(String json)
	{
		ActiveTarget.StageLine l = new Gson().fromJson(json, ActiveTarget.StageLine.class);
		assertNull(ActiveTarget.Pre.problem(l.getPre()));
		return l;
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

	private static Preflight.Block check(ActiveTarget.StageLine l, ItemCounts carried, ItemCounts bank, int px, int py)
	{
		return Preflight.check("S3-02", l, true, carried, bank, px, py, 0, BANKS);
	}

	@Test
	public void noCabbageAtTheFortressTurnsTheArrowToTheFaladorField()
	{
		Preflight.Block b = check(line(DOOR), new ItemCounts(), null, 3016, 3514);
		assertNotNull(b);
		assertEquals("Cabbage", b.getItem());
		assertEquals(Preflight.Via.SOURCE, b.getVia());
		NavTarget n = b.getTarget();
		assertEquals(3058, n.getX());
		assertEquals(3290, n.getY());
		assertEquals("Pick Cabbage south of Falador (do NOT pick Draynor cabbage)", n.getLabel());
		assertTrue("the cabbage patch is highlighted at the field", n.getObjectNameSet().contains(ActiveTarget.nameKey("Cabbage")));
		assertEquals("⚠ Missing Item: Cabbage - Turn back!", b.chip());
	}

	@Test
	public void theDraynorManorCabbageDoesNotCountButTheFieldCabbageDoes()
	{
		ActiveTarget.StageLine l = line(DOOR);
		assertNotNull(check(l, bag(1967, "Cabbage", 1), null, 3016, 3514));
		assertNull(check(l, bag(1965, "Cabbage", 1), null, 3016, 3514));
	}

	@Test
	public void aBankedItemSendsThePlayerToTheNearestBank()
	{
		Preflight.Block b = check(line(DOOR), new ItemCounts(), bag(1965, "Cabbage", 2), 2965, 3380);
		assertEquals(Preflight.Via.BANK, b.getVia());
		assertEquals(2946, b.getTarget().getX());
		assertEquals("Take Cabbage from the bank", b.getTarget().getLabel());
		assertEquals("a bank with only the wrong cabbage does not help", Preflight.Via.SOURCE, check(line(DOOR), new ItemCounts(), bag(1967, "Cabbage", 5), 2965, 3380).getVia());
	}

	@Test
	public void anItemWithNoPlaceIsBoughtOnTheGrandExchange()
	{
		Preflight.Block b = check(line(PIE), new ItemCounts(), null, 3000, 3145);
		assertEquals(Preflight.Via.EXCHANGE, b.getVia());
		assertEquals(Preflight.EXCHANGE_X, b.getTarget().getX());
		assertEquals("Buy Redberry pie on the Grand Exchange", b.getTarget().getLabel());
	}

	@Test
	public void countsAreChecked()
	{
		ActiveTarget.StageLine l = line(BARS);
		Preflight.Block b = check(l, bag(1, "Blurite ore", 1, 2, "Iron bar", 1), null, 3000, 3145);
		assertEquals("Iron bar", b.getItem());
		assertEquals(2, b.getNeed());
		assertEquals(1, b.getHave());
		assertNull(check(l, bag(1, "Blurite ore", 1, 2, "Iron bar", 2), null, 3000, 3145));
	}

	@Test
	public void unknownIsNotMissing()
	{
		assertNull("the bag was never read", Preflight.check("S3-02", line(DOOR), false, new ItemCounts(), null, 3016, 3514, 0, BANKS));
		assertNull("a line with no guard", Preflight.check("S3-02", line("{\"t\":\"Walk.\"}"), true, new ItemCounts(), null, 3016, 3514, 0, BANKS));
		assertNull(Preflight.check("S3-02", null, true, new ItemCounts(), null, 0, 0, 0, BANKS));
	}

	@Test
	public void theChipShowsOnlyNearTheBlockedStep()
	{
		Preflight.Block b = check(line(DOOR), new ItemCounts(), null, 3016, 3514);
		assertTrue(b.near(3016, 3514, 0));
		assertTrue(b.near(3000, 3490, 0));
		assertTrue("far away the arrow already leads to the field, no chip", !b.near(3200, 3200, 0));
		assertTrue("another plane is another place", !b.near(3016, 3514, 1));
	}

	@Test
	public void theKeyChangesWithWhatIsMissingAndWhereItIs()
	{
		ActiveTarget.StageLine l = line(BARS);
		String first = check(l, new ItemCounts(), null, 3000, 3145).key();
		String second = check(l, bag(1, "Blurite ore", 1), null, 3000, 3145).key();
		assertTrue(!first.equals(second));
		assertTrue(!second.equals(check(l, bag(1, "Blurite ore", 1), bag(2, "Iron bar", 2), 3000, 3145).key()));
	}

	@Test
	public void badGuardsAreRefused()
	{
		ActiveTarget.Pre p = new ActiveTarget.Pre();
		p.setItem("");
		assertEquals("invalid pre-flight item", ActiveTarget.Pre.problem(Collections.singletonList(p)));
		p.setItem("Cabbage");
		p.setAt(List.of(3058, 3290));
		assertEquals("invalid pre-flight item", ActiveTarget.Pre.problem(Collections.singletonList(p)));
		p.setAt(List.of(3058, 3290, 0));
		p.setN(0);
		assertEquals("invalid pre-flight item", ActiveTarget.Pre.problem(Collections.singletonList(p)));
		p.setN(1);
		assertNull(ActiveTarget.Pre.problem(Collections.singletonList(p)));
		assertNull(ActiveTarget.Pre.problem(null));
		ActiveTarget.Spot bad = new ActiveTarget.Spot();
		assertEquals("invalid point", bad.problem());
	}

	@Test
	public void theHudCarriesTheChipThroughTheLeanAndTheCompactViews()
	{
		OsrsPathHudOverlay.State s = new OsrsPathHudOverlay.State("[S3-02] Black Knights' Fortress", "Go to: Cabbage", "40 tiles", false, null, false, null, false, null, false,
			null, null, false, null, 40, "⚠ Missing Item: Cabbage - Turn back!");
		assertEquals("⚠ Missing Item: Cabbage - Turn back!", s.getMissing());
		assertEquals(s.getMissing(), OsrsPathHudOverlay.lean(s, true).getMissing());
		assertEquals(s.getMissing(), SmartView.compact(s).getMissing());
		assertTrue(OsrsPathHudOverlay.plain(s).contains("Turn back!"));
		assertEquals(OverlayCard.RED, OsrsPathHudOverlay.accent(s));
		// An older call without the chip still builds.
		assertNull(new OsrsPathHudOverlay.State("t", null, null, false, null, false, null, false, null, false, null, null, false, null, -1).getMissing());
	}
}
