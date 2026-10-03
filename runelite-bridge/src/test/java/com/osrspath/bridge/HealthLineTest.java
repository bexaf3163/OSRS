package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.awt.Canvas;
import java.awt.FontMetrics;
import java.util.List;
import net.runelite.client.ui.overlay.components.PanelComponent;
import org.junit.Test;

/** Строка о здоровье в HUD: когда показывается, когда молчит и что приходит от приложения. */
public class HealthLineTest
{
	@Test
	public void молчит_пока_здоровья_хватает_или_удар_неизвестен()
	{
		assertNull(OsrsPathBridgePlugin.healthLine(40, 40, 10));
		assertNull("ровно два удара — ещё рано", OsrsPathBridgePlugin.healthLine(20, 40, 10));
		assertNull("удар неизвестен", OsrsPathBridgePlugin.healthLine(5, 40, null));
		assertNull("не в игре", OsrsPathBridgePlugin.healthLine(0, 0, 10));
	}

	@Test
	public void предупреждает_ниже_двух_ударов_и_кричит_ниже_одного()
	{
		assertEquals("HP 19/40 — пора есть. Бьёт до 10", OsrsPathBridgePlugin.healthLine(19, 40, 10));
		assertEquals("HP 10/40 — ЕШЬ СЕЙЧАС! Бьёт до 10", OsrsPathBridgePlugin.healthLine(10, 40, 10));
		assertEquals("HP 1/10 — ЕШЬ СЕЙЧАС! Бьёт до 3", OsrsPathBridgePlugin.healthLine(1, 10, 3));
	}

	@Test
	public void maxHit_приходит_от_приложения_и_проверяется()
	{
		ActiveTarget t = new Gson().fromJson("{\"stepId\":\"S5-08\",\"title\":\"Elvarg\",\"maxHit\":10}", ActiveTarget.class);
		assertNull(t.prepare());
		assertEquals(Integer.valueOf(10), t.getMaxHit());
		ActiveTarget bad = new Gson().fromJson("{\"stepId\":\"S5-08\",\"title\":\"Elvarg\",\"maxHit\":900}", ActiveTarget.class);
		assertNotNull(bad.prepare());
	}

	@Test
	public void строка_рисуется_в_HUD()
	{
		FontMetrics fm = new Canvas().getFontMetrics(new java.awt.Font("Dialog", java.awt.Font.PLAIN, 12));
		PanelComponent panel = new PanelComponent();
		OsrsPathHudOverlay.State s = new OsrsPathHudOverlay.State("[S5-08] Elvarg", "Дом", null, false, null, false, null, false, null, false, null,
			"HP 10/40 — ЕШЬ СЕЙЧАС! Бьёт до 10", true);
		OsrsPathHudOverlay.build(panel, s, fm, OsrsPathHudOverlay.WIDTH, 70);
		assertTrue(panel.getChildren().size() >= 3);
		// Без строки о здоровье HUD как раньше (старый конструктор).
		PanelComponent old = new PanelComponent();
		OsrsPathHudOverlay.build(old, new OsrsPathHudOverlay.State("[S5-08] Elvarg", "Дом", null, false, null, false, null, false, null, false, null),
			fm, OsrsPathHudOverlay.WIDTH, 70);
		assertTrue(old.getChildren().size() < panel.getChildren().size());
	}

	@Test
	public void use_напоминание_только_когда_предмет_в_сумке_и_цель_подсвечивается()
	{
		ActiveTarget t = new Gson().fromJson("{\"stepId\":\"S2-03\",\"title\":\"Witch's Potion\","
			+ "\"useOn\":[{\"item\":\"Raw rat meat\",\"target\":\"Fireplace\"}]}", ActiveTarget.class);
		assertNull(t.prepare());
		assertNull("мяса ещё нет", OsrsPathBridgePlugin.useLine(t, StepGuideTest.counts()));
		assertEquals("Use Raw rat meat на Fireplace", OsrsPathBridgePlugin.useLine(t, StepGuideTest.counts(2134, "Raw rat meat", 1)));
		assertTrue("камин подсвечивается как объект шага", t.getObjectNameSet().contains("fireplace"));
		assertTrue("мясо подсвечивается в сумке", t.getItemNameSet().contains("raw rat meat"));
		assertNull(OsrsPathBridgePlugin.useLine(null, StepGuideTest.counts()));
		ActiveTarget bad = new Gson().fromJson("{\"stepId\":\"S2-03\",\"title\":\"x\",\"useOn\":[{\"item\":\"\",\"target\":\"Fireplace\"}]}", ActiveTarget.class);
		assertNotNull(bad.prepare());
		ActiveTarget npc = new Gson().fromJson("{\"stepId\":\"S2-03\",\"title\":\"x\",\"useOn\":[{\"item\":\"Bones\",\"target\":\"Cow\",\"kind\":\"npc\"}]}", ActiveTarget.class);
		assertNull(npc.prepare());
		assertTrue(npc.getNpcNameSet().contains("cow"));
	}
}
