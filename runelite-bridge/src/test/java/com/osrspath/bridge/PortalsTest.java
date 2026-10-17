package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

/** The ways in and out on the real table (src/data/portals.json, from the Shortest Path plugin's transports). */
public class PortalsTest
{
	@Test
	public void theTableLoads()
	{
		assertTrue("ways: " + Portals.all().size(), Portals.all().size() > 500);
	}

	/** The owner, 2026-10-17: "Talk to Chief Tess (Corsair Cove Dungeon)" said only "Target is underground - find the way down". */
	@Test
	public void chiefTessIsReachedThroughTheHoleOnTheBeach()
	{
		Portals.Portal p = Portals.pick(2552, 2846, 2012, 9006);
		assertNotNull(p);
		assertEquals(31791, p.getId());
		assertEquals("Way down: Enter Hole", p.label());
		assertTrue(Math.abs(p.getX() - 2523) <= 2 && Math.abs(p.getY() - 2860) <= 2);
	}

	@Test
	public void outOfTessCaveTheVineLadderLeadsUp()
	{
		Portals.Portal p = Portals.pick(2012, 9004, 2504, 2840);
		assertNotNull(p);
		assertEquals(31790, p.getId());
		assertTrue(p.label().startsWith("Way up"));
	}

	@Test
	public void theWizardsTowerBasementIsTheTowerLadder()
	{
		Portals.Portal p = Portals.pick(3222, 3218, 3104, 9571);
		assertNotNull(p);
		assertEquals(2147, p.getId());
	}

	@Test
	public void theHillGiantsAreThroughTheEdgevilleTrapdoor()
	{
		Portals.Portal p = Portals.pick(3094, 3480, 3111, 9838);
		assertNotNull(p);
		assertTrue("near the trapdoor north of Edgeville: " + p, Math.abs(p.getX() - 3096) <= 6 && Math.abs(p.getY() - 3468) <= 6);
	}

	@Test
	public void theStrongholdOfSecurityIsASeparateAreaEnteredFromTheBarbarianVillage()
	{
		Portals.Portal p = Portals.pick(3081, 3430, 1876, 5216);
		assertNotNull(p);
		assertTrue(p.label(), p.label().startsWith("Way in"));
		assertTrue("the entrance by Barbarian Village: " + p, Math.abs(p.getX() - 3081) <= 4 && Math.abs(p.getY() - 3421) <= 4);
	}

	@Test
	public void sameLayerNeedsNoWay()
	{
		assertNull(Portals.pick(3222, 3218, 3104, 3162));
		assertNull(Portals.pick(2012, 9004, 2020, 9010));
	}

	@Test
	public void aFreeWayWinsOverOneWithARequirement()
	{
		List<Portals.Portal> ways = Arrays.asList(
			new Portals.Portal(100, 100, 0, 100, 6600, 0, 1, "Enter Gated", "Quest X"),
			new Portals.Portal(150, 150, 0, 120, 6620, 0, 2, "Enter Free", ""));
		assertEquals(2, Portals.pick(ways, 0, 0, 101, 6601).getId());
		assertEquals("only one with a requirement fits: it is taken", 1, Portals.pick(ways.subList(0, 1), 0, 0, 101, 6601).getId());
	}

	@Test
	public void aWayWhoseFarEndIsFarFromTheTargetIsNotTaken()
	{
		List<Portals.Portal> ways = Arrays.asList(new Portals.Portal(100, 100, 0, 3000, 9000, 0, 1, "Enter Far", ""));
		assertNull(Portals.pick(ways, 0, 0, 100, 6600));
	}

	/** "A floor up" with nothing to climb: the staircase that comes out next to the target (Lumbridge Castle's bank floor from the courtyard). */
	@Test
	public void aFloorUpIsReachedByTheStairsOfTheTargetsBuilding()
	{
		Portals.Portal p = Portals.pickFloor(3222, 3218, 0, 3208, 3220, 2);
		assertNotNull(p);
		assertTrue(p.label(), p.label().startsWith("Way up"));
		assertTrue("Lumbridge Castle stairs: " + p, Math.abs(p.getX() - 3205) <= 6 && p.getY() >= 3205 && p.getY() <= 3232);
	}

	@Test
	public void goingDownTakesTheStairsOfTheBuildingThePlayerIsIn()
	{
		// Upstairs in Lumbridge Castle (bank floor), the target on the ground far away: the castle's own stairs, not some staircase near the target.
		Portals.Portal p = Portals.pickFloor(3208, 3220, 2, 3093, 3243, 0);
		assertNotNull(p);
		assertTrue("Lumbridge Castle stairs (north or south): " + p, Math.abs(p.getX() - 3205) <= 6 && p.getY() >= 3205 && p.getY() <= 3232);
		assertTrue(p.label().startsWith("Way down"));
	}

	@Test
	public void theSameFloorNeedsNoStairs()
	{
		assertNull(Portals.pickFloor(3222, 3218, 0, 3208, 3220, 0));
		assertNull("another layer is a way, not a staircase", Portals.pickFloor(3222, 3218, 0, 3104, 9571, 0));
	}
}
