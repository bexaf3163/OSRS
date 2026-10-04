package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Факты игры для машины Quest Helper: предметы (сумка, надетое, банк) и память сообщений. Сам клиент тут не нужен. */
public class QhLiveFactsTest
{
	private static ItemCounts counts(Object... idNameQty)
	{
		ItemCounts c = new ItemCounts();
		for (int i = 0; i < idNameQty.length; i += 3)
		{
			c.add((Integer) idNameQty[i], (String) idNameQty[i + 1], (Integer) idNameQty[i + 2]);
		}
		return c;
	}

	@Test
	public void предметы_сумкаНадетоеБанк()
	{
		// В «carried» надетое уже входит в сумку: так его считает плагин.
		ItemCounts carried = counts(431, "karamjan rum", 2, 1005, "white apron", 1);
		ItemCounts worn = counts(1005, "white apron", 1);
		ItemCounts bank = counts(431, "karamjan rum", 5);
		QhLiveFacts f = new QhLiveFacts(null, () -> carried, () -> worn, () -> bank);
		assertEquals("в сумке", 2, f.items(new int[] {431}, false, false));
		assertEquals("и в банке", 7, f.items(new int[] {431}, false, true));
		assertEquals("ром не надет", 0, f.items(new int[] {431}, true, false));
		assertEquals("фартук надет", 1, f.items(new int[] {1005}, true, false));
		assertEquals("несколько id суммируются", 3, f.items(new int[] {431, 1005}, false, false));
		assertEquals("нет такого предмета", 0, f.items(new int[] {9999}, false, true));
	}

	@Test
	public void банкНеИзвестен_неМешает()
	{
		ItemCounts carried = counts(431, "karamjan rum", 1);
		QhLiveFacts f = new QhLiveFacts(null, () -> carried, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY);
		assertEquals(1, f.items(new int[] {431}, false, true));
	}

	@Test
	public void сообщенийПомнитНеБольшеПредела_старыеУходят()
	{
		QhLiveFacts f = new QhLiveFacts(null, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY);
		for (int i = 0; i < QhLiveFacts.MAX_EVENTS + 25; i++)
		{
			f.add("GAMEMESSAGE", "сообщение " + i);
		}
		assertEquals(QhLiveFacts.MAX_EVENTS, f.events().size());
		assertEquals("самые старые забыты", "сообщение 25", f.events().get(0).getText());
		assertEquals("сообщение " + (QhLiveFacts.MAX_EVENTS + 24), f.events().get(f.events().size() - 1).getText());
	}

	@Test
	public void clearЗабываетВсё_иПустоеНеДобавляется()
	{
		QhLiveFacts f = new QhLiveFacts(null, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY, () -> ItemCounts.EMPTY);
		f.add("DIALOG", "Luthas|Hello");
		f.add("DIALOG", null);
		assertEquals(1, f.events().size());
		assertEquals("DIALOG", f.events().get(0).getType());
		f.clear();
		assertTrue(f.events().isEmpty());
	}
}
