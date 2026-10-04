package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import lombok.Data;
import lombok.Value;

/**
 * The Grand Exchange bulk list from the app: what to buy several steps ahead.
 * The plugin only shows it at the exchange and counts what you already have; it buys nothing itself.
 */
@Data
public class ShoppingPlan
{
	static final int MAX_ITEMS = 200;
	static final int MAX_COUNT = 10_000_000;

	private List<Item> items;

	@Data
	public static class Item
	{
		private String name;
		private Integer id;
		private int count;
	}

	/** The error text or null. */
	String prepare()
	{
		if (items == null)
		{
			return "items required";
		}
		if (items.size() > MAX_ITEMS)
		{
			return "list too long";
		}
		for (Item i : items)
		{
			if (i == null || i.name == null || i.name.isEmpty() || i.name.length() > ActiveTarget.MAX_TEXT)
			{
				return "invalid name";
			}
			if (i.count < 0 || i.count > MAX_COUNT)
			{
				return "invalid count";
			}
		}
		return null;
	}

	enum RowState
	{
		/** Already have (in the bag, as notes or in the bank). */
		HAVE,
		/** The exchange order is filled: it only remains to collect. */
		BOUGHT,
		/** The order is placed and waits for sellers. */
		BUYING,
		/** Needs to be bought. */
		NEEDED,
	}

	/** A buy order from the exchange slots. */
	@Value
	static class Offer
	{
		boolean done;
		int bought;
		int total;
	}

	@Value
	static class Row
	{
		String name;
		/** 0 means the amount depends on the situation (not a number in the route). */
		int need;
		int have;
		RowState state;
		String offer;
		/** The next thing to search for at the exchange. */
		boolean next;
	}

	/**
	 * What of the list you already have and what remains to buy. owned is everything the player has (bag, worn items,
	 * notes and the bank if it was opened); offers are the buy orders by item ID.
	 */
	static List<Row> progress(List<Item> items, ItemCounts owned, Map<Integer, Offer> offers)
	{
		if (items == null || items.isEmpty())
		{
			return Collections.emptyList();
		}
		List<Row> rows = new ArrayList<>(items.size());
		boolean nextTaken = false;
		for (Item i : items)
		{
			int need = i.getCount();
			int have = owned.count(i.getId(), i.getName());
			Offer offer = i.getId() == null ? null : offers.get(i.getId());
			RowState state;
			String offerText = null;
			if (have >= Math.max(need, 1))
			{
				state = RowState.HAVE;
			}
			else if (offer != null && offer.isDone())
			{
				state = RowState.BOUGHT;
				offerText = "bought - collect it";
			}
			else if (offer != null)
			{
				state = RowState.BUYING;
				offerText = "order " + offer.getBought() + "/" + offer.getTotal();
			}
			else
			{
				state = RowState.NEEDED;
			}
			boolean next = state == RowState.NEEDED && !nextTaken;
			nextTaken |= next;
			rows.add(new Row(i.getName(), need, have, state, offerText, next));
		}
		return Collections.unmodifiableList(rows);
	}
}
