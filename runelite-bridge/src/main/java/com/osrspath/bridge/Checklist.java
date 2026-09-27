package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.Value;

/**
 * Проверка вылета: всё ли для шага лежит в сумке (или надето), а чего не хватает — есть ли оно в банке.
 * Чистая логика без RuneLite: её же повторяет src/lib/checklist.ts в приложении.
 */
final class Checklist
{
	enum State
	{
		/** В сумке или надето сколько нужно. */
		IN_BAG_READY,
		/** Не хватает, но в банке есть (или банк ещё не открывали). */
		MISSING_FROM_BAG,
		/** Не хватает даже вместе с банком. */
		NOT_FOUND_IN_BANK,
	}

	@Value
	static class Row
	{
		String name;
		int have;
		int need;
		/** Сколько в банке; -1 — банк ещё не открывали. */
		int inBank;
		Integer heals;
		State state;
	}

	@Value
	static class Result
	{
		List<Row> rows;
		/** READY_TO_DEPART: всё на руках. */
		boolean ready;

		long missing()
		{
			return rows.stream().filter(r -> r.state != State.IN_BAG_READY).count();
		}
	}

	static final Result NONE = new Result(Collections.emptyList(), false);

	/**
	 * Строка HUD: чего не хватает — по названиям, а не «не хватает 1 из 1». Одна вещь в банке — «возьми из банка»;
	 * больше двух — первые две и «и ещё N» (весь список — в панели «OSRS Путь»).
	 */
	static String hudLine(Result r)
	{
		List<String> names = new ArrayList<>();
		Row only = null;
		for (Row row : r.getRows())
		{
			if (row.getState() != State.IN_BAG_READY)
			{
				names.add(row.getNeed() > 1 ? row.getName() + " " + row.getHave() + "/" + row.getNeed() : row.getName());
				only = row;
			}
		}
		if (names.isEmpty())
		{
			return "Сумка готова к выходу";
		}
		if (names.size() == 1)
		{
			return only.getState() == State.MISSING_FROM_BAG && only.getInBank() > 0
				? "Сумка: " + names.get(0) + " — возьми из банка"
				: "Сумка: нет " + names.get(0);
		}
		String head = "Сумка: нет " + names.get(0) + ", " + names.get(1);
		return names.size() == 2 ? head : head + " и ещё " + (names.size() - 2);
	}

	private Checklist()
	{
	}

	/** bank == null — содержимое банка неизвестно (банк в этой сессии не открывали). */
	static Result evaluate(List<ActiveTarget.ChecklistItem> items, ItemCounts carried, ItemCounts bank)
	{
		if (items == null || items.isEmpty())
		{
			return NONE;
		}
		List<Row> rows = new ArrayList<>(items.size());
		boolean ready = true;
		for (ActiveTarget.ChecklistItem item : items)
		{
			int need = Math.max(1, item.getCount());
			int have = carried.count(item.getId(), item.getName());
			int inBank = bank == null ? -1 : bank.count(item.getId(), item.getName());
			State state;
			if (have >= need)
			{
				state = State.IN_BAG_READY;
			}
			else if (bank == null || have + inBank >= need)
			{
				state = State.MISSING_FROM_BAG;
			}
			else
			{
				state = State.NOT_FOUND_IN_BANK;
			}
			ready &= state == State.IN_BAG_READY;
			rows.add(new Row(item.getName(), have, need, inBank, item.getHeals(), state));
		}
		return new Result(Collections.unmodifiableList(rows), ready);
	}
}
