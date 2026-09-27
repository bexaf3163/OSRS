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
	public void расстояниеПоПрямой()
	{
		assertEquals(0, Navigation.distance(3222, 3218, 3222, 3218));
		assertEquals(5, Navigation.distance(0, 0, 3, 4));
		// Кухня Lumbridge → церковь: dx = 35, dy = −8.
		assertEquals(36, Navigation.distance(3208, 3214, 3243, 3206));
		// Lumbridge → Varrock, ≈ 208 клеток.
		assertEquals(208, Navigation.distance(3222, 3218, 3212, 3426));
	}

	@Test
	public void стрелкаПоСторонамСвета()
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
	public void рядомСГистерезисом()
	{
		Navigation.Readout far = Navigation.readout(3200, 3200, 0, 3200, 3342, 0, false);
		assertEquals("~142 клетки ↑", far.getText());
		assertFalse(far.isNear());
		assertTrue(Navigation.readout(3200, 3200, 0, 3203, 3203, 0, false).isNear());
		assertEquals("✓ Рядом", Navigation.readout(3200, 3200, 0, 3204, 3200, 0, false).getText());
		// 6 клеток: подходя — ещё не «Рядом», отходя от «Рядом» — ещё «Рядом».
		assertFalse(Navigation.readout(3200, 3200, 0, 3206, 3200, 0, false).isNear());
		assertTrue(Navigation.readout(3200, 3200, 0, 3206, 3200, 0, true).isNear());
		assertFalse(Navigation.readout(3200, 3200, 0, 3207, 3200, 0, true).isNear());
	}

	@Test
	public void этажиИПодземелья()
	{
		assertEquals("Цель этажом выше", Navigation.readout(3208, 3214, 0, 3209, 3214, 1, false).getText());
		assertEquals("~20 клеток →, этажом ниже", Navigation.readout(3200, 3200, 2, 3220, 3200, 0, false).getText());
		assertEquals("Цель под землёй — найди спуск", Navigation.readout(3109, 3160, 0, 3104, 9571, 0, false).getText());
		assertEquals("Цель на поверхности — выбирайся наверх", Navigation.readout(3104, 9571, 0, 3109, 3160, 0, false).getText());
	}

	@Test
	public void склонениеКлеток()
	{
		assertEquals("1 клетка", Navigation.tiles(1));
		assertEquals("3 клетки", Navigation.tiles(3));
		assertEquals("11 клеток", Navigation.tiles(11));
		assertEquals("21 клетка", Navigation.tiles(21));
		assertEquals("142 клетки", Navigation.tiles(142));
		assertEquals("115 клеток", Navigation.tiles(115));
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
	public void путевыеТочкиПереключаютсяИОчищаются()
	{
		Navigation.Breadcrumbs route = new Navigation.Breadcrumbs(Arrays.asList(p(3243, 3210, "Aereck"), p(3148, 3175, "Urhney"), p(3250, 3193, "Гроб")));
		assertEquals("Aereck", route.current().getLabel());
		assertFalse(route.update(3230, 3210, 0));
		assertTrue(route.update(3241, 3212, 0));
		assertEquals("Urhney", route.current().getLabel());
		// Не тот этаж — не засчитывается.
		assertFalse(route.update(3148, 3175, 1));
		// Дошёл сразу до последней — промежуточная пропускается, маршрут пройден.
		assertTrue(route.update(3251, 3194, 0));
		assertTrue(route.finished());
		assertNull(route.current());
		assertFalse(route.update(3251, 3194, 0));
	}

	@Test
	public void маршрутТудаИОбратноНеПерескакиваетВКонец()
	{
		// The Restless Ghost: гроб → башня магов → снова гроб.
		Navigation.Breadcrumbs route = new Navigation.Breadcrumbs(Arrays.asList(p(3250, 3193, "Гроб"), p(3109, 3160, "Башня"), p(3250, 3193, "Гроб")));
		assertTrue(route.update(3250, 3194, 0));
		assertEquals("Башня", route.current().getLabel());
		assertFalse(route.finished());
		assertTrue(route.update(3109, 3161, 0));
		assertTrue(route.update(3249, 3193, 0));
		assertTrue(route.finished());
	}
}
