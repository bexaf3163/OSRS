package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.Data;

/**
 * План подготовки, который программа уже посчитала (протокол 6, часть снимка /prep-plan): процент готовности, у каждого
 * предмета — важность, срок, хватает ли расходника и что сделать; «не бери сейчас»; режим восстановления после смерти;
 * совет про вес и сумку. Плагин ничего из этого не решает — только рисует рядом со своим живым списком предметов
 * (сумка и банк известны ему мгновенно, программе — с задержкой событий). Чего нет в плане — не рисуется.
 */
@Data
public class PrepPlan
{
	static final int MAX_LINES = 48;
	static final int MAX_LATER = 12;
	static final int MAX_RECOVERY = 5;
	static final int MAX_BLOCKERS = 4;

	private String stepId;
	private Score score;
	private List<Line> lines;
	private List<String> later;
	private Recovery recovery;
	private String weight;
	private String slots;
	private List<String> blockers;

	private transient Map<String, Line> byName = Collections.emptyMap();

	@Data
	public static class Score
	{
		/** 0–100; null — проверять пока нечем (нет данных из игры). */
		private Integer percent;
		/** READY / NOT_READY / UNKNOWN. */
		private String verdict;
		private int critical;
		private int important;
		private int optimizations;
		private int unknown;
	}

	@Data
	public static class Line
	{
		/** Английское название — как в сумке. */
		private String name;
		private int need;
		/** EQUIPPED / INVENTORY / BANK / MISSING / UNKNOWN. */
		private String where;
		/** CRITICAL / IMPORTANT / OPTIMIZATION / OPTIONAL. */
		private String priority;
		/** NOW / SOON / IN_STEP. */
		private String timing;
		/** LOW / CRITICAL — расходника мало; нет — хватает. */
		private String supply;
		/** Что сделать, коротко: «Забери из банка», «Купи у Betty — 3 gp». */
		private String action;

		boolean lowSupply()
		{
			return "LOW".equals(supply) || "CRITICAL".equals(supply);
		}
	}

	@Data
	public static class Recovery
	{
		private String title;
		private List<String> steps;
	}

	String prepare()
	{
		if (stepId == null || stepId.isEmpty() || stepId.length() > 32)
		{
			return "нужен stepId плана";
		}
		if (score != null && (score.percent != null && (score.percent < 0 || score.percent > 100)
			|| score.critical < 0 || score.important < 0 || score.optimizations < 0 || score.unknown < 0
			|| (score.verdict != null && ActiveTarget.tooLong(score.verdict))))
		{
			return "неверная оценка готовности";
		}
		if (lines != null)
		{
			if (lines.size() > MAX_LINES)
			{
				return "слишком длинный план";
			}
			Map<String, Line> index = new HashMap<>();
			for (Line l : lines)
			{
				if (l == null || l.name == null || l.name.isEmpty() || ActiveTarget.tooLong(l.name) || l.need < 0 || l.need > ShoppingPlan.MAX_COUNT
					|| ActiveTarget.tooLong(l.action))
				{
					return "неверная строка плана";
				}
				index.putIfAbsent(ActiveTarget.nameKey(l.name), l);
			}
			byName = index;
		}
		return textProblem(later, MAX_LATER, "не бери сейчас");
	}

	private String textProblem(List<String> list, int max, String what)
	{
		if (list != null && (list.size() > max || list.stream().anyMatch(s -> s == null || s.isEmpty() || ActiveTarget.tooLong(s))))
		{
			return "неверный список: " + what;
		}
		if (recovery != null && (recovery.steps == null || recovery.steps.isEmpty() || recovery.steps.size() > MAX_RECOVERY
			|| recovery.steps.stream().anyMatch(s -> s == null || s.isEmpty() || ActiveTarget.tooLong(s))
			|| (recovery.title != null && ActiveTarget.tooLong(recovery.title))))
		{
			return "неверный режим восстановления";
		}
		if (ActiveTarget.tooLong(weight) || ActiveTarget.tooLong(slots))
		{
			return "слишком длинный совет";
		}
		if (blockers != null && (blockers.size() > MAX_BLOCKERS || blockers.stream().anyMatch(s -> s == null || s.isEmpty() || ActiveTarget.tooLong(s))))
		{
			return "неверный список блокеров";
		}
		return null;
	}

	/** Строка плана по названию предмета (с любым регистром и числом в конце «×5» — как в списке игры); null — такой нет. */
	Line line(String itemName)
	{
		return itemName == null ? null : byName.get(ActiveTarget.nameKey(rawName(itemName)));
	}

	/** «Lobster ×5» → «Lobster». */
	static String rawName(String shown)
	{
		return shown.replaceAll("\\s*×\\s*\\d+\\s*$", "").trim();
	}

	/** Процент для заголовка списка: меньше ста и известен. */
	Integer pendingPercent()
	{
		return score != null && score.percent != null && score.percent < 100 ? score.percent : null;
	}

	boolean hasRecovery()
	{
		return recovery != null && recovery.steps != null && !recovery.steps.isEmpty();
	}
}
