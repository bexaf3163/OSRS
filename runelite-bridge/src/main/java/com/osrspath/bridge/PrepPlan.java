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
	static final int MAX_WITHDRAWALS = 12;

	private String stepId;
	private Score score;
	private List<Line> lines;
	private List<String> later;
	private Recovery recovery;
	private String weight;
	private String slots;
	private List<String> blockers;
	private ActiveDetour activeDetour;
	private List<BankWithdrawal> bankWithdrawals;
	private RecommendedTransport recommendedTransport;

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

	/** A tile in the world. */
	@Data
	public static class Tile
	{
		private int x;
		private int y;
		private int plane;

		boolean valid()
		{
			return x > 0 && y > 0 && x < NavTarget.MAX_COORD && y < NavTarget.MAX_COORD && plane >= 0 && plane <= 3;
		}
	}

	/** A target for the arrow built from a label and a tile; null when it does not pass the arrow's own checks. */
	static NavTarget navTargetOf(String label, Tile tile, String stepId)
	{
		if (label == null || label.trim().isEmpty() || tile == null)
		{
			return null;
		}
		NavTarget n = new NavTarget();
		n.setLabel(label.length() > 60 ? label.substring(0, 59) + "…" : label);
		n.setX(tile.getX());
		n.setY(tile.getY());
		n.setPlane(tile.getPlane());
		n.setStepId(stepId);
		return n.prepare() == null ? n : null;
	}

	/**
	 * A stop worth making on the way ("Detour: Buy Orange dye at Aggie (+10 tiles, saves ~3 min)"): the text, where a click leads the arrow, what it costs in
	 * tiles, and what kind of stop it is (BUY, GET or WITHDRAW).
	 */
	@Data
	public static class ActiveDetour
	{
		private String text;
		private String label;
		private Tile targetTile;
		private int costTiles;
		private String actionType;

		boolean valid()
		{
			return text != null && !text.trim().isEmpty() && !ActiveTarget.tooLong(text) && label != null && !label.trim().isEmpty() && !ActiveTarget.tooLong(label)
				&& targetTile != null && targetTile.valid() && costTiles >= 0 && costTiles <= 100_000 && !ActiveTarget.tooLong(actionType);
		}

		/** The arrow target of the stop. */
		NavTarget navTarget(String stepId)
		{
			return navTargetOf(label, targetTile, stepId);
		}
	}

	/** Something in the bank the plan wants taken out. itemId 0 means the app did not know the id. */
	@Data
	public static class BankWithdrawal
	{
		private int itemId;
		private String itemName;
		private int quantity;

		boolean valid()
		{
			return itemId >= 0 && itemId <= NavTarget.MAX_ITEM_ID && itemName != null && !itemName.trim().isEmpty() && !ActiveTarget.tooLong(itemName) && quantity >= 1 && quantity <= ShoppingPlan.MAX_COUNT;
		}
	}

	/**
	 * The way to the step that is not walking: the kind, where it ends, what to interact with (an id when known, otherwise the name) and what to use from the
	 * bag. The plugin points at the first stop and frames the item; it activates nothing.
	 */
	@Data
	public static class RecommendedTransport
	{
		private String type;
		private String destination;
		private int interactionId;
		private String interactionName;
		private String item;
		private Tile tile;
		private String text;

		boolean valid()
		{
			return type != null && !type.isEmpty() && !ActiveTarget.tooLong(type) && destination != null && !ActiveTarget.tooLong(destination) && interactionId >= 0
				&& interactionId <= 1_000_000 && !ActiveTarget.tooLong(interactionName) && !ActiveTarget.tooLong(item) && (tile == null || tile.valid())
				&& text != null && !text.trim().isEmpty() && !ActiveTarget.tooLong(text);
		}

		NavTarget navTarget(String stepId)
		{
			return navTargetOf(destination, tile, stepId);
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
		if (activeDetour != null && !activeDetour.valid())
		{
			return "invalid detour";
		}
		if (recommendedTransport != null && !recommendedTransport.valid())
		{
			return "invalid transport";
		}
		if (bankWithdrawals != null && (bankWithdrawals.size() > MAX_WITHDRAWALS || bankWithdrawals.stream().anyMatch(w -> w == null || !w.valid())))
		{
			return "invalid bank withdrawals";
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

	boolean hasDetour()
	{
		return activeDetour != null && activeDetour.valid();
	}

	boolean hasTransport()
	{
		return recommendedTransport != null && recommendedTransport.valid();
	}

	boolean hasWithdrawals()
	{
		return bankWithdrawals != null && !bankWithdrawals.isEmpty();
	}

	/** Whether the plan wants this item taken out of the bank: by id when the app knew it, otherwise by name. */
	boolean withdrawsItem(int itemId, String nameKey)
	{
		if (bankWithdrawals == null)
		{
			return false;
		}
		for (BankWithdrawal w : bankWithdrawals)
		{
			if (w != null && ((itemId > 0 && w.getItemId() == itemId) || (nameKey != null && w.getItemName() != null && ActiveTarget.nameKey(w.getItemName()).equals(nameKey))))
			{
				return true;
			}
		}
		return false;
	}

	/** The item the recommended transport uses, by name key. */
	boolean usesTransportItem(String nameKey)
	{
		return hasTransport() && recommendedTransport.getItem() != null && ActiveTarget.nameKey(recommendedTransport.getItem()).equals(nameKey);
	}

	boolean hasRecovery()
	{
		return recovery != null && recovery.steps != null && !recovery.steps.isEmpty();
	}
}
