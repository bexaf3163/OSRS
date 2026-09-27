package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class ChecklistTest
{
	private static ActiveTarget.ChecklistItem item(String name, Integer id, int count, Integer heals)
	{
		ActiveTarget.ChecklistItem i = new ActiveTarget.ChecklistItem();
		i.setName(name);
		i.setId(id);
		i.setCount(count);
		i.setHeals(heals);
		return i;
	}

	private static ItemCounts counts(Object... idNameQty)
	{
		ItemCounts c = new ItemCounts();
		for (int i = 0; i < idNameQty.length; i += 3)
		{
			c.add((Integer) idNameQty[i], ActiveTarget.nameKey((String) idNameQty[i + 1]), (Integer) idNameQty[i + 2]);
		}
		return c;
	}

	private static final ActiveTarget.ChecklistItem ROPE = item("Rope", 954, 1, null);

	@Test
	public void предмет0из1НоВБанкеЕсть()
	{
		Checklist.Result r = Checklist.evaluate(Collections.singletonList(ROPE), counts(), counts(954, "Rope", 3));
		Checklist.Row row = r.getRows().get(0);
		assertEquals(0, row.getHave());
		assertEquals(1, row.getNeed());
		assertEquals(3, row.getInBank());
		assertEquals(Checklist.State.MISSING_FROM_BAG, row.getState());
		assertFalse(r.isReady());
	}

	@Test
	public void предмет1из1Готов()
	{
		Checklist.Result r = Checklist.evaluate(Collections.singletonList(ROPE), counts(954, "Rope", 1), null);
		assertEquals(Checklist.State.IN_BAG_READY, r.getRows().get(0).getState());
		assertTrue(r.isReady());
	}

	@Test
	public void стопкаСчитаетсяПоКоличеству()
	{
		ActiveTarget.ChecklistItem coins = item("Coins", 995, 90, null);
		assertTrue(Checklist.evaluate(Collections.singletonList(coins), counts(995, "Coins", 120), null).isReady());
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(coins), counts(995, "Coins", 60), counts(995, "Coins", 10)).getRows().get(0);
		assertEquals(60, row.getHave());
		assertEquals(Checklist.State.NOT_FOUND_IN_BANK, row.getState());
	}

	@Test
	public void несколькоОдинаковыхПредметовСкладываются()
	{
		// Пять курятин в разных ячейках сумки + еда подписана «+3 HP».
		ItemCounts bag = counts(2140, "Cooked chicken", 1, 2140, "Cooked chicken", 1);
		ActiveTarget.ChecklistItem chicken = item("Cooked chicken", 2140, 5, 3);
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(chicken), bag, counts(2140, "Cooked chicken", 10)).getRows().get(0);
		assertEquals(2, row.getHave());
		assertEquals(Integer.valueOf(3), row.getHeals());
		assertEquals(Checklist.State.MISSING_FROM_BAG, row.getState());
		bag.add(2140, "cooked chicken", 3);
		assertTrue(Checklist.evaluate(Collections.singletonList(chicken), bag, null).isReady());
	}

	@Test
	public void отсутствиеВБанке()
	{
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(ROPE), counts(), counts(1351, "Bronze axe", 1)).getRows().get(0);
		assertEquals(0, row.getInBank());
		assertEquals(Checklist.State.NOT_FOUND_IN_BANK, row.getState());
	}

	@Test
	public void банкЕщёНеОткрывали()
	{
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(ROPE), counts(), null).getRows().get(0);
		assertEquals(-1, row.getInBank());
		// Без банка нельзя сказать «нет в банке» — просто не хватает в сумке.
		assertEquals(Checklist.State.MISSING_FROM_BAG, row.getState());
	}

	@Test
	public void полныйКомплектИПоискПоИмени()
	{
		List<ActiveTarget.ChecklistItem> items = Arrays.asList(ROPE, item("Hammer", null, 1, null), item("Tinderbox", 590, 1, null));
		// Молоток без ID — найдётся по имени, регистр не важен.
		Checklist.Result r = Checklist.evaluate(items, counts(954, "Rope", 1, 2347, "HAMMER", 1, 590, "Tinderbox", 1), counts());
		assertTrue(r.isReady());
		assertEquals(0, r.missing());
	}

	@Test
	public void пустойСписок()
	{
		assertFalse(Checklist.evaluate(null, counts(), null).isReady());
		assertTrue(Checklist.evaluate(Collections.emptyList(), counts(), null).getRows().isEmpty());
	}

	@Test
	public void суммаСчётчиков()
	{
		ItemCounts all = ItemCounts.sum(counts(954, "Rope", 1), null, counts(954, "Rope", 2));
		assertEquals(3, all.count(954, "Rope"));
	}
}
