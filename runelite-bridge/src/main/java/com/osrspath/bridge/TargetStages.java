package com.osrspath.bridge;

import com.osrspath.bridge.TargetGuide.Guide;
import com.osrspath.bridge.TargetGuide.GuideItem;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.Data;

import static com.osrspath.bridge.ActiveTarget.MAX_LIST;
import static com.osrspath.bridge.ActiveTarget.nameKey;
import static com.osrspath.bridge.ActiveTarget.nonNull;
import static com.osrspath.bridge.ActiveTarget.tooLong;
import static com.osrspath.bridge.TargetGuide.badAlt;

/** Quest stages by a quest variable's values, with their lines, steps, places and highlights, as the app sends them. Part of {@link ActiveTarget}. */
final class TargetStages
{
	// Quest stages by a quest variable's values, with their lines, steps, places and highlights, as the app sends them.
	/** A quest variable (varp or varbit) and the stages by its values, like StagePayload in the app. */
	@Data
	public static class Stage
	{
		static final int MAX_STAGES = 40;
		static final int MAX_STAGE_STEPS = 40;
		static final int MAX_BANKS = 40;

		/**
		 * A quest the app has no stage data for (Shield of Arrav): its walkthrough lines are one stage with no game variable behind it, and the player
		 * moves through it with "done". Never sent by the app: {@link ActiveTarget#prepare} builds it from the quick path.
		 */
		static final String MANUAL = "manual";

		/** "varp" or "varbit". */
		private String kind;
		private int id;
		private List<StageStep> stages;
		/** The banks of the surface: where the arrow turns when a missing item of a step is in the bank. */
		private List<Spot> banks;

		boolean isVarp()
		{
			return "varp".equals(kind);
		}

		boolean isManual()
		{
			return MANUAL.equals(kind);
		}

		/** One hand-advanced stage from the lines of a quick path. */
		static Stage manual(List<String> lines)
		{
			List<StageLine> steps = new ArrayList<>();
			for (String text : lines)
			{
				StageLine line = new StageLine();
				line.setT(text.trim());
				// The line is the whole instruction ("...pay 20 coins"): the card shows all of it, not a first-sentence cut.
				line.setS(text.trim());
				steps.add(line);
			}
			StageStep only = new StageStep();
			only.setAt(0);
			only.setSteps(steps);
			Stage stage = new Stage();
			stage.setKind(MANUAL);
			stage.setStages(Collections.singletonList(only));
			return stage;
		}

		/** The stage number (zero-based) for a variable value: the last one whose at is not above the value; if there is none, the first. */
		int indexFor(int value)
		{
			int found = 0;
			for (int i = 0; i < stages.size(); i++)
			{
				if (stages.get(i).getAt() <= value)
				{
					found = i;
				}
			}
			return found;
		}

		String problem(int placeCount)
		{
			if (isManual())
			{
				// Built by prepare() from an already checked quick path; a saved target is prepared again when the client starts.
				boolean ok = stages != null && stages.size() == 1 && stages.get(0) != null && stages.get(0).steps != null && !stages.get(0).steps.isEmpty()
					&& stages.get(0).steps.size() <= MAX_LIST
					&& stages.get(0).steps.stream().allMatch(l -> l != null && l.t != null && !l.t.trim().isEmpty() && l.t.length() <= Guide.MAX_WHERE);
				return ok ? null : "invalid walkthrough";
			}
			if (!isVarp() && !"varbit".equals(kind))
			{
				return "unknown quest variable kind";
			}
			if (id < 1 || id > 100_000 || stages == null || stages.isEmpty() || stages.size() > MAX_STAGES)
			{
				return "invalid quest stages";
			}
			if (banks != null && (banks.size() > MAX_BANKS || banks.stream().anyMatch(b -> b == null || b.problem() != null)))
			{
				return "invalid banks";
			}
			int last = -1;
			for (StageStep s : stages)
			{
				if (s == null || s.steps == null || s.steps.isEmpty() || s.steps.size() > MAX_STAGE_STEPS || s.at < 0 || s.at > 100_000
					|| s.at <= last || (s.go != null && (s.go < 0 || s.go >= placeCount)))
				{
					return "invalid quest stage";
				}
				for (StageLine line : s.steps)
				{
					if (line == null || line.t == null || line.t.trim().isEmpty() || line.t.length() > Guide.MAX_WHERE || (line.s != null && line.s.length() > Guide.MAX_WHERE)
						|| (line.x != null && (line.y == null || line.plane == null || line.x <= 0 || line.y <= 0 || line.x >= NavTarget.MAX_COORD
						|| line.y >= NavTarget.MAX_COORD || line.plane < 0 || line.plane > 3)) || tooLong(line.has)
						|| (line.hl != null && line.hl.problem() != null) || Pre.problem(line.pre) != null || (line.mh != null && (line.mh < 1 || line.mh > 200)) || (line.k != null && !line.k.matches("[A-Za-z0-9_.]{1,80}")))
					{
						return "invalid quest stage step";
					}
				}
				last = s.at;
				if (s.items != null && s.items.size() > MAX_LIST)
				{
					return "list too long";
				}
				for (GuideItem i : nonNull(s.items))
				{
					if (i == null || i.name == null || i.name.isEmpty() || tooLong(i.name)
						|| (i.where != null && i.where.length() > Guide.MAX_WHERE) || (i.count != null && (i.count < 1 || i.count > ShoppingPlan.MAX_COUNT)) || badAlt(i.alt))
					{
						return "invalid stage item";
					}
				}
			}
			return null;
		}
	}

