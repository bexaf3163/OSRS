package com.osrspath.bridge;

import com.osrspath.bridge.TargetStages.Stage;
import java.util.List;
import lombok.Data;

import static com.osrspath.bridge.ActiveTarget.MAX_LIST;
import static com.osrspath.bridge.ActiveTarget.nonNull;
import static com.osrspath.bridge.ActiveTarget.tooLong;

/** The side panel, the selected plan's phase and the guide's items, places and checklist, as the app sends them. Part of {@link ActiveTarget}. */
final class TargetGuide
{
	// The side panel, the selected plan's phase and the guide's items, places and checklist, as the app sends them.
	/** The "OSRS Path" side panel: the step's items with a "where to get it" hint and the step's points. */
	@Data
	public static class Guide
	{
		/** "Where to get it" can be longer than a usual label: a whole sentence from the route. */
		static final int MAX_WHERE = 500;

		private List<GuideItem> items;
		private List<GuidePlace> places;
		/** The step's quick path in order: the last item is shown when everything is collected. */
		List<String> steps;
		/** Quest stages by a game variable: what to do and where to go right now. null means the step has no stages. */
		Stage stage;

		String problem()
		{
			if (stage != null)
			{
				String bad = stage.problem(places == null ? 0 : places.size());
				if (bad != null)
				{
					return bad;
				}
			}
			for (List<?> list : new List<?>[]{items, places, steps})
			{
				if (list != null && list.size() > MAX_LIST)
				{
					return "list too long";
				}
			}
			for (String s : nonNull(steps))
			{
				if (s == null || s.length() > MAX_WHERE)
				{
					return "invalid quick-path item";
				}
			}
			for (GuideItem i : nonNull(items))
			{
				if (i == null || i.name == null || i.name.isEmpty() || tooLong(i.name)
					|| (i.where != null && i.where.length() > MAX_WHERE) || (i.count != null && (i.count < 1 || i.count > ShoppingPlan.MAX_COUNT)) || badAlt(i.alt)
					|| (i.doses != null && (i.doses < 1 || i.doses > ShoppingPlan.MAX_COUNT)))
				{
					return "invalid panel item";
				}
			}
			for (GuidePlace p : nonNull(places))
			{
				if (p == null || p.label == null || p.label.trim().isEmpty() || tooLong(p.label) || tooLong(p.npc)
					|| p.x <= 0 || p.y <= 0 || p.x >= NavTarget.MAX_COORD || p.y >= NavTarget.MAX_COORD || p.plane < 0 || p.plane > 3
					|| (p.items != null && (p.items.size() > MAX_LIST || p.items.stream().anyMatch(n -> n == null || tooLong(n)))))
				{
					return "invalid panel point";
				}
			}
			return null;
		}
	}

	// The side panel, the selected plan's phase and the guide's items, places and checklist, as the app sends them.
	@Data
	public static class GuideItem
	{
		String name;
		private Integer id;
		/** null means the amount in the route is not a number ("as many as you have"): one is enough. */
		Integer count;
		String where;
		/** Obtained during the step itself, no need to take it beforehand. */
		private boolean inStep;
		/** Other items that count in its place (every pickaxe tier for "Bronze pickaxe"). null means only the item itself. */
		List<String> alt;
		/** A potion: the doses the step needs; every size counts toward them (ItemCounts.doses). null for anything else. */
		private Integer doses;
	}

	@Data
	public static class GuidePlace
	{
		private int x;
		private int y;
		private int plane;
		private String label;
		/** The NPC at this point: highlighted once the arrow leads there. */
		private String npc;
		/** Which of the step's items are taken here (English names). */
		private List<String> items;
	}

	@Data
	public static class ChecklistItem
	{
		private Boolean equip;
		String name;
		private Integer id;
		int count;
		/** How much health it heals, for food. */
		private Integer heals;
		/** Other items that count in its place (every pickaxe tier for "Bronze pickaxe"). null means only the item itself. */
		private List<String> alt;
		/** A potion: the doses `count` potions hold; every size counts toward them (ItemCounts.doses). null for anything else. */
		Integer doses;
	}

	/** How many of the item and of its alternatives the container holds together. */
	static int countWithAlt(ItemCounts items, Integer id, String name, List<String> alt)
	{
		return items.countWithAlt(id, name, alt);
	}

	static boolean badAlt(List<String> alt)
	{
		return alt != null && (alt.size() > 16 || alt.stream().anyMatch(n -> n == null || n.isEmpty() || tooLong(n)));
	}
}
