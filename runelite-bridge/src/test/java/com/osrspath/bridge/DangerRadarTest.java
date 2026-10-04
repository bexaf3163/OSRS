package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class DangerRadarTest
{
	private static DangerRadar.Zone zone(String id, int x, int y, int radius, Integer warn, String severity)
	{
		DangerRadar.Zone z = new DangerRadar.Zone();
		z.setId(id);
		z.setName(id);
		DangerRadar.Point c = new DangerRadar.Point();
		c.setX(x);
		c.setY(y);
		z.setCenter(c);
		z.setRadius(radius);
		z.setWarningRadius(warn);
		z.setSeverity(severity);
		z.setMessage("danger");
		z.setNpcNames(Collections.singletonList("Dark wizard"));
		z.prepare();
		return z;
	}

	@Test
	public void zonesFromTheAppDataAreReadFromTheJar()
	{
		DangerRadar radar = DangerRadar.load(new Gson());
		assertTrue("dangerZones.json must be in the jar", radar.getZones().size() >= 3);
		for (DangerRadar.Zone z : radar.getZones())
		{
			assertTrue(z.getId(), z.warn() >= z.getRadius());
			assertFalse(z.getId(), z.getBoundary().isEmpty());
			assertNotNull(z.getId(), z.hudText());
		}
		DangerRadar.Zone wizards = radar.getZones().stream().filter(z -> z.getId().equals("dark-wizards-varrock")).findFirst().orElse(null);
		assertNotNull(wizards);
		assertEquals("CRITICAL", wizards.getSeverity());
		assertTrue(wizards.getNpcNameSet().contains("dark wizard"));
	}

	@Test
	public void brokenZonesAreDroppedAndDoNotCrashThePlugin()
	{
		DangerRadar.ZoneFile f = new DangerRadar.ZoneFile();
		DangerRadar.Zone noCenter = new DangerRadar.Zone();
		noCenter.setId("x");
		noCenter.setName("x");
		noCenter.setMessage("x");
		noCenter.setRadius(5);
		f.zones = Arrays.asList(null, noCenter, zone("ok", 3200, 3200, 5, null, "LOW"));
		assertEquals(1, DangerRadar.parse(f).size());
		assertTrue(DangerRadar.parse(null).isEmpty());
		assertTrue(DangerRadar.parse(new DangerRadar.ZoneFile()).isEmpty());
	}

	@Test
	public void distanceAsASquare()
	{
		assertEquals(0, DangerRadar.distanceSq(3227, 3369, 3227, 3369));
		assertEquals(25, DangerRadar.distanceSq(3227, 3369, 3230, 3373));
		// Radius 12: a tile 12 away in a straight line is inside, a diagonal 9/9 (about 12.7) is not.
		assertTrue(DangerRadar.distanceSq(0, 0, 12, 0) <= 12 * 12);
		assertFalse(DangerRadar.distanceSq(0, 0, 9, 9) <= 12 * 12);
	}

	@Test
	public void entryExitAndSoundOncePerEntry()
	{
		DangerRadar r = new DangerRadar(Collections.singletonList(zone("wiz", 3227, 3369, 12, 15, "CRITICAL")));
		assertSame(DangerRadar.QUIET, r.update(3227, 3300, 0));
		assertEquals(DangerRadar.Level.NEAR, r.update(3227, 3369 - 18, 0).getLevel());

		DangerRadar.Reading in = r.update(3227, 3369 - 14, 0);
		assertEquals(DangerRadar.Level.WARNING, in.getLevel());
		assertTrue("entry is a signal", in.isEntered());
		assertFalse("standing still: no repeat signal", r.update(3227, 3369 - 14, 0).isEntered());
		DangerRadar.Reading deeper = r.update(3227, 3369 - 5, 0);
		assertEquals(DangerRadar.Level.INSIDE, deeper.getLevel());
		assertFalse("deeper in the same zone: no signal", deeper.isEntered());

		// A step out past the warning radius but within the margin is still a warning, without flicker.
		DangerRadar.Reading edge = r.update(3227, 3369 - 17, 0);
		assertEquals(DangerRadar.Level.WARNING, edge.getLevel());
		assertFalse(edge.isEntered());
		assertEquals(DangerRadar.Level.NEAR, r.update(3227, 3369 - 19, 0).getLevel());
		assertTrue("left and entered again: the signal is allowed", r.update(3227, 3369 - 14, 0).isEntered());
	}

	@Test
	public void anotherFloorIsNotDangerous()
	{
		DangerRadar r = new DangerRadar(Collections.singletonList(zone("wiz", 3227, 3369, 12, 15, "CRITICAL")));
		assertSame(DangerRadar.QUIET, r.update(3227, 3369, 1));
	}

	@Test
	public void ofTwoZonesTheDeeperOneIsChosen()
	{
		DangerRadar.Zone near = zone("near", 3100, 3100, 4, 8, "MEDIUM");
		DangerRadar.Zone far = zone("far", 3112, 3100, 10, 14, "CRITICAL");
		DangerRadar r = new DangerRadar(Arrays.asList(near, far));
		DangerRadar.Reading a = r.update(3101, 3100, 0);
		assertSame(near, a.getZone());
		assertEquals(DangerRadar.Level.INSIDE, a.getLevel());
		// Inside both: closer to the centre of the farther one.
		DangerRadar.Reading b = r.update(3108, 3100, 0);
		assertSame(far, b.getZone());
		assertTrue("a new zone is a new signal", b.isEntered());
	}

	@Test
	public void resetAfterChangingCharacter()
	{
		DangerRadar r = new DangerRadar(Collections.singletonList(zone("wiz", 3227, 3369, 12, 15, "CRITICAL")));
		assertTrue(r.update(3227, 3369, 0).isEntered());
		r.reset();
		assertTrue(r.update(3227, 3369, 0).isEntered());
	}

	@Test
	public void theCircleBorderHasNoGapsAndNoExtras()
	{
		List<int[]> ring = DangerRadar.ring(0, 0, 12);
		assertFalse(ring.isEmpty());
		for (int[] t : ring)
		{
			int d = t[0] * t[0] + t[1] * t[1];
			assertTrue("a border tile is inside the radius", d <= 144);
			assertTrue("and near the edge, not in the middle", d > 100);
		}
		// The four extreme points on the axes are on the border.
		for (int[] want : new int[][]{{12, 0}, {-12, 0}, {0, 12}, {0, -12}})
		{
			assertTrue(ring.stream().anyMatch(t -> t[0] == want[0] && t[1] == want[1]));
		}
	}
}
