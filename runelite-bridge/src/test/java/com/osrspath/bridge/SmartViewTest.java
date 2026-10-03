package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.awt.FontMetrics;
import java.util.List;
import net.runelite.client.ui.overlay.components.PanelComponent;
import org.junit.Test;

/** «Умное проявление»: что видно в игре в пути, у банка, на бирже и рядом со шагом; что остаётся всегда. */
public class SmartViewTest
{
	@Test
	public void вПути_далеко_отЦели_только_стрелкаИОднаСтрока()
	{
		SmartView.Context c = SmartView.of(false, false, SmartView.TRAVEL_TILES + 1);
		assertEquals(SmartView.Context.TRAVEL, c);
		assertFalse("список шага в пути закрывал бы обзор", SmartView.showsGuide(c));
		assertTrue(SmartView.compactHud(c));
	}

	@Test
	public void рядомСоШагомИлиБезЦели_обычныйВид()
	{
		for (int tiles : new int[] {-1, 0, 5, SmartView.TRAVEL_TILES})
		{
			SmartView.Context c = SmartView.of(false, false, tiles);
			assertEquals("клеток: " + tiles, SmartView.Context.STEP, c);
			assertTrue(SmartView.showsGuide(c));
			assertFalse(SmartView.compactHud(c));
		}
	}

	@Test
	public void уБанка_списокВиден_дажеЕслиЦельДалеко()
	{
		SmartView.Context c = SmartView.of(true, false, 500);
		assertEquals(SmartView.Context.BANK, c);
		assertTrue(SmartView.showsGuide(c));
		assertFalse("у банка HUD обычный: проверка вылета рисуется отдельно", SmartView.compactHud(c));
	}

	@Test
	public void наБирже_списокШагаПрячется_HUDОднойСтрокой()
	{
		SmartView.Context c = SmartView.of(false, true, 3);
		assertEquals(SmartView.Context.EXCHANGE, c);
		assertFalse(SmartView.showsGuide(c));
		assertTrue(SmartView.compactHud(c));
	}

	@Test
	public void банкГлавнееБиржи_иЦели()
	{
		assertEquals(SmartView.Context.BANK, SmartView.of(true, true, 100));
	}

	@Test
	public void радар_вУмномВиде_толькоКогдаУжеВЗоне()
	{
		assertFalse(SmartView.dangerVisible(true, DangerRadar.Level.NONE));
		assertFalse(SmartView.dangerVisible(true, DangerRadar.Level.NEAR));
		assertFalse("на подходе — не всплываем", SmartView.dangerVisible(true, DangerRadar.Level.WARNING));
		assertTrue(SmartView.dangerVisible(true, DangerRadar.Level.INSIDE));
		// Умный вид выключен — как раньше: и на подходе.
		assertTrue(SmartView.dangerVisible(false, DangerRadar.Level.WARNING));
		assertTrue(SmartView.dangerVisible(false, DangerRadar.Level.INSIDE));
		assertFalse(SmartView.dangerVisible(false, DangerRadar.Level.NEAR));
	}

	private static OsrsPathHudOverlay.State full(String danger, boolean inside, String health, boolean critical)
	{
		return new OsrsPathHudOverlay.State("К месту: Draynor Bank", "Потом — шаг [S9-01] Lost City", "~42 клетки ↗", false,
			"Сумка: не хватает 2", false, danger, inside, "34 креветки до 20 Fishing", false, "⚡ Надень Iron scimitar",
			health, critical, "Use Knife на Tree", 42);
	}

	@Test
	public void компактныйHUD_действиеИРасстояниеОднойСтрокой_остальноеУбрано()
	{
		OsrsPathHudOverlay.State s = SmartView.compact(full(null, false, null, false));
		assertEquals("К месту: Draynor Bank · ~42 клетки ↗", s.getTitle());
		assertNull(s.getGoal());
		assertNull(s.getDistance());
		assertNull(s.getBag());
		assertNull(s.getPacing());
		assertNull(s.getUpgrade());
		assertNull(s.getAction());
		assertNull(s.getDanger());
		assertEquals(42, s.getTiles());
	}

	@Test
	public void компактныйHUD_критичноеОстаётся_опасностьТолькоВнутриЗоны()
	{
		assertNull("на подходе — не показываем", SmartView.compact(full("Тёмные маги", false, null, false)).getDanger());
		OsrsPathHudOverlay.State inside = SmartView.compact(full("Тёмные маги", true, null, false));
		assertEquals("Тёмные маги", inside.getDanger());
		assertTrue(inside.isDangerInside());
		OsrsPathHudOverlay.State low = SmartView.compact(full(null, false, "HP 5/40 — ЕШЬ СЕЙЧАС! Бьёт до 8", true));
		assertEquals("HP 5/40 — ЕШЬ СЕЙЧАС! Бьёт до 8", low.getHealth());
		assertTrue(low.isHealthCritical());
		assertNull("пора есть, но не критично — это не для одной строки", SmartView.compact(full(null, false, "HP 15/40 — пора есть. Бьёт до 8", false)).getHealth());
	}

	@Test
	public void компактныйHUD_безНазванияИлиРасстояния_неПадает()
	{
		OsrsPathHudOverlay.State onlyDistance = SmartView.compact(new OsrsPathHudOverlay.State(null, null, "~30 клеток", false, null, false, null, false, null, false, null));
		assertEquals("~30 клеток", onlyDistance.getTitle());
		OsrsPathHudOverlay.State onlyTitle = SmartView.compact(new OsrsPathHudOverlay.State("[S1-01] Шаг", null, null, false, null, false, null, false, null, false, null));
		assertEquals("[S1-01] Шаг", onlyTitle.getTitle());
		OsrsPathHudOverlay.State nothing = SmartView.compact(new OsrsPathHudOverlay.State("", null, null, false, null, false, null, false, null, false, null));
		assertEquals("OSRS Путь", nothing.getTitle());
	}

	@Test
	public void компактныйHUD_рисуетсяКороткойПлашкой()
	{
		FontMetrics fm = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_ARGB).createGraphics()
			.getFontMetrics(OverlayText.font(net.runelite.client.ui.FontManager.getRunescapeFont(), 1f));
		PanelComponent normal = new PanelComponent();
		PanelComponent compact = new PanelComponent();
		OsrsPathHudOverlay.build(normal, full(null, false, null, false), fm, OsrsPathHudOverlay.WIDTH, 70);
		OsrsPathHudOverlay.build(compact, SmartView.compact(full(null, false, null, false)), fm, OsrsPathHudOverlay.WIDTH, 70);
		List<?> a = normal.getChildren();
		List<?> b = compact.getChildren();
		assertTrue("в пути строк заметно меньше (" + b.size() + " против " + a.size() + ")", b.size() < a.size());
	}

	@Test
	public void расстояниеВКлетках_приходитИзГотовогоРасчёта()
	{
		assertEquals(30, Navigation.readout(3200, 3200, 0, 3200, 3230, 0, false).getTiles());
		assertEquals("рядом — тоже число", 3, Navigation.readout(3200, 3200, 0, 3203, 3200, 0, false).getTiles());
		assertEquals("другой этаж — не «в пути»", -1, Navigation.readout(3200, 3200, 0, 3200, 3300, 1, false).getTiles());
		assertEquals("под землёй — неизвестно", -1, Navigation.readout(3200, 3200, 0, 3200, 9700, 0, false).getTiles());
	}
}
