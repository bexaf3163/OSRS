package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import org.junit.Test;

public class NavigationTest
{
	@Test
	public void straightLineDistance()
	{
		assertEquals(0, Navigation.distance(3222, 3218, 3222, 3218));
		assertEquals(5, Navigation.distance(0, 0, 3, 4));
		// Lumbridge kitchen to the church: dx = 35, dy = −8.
		assertEquals(36, Navigation.distance(3208, 3214, 3243, 3206));
		// Lumbridge to Varrock, about 208 tiles.
		assertEquals(208, Navigation.distance(3222, 3218, 3212, 3426));
	}

	@Test
	public void arrowByCompassDirection()
	{
		assertEquals("↑", Navigation.arrow(0, 10));
		assertEquals("↗", Navigation.arrow(10, 10));
		assertEquals("→", Navigation.arrow(10, 1));
		assertEquals("↘", Navigation.arrow(7, -7));
		assertEquals("↓", Navigation.arrow(0, -3));
		assertEquals("↙", Navigation.arrow(-5, -5));
		assertEquals("←", Navigation.arrow(-9, 2));
		assertEquals("↖", Navigation.arrow(-4, 4));
		assertEquals("", Navigation.arrow(0, 0));
	}

	@Test
	public void nearWithHysteresis()
	{
		Navigation.Readout far = Navigation.readout(3200, 3200, 0, 3200, 3342, 0, false);
		assertEquals("~142 tiles ↑", far.getText());
		assertFalse(far.isNear());
		assertTrue(Navigation.readout(3200, 3200, 0, 3203, 3203, 0, false).isNear());
		assertEquals("✓ Nearby", Navigation.readout(3200, 3200, 0, 3204, 3200, 0, false).getText());
		// 6 tiles: when approaching it is not yet "Nearby", when moving away from "Nearby" it is still "Nearby".
		assertFalse(Navigation.readout(3200, 3200, 0, 3206, 3200, 0, false).isNear());
		assertTrue(Navigation.readout(3200, 3200, 0, 3206, 3200, 0, true).isNear());
		assertFalse(Navigation.readout(3200, 3200, 0, 3207, 3200, 0, true).isNear());
	}

	@Test
	public void floorsAndDungeons()
	{
		assertEquals("Target is a floor up", Navigation.readout(3208, 3214, 0, 3209, 3214, 1, false).getText());
		assertEquals("~20 tiles →, a floor down", Navigation.readout(3200, 3200, 2, 3220, 3200, 0, false).getText());
		assertEquals("Target is underground - find the way down", Navigation.readout(3109, 3160, 0, 3104, 9571, 0, false).getText());
		assertEquals("Target is on the surface - get back up", Navigation.readout(3104, 9571, 0, 3109, 3160, 0, false).getText());
	}

	@Test
	public void tilePlural()
	{
		assertEquals("1 tile", Navigation.tiles(1));
		assertEquals("3 tiles", Navigation.tiles(3));
		assertEquals("11 tiles", Navigation.tiles(11));
		assertEquals("21 tiles", Navigation.tiles(21));
		assertEquals("142 tiles", Navigation.tiles(142));
		assertEquals("115 tiles", Navigation.tiles(115));
	}

	private static ActiveTarget.WorldPointDto p(int x, int y, String label)
	{
		ActiveTarget.WorldPointDto d = new ActiveTarget.WorldPointDto();
		d.setX(x);
		d.setY(y);
		d.setLabel(label);
		return d;
	}

	@Test
	public void waypointsSwitchAndClear()
	{
		Navigation.Breadcrumbs route = new Navigation.Breadcrumbs(Arrays.asList(p(3243, 3210, "Aereck"), p(3148, 3175, "Urhney"), p(3250, 3193, "Coffin")));
		assertEquals("Aereck", route.current().getLabel());
		assertFalse(route.update(3230, 3210, 0));
		assertTrue(route.update(3241, 3212, 0));
		assertEquals("Urhney", route.current().getLabel());
		// Wrong floor: not counted.
		assertFalse(route.update(3148, 3175, 1));
		// Reached the last one at once: the intermediate one is skipped, the route is done.
		assertTrue(route.update(3251, 3194, 0));
		assertTrue(route.finished());
		assertNull(route.current());
		assertFalse(route.update(3251, 3194, 0));
	}