	/** A point on the map: a bank. */
	@Data
	public static class Spot
	{
		private int x;
		private int y;
		private int plane;
		private String label;

		String problem()
		{
			return x <= 0 || y <= 0 || x >= NavTarget.MAX_COORD || y >= NavTarget.MAX_COORD || plane < 0 || plane > 3 || label == null || label.isEmpty() || tooLong(label)
				? "invalid point" : null;
		}
	}

	/**
	 * An item a stage step needs in the bag, and where to get it. With an ID only that exact item counts (the Draynor Manor cabbage is called Cabbage too);
	 * without one, the name. No tile means the Grand Exchange.
	 */
	@Data
	public static class Pre
	{
		static final int MAX = 8;
		static final int MAX_COUNT = 1000;

		private String item;
		private Integer id;
		private Integer n;
		/** x, y, plane of the place to get the item. */
		private List<Integer> at;
		/** What to do there: the label of the arrow. */
		private String t;
		/** Object names and an NPC to highlight at that place. */
		private List<String> on;
		private String npc;
		/** Other items that do the same job: any of them counts (every pickaxe tier for "Pickaxe"). null means only the item itself. */
		private List<String> alt;

		int need()
		{
			return n == null ? 1 : n;
		}

		boolean hasPlace()
		{
			return at != null && at.size() == 3;
		}

		static String problem(List<Pre> list)
		{
			if (list == null)
			{
				return null;
			}
			if (list.size() > MAX)
			{
				return "too many items";
			}
			for (Pre p : list)
			{
				if (p == null || p.item == null || p.item.isEmpty() || tooLong(p.item) || tooLong(p.t) || tooLong(p.npc) || (p.id != null && (p.id <= 0 || p.id >= NavTarget.MAX_ITEM_ID))
					|| (p.n != null && (p.n < 1 || p.n > MAX_COUNT)) || (p.alt != null && (p.alt.size() > 16 || p.alt.stream().anyMatch(n -> n == null || n.isEmpty() || tooLong(n))))
					|| (p.on != null && (p.on.size() > NavTarget.MAX_NPCS || p.on.stream().anyMatch(n -> n == null || n.isEmpty() || tooLong(n))))
					|| (p.at != null && (p.at.size() != 3 || p.at.stream().anyMatch(v -> v == null) || p.at.get(0) <= 0 || p.at.get(1) <= 0 || p.at.get(0) >= NavTarget.MAX_COORD
						|| p.at.get(1) >= NavTarget.MAX_COORD || p.at.get(2) < 0 || p.at.get(2) > 3)))
				{
					return "invalid pre-flight item";
				}
			}
			return null;
		}
	}

	/** A stage step highlight: NPCs and objects by ID, objects by name (when there is no ID or the look changes), items in the bag. */
	@Data
	public static class Highlight
	{
		static final int MAX = 8;
		static final int MAX_ID = 200_000;

		private List<Integer> npc;
		private List<Integer> obj;
		private List<String> on;
		private List<String> item;

		String problem()
		{
			for (List<Integer> ids : List.of(nonNull(npc), nonNull(obj)))
			{
				if (ids.size() > MAX || ids.stream().anyMatch(i -> i == null || i < 1 || i > MAX_ID))
				{
					return "invalid step highlight";
				}
			}
			for (List<String> names : List.of(nonNull(on), nonNull(item)))
			{
				if (names.size() > MAX || names.stream().anyMatch(n -> n == null || n.isEmpty() || tooLong(n)))
				{
					return "invalid step highlight";
				}
			}
			return null;
		}
	}

	/** What is highlighted on the current stage step, ready for comparison: sets of IDs and names. */
	static final class LineHighlight
	{
		static final LineHighlight NONE = new LineHighlight(null);

		final Set<Integer> npcIds = new HashSet<>();
		final Set<Integer> objectIds = new HashSet<>();
		final Set<String> objectNames = new HashSet<>();
		final Set<String> itemNames = new HashSet<>();
		/** The line's tile: of several objects with one of objectIds only the nearest to it is the line's (the maze's same-coloured doors). */
		final boolean hasPoint;
		final int x;
		final int y;
		final int plane;

		LineHighlight(Highlight h)
		{
			this(h, null);
		}

