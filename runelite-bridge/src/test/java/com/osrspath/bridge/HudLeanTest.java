package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import org.junit.Test;

/**
 * Компактный HUD: верхняя плашка не повторяет список «Что нужно» (название шага, цель, расстояние, «Сумка готова» — это всё
 * уже в списке, на стрелке и миникарте) и пропадает совсем, когда сказать ей нечего.
 */
public class HudLeanTest
{
	/** Как на скриншоте: временная цель поверх шага, ~194 клетки, сумка готова. */
	private static OsrsPathHudOverlay.State detour()
	{
		return new OsrsPathHudOverlay.State("К месту: Отнеси меч Squire", "Потом — шаг [S2-07] The Knight's Sword", "~194 клетки ↑", false,
			"Сумка готова к выходу", true, null, false, null, false, null, null, false, null, 194);
	}

	private static StepGuide.View stageView()
	{
		StepGuide.StageView sv = new StepGuide.StageView(1, 1, Collections.emptyList(), 0, false);
		return new StepGuide.View("[S2-07] The Knight's Sword", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null, sv);
	}

	@Test
	public void списокНаЭкране_плашкаСДублямиПропадаетСовсем()
	{
		assertNull("название, цель, расстояние и «сумка готова» — всё в списке", OsrsPathHudOverlay.lean(detour(), true));
	}

	@Test
	public void спискаНет_названиеЦельИРасстояниеОстаются_СумкаГотоваНет()
	{
		OsrsPathHudOverlay.State s = OsrsPathHudOverlay.lean(detour(), false);
		assertNotNull(s);
		assertEquals("К месту: Отнеси меч Squire", s.getTitle());
		assertEquals("~194 клетки ↑", s.getDistance());
		assertNull("хорошая новость не нужна", s.getBag());
	}

	@Test
	public void спискаНет_ноВСумкеЧегоТоНеХватает_строкаСумкиОстаётся()
	{
		OsrsPathHudOverlay.State s = new OsrsPathHudOverlay.State("Шаг", null, null, false, "Сумка: нет Knife", false, null, false, null, false, null);
		assertEquals("Сумка: нет Knife", OsrsPathHudOverlay.lean(s, false).getBag());
		assertNull("список рядом — недостающее видно в нём", OsrsPathHudOverlay.lean(s, true));
	}

	@Test
	public void предупреждения_остаютсяВсегда()
	{
		OsrsPathHudOverlay.State danger = new OsrsPathHudOverlay.State("Шаг", "цель", "~5 клеток", false, null, false, "Скелет рядом", true, null, false, null);
		OsrsPathHudOverlay.State lean = OsrsPathHudOverlay.lean(danger, true);
		assertNotNull(lean);
		assertEquals("Скелет рядом", lean.getDanger());
		assertTrue(lean.isDangerInside());
		assertNull("название и цель убраны", lean.getTitle());
		assertNull(lean.getGoal());

		OsrsPathHudOverlay.State health = new OsrsPathHudOverlay.State("Шаг", null, null, false, null, false, null, false, null, false, null,
			"HP 12/40 — ешь!", true);
		assertEquals("HP 12/40 — ешь!", OsrsPathHudOverlay.lean(health, true).getHealth());
		assertTrue(OsrsPathHudOverlay.lean(health, true).isHealthCritical());

		OsrsPathHudOverlay.State action = new OsrsPathHudOverlay.State("Шаг", null, null, false, null, false, null, false, null, false, null,
			null, false, "Use Knife на Bread");
		assertEquals("Use Knife на Bread", OsrsPathHudOverlay.lean(action, true).getAction());

		OsrsPathHudOverlay.State pacing = new OsrsPathHudOverlay.State("Шаг", null, null, false, null, false, null, false, "34 креветки до 20 Fishing", true, null);
		assertEquals("34 креветки до 20 Fishing", OsrsPathHudOverlay.lean(pacing, true).getPacing());

		OsrsPathHudOverlay.State upgrade = new OsrsPathHudOverlay.State("Шаг", null, null, false, null, false, null, false, null, false, "⚡ Надень Iron scimitar");
		assertEquals("⚡ Надень Iron scimitar", OsrsPathHudOverlay.lean(upgrade, true).getUpgrade());
	}

	@Test
	public void сообщенияБезПредупреждений_ничегоНеТеряют_цветИРасстояниеВТикахСохраняются()
	{
		OsrsPathHudOverlay.State s = new OsrsPathHudOverlay.State("Шаг", null, "рядом", true, null, false, null, false, "темп", false, null,
			null, false, null, 7);
		OsrsPathHudOverlay.State lean = OsrsPathHudOverlay.lean(s, true);
		assertTrue(lean.isNear());
		assertEquals(7, lean.getTiles());
	}

	@Test
	public void списокВиден_толькоЕслиВключёнНеСвёрнутИЕстьЧтоПоказать()
	{
		StepGuide.View v = stageView();
		assertTrue(GuideList.shown(true, false, v, false, SmartView.Context.STEP));
		assertFalse("выключен в настройках", GuideList.shown(false, false, v, false, SmartView.Context.STEP));
		assertFalse("свёрнут — подробностей в нём нет, HUD остаётся полным", GuideList.shown(true, true, v, false, SmartView.Context.STEP));
		assertFalse("пусто", GuideList.shown(true, false, StepGuide.EMPTY, false, SmartView.Context.STEP));
		assertFalse("в пути умный вид прячет список", GuideList.shown(true, false, v, true, SmartView.Context.TRAVEL));
		assertTrue("у банка — показывает", GuideList.shown(true, false, v, true, SmartView.Context.BANK));
		assertTrue("умный вид выключен — контекст не важен", GuideList.shown(true, false, v, false, SmartView.Context.TRAVEL));
	}
}
