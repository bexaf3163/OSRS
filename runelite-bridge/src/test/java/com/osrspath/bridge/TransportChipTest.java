package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Collections;
import org.junit.Test;

/**
 * The fast-travel recommendation in the game: a short action chip on the HUD, the arrow at the first stop (the dock, the canoe station, the first ring) with
 * the NPC or the object to click highlighted there, and no stale arrow after the player has teleported or sailed.
 */
public class TransportChipTest
{
	private static PrepPlan.RecommendedTransport transport(String json)
	{
		PrepPlan.RecommendedTransport t = new Gson().fromJson(json, PrepPlan.RecommendedTransport.class);
		assertTrue(json, t.valid());
		return t;
	}

	private static PrepPlan plan(PrepPlan.RecommendedTransport t)
	{
		PrepPlan p = new PrepPlan();
		p.setStepId("S2-12");
		p.setRecommendedTransport(t);
		assertNull(p.prepare());
		return p;
	}

	private static final String CHRONICLE = "{\"type\":\"item_teleport\",\"destination\":\"by Champions' Guild\",\"interactionId\":0,\"item\":\"Chronicle\","
		+ "\"text\":\"Teleport: Chronicle to by Champions' Guild (saves ~120 tiles, about 1 min)\",\"chip\":\"⚡ Use Chronicle → Champions' Guild\"}";
	private static final String FERRY = "{\"type\":\"ferry\",\"destination\":\"Musa Point, Karamja\",\"interactionId\":0,\"interactionName\":\"Captain Tobias\","
		+ "\"tile\":{\"x\":3028,\"y\":3218,\"plane\":0},\"text\":\"Boat: Port Sarim to Karamja (saves ~90 tiles)\",\"chip\":\"⚡ Ferry: talk to Captain Tobias → Musa Point, Karamja\"}";
	private static final String CANOE = "{\"type\":\"canoe\",\"destination\":\"Edgeville\",\"interactionId\":0,\"interactionName\":\"Canoe Station\","
		+ "\"tile\":{\"x\":3241,\"y\":3235,\"plane\":0},\"text\":\"Canoe: Lumbridge to Edgeville (saves ~250 tiles)\"}";

	@Test
	public void theChipComesFromTheAppAndFallsBackToTheText()
	{
		assertEquals("⚡ Use Chronicle → Champions' Guild", transport(CHRONICLE).chipText());
		// An older app sends no chip: the first words of the text carry it.
		String chip = transport(CANOE).chipText();
		assertTrue(chip, chip.startsWith("⚡ Canoe: Lumbridge to Edgeville"));
		assertTrue(chip.length() <= 58);
	}

	@Test
	public void aFerryPointsAtItsDockWithItsNpcHighlighted()
	{
		NavTarget n = transport(FERRY).navTarget("S4-04");
		assertNotNull(n);
		assertEquals("Captain Tobias → Musa Point, Karamja", n.getLabel());
		assertEquals(3028, n.getX());
		assertEquals(Collections.singletonList("Captain Tobias"), n.getNpcNames());
		assertTrue(n.getNpcNameSet().contains(ActiveTarget.nameKey("Captain Tobias")));
		assertTrue(n.getObjectNameSet().isEmpty());
	}

	@Test
	public void aCanoePointsAtTheStationWithTheStationHighlighted()
	{
		NavTarget n = transport(CANOE).navTarget("S1-09");
		assertNotNull("a canoe has a first stop to point at", n);
		assertEquals(3241, n.getX());
		assertTrue(n.getObjectNameSet().contains(ActiveTarget.nameKey("Canoe Station")));
		assertTrue(n.getNpcNameSet().isEmpty());
	}

	@Test
	public void aTeleportHasNoStopToPointAt()
	{
		assertNull(transport(CHRONICLE).navTarget("S2-12"));
	}

	@Test
	public void objectNamesAreCheckedLikeNpcNames()
	{
		NavTarget n = new NavTarget();
		n.setLabel("Canoe Station → Edgeville");
		n.setX(3241);
		n.setY(3235);
		n.setObjectNames(Collections.singletonList("Canoe Station"));
		assertNull(n.prepare());
		n.setObjectNames(Collections.singletonList(""));
		assertEquals("invalid object name", n.prepare());
		n.setObjectNames(java.util.Arrays.asList("a", "b", "c", "d", "e", "f", "g", "h", "i"));
		assertEquals("too many objects", n.prepare());
	}

	@Test
	public void theChipIsOnTheHudWhileNothingElseLeadsTheArrowAndWhileTheTransportDoes()
	{
		PrepPlan p = plan(transport(CHRONICLE));
		assertEquals("⚡ Use Chronicle → Champions' Guild", OsrsPathBridgePlugin.transportChip(p, false, false));
		assertEquals("the arrow leads to the transport's own stop", "⚡ Use Chronicle → Champions' Guild", OsrsPathBridgePlugin.transportChip(p, true, true));
		assertNull("a shop or a place has its own heading", OsrsPathBridgePlugin.transportChip(p, true, false));
		assertNull("no plan, no chip", OsrsPathBridgePlugin.transportChip(null, false, false));
		assertNull("a plan without a transport", OsrsPathBridgePlugin.transportChip(new PrepPlan(), false, false));
	}

	@Test
	public void aJumpEndsATransportStopButNotAPlaceTarget()
	{
		assertTrue(OsrsPathBridgePlugin.transportStopOutdated(true, true));
		assertFalse("walking on keeps the dock arrow", OsrsPathBridgePlugin.transportStopOutdated(true, false));
		assertFalse("a shop target is still the goal after a teleport", OsrsPathBridgePlugin.transportStopOutdated(false, true));
	}

	@Test
	public void aJumpOfTwentyTilesIsATeleportAndWalkingIsNot()
	{
		// Port Sarim dock to Musa Point on the boat; a Chronicle jump; a normal step.
		assertTrue(MoveDetector.isJump(3028, 3218, 2950, 3151));
		assertTrue(MoveDetector.isJump(3093, 3244, 3201, 3355));
		assertFalse(MoveDetector.isJump(3028, 3218, 3029, 3219));
	}

	@Test
	public void aBadChipIsRefusedWithTheTransport()
	{
		PrepPlan.RecommendedTransport t = transport(CHRONICLE);
		t.setChip(new String(new char[600]).replace('\0', 'x'));
		assertFalse(t.valid());
	}
}
