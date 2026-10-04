package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public class ShoppingPlanTest
{
	private static ShoppingPlan.Item item(String name, Integer id, int count)
	{
		ShoppingPlan.Item i = new ShoppingPlan.Item();
		i.setName(name);
		i.setId(id);
		i.setCount(count);
		return i;
	}

	@Test
	public void whatIsOwnedWhatIsInAnOrderWhatToBuy()
	{
		ItemCounts owned = new ItemCounts();
		owned.add(954, "rope", 2);
		owned.add(2351, "iron bar", 1);
		Map<Integer, ShoppingPlan.Offer> offers = new HashMap<>();
		offers.put(2351, new ShoppingPlan.Offer(false, 0, 1));
		offers.put(1759, new ShoppingPlan.Offer(true, 3, 3));
		List<ShoppingPlan.Row> rows = ShoppingPlan.progress(Arrays.asList(
			item("Rope", 954, 2),
			item("Iron bar", 2351, 2),
			item("Ball of wool", 1759, 3),
			item("Hammer", 2347, 1),
			item("Redberries", 1951, 1)), owned, offers);
		assertEquals(ShoppingPlan.RowState.HAVE, rows.get(0).getState());
		assertEquals(ShoppingPlan.RowState.BUYING, rows.get(1).getState());
		assertEquals("order 0/1", rows.get(1).getOffer());
		assertEquals(ShoppingPlan.RowState.BOUGHT, rows.get(2).getState());
		assertEquals(ShoppingPlan.RowState.NEEDED, rows.get(3).getState());
		// Look for the first thing that has to be bought next; only one.
		assertTrue(rows.get(3).isNext());
		assertFalse(rows.get(4).isNext());
		assertNull(rows.get(3).getOffer());
	}

	@Test
	public void amountDependingOnTheSituationAndAnEmptyList()
	{
		ItemCounts owned = new ItemCounts();
		owned.add(314, "feather", 100);
		List<ShoppingPlan.Row> rows = ShoppingPlan.progress(Collections.singletonList(item("Feather", 314, 0)), owned, Collections.emptyMap());
		assertEquals(ShoppingPlan.RowState.HAVE, rows.get(0).getState());
		assertTrue(ShoppingPlan.progress(null, owned, Collections.emptyMap()).isEmpty());
	}

	@Test
	public void listValidation()
	{
		ShoppingPlan plan = new ShoppingPlan();
		assertEquals("items required", plan.prepare());
		plan.setItems(Collections.singletonList(item("Rope", 954, 2)));
		assertNull(plan.prepare());
		plan.setItems(Collections.singletonList(item("Rope", 954, -1)));
		assertEquals("invalid count", plan.prepare());
	}
}
