package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** One card at the exchange (the owner's screenshot of 2026-10-15: bulk list, "what to buy", the HUD and the guide card all at once). */
public class ExchangeViewTest
{
	private static ShoppingPlan.Row row(String name, int need, int have, ShoppingPlan.RowState state)
	{
		return new ShoppingPlan.Row(name, need, have, state, null, false);
	}

	private static ShopWindow.Result step(int todo, String... buy)
	{
		java.util.List<ShopWindow.Row> rows = new java.util.ArrayList<>();
		for (String b : buy)
		{
			rows.add(new ShopWindow.Row("Buy: " + b, ShopWindow.Mark.TODO));
		}
		rows.add(new ShopWindow.Row("Already in the bag: Mithril scimitar", ShopWindow.Mark.GOOD));
		return new ShopWindow.Result("Exchange · what to buy · S3-08", rows, todo);
	}

	private static final List<ShoppingPlan.Row> DONE = Arrays.asList(row("Adamant scimitar", 1, 1, ShoppingPlan.RowState.HAVE));
	private static final List<ShoppingPlan.Row> OPEN = Arrays.asList(
		row("Adamant scimitar", 1, 1, ShoppingPlan.RowState.HAVE), row("Salmon", 80, 13, ShoppingPlan.RowState.NEEDED));

	@Test
	public void theScreenshotCase_aBulkListThatHasEverything_andTheStepNeedsSalmon_isOneCard_theSteps()
	{
		assertEquals(ExchangeView.Card.STEP, ExchangeView.choose(DONE, step(1, "Salmon ×20 — Dropped by Ogress Shaman")));
	}

	@Test
	public void aBulkListWithSomethingToBuyIsTheCard_andCarriesWhatOnlyTheStepNeeds()
	{
		ShopWindow.Result s = step(2, "Salmon ×20 — Dropped by Ogress Shaman", "Strength potion(4) ×3");
		assertEquals(ExchangeView.Card.BULK, ExchangeView.choose(OPEN, s));
		assertEquals("Salmon is in the list, the potions are not", Arrays.asList("Strength potion(4) ×3"), ExchangeView.extras(OPEN, s));
	}

	@Test
	public void nothingToBuyAnywhere_theBulkListsGoodNewsOnce_orTheStepsCheckmark()
	{
		assertEquals(ExchangeView.Card.BULK, ExchangeView.choose(DONE, step(0)));
		assertEquals(ExchangeView.Card.STEP, ExchangeView.choose(Collections.emptyList(), step(0)));
		assertEquals(ExchangeView.Card.NONE, ExchangeView.choose(Collections.emptyList(), null));
	}

	@Test
	public void noBulkListAtAll_theStepCardDraws()
	{
		assertEquals(ExchangeView.Card.STEP, ExchangeView.choose(Collections.emptyList(), step(1, "Salmon ×20")));
	}

	@Test
	public void exactlyOneCardEveryTime()
	{
		List<List<ShoppingPlan.Row>> bulks = Arrays.asList(Collections.emptyList(), DONE, OPEN);
		List<ShopWindow.Result> steps = Arrays.asList(null, step(0), step(1, "Salmon ×20"));
		for (List<ShoppingPlan.Row> b : bulks)
		{
			for (ShopWindow.Result s : steps)
			{
				ExchangeView.Card c = ExchangeView.choose(b, s);
				boolean any = !b.isEmpty() || s != null;
				assertEquals("one card when there is anything to say", any, c != ExchangeView.Card.NONE);
			}
		}
	}

	@Test
	public void theNameIsReadOffTheStepsWording()
	{
		assertEquals("Salmon", ExchangeView.itemName("Salmon ×20 — Dropped by Ogress Shaman"));
		assertEquals("Strength potion(4)", ExchangeView.itemName("Strength potion(4) ×3"));
		assertEquals("Knife", ExchangeView.itemName("Knife"));
	}

	@Test
	public void atTheExchangeTheGuideStaysClosed_whateverTheSmartRevealSays()
	{
		assertTrue("open near the step when the player opened it", OsrsPathGuideOverlay.expanded(true, false, SmartView.Context.STEP));
		assertTrue(OsrsPathGuideOverlay.expanded(true, true, SmartView.Context.BANK));
		assertTrue(SmartView.exchangeFocus(SmartView.Context.EXCHANGE));
		assertFalse(SmartView.exchangeFocus(SmartView.Context.BANK));
		assertFalse(SmartView.exchangeFocus(SmartView.Context.STEP));
		// Closed at the exchange with the smart reveal off too: the exchange card has the room.
		assertFalse(OsrsPathGuideOverlay.expanded(true, false, SmartView.Context.EXCHANGE));
		assertFalse(OsrsPathGuideOverlay.expanded(true, true, SmartView.Context.EXCHANGE));
		// While travelling only with the smart reveal; and nothing opens a card the player closed.
		assertFalse(OsrsPathGuideOverlay.expanded(true, true, SmartView.Context.TRAVEL));
		assertTrue(OsrsPathGuideOverlay.expanded(true, false, SmartView.Context.TRAVEL));
		for (SmartView.Context c : SmartView.Context.values())
		{
			assertFalse(c.name(), OsrsPathGuideOverlay.expanded(false, true, c));
			assertFalse(c.name(), OsrsPathGuideOverlay.expanded(false, false, c));
		}
	}
}
