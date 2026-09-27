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
		z.setMessage("опасно");
		z.setNpcNames(Collections.singletonList("Dark wizard"));
		z.prepare();
		return z;
	}

	@Test
	public void зоныИзДанныхПриложенияЧитаютсяИзJar()
	{
		DangerRadar radar = DangerRadar.load(new Gson());
		assertTrue("в jar должен лежать dangerZones.json", radar.getZones().size() >= 3);
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
	public void битыеЗоныОтбрасываютсяАНеРоняютПлагин()
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
	public void расстояниеКвадратом()
	{
		assertEquals(0, DangerRadar.distanceSq(3227, 3369, 3227, 3369));
		assertEquals(25, DangerRadar.distanceSq(3227, 3369, 3230, 3373));
		// Радиус 12: клетка в 12 по прямой — внутри, по диагонали 9/9 (≈12,7) — уже нет.
		assertTrue(DangerRadar.distanceSq(0, 0, 12, 0) <= 12 * 12);
		assertFalse(DangerRadar.distanceSq(0, 0, 9, 9) <= 12 * 12);
	}

	@Test
	public void входВыходИЗвукОдинРазНаВход()
	{
		DangerRadar r = new DangerRadar(Collections.singletonList(zone("wiz", 3227, 3369, 12, 15, "CRITICAL")));
		assertSame(DangerRadar.QUIET, r.update(3227, 3300, 0));
		assertEquals(DangerRadar.Level.NEAR, r.update(3227, 3369 - 18, 0).getLevel());

		DangerRadar.Reading in = r.update(3227, 3369 - 14, 0);
		assertEquals(DangerRadar.Level.WARNING, in.getLevel());
		assertTrue("вход — сигнал", in.isEntered());
		assertFalse("стоим — без повторного сигнала", r.update(3227, 3369 - 14, 0).isEntered());
		DangerRadar.Reading deeper = r.update(3227, 3369 - 5, 0);
		assertEquals(DangerRadar.Level.INSIDE, deeper.getLevel());
		assertFalse("глубже в той же зоне — без сигнала", deeper.isEntered());

		// Шаг наружу за радиус предупреждения, но в пределах запаса — всё ещё предупреждение, без мигания.
		DangerRadar.Reading edge = r.update(3227, 3369 - 17, 0);
		assertEquals(DangerRadar.Level.WARNING, edge.getLevel());
		assertFalse(edge.isEntered());
		assertEquals(DangerRadar.Level.NEAR, r.update(3227, 3369 - 19, 0).getLevel());
		assertTrue("вышел и вошёл снова — сигнал разрешён", r.update(3227, 3369 - 14, 0).isEntered());
	}

	@Test
	public void другойЭтажНеОпасен()
	{
		DangerRadar r = new DangerRadar(Collections.singletonList(zone("wiz", 3227, 3369, 12, 15, "CRITICAL")));
		assertSame(DangerRadar.QUIET, r.update(3227, 3369, 1));
	}

	@Test
	public void изДвухЗонВыбираетсяТаКудаЗашёлГлубже()
	{
		DangerRadar.Zone near = zone("near", 3100, 3100, 4, 8, "MEDIUM");
		DangerRadar.Zone far = zone("far", 3112, 3100, 10, 14, "CRITICAL");
		DangerRadar r = new DangerRadar(Arrays.asList(near, far));
		DangerRadar.Reading a = r.update(3101, 3100, 0);
		assertSame(near, a.getZone());
		assertEquals(DangerRadar.Level.INSIDE, a.getLevel());
		// Внутри обеих — ближе к центру дальней.
		DangerRadar.Reading b = r.update(3108, 3100, 0);
		assertSame(far, b.getZone());
		assertTrue("новая зона — новый сигнал", b.isEntered());
	}

	@Test
	public void сбросПослеСменыПерсонажа()
	{
		DangerRadar r = new DangerRadar(Collections.singletonList(zone("wiz", 3227, 3369, 12, 15, "CRITICAL")));
		assertTrue(r.update(3227, 3369, 0).isEntered());
		r.reset();
		assertTrue(r.update(3227, 3369, 0).isEntered());
	}

	@Test
	public void границаКругаБезДырИЛишнего()
	{
		List<int[]> ring = DangerRadar.ring(0, 0, 12);
		assertFalse(ring.isEmpty());
		for (int[] t : ring)
		{
			int d = t[0] * t[0] + t[1] * t[1];
			assertTrue("клетка границы внутри радиуса", d <= 144);
			assertTrue("и у края, а не в середине", d > 100);
		}
		// Четыре крайние точки по осям — на границе.
		for (int[] want : new int[][]{{12, 0}, {-12, 0}, {0, 12}, {0, -12}})
		{
			assertTrue(ring.stream().anyMatch(t -> t[0] == want[0] && t[1] == want[1]));
		}
	}
}