	@Test
	public void routeThereAndBackDoesNotJumpToTheEnd()
	{
		// The Restless Ghost: coffin, Wizards' Tower, then the coffin again.
		Navigation.Breadcrumbs route = new Navigation.Breadcrumbs(Arrays.asList(p(3250, 3193, "Coffin"), p(3109, 3160, "Tower"), p(3250, 3193, "Coffin")));
		assertTrue(route.update(3250, 3194, 0));
		assertEquals("Tower", route.current().getLabel());
		assertFalse(route.finished());
		assertTrue(route.update(3109, 3161, 0));
		assertTrue(route.update(3249, 3193, 0));
		assertTrue(route.finished());
	}

	/** S3-08 in 2.55.0: inside the Stronghold of Security the HUD read "~2180 tiles" to the surface entrance. */
	@Test
	public void theStrongholdIsASeparateAreaNotADistance()
	{
		assertEquals(0, Navigation.layer(3420));
		assertEquals(1, Navigation.layer(5241));
		assertEquals(2, Navigation.layer(9571));
		assertEquals("Target is outside this area - find the way out", Navigation.readout(1899, 5241, 0, 3081, 3420, 0, false).getText());
		assertEquals(-1, Navigation.readout(1899, 5241, 0, 3081, 3420, 0, false).getTiles());
		assertEquals("Target is in a separate area - find the way in", Navigation.readout(3081, 3420, 0, 1876, 5216, 0, false).getText());
		// Inside the same area it is a distance as usual: from the north-east room to the level 12 Minotaurs.
		assertEquals("~34 tiles ↙", Navigation.readout(1899, 5241, 0, 1876, 5216, 0, false).getText());
	}

	@Test
	public void insideTheStepsAreaTheSurfaceWaypointsAreBehind()
	{
		ActiveTarget.WorldPointDto room = p(1876, 5216, "Minotaurs");
		Navigation.Breadcrumbs route = new Navigation.Breadcrumbs(Arrays.asList(p(3081, 3420, "Entrance"), room));
		// On the surface the entrance comes first.
		assertFalse(route.update(3100, 3430, 0));
		assertEquals("Entrance", route.current().getLabel());
		// The step is shown while the player is already inside: the entrance is behind, the arrow leads to the room.
		Navigation.Breadcrumbs inside = new Navigation.Breadcrumbs(Arrays.asList(p(3081, 3420, "Entrance"), room));
		assertTrue(inside.update(1899, 5241, 0));
		assertEquals("Minotaurs", inside.current().getLabel());
		assertFalse(inside.update(1898, 5240, 0));
		// Reaching the room ends the route.
		assertTrue(inside.update(1877, 5217, 0));
		assertTrue(inside.finished());
	}

	@Test
	public void aDungeonWaypointOnTheWayIsNeverSkippedFromTheSurface()
	{
		// Surface, a dungeon, back to the surface: a player on the surface is not "past" the dungeon waypoint.
		Navigation.Breadcrumbs route = new Navigation.Breadcrumbs(Arrays.asList(p(3097, 3468, "Trapdoor"), p(3115, 9840, "Giants"), p(3094, 3491, "Bank")));
		assertTrue(route.update(3097, 3469, 0));
		assertEquals("Giants", route.current().getLabel());
		assertFalse(route.update(3094, 3480, 0));
		assertEquals("Giants", route.current().getLabel());
		// Underground, with the route going back to the surface after the dungeon point: nothing is skipped either (as before 2.55.1).
		Navigation.Breadcrumbs back = new Navigation.Breadcrumbs(Arrays.asList(p(3097, 3468, "Trapdoor"), p(3115, 9840, "Giants"), p(3094, 3491, "Bank")));
		assertFalse(back.update(3110, 9850, 0));
		assertEquals("Trapdoor", back.current().getLabel());
	}

	@Test
	public void theMisthalinMysteryManorIsAnInstanceNotAWorldMapPlace()
	{
		assertTrue(Navigation.isInstanced(1615, 4829));
		assertTrue(Navigation.isInstanced(1647, 4836));
		assertFalse(Navigation.isInstanced(3213, 3428));
		assertFalse("dungeons north of the surface are not instances", Navigation.isInstanced(3104, 9571));
	}
}
