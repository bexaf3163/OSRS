package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.Value;

/**
 * The departure check: is everything for the step in the bag (or worn), and for what is missing, is it in the bank.
 * Pure logic without RuneLite: src/lib/checklist.ts in the app repeats it.
 */
final class Checklist
{
	enum State
	{
		/** In the bag or worn as many as needed. */
		IN_BAG_READY,
		/** Missing, but the bank has it (or the bank has not been opened yet). */
		MISSING_FROM_BAG,
		/** Missing even with the bank. */
		NOT_FOUND_IN_BANK,
	}

	@Value
	static class Row
	{
		String name;
		int have;
		int need;
		/** How many in the bank; -1 means the bank has not been opened yet. */
		int inBank;
		Integer heals;
		State state;
	}

	@Value
	static class Result
	{
		List<Row> rows;
		/** READY_TO_DEPART: everything is on hand. */
		boolean ready;

		long missing()
		{
			return rows.stream().filter(r -> r.state != State.IN_BAG_READY).count();
		}
	}

	static final Result NONE = new Result(Collections.emptyList(), false);

	/**
	 * The HUD line: what is missing, by names, not "missing 1 of 1". One thing in the bank: "take it from the bank";
	 * more than two: the first two and "and N more" (the whole list is in the "OSRS Path" panel).
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
			return "Bag ready to leave";
		}
		if (names.size() == 1)
		{
			return only.getState() == State.MISSING_FROM_BAG && only.getInBank() > 0
				? "Bag: " + names.get(0) + " - take it from the bank"
				: "Bag: missing " + names.get(0);
		}
		String head = "Bag: missing " + names.get(0) + ", " + names.get(1);
		return names.size() == 2 ? head : head + " and " + (names.size() - 2) + " more";
	}

	private Checklist()
	{
	}

	/** bank == null means the bank's contents are unknown (the bank was not opened in this session). */
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