		LineHighlight(Highlight h, StageLine at)
		{
			hasPoint = at != null && at.hasPoint();
			x = hasPoint ? at.getX() : 0;
			y = hasPoint ? at.getY() : 0;
			plane = hasPoint ? at.getPlane() : 0;
			if (h == null)
			{
				return;
			}
			npcIds.addAll(nonNull(h.npc));
			objectIds.addAll(nonNull(h.obj));
			for (String n : nonNull(h.on))
			{
				objectNames.add(nameKey(n));
			}
			for (String n : nonNull(h.item))
			{
				itemNames.add(nameKey(n));
			}
		}

		boolean isEmpty()
		{
			return npcIds.isEmpty() && objectIds.isEmpty() && objectNames.isEmpty() && itemNames.isEmpty();
		}

		/** How far an object stands from the line's tile, in tiles; another floor counts as farther than any tile. */
		int distance(int ox, int oy, int oplane)
		{
			return oplane != plane ? Integer.MAX_VALUE / 2 : Math.max(Math.abs(ox - x), Math.abs(oy - y));
		}
	}

	/** A stage step: the text and, if known, the tile; the plugin uses it to see that the player reached the step. */
	@Data
	public static class StageLine
	{
		/** "... x2" at the end of a has text: how many are needed. */
		private static final java.util.regex.Pattern HAS_COUNT = java.util.regex.Pattern.compile("[ ]*[x×][ ]*([0-9]+)[ ]*$");
		private String t;
		/** Short text for a list line in the game (up to ~70 characters); null means the app did not send it and the line shortens itself. */
		private String s;
		private Integer x;
		private Integer y;
		private Integer plane;
		/** Item: it is already in the bag, so the step is done (the portrait is found, no need to look for it). null means not determined by items. */
		private String has;
		/**
		 * An item without which the step is not counted by position: "give Thurgo the ore" is not considered done just
		 * because the player stands next to Thurgo. null means no conditions.
		 */
		private String need;
		/** What to highlight in the game on this step (per Quest Helper); null means only the arrow to the tile. */
		private Highlight hl;
		/** The step's name in Quest Helper (talkToLuthasAgain): the state machine uses it to pick the line. null means not a Quest Helper step. */
		private String k;
		/** Items that must be in the bag before this step; while one is missing the arrow leads to where to get it. null means no guard. */
		private List<Pre> pre;
		/** The strongest usual hit of what attacks the player on this line; the health warning uses it while this line is current. null means none. */
		private Integer mh;

		boolean hasPoint()
		{
			return x != null && y != null && plane != null;
		}

		boolean hasNeed()
		{
			return need != null && !need.isEmpty();
		}

		boolean hasHas()
		{
			return has != null && !has.isEmpty();
		}

		/**
		 * The "has" text without its count: "Goblin mail x2" gives "Goblin mail". For "Key print|Bronze key" the first item is the one the step obtains
		 * (the others are what it turns into later).
		 */
		String primaryHas()
		{
			return has == null ? null : hasNames().get(0);
		}

		/** The least number of items that makes the step done: "Goblin mail x2" is 2, no count is 1. */
		int hasCount()
		{
			java.util.regex.Matcher m = HAS_COUNT.matcher(has == null ? "" : has);
			return m.find() ? Integer.parseInt(m.group(1)) : 1;
		}

		private java.util.List<String> hasNames()
		{
			java.util.List<String> out = new java.util.ArrayList<>();
			String text = has == null ? "" : HAS_COUNT.matcher(has).replaceFirst("");
			for (String name : text.split("[|]"))
			{
				if (!name.trim().isEmpty())
				{
					out.add(name.trim());
				}
			}
			return out.isEmpty() ? java.util.Collections.singletonList("") : out;
		}

		/**
		 * Whether the bag holds the step's item. "has" may list alternatives with "|" and a count at the end: "Goblin mail|Blue goblin mail|Orange goblin mail x3"
		 * is done when the three kinds together number three, so a step stays done after the item was used up or turned into another (the dye, the key made
		 * from the print). The counts of the listed items are added; no count means one.
		 */
		boolean holds(ItemCounts bag)
		{
			if (bag == null || !hasHas())
			{
				return false;
			}
			int total = 0;
			for (String name : hasNames())
			{
				total += name.isEmpty() ? 0 : bag.count(null, name);
			}
			return total >= hasCount();
		}

		/** The text for a line in the game: the short one from the app, or if there is none, the first sentence of the full one. */
		String shown()
		{
			return s != null && !s.trim().isEmpty() ? s.trim() : ShortText.of(t);
		}
	}

	@Data
	public static class StageStep
	{
		/** From which variable value the stage applies. */
		private int at;
		/** What to do in the stage: the steps in order (as in Quest Helper), each with a tile if known. */
		private List<StageLine> steps;
		/** The number of the point in the guide's places to go to; null means no place. */
		private Integer go;
		/** What is needed in this stage; null means the step's items, an empty list means nothing. */
		private List<GuideItem> items;
	}
}
