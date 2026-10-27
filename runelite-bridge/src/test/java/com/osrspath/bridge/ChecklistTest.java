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
	public void oneAlternativeStackCannotCoverTwoFoodRequirements()
	{
		ActiveTarget.ChecklistItem salmon = item("Salmon", 329, 7, 9);
		salmon.setAlt(Collections.singletonList("Trout"));
		ActiveTarget.ChecklistItem lobster = item("Lobster", 379, 1, 12);
		lobster.setAlt(Collections.singletonList("Trout"));
		Checklist.Result result = Checklist.evaluate(Arrays.asList(salmon, lobster), counts(333, "Trout", 9), counts());
		assertFalse(result.isReady());
		assertEquals(7, result.getRows().get(0).getHave());
		assertEquals(0, result.getRows().get(1).getHave());
	}

	@Test
	public void anExactQuestIngredientIsKeptOutOfCombatFood()
	{
		ActiveTarget.ChecklistItem salmon = item("Salmon", 329, 7, 9);
		salmon.setAlt(Collections.singletonList("Trout"));
		ActiveTarget.ChecklistItem ingredient = item("Trout", 333, 1, null);
		Checklist.Result result = Checklist.evaluate(Arrays.asList(salmon, ingredient), counts(333, "Trout", 9), counts());
		assertFalse(result.isReady());
		assertEquals(6, result.getRows().get(0).getHave());
	}

	@Test
	public void weakerFoodMustCoverTheSameHealing()
	{
		ActiveTarget.ChecklistItem salmon = item("Salmon", 329, 20, 9);
		salmon.setAlt(Arrays.asList("Trout", "trout", "Salmon"));
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(salmon), counts(333, "Trout", 20), counts()).getRows().get(0);
		assertEquals(15, row.getHave());
		assertEquals(Checklist.State.NOT_FOUND_IN_BANK, row.getState());
	}

	@Test
	public void mixedFoodIsRoundedAfterAddingHealing()
	{
		ActiveTarget.ChecklistItem salmon = item("Salmon", 329, 1, 9);
		salmon.setAlt(Arrays.asList("Shrimps", "Cooked meat"));
		assertTrue(Checklist.evaluate(Collections.singletonList(salmon), counts(315, "Shrimps", 2, 2142, "Cooked meat", 1), counts()).isReady());
	}

	@Test
	public void lowHitpointsCapsAlternativesAndDisplayedHealing()
	{
		ItemCounts.setLevels(1, 1, 10);
		try
		{
			ActiveTarget.ChecklistItem salmon = item("Salmon", 329, 25, 9);
			salmon.setAlt(Collections.singletonList("Tuna"));
			Checklist.Result result = Checklist.evaluate(Collections.singletonList(salmon), counts(361, "Tuna", 23), counts());
			assertFalse(result.isReady());
			assertEquals(23, result.getRows().get(0).getHave());
			ActiveTarget.ChecklistItem tuna = item("Tuna", 361, 1, 10);
			assertEquals(Integer.valueOf(9), Checklist.evaluate(Collections.singletonList(tuna), counts(361, "Tuna", 1), counts()).getRows().get(0).getHeals());
		}
		finally
		{
			ItemCounts.setLevels(0, 0, 0);
		}
	}

	@Test
	public void equippedAmmunitionRequiresTheActualStackQuantity()
	{
		ActiveTarget.ChecklistItem arrows = item("Bronze arrow", 882, 100, null);
		arrows.setEquip(true);
		List<ActiveTarget.ChecklistItem> items = Collections.singletonList(arrows);
		ItemCounts carried = counts(882, "Bronze arrow", 100);
		Checklist.Result oneWorn = Checklist.evaluate(items, carried, counts(), counts(882, "Bronze arrow", 1));
		assertFalse(oneWorn.isReady());
		assertEquals(Checklist.State.NOT_EQUIPPED, oneWorn.getRows().get(0).getState());
		assertEquals(1, oneWorn.getRows().get(0).getHave());
		Checklist.Result stackWorn = Checklist.evaluate(items, carried, counts(), carried);
		assertTrue(stackWorn.isReady());
		assertEquals(100, stackWorn.getRows().get(0).getHave());
		assertFalse(Checklist.evaluate(items, carried, counts(), null).isReady());
	}

	@Test
	public void requiredArmourMustBeWornAndOwnedAlternativesCount()
	{
		ActiveTarget.ChecklistItem helm = item("Black full helm", 1165, 1, null);
		helm.setEquip(true);
		helm.setAlt(Collections.singletonList("Mithril full helm"));
		ItemCounts carried = counts(1159, "Mithril full helm", 1);
		List<ActiveTarget.ChecklistItem> items = Collections.singletonList(helm);
		Checklist.Result bag = Checklist.evaluate(items, carried, counts(), counts());
		assertFalse(bag.isReady());
		assertEquals(Checklist.State.NOT_EQUIPPED, bag.getRows().get(0).getState());
		assertEquals("Equip Black full helm before training", Checklist.hudLine(bag));
		assertTrue(Checklist.evaluate(items, carried, counts(), carried).isReady());
		assertFalse(Checklist.evaluate(items, carried, counts(), null).isReady());
		assertFalse(Checklist.evaluate(items, counts(), carried, counts()).isReady());
	}

	@Test
	public void item0of1ButInTheBank()
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
	public void item1of1Ready()
	{
		Checklist.Result r = Checklist.evaluate(Collections.singletonList(ROPE), counts(954, "Rope", 1), null);
		assertEquals(Checklist.State.IN_BAG_READY, r.getRows().get(0).getState());
		assertTrue(r.isReady());
	}

	@Test
	public void aStackIsCountedByQuantity()
	{
		ActiveTarget.ChecklistItem coins = item("Coins", 995, 90, null);
		assertTrue(Checklist.evaluate(Collections.singletonList(coins), counts(995, "Coins", 120), null).isReady());
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(coins), counts(995, "Coins", 60), counts(995, "Coins", 10)).getRows().get(0);
		assertEquals(60, row.getHave());
		assertEquals(Checklist.State.NOT_FOUND_IN_BANK, row.getState());
	}

	@Test
	public void severalIdenticalItemsAreSummed()
	{
		// Five chicken in different bag slots, the food is labelled "+3 HP".
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
	public void absentFromTheBank()
	{
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(ROPE), counts(), counts(1351, "Bronze axe", 1)).getRows().get(0);
		assertEquals(0, row.getInBank());
		assertEquals(Checklist.State.NOT_FOUND_IN_BANK, row.getState());
	}

	@Test
	public void theBankWasNotOpenedYet()
	{
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(ROPE), counts(), null).getRows().get(0);
		assertEquals(-1, row.getInBank());
		// Without the bank you cannot say "not in the bank": it is simply missing from the bag.
		assertEquals(Checklist.State.MISSING_FROM_BAG, row.getState());
	}

	@Test
	public void aFullSetAndSearchByName()
	{
		List<ActiveTarget.ChecklistItem> items = Arrays.asList(ROPE, item("Hammer", null, 1, null), item("Tinderbox", 590, 1, null));
		// The hammer without an ID is found by name, the case does not matter.
		Checklist.Result r = Checklist.evaluate(items, counts(954, "Rope", 1, 2347, "HAMMER", 1, 590, "Tinderbox", 1), counts());
		assertTrue(r.isReady());
		assertEquals(0, r.missing());
	}

	@Test
	public void anEmptyList()
	{
		assertFalse(Checklist.evaluate(null, counts(), null).isReady());
		assertTrue(Checklist.evaluate(Collections.emptyList(), counts(), null).getRows().isEmpty());
	}

	@Test
	public void sumOfCounters()
	{
		ItemCounts all = ItemCounts.sum(counts(954, "Rope", 1), null, counts(954, "Rope", 2));
		assertEquals(3, all.count(954, "Rope"));
	}
	@Test
	public void partialFoodHealingAcrossBagAndBankIsOwned()
	{
		ActiveTarget.ChecklistItem salmon = item("Salmon", 329, 1, 9);
		salmon.setAlt(Arrays.asList("Shrimps", "Cooked meat"));
		Checklist.Row row = Checklist.evaluate(Collections.singletonList(salmon), counts(315, "Shrimps", 2), counts(2142, "Cooked meat", 1)).getRows().get(0);
		assertEquals(0, row.getHave());
		assertEquals(1, row.getInBank());
		assertEquals(Checklist.State.MISSING_FROM_BAG, row.getState());
	}

}
