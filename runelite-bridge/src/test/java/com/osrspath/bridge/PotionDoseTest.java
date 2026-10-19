package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/**
 * Potions are counted in doses of every size, the same as doses.ts in the app (2.73.0): a step that needs a "Strength potion(4)" is covered by a (3) and
 * a (1), and a player with 3 doses is 1 dose short, not "0 of 1".
 */
public class PotionDoseTest
{
	private static ItemCounts counts(Object... idNameQty)
	{
		ItemCounts c = new ItemCounts();
		for (int i = 0; i < idNameQty.length; i += 3)
		{
			c.add((Integer) idNameQty[i], ActiveTarget.nameKey((String) idNameQty[i + 1]), (Integer) idNameQty[i + 2]);
		}
		return c;
	}

	private static ActiveTarget.ChecklistItem check(String name, int count, Integer doses)
	{
		ActiveTarget.ChecklistItem i = new ActiveTarget.ChecklistItem();
		i.setName(name);
		i.setCount(count);
		i.setDoses(doses);
		return i;
	}

	@Test
	public void potionsAreRecognisedByName()
	{
		assertEquals("Strength potion", ItemCounts.doseBase("Strength potion(4)"));
		assertEquals("Prayer potion", ItemCounts.doseBase("Prayer potion(2)"));
		assertEquals("Antipoison", ItemCounts.doseBase("Antipoison(1)"));
		// Charges are not doses: two glories cannot be poured into one.
		assertNull(ItemCounts.doseBase("Amulet of glory(4)"));
		assertNull(ItemCounts.doseBase("Games necklace(8)"));
		assertNull(ItemCounts.doseBase("Lobster"));
		assertEquals(Arrays.asList("Strength potion(1)", "Strength potion(2)", "Strength potion(3)", "Strength potion(4)"), ItemCounts.doseNames("Strength potion(4)"));
		assertTrue(ItemCounts.doseNames("Lobster").isEmpty());
	}

	@Test
	public void dosesAddUpAcrossSizes()
	{
		ItemCounts bag = counts(115, "Strength potion(3)", 1, 119, "Strength potion(1)", 1, 113, "Strength potion(4)", 2);
		assertEquals(12, bag.doses("Strength potion(4)"));
		assertEquals(12, bag.doses("Strength potion(1)"));
		assertEquals(0, bag.doses("Energy potion(4)"));
		assertEquals(0, bag.doses("Lobster"));
	}

	@Test
	public void aThreeAndAOneCoverOneFourDosePotion()
	{
		ItemCounts bag = counts(115, "Strength potion(3)", 1, 119, "Strength potion(1)", 1);
		Checklist.Result r = Checklist.evaluate(Collections.singletonList(check("Strength potion(4)", 1, 4)), bag, null);
		Checklist.Row row = r.getRows().get(0);
		assertEquals(Checklist.State.IN_BAG_READY, row.getState());
		assertEquals(4, row.getHave());
		assertEquals(4, row.getNeed());
		assertTrue(r.isReady());
	}

	@Test
	public void threeDosesAreOneDoseShortNotNoneOfOne()
	{
		ItemCounts bag = counts(115, "Strength potion(3)", 1);
		Checklist.Result r = Checklist.evaluate(Collections.singletonList(check("Strength potion(4)", 1, 4)), bag, counts());
		Checklist.Row row = r.getRows().get(0);
		assertEquals(3, row.getHave());
		assertEquals(Checklist.State.NOT_FOUND_IN_BANK, row.getState());
		assertEquals("3/4 doses", row.amount());
	}

	@Test
	public void dosesInTheBankCountAsTakeItFromTheBank()
	{
		ItemCounts bank = counts(117, "Strength potion(2)", 2, 113, "Strength potion(4)", 3);
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(check("Strength potion(4)", 4, 16)), counts(), bank).getRows().get(0);
		assertEquals(16, row.getInBank());
		assertEquals(Checklist.State.MISSING_FROM_BAG, row.getState());
	}

	@Test
	public void withoutDosesFromTheAppTheOldCountStays()
	{
		// An older app sends no doses: the named potion is counted as before.
		ItemCounts bag = counts(115, "Strength potion(3)", 1, 119, "Strength potion(1)", 1);
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(check("Strength potion(4)", 1, null)), bag, null).getRows().get(0);
		assertEquals(0, row.getHave());
		assertFalse(row.isDoses());
	}

	@Test
	public void theExchangeListCountsDoses()
	{
		ShoppingPlan.Item i = new ShoppingPlan.Item();
		i.setName("Strength potion(4)");
		i.setId(113);
		i.setCount(4);
		i.setDoses(16);
		ItemCounts owned = counts(115, "Strength potion(3)", 4, 113, "Strength potion(4)", 1);
		List<ShoppingPlan.Row> rows = ShoppingPlan.progress(Collections.singletonList(i), owned, Collections.emptyMap());
		assertEquals(16, rows.get(0).getHave());
		assertEquals(16, rows.get(0).getNeed());
		assertEquals(ShoppingPlan.RowState.HAVE, rows.get(0).getState());
		assertTrue(rows.get(0).isDoses());
	}

	@Test
	public void theStepCardSaysDoses()
	{
		ActiveTarget.GuideItem g = new ActiveTarget.GuideItem();
		g.setName("Energy potion(4)");
		g.setCount(5);
		g.setDoses(20);
		ItemCounts bag = counts(3010, "Energy potion(3)", 2, 3008, "Energy potion(4)", 3);
		StepGuide.ItemLine line = StepGuide.item(g, Collections.emptyList(), bag, counts());
		assertEquals(StepGuide.Have.NONE, line.getHave());
		assertEquals("Energy potion(4) ×5", line.getName());
		assertTrue(line.getStatus(), line.getStatus().contains("18 of 20 doses"));
	}
}
