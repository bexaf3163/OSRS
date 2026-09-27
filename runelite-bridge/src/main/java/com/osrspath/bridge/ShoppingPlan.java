package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import lombok.Data;
import lombok.Value;

/**
 * Оптовый список Grand Exchange из приложения: что купить на несколько шагов вперёд.
 * Плагин только показывает его на бирже и считает, что уже есть, — ничего не покупает сам.
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

	/** Текст ошибки или null. */
	String prepare()
	{
		if (items == null)
		{
			return "items обязателен";
		}
		if (items.size() > MAX_ITEMS)
		{
			return "слишком длинный список";
		}
		for (Item i : items)
		{
			if (i == null || i.name == null || i.name.isEmpty() || i.name.length() > ActiveTarget.MAX_TEXT)
			{
				return "неверное название";
			}
			if (i.count < 0 || i.count > MAX_COUNT)
			{
				return "неверное количество";
			}
		}
		return null;
	}

	enum RowState
	{
		/** Уже есть (в сумке, банкнотами или в банке). */
		HAVE,
		/** Ордер на бирже выполнен — осталось забрать. */
		BOUGHT,
		/** Ордер выставлен и ждёт продавцов. */
		BUYING,
		/** Надо купить. */
		NEEDED,
	}

	/** Ордер на покупку из слотов биржи. */
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
		/** 0 — количество по ситуации (в маршруте не число). */
		int need;
		int have;
		RowState state;
		String offer;
		/** Следующее, что искать на бирже. */
		boolean next;
	}

	/**
	 * Что из списка уже есть и что осталось купить. owned — всё, что есть у игрока (сумка, надетое,
	 * банкноты и банк, если его открывали); offers — ордера на покупку по ID предмета.
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
				offerText = "куплено — забери";
			}
			else if (offer != null)
			{
				state = RowState.BUYING;
				offerText = "ордер " + offer.getBought() + "/" + offer.getTotal();
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
