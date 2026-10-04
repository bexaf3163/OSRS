package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.Value;

/**
 * Окно у банка, биржи и магазина: что нужно для шага именно здесь. В банке — что взять (и чего в банке нет), на бирже и у
 * торговца — что купить и где продаётся. Для любого квеста: берётся тот же список предметов шага или этапа, что и в списке
 * «Что нужно», плюс строки плана подготовки от программы (там действие вроде «Купи у Betty — 3 gp»). Предметы не
 * перекладываются и не покупаются — окно только говорит, что делать.
 *
 * Здесь только раскладка строк (чистая логика для тестов); окно рисует {@link OsrsPathShopOverlay}.
 */
final class ShopWindow
{
	enum Place
	{
		BANK, EXCHANGE, SHOP
	}

	enum Mark
	{
		/** Сделать здесь: взять или купить. */
		TODO,
		/** Не получится здесь: нет в банке. */
		BAD,
		/** Уже есть. */
		GOOD,
		/** Справка. */
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
		/** Сколько дел осталось здесь: взять или купить. */
		int todo;
	}

	static final int MAX_ROWS = 12;
	private static final Pattern STEP = Pattern.compile("^\\[([^\\]]+)]");

	private ShopWindow()
	{
	}

	/** Что показать у этого окна игры; null — показывать нечего (нет шага или предметов). */
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
			String label = i.getName() == null ? i.getTitle() : i.getName() + (i.getRu() == null ? "" : " (" + i.getRu() + ")");
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
					// Добудешь по ходу шага или уже отдано — у банка, биржи и торговца это не нужно.
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
			title = "Банк · что взять" + (id.isEmpty() ? "" : " · " + id);
			add(rows, take, "Взять: ", Mark.TODO);
			add(rows, missing, "Нет в банке: ", Mark.BAD);
			if (take.isEmpty() && missing.isEmpty())
			{
				rows.add(new Row("Всё нужное уже в сумке ✓", Mark.GOOD));
			}
			else if (!inBag.isEmpty())
			{
				rows.add(new Row(bagLine(inBag), Mark.GOOD));
			}
			if (plan != null)
			{
				if (plan.getWeight() != null && !plan.getWeight().isEmpty())
				{
					rows.add(new Row("Вес: " + plan.getWeight(), Mark.INFO));
				}
				if (plan.getSlots() != null && !plan.getSlots().isEmpty())
				{
					rows.add(new Row("⚠ " + plan.getSlots(), Mark.INFO));
				}
				if (plan.getLater() != null && !plan.getLater().isEmpty())
				{
					rows.add(new Row("Не бери сейчас: " + String.join(", ", plan.getLater()), Mark.INFO));
				}
			}
		}
		else
		{
			todo = missing.size();
			title = (place == Place.EXCHANGE ? "Биржа · что купить" : "Магазин · что купить") + (id.isEmpty() ? "" : " · " + id);
			add(rows, missing, "Купить: ", Mark.TODO);
			if (missing.isEmpty())
			{
				rows.add(new Row("Здесь покупать нечего ✓", Mark.GOOD));
			}
			if (!inBank.isEmpty())
			{
				rows.add(new Row("Лежит в банке (не покупай): " + String.join(", ", inBank), Mark.INFO));
			}
			if (!inBag.isEmpty())
			{
				rows.add(new Row(bagLine(inBag), Mark.GOOD));
			}
		}
		return new Result(title, rows, todo);
	}

	/** Сколько предметов, что уже с собой, называем в окне: длинный список всей сумки окно только раздувает. */
	static final int BAG_SHOWN = 4;

	/** «Уже в сумке: A, B, C, D и ещё 6» — не весь план на несколько шагов вперёд. */
	static String bagLine(List<String> inBag)
	{
		int n = Math.min(inBag.size(), BAG_SHOWN);
		return "Уже в сумке: " + String.join(", ", inBag.subList(0, n)) + (inBag.size() > n ? " и ещё " + (inBag.size() - n) : "");
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
			rows.add(new Row("…и ещё " + (items.size() - shown), Mark.INFO));
		}
	}

	/** « — Купи у Betty — 3 gp»: действие плана, а нет его — где брать из шага. */
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

	/** Текст окна строками — для журнала отладки и тестов. */
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
