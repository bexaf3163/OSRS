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
	@Test
	public void ownedNotesLeadToABankButDoNotSatisfyTheUsableGuard()
	{
		Preflight.Block b = Preflight.check("S2-07", line(PIE), true, bag(), bag(2325, "Redberry pie", 1), null, 3000, 3145, 0, BANKS);
		assertNotNull(b);
		assertEquals(Preflight.Via.BANK, b.getVia());
		assertEquals(0, b.getHave());
		assertNull(Preflight.check("S2-07", line(PIE), true, bag(2325, "Redberry pie", 1), bag(), null, 3000, 3145, 0, BANKS));
	}
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
	public void theGuidePlateSaysWhyAndWhatToDo_forEachWayTheItemIsFound()
	{
		Preflight.Block field = check(line(DOOR), new ItemCounts(), null, 3016, 3514);
		assertEquals("Guidance paused: Cabbage is missing from your bag. Get it first, the arrow leads there.", field.reason());
		Preflight.Block exchange = check(line(PIE), new ItemCounts(), bag(), 3000, 3145);
		assertEquals("Guidance paused: Redberry pie is missing from your bag. Buy it at the Grand Exchange first.", exchange.reason());
		Preflight.Block bank = check(line(PIE), new ItemCounts(), bag(2325, "Redberry pie", 1), 3185, 3436);
		assertEquals("Guidance paused: Redberry pie is missing from your bag. Take it from the bank first.", bank.reason());
		Preflight.Block several = check(line(BARS), bag(668, "Blurite ore", 1), null, 3000, 3145);
		assertTrue(several.reason(), several.reason().contains("2 x Iron bar"));
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
		Preflight.Block b = check(line(PIE), new ItemCounts(), bag(), 3000, 3145);
		assertEquals(Preflight.Via.EXCHANGE, b.getVia());
		assertEquals(Preflight.EXCHANGE_X, b.getTarget().getX());
		assertEquals("Buy Redberry pie on the Grand Exchange", b.getTarget().getLabel());
	}

	@Test
	public void anUnreadBankDoesNotProveAPurchaseShortage()
	{
		Preflight.Block b = check(line(PIE), bag(), null, 3000, 3145);
		assertEquals(Preflight.Via.CHECK_BANK, b.getVia());
		assertTrue(b.getTarget().getLabel().startsWith("Check your bank"));
		assertTrue(b.reason().contains("check it before buying"));
		assertEquals(Preflight.Via.EXCHANGE, check(line(PIE), bag(), bag(), 3000, 3145).getVia());
		assertNull(check(line(PIE), bag(2325, "Redberry pie", 1), null, 3000, 3145));
		Preflight.Block noBank = Preflight.check("test", line(PIE), true, bag(), null, 3000, 3145, 0, Collections.emptyList());
		assertNotNull(noBank);
		assertEquals(Preflight.Via.CHECK_BANK, noBank.getVia());
		assertNull(noBank.getTarget());
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
	public void anUpstairsBankCostsItsStairs()
	{
		ActiveTarget.Spot castle = spot(3208, 3220, "Lumbridge Bank (castle top floor)");
		castle.setPlane(2);
		List<ActiveTarget.Spot> banks = List.of(spot(3093, 3243, "Draynor Bank"), castle);
		assertEquals("in the courtyard the castle's bank is nearest", castle, Preflight.nearest(banks, 3222, 3219, 0));
		assertEquals("halfway to Draynor the stairs tip it", "Draynor Bank", Preflight.nearest(banks, 3162, 3235, 0).getLabel());
		assertEquals("on the top floor already, no stairs", castle, Preflight.nearest(banks, 3150, 3225, 2));
	}

	@Test
	public void theGuideCarriesTheChip_onceAndRed()
	{
		Hud.State s = new Hud.State("[S3-02] Black Knights' Fortress", "Go to: Cabbage", "40 tiles", false, null, false, null, false, null, false,
			null, null, false, null, 40, "⚠ Missing Item: Cabbage - Turn back!");
		assertEquals("⚠ Missing Item: Cabbage - Turn back!", s.getMissing());
		StepGuide.View v = new StepGuide.View("[S3-02] Black Knights' Fortress", null, java.util.Collections.emptyList(), java.util.Collections.emptyList(), null, null,
			null, null);
		// Without the guard holding the arrow (the chip came first): the chip is the one warning, red, without its marker.
		HudModel.Card c = HudModel.build(HudModelTest.input(v, s, null));
		assertEquals("Missing Item: Cabbage - Turn back!", c.getWarning().getText());
		assertEquals(HudModel.Tone.DANGER, c.getWarning().getTone());
		// With the guard: the headline says what to get, red, and the chip is not repeated.
		Preflight.Block pb = new Preflight.Block("Cabbage", 1, 0, Preflight.Via.SOURCE, null, 2965, 3380, 0);
		HudModel.Card held = HudModel.build(HudModelTest.with(HudModelTest.input(v, s, null), "preflight", pb));
		assertEquals("Get Cabbage", held.getHeadline());
		assertEquals(HudModel.Tone.DANGER, held.getTone());
		assertTrue(held.plain(true, true), !held.plain(true, true).contains("Turn back"));
		// An older call without the chip still builds.
		assertNull(new Hud.State("t", null, null, false, null, false, null, false, null, false, null, null, false, null, -1).getMissing());
	}
	@Test
	public void partialBitesAcrossContainersLeadToTheBank()
	{
		ActiveTarget.StageLine l = line("{\"pre\":[{\"item\":\"Salmon\",\"n\":1,\"alt\":[\"Shrimps\",\"Cooked meat\"]}]}");
		Preflight.Block block = check(l, bag(315, "Shrimps", 2), bag(2142, "Cooked meat", 1), 3222, 3218);
		assertNotNull(block);
		assertEquals(Preflight.Via.BANK, block.getVia());
	}

}
