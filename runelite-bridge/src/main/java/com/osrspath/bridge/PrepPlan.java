package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.Data;

/**
 * The preparation plan the app has already computed (protocol 6, part of the /prep-plan snapshot): the readiness percentage, for each
 * item the importance, the deadline, whether the supply is enough and what to do; "don't take now"; the recovery mode after death;
 * the weight and bag advice. The plugin decides none of this: it only draws it next to its own live item list
 * (the bag and bank are known to it instantly, to the app with an event delay). What is not in the plan is not drawn.
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
		/** 0-100; null means there is nothing to check with yet (no data from the game). */
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
		/** The English name, as in the bag. */
		private String name;
		private int need;
		/** EQUIPPED / INVENTORY / BANK / MISSING / UNKNOWN. */
		private String where;
		/** CRITICAL / IMPORTANT / OPTIMIZATION / OPTIONAL. */
		private String priority;
		/** NOW / SOON / IN_STEP. */
		private String timing;
		/** LOW / CRITICAL means the supply is low; absent means enough. */
		private String supply;
		/** What to do, briefly: "Take it from the bank", "Buy from Betty - 3 gp". */
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
			return "stepId of the plan is required";
		}
		if (score != null && (score.percent != null && (score.percent < 0 || score.percent > 100)
			|| score.critical < 0 || score.important < 0 || score.optimizations < 0 || score.unknown < 0
			|| (score.verdict != null && ActiveTarget.tooLong(score.verdict))))
		{
			return "invalid readiness estimate";
		}
		if (lines != null)
		{
			if (lines.size() > MAX_LINES)
			{
				return "plan too long";
			}
			Map<String, Line> index = new HashMap<>();
			for (Line l : lines)
			{
				if (l == null || l.name == null || l.name.isEmpty() || ActiveTarget.tooLong(l.name) || l.need < 0 || l.need > ShoppingPlan.MAX_COUNT
					|| ActiveTarget.tooLong(l.action))
				{
					return "invalid plan row";
				}
				index.putIfAbsent(ActiveTarget.nameKey(l.name), l);
			}
			byName = index;
		}
		return textProblem(later, MAX_LATER, "don't take now");
	}

	private String textProblem(List<String> list, int max, String what)
	{
		if (list != null && (list.size() > max || list.stream().anyMatch(s -> s == null || s.isEmpty() || ActiveTarget.tooLong(s))))
		{
			return "invalid list: " + what;
		}
		if (recovery != null && (recovery.steps == null || recovery.steps.isEmpty() || recovery.steps.size() > MAX_RECOVERY
			|| recovery.steps.stream().anyMatch(s -> s == null || s.isEmpty() || ActiveTarget.tooLong(s))
			|| (recovery.title != null && ActiveTarget.tooLong(recovery.title))))
		{
			return "invalid recovery mode";
		}
		if (ActiveTarget.tooLong(weight) || ActiveTarget.tooLong(slots))
		{
			return "advice too long";
		}
		if (blockers != null && (blockers.size() > MAX_BLOCKERS || blockers.stream().anyMatch(s -> s == null || s.isEmpty() || ActiveTarget.tooLong(s))))
		{
			return "invalid blockers list";
		}
		return null;
	}

	/** A plan row by item name (with any case and a trailing count like "×5", as in the game list): null means there is none. */
	Line line(String itemName)
	{
		return itemName == null ? null : byName.get(ActiveTarget.nameKey(rawName(itemName)));
	}

	/** "Lobster ×5" → "Lobster". */
	static String rawName(String shown)
	{
		return shown.replaceAll("\\s*×\\s*\\d+\\s*$", "").trim();
	}

	/** The percentage for the list heading: below one hundred and known. */
	Integer pendingPercent()
	{
		return score != null && score.percent != null && score.percent < 100 ? score.percent : null;
	}

	boolean hasRecovery()
	{
		return recovery != null && recovery.steps != null && !recovery.steps.isEmpty();
	}
}
