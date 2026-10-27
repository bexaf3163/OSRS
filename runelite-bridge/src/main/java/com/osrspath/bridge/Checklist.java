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
		/** With you, but required equipment is not confirmed worn. */
		NOT_EQUIPPED,
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
		/** A potion: have, need and inBank are doses of every size. */
		boolean doses;

		Row(String name, int have, int need, int inBank, Integer heals, State state)
		{
			this(name, have, need, inBank, heals, state, false);
		}

		Row(String name, int have, int need, int inBank, Integer heals, State state, boolean doses)
		{
			this.name = name;
			this.have = have;
			this.need = need;
			this.inBank = inBank;
			this.heals = heals;
			this.state = state;
			this.doses = doses;
		}

		/** "3/4" or, for a potion, "3/4 doses". */
		String amount()
		{
			return have + "/" + need + (doses ? " doses" : "");
		}
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
				names.add(row.getNeed() > 1 ? row.getName() + " " + row.amount() : row.getName());
				only = row;
			}
		}
		if (names.isEmpty())
		{
			return "Bag ready to leave";
		}
		if (names.size() == 1)
		{
			if (only.getState() == State.NOT_EQUIPPED)
			{
				return "Equip " + names.get(0) + " before training";
			}
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
		return evaluate(items, carried, bank, null);
	}

	static Result evaluate(List<ActiveTarget.ChecklistItem> items, ItemCounts carried, ItemCounts bank, ItemCounts worn)
	{
		if (items == null || items.isEmpty())
		{
			return NONE;
		}
		List<Row> rows = new ArrayList<>(items.size());
		java.util.Map<String, Integer> remaining = new java.util.HashMap<>();
		java.util.Map<String, Integer> usedBag = new java.util.HashMap<>();
		java.util.Map<String, Integer> usedBank = new java.util.HashMap<>();
		for (ActiveTarget.ChecklistItem item : items)
		{
			remaining.merge(ActiveTarget.nameKey(item.getName()), Math.max(1, item.getCount()),
				(a, b) -> (int) Math.min(Integer.MAX_VALUE, (long) a + b));
		}
		boolean ready = true;
		for (ActiveTarget.ChecklistItem item : items)
		{
			// A potion is counted in doses of every size (the app sends them): a (3) and a (1) cover a "Strength potion(4)".
			boolean dose = item.getDoses() != null && item.getDoses() > 0 && ItemCounts.doseBase(item.getName()) != null;
			int need = dose ? item.getDoses() : Math.max(1, item.getCount());
			boolean food = item.getHeals() != null && item.getHeals() > 0;
			java.util.Map<String, Integer> bagReserved = new java.util.HashMap<>();
			java.util.Map<String, Integer> bankReserved = new java.util.HashMap<>();
			if (food)
			{
				String primary = ActiveTarget.nameKey(item.getName());
				remaining.compute(primary, (key, count) -> Math.max(0, (count == null ? 0 : count) - need));
				for (java.util.Map.Entry<String, Integer> requirement : remaining.entrySet())
				{
					int bankFree = bank == null ? 0 : Math.max(0, bank.exact(null, requirement.getKey()) - usedBank.getOrDefault(requirement.getKey(), 0));
					int inBank = Math.min(requirement.getValue(), bankFree);
					bankReserved.put(requirement.getKey(), inBank);
					bagReserved.put(requirement.getKey(), requirement.getValue() - inBank);
				}
			}
			int onHand = dose ? carried.doses(item.getName()) : food ? Foods.count(carried, item.getId(), item.getName(), item.getAlt(), item.getHeals(), usedBag, bagReserved)
				: ActiveTarget.countWithAlt(carried, item.getId(), item.getName(), item.getAlt());
			boolean equip = Boolean.TRUE.equals(item.getEquip());
			int have = equip ? worn == null ? 0 : ActiveTarget.countWithAlt(worn, item.getId(), item.getName(), item.getAlt()) : onHand;
			int inBank = bank == null ? -1 : dose ? bank.doses(item.getName()) : food ? Foods.count(bank, item.getId(), item.getName(), item.getAlt(), item.getHeals(), usedBank, bankReserved)
				: ActiveTarget.countWithAlt(bank, item.getId(), item.getName(), item.getAlt());
			if (food)
			{
				long health = Foods.reserve(carried, item.getId(), item.getName(), item.getAlt(), item.getHeals(),
					(long) need * ItemCounts.effectiveHeal(item.getHeals()), usedBag, bagReserved);
				if (bank != null) Foods.reserve(bank, item.getId(), item.getName(), item.getAlt(), item.getHeals(), health, usedBank, bankReserved);
			}
			State state;
			if (have >= need)
			{
				state = State.IN_BAG_READY;
			}
			else if (equip && onHand >= need)
			{
				state = State.NOT_EQUIPPED;
			}
			else if (bank == null || onHand + inBank >= need)
			{
				state = State.MISSING_FROM_BAG;
			}
			else
			{
				state = State.NOT_FOUND_IN_BANK;
			}
			ready &= state == State.IN_BAG_READY;
			rows.add(new Row(item.getName(), have, need, inBank, food ? Integer.valueOf(ItemCounts.effectiveHeal(item.getHeals())) : item.getHeals(), state, dose));
		}
		return new Result(Collections.unmodifiableList(rows), ready);
	}
}
