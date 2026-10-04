package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.Value;

/**
 * The bank, exchange and shop window: what the step needs right here. At the bank, what to take (and what the bank lacks); at the exchange and at a
 * merchant, what to buy and where it is sold. For any quest: the same item list of the step or stage as in the "What you need"
 * list, plus the preparation plan rows from the app (an action like "Buy from Betty - 3 gp"). Items are not
 * moved or bought: the window only says what to do.
 *
 * Only the row layout is here (pure logic for tests); {@link OsrsPathShopOverlay} draws the window.
 */
final class ShopWindow
{
	enum Place
	{
		BANK, EXCHANGE, SHOP
	}

	enum Mark
	{
		/** To do here: take or buy. */
		TODO,
		/** Cannot be done here: not in the bank. */
		BAD,
		/** Already have. */
		GOOD,
		/** A note. */
		INFO
	}

	@Value
	static class Row
	{
		String text;
		Mark mark;
	}

	@Value
	static class Result
	{
		String title;
		List<Row> rows;
		/** How many things are left to do here: take or buy. */
		int todo;
	}

	static final int MAX_ROWS = 12;
	private static final Pattern STEP = Pattern.compile("^\\[([^\\]]+)]");

	private ShopWindow()
	{
	}

	/** What to show at this game window; null means nothing to show (no step or items). */
	static Result build(Place place, StepGuide.View v)
	{
		if (v == null || v.getItems() == null)
		{
			return null;
		}
		PrepPlan plan = v.getPrep();
		List<String> take = new ArrayList<>();
		List<String> missing = new ArrayList<>();
		List<String> inBank = new ArrayList<>();
		List<String> inBag = new ArrayList<>();
		Set<String> seen = new HashSet<>();
		for (StepGuide.ItemLine i : v.getItems())
		{
			String raw = i.getName() == null ? i.getTitle() : i.getName();
			seen.add(ActiveTarget.nameKey(PrepPlan.rawName(raw)));
			PrepPlan.Line pl = plan == null ? null : plan.line(raw);
			String label = i.getName() == null ? i.getTitle() : i.getName();
			switch (i.getHave())
			{
				case BAG:
					inBag.add(label);
					break;
				case BANK:
					inBank.add(label);
					take.add(label);
					break;
				case NONE:
				case UNKNOWN:
					missing.add(label + hint(pl, i.getWhere()));
					break;
				default:
					// Obtained during the step or already handed in: not needed at the bank, exchange or merchant.
					break;
			}
		}
		if (plan != null && plan.getLines() != null)
		{
			for (PrepPlan.Line l : plan.getLines())
			{
				if (l.getNeed() <= 0 || "OPTIONAL".equals(l.getPriority()) || "IN_STEP".equals(l.getTiming()) || !seen.add(ActiveTarget.nameKey(l.getName())))
				{
					continue;
				}
				String label = l.getName() + (l.getNeed() > 1 ? " ×" + l.getNeed() : "");
				if ("BANK".equals(l.getWhere()))
				{
					inBank.add(label);
					take.add(label);
				}
				else if ("MISSING".equals(l.getWhere()) || "UNKNOWN".equals(l.getWhere()))
				{
					missing.add(label + hint(l, null));
				}
				else
				{
					inBag.add(label);
				}
			}
		}
		if (take.isEmpty() && missing.isEmpty() && inBag.isEmpty())
		{
			return null;
		}
		List<Row> rows = new ArrayList<>();
		String id = stepId(v);
		int todo;
		String title;
		if (place == Place.BANK)
		{
			todo = take.size() + missing.size();
			title = "Bank · what to take" + (id.isEmpty() ? "" : " · " + id);
			add(rows, take, "Take: ", Mark.TODO);
			add(rows, missing, "Not in the bank: ", Mark.BAD);
			if (take.isEmpty() && missing.isEmpty())
			{
				rows.add(new Row("Everything needed is already in the bag ✓", Mark.GOOD));
			}
			else if (!inBag.isEmpty())
			{
				rows.add(new Row(bagLine(inBag), Mark.GOOD));
			}
			if (plan != null)
			{
				if (plan.getWeight() != null && !plan.getWeight().isEmpty())
				{
					rows.add(new Row("Weight: " + plan.getWeight(), Mark.INFO));
				}
				if (plan.getSlots() != null && !plan.getSlots().isEmpty())
				{
					rows.add(new Row("⚠ " + plan.getSlots(), Mark.INFO));
				}
				if (plan.getLater() != null && !plan.getLater().isEmpty())
				{
					rows.add(new Row("Don't take now: " + String.join(", ", plan.getLater()), Mark.INFO));
				}
			}
		}
		else
		{
			todo = missing.size();
			title = (place == Place.EXCHANGE ? "Exchange · what to buy" : "Shop · what to buy") + (id.isEmpty() ? "" : " · " + id);
			add(rows, missing, "Buy: ", Mark.TODO);
			if (missing.isEmpty())
			{
				rows.add(new Row("Nothing to buy here ✓", Mark.GOOD));
			}
			if (!inBank.isEmpty())
			{
				rows.add(new Row("In the bank (do not buy): " + String.join(", ", inBank), Mark.INFO));
			}
			if (!inBag.isEmpty())
			{
				rows.add(new Row(bagLine(inBag), Mark.GOOD));
			}
		}
		return new Result(title, rows, todo);
	}

	/** How many items already with you we name in the window: a long list of the whole bag only bloats the window. */
	static final int BAG_SHOWN = 4;

	/** "Already in the bag: A, B, C, D and 6 more": not the whole plan several steps ahead. */
	static String bagLine(List<String> inBag)
	{
		int n = Math.min(inBag.size(), BAG_SHOWN);
		return "Already in the bag: " + String.join(", ", inBag.subList(0, n)) + (inBag.size() > n ? " and " + (inBag.size() - n) + " more" : "");
	}

	private static void add(List<Row> rows, List<String> items, String prefix, Mark mark)
	{
		int shown = 0;
		for (String s : items)
		{
			if (rows.size() >= MAX_ROWS)
			{
				break;
			}
			rows.add(new Row(prefix + s, mark));
			shown++;
		}
		if (shown < items.size())
		{
			rows.add(new Row("... and " + (items.size() - shown) + " more", Mark.INFO));
		}
	}

	/** " - Buy from Betty - 3 gp": the plan's action, or if there is none, where to get it from the step. */
	private static String hint(PrepPlan.Line l, String where)
	{
		String text = l != null && l.getAction() != null && !l.getAction().isEmpty() ? l.getAction() : where;
		if (text == null || text.trim().isEmpty())
		{
			return "";
		}
		String t = text.trim();
		return " — " + (t.endsWith(".") ? t.substring(0, t.length() - 1) : t);
	}

	/** The window text as lines, for the debug log and tests. */
	static String plain(Result r)
	{
		StringBuilder sb = new StringBuilder(r.getTitle());
		for (Row row : r.getRows())
		{
			sb.append(String.valueOf((char) 10)).append(row.getText());
		}
		return sb.toString();
	}

	static String stepId(StepGuide.View v)
	{
		Matcher m = v.getTitle() == null ? null : STEP.matcher(v.getTitle());
		return m != null && m.find() ? m.group(1) : "";
	}
}
