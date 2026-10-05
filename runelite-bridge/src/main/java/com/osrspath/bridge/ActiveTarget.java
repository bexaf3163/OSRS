package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.Data;
import net.runelite.api.Skill;

/**
 * The current step sent by the app: the same as InGameTarget in src/types/index.ts, plus the step's code and title.
 * Gson fills the fields; the sets for fast comparison are built by {@link #prepare()}.
 */
@Data
public class ActiveTarget
{
	/** Size limits: the request arrives over a network, even if a local one. */
	static final int MAX_LIST = 64;
	static final int MAX_TEXT = 200;

	private static final Pattern TAGS = Pattern.compile("<[^>]*>");
	private static final Pattern SPACES = Pattern.compile("\\s+");
	private static final Pattern TRAILING_PUNCT = Pattern.compile("[.!?…]+$");

	private String stepId;
	private String title;
	private WorldPointDto worldPoint;
	private List<GroundTile> groundTiles;
	private List<String> npcNames;
	private List<Integer> npcIds;
	private List<String> objectNames;
	private List<Integer> objectIds;
	private List<String> dialogChoices;
	private List<String> highlightItems;
	private Trigger completionTrigger;
	/** The current target in one line, for the micro HUD. */
	private String goal;
	/** What must be in the bag before leaving the bank (departure check). */
	private List<ChecklistItem> checklist;
	/** Waypoints in order: gate -> bridge -> ladder -> NPC. */
	private List<WorldPointDto> pathWaypoints;
	/** More items the app needs to know the count of (conditions of the quick variants). */
	private List<String> watchItems;
	/** The step skill's pacing: how many actions to the goal and how long that takes. */
	private Pacing pacing;
	/** For the side panel: what the step needs, where to get it and where the arrow can be pointed (since protocol 3). */
	private Guide guide;
	/** The strongest regular hit of the step's enemies (per the wiki): the HUD warns when health drops below two such hits. */
	private Integer maxHit;
	/** "Use X on Y": an item from the bag and what it is used on. The HUD reminds of the action and the target is highlighted. */
	private List<UseOn> useOn;

	private transient Set<String> npcNameSet = Collections.emptySet();
	private transient Set<Integer> npcIdSet = Collections.emptySet();
	private transient Set<String> objectNameSet = Collections.emptySet();
	private transient Set<Integer> objectIdSet = Collections.emptySet();
	private transient Set<String> dialogSet = Collections.emptySet();
	private transient Set<String> itemNameSet = Collections.emptySet();

	@Data
	public static class UseOn
	{
		private String item;
		private String target;
		/** object, npc or item; empty means object. */
		private String kind;

		boolean isNpc()
		{
			return "npc".equals(kind);
		}

		boolean isObject()
		{
			return kind == null || kind.isEmpty() || "object".equals(kind);
		}
	}

	@Data
	public static class WorldPointDto
	{
		private int x;
		private int y;
		private int plane;
		private String label;
	}

	@Data
	public static class GroundTile
	{
		private int x;
		private int y;
		private int plane;
		private String label;
		private String color;
	}

	/** The "OSRS Path" side panel: the step's items with a "where to get it" hint and the step's points. */
	@Data
	public static class Guide
	{
		/** "Where to get it" can be longer than a usual label: a whole sentence from the route. */
		static final int MAX_WHERE = 500;

		private List<GuideItem> items;
		private List<GuidePlace> places;
		/** The step's quick path in order: the last item is shown when everything is collected. */
		private List<String> steps;
		/** Quest stages by a game variable: what to do and where to go right now. null means the step has no stages. */
		private Stage stage;

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
					|| (i.where != null && i.where.length() > MAX_WHERE) || (i.count != null && (i.count < 1 || i.count > ShoppingPlan.MAX_COUNT)))
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

	/** A quest variable (varp or varbit) and the stages by its values, like StagePayload in the app. */
	@Data
	public static class Stage
	{
		static final int MAX_STAGES = 40;
		static final int MAX_STAGE_STEPS = 40;

		/** "varp" or "varbit". */
		private String kind;
		private int id;
		private List<StageStep> stages;

		boolean isVarp()
		{
			return "varp".equals(kind);
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
			if (!isVarp() && !"varbit".equals(kind))
			{
				return "unknown quest variable kind";
			}
			if (id < 1 || id > 100_000 || stages == null || stages.isEmpty() || stages.size() > MAX_STAGES)
			{
				return "invalid quest stages";
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
						|| (line.hl != null && line.hl.problem() != null) || (line.k != null && !line.k.matches("[A-Za-z0-9_.]{1,80}")))
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
						|| (i.where != null && i.where.length() > Guide.MAX_WHERE) || (i.count != null && (i.count < 1 || i.count > ShoppingPlan.MAX_COUNT)))
					{
						return "invalid stage item";
					}
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

		LineHighlight(Highlight h)
		{
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

	@Data
	public static class GuideItem
	{
		private String name;
		private Integer id;
		/** null means the amount in the route is not a number ("as many as you have"): one is enough. */
		private Integer count;
		private String where;
		/** Obtained during the step itself, no need to take it beforehand. */
		private boolean inStep;
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
		private String name;
		private Integer id;
		private int count;
		/** How much health it heals, for food. */
		private Integer heals;
	}

	/** The same as StepPacing in src/types/index.ts. */
	@Data
	public static class Pacing
	{
		/** Melee skills: their action is a defeated enemy, and XP comes for each hit. */
		static final Set<String> COMBAT = Set.of("attack", "strength", "defence");
		static final Set<String> SKILLS = Set.of("fishing", "woodcutting", "cooking", "mining", "attack", "strength", "defence");

		private String skill;
		/** More skills with the same goal, combat only: Strength and Defence after Attack. The one that is growing is shown. */
		private List<String> also;
		private int targetLevel;
		private int targetExp;
		/** The action name in forms for 1 and 2+: "shrimp|shrimps". A single form works too. */
		private String actionName;
		private double expPerAction;
		/** Seconds per action: a first estimate until there are own measurements. */
		private Double secondsPerAction;

		/** The step's skill followed by the skills from also, in the order the step recommends training them. */
		List<String> skills()
		{
			List<String> out = new ArrayList<>();
			out.add(skill);
			for (String s : nonNull(also))
			{
				if (!out.contains(s))
				{
					out.add(s);
				}
			}
			return out;
		}

		String problem()
		{
			if (skill == null || !SKILLS.contains(skill))
			{
				return "unknown pacing skill";
			}
			if (also != null)
			{
				// Several skills with one goal happen only in combat: they are trained in turn, changing the attack style.
				if (also.size() > 2 || !COMBAT.contains(skill))
				{
					return "invalid pacing skill list";
				}
				for (String s : also)
				{
					if (s == null || !COMBAT.contains(s) || s.equals(skill))
					{
						return "invalid pacing skill list";
					}
				}
			}
			if (targetLevel < 2 || targetLevel > 99 || targetExp < 1 || targetExp > 13_034_431)
			{
				return "invalid pacing target";
			}
			if (!(expPerAction > 0 && expPerAction <= 10_000) || actionName == null || actionName.isEmpty() || tooLong(actionName))
			{
				return "invalid pacing action";
			}
			if (secondsPerAction != null && !(secondsPerAction > 0 && secondsPerAction <= 600))
			{
				return "invalid action time";
			}
			return null;
		}
	}

	@Data
	public static class Trigger
	{
		private String type;
		private String questName;
		/** SKILL_LEVEL: these real levels (without potions), all at once. */
		private List<LevelNeed> levels;
		/** ITEM_OWNED: the items themselves; QUEST_COMPLETED and SKILL_LEVEL have one more condition on top. */
		private List<ItemNeed> items;
		private String chatPattern;
		private Integer varbitId;
		private Integer targetValue;

		String problem()
		{
			if (levels != null)
			{
				if (levels.size() > MAX_LIST)
				{
					return "list too long";
				}
				for (LevelNeed l : levels)
				{
					if (l == null || skillOf(l.skill) == null || l.level < 1 || l.level > 99)
					{
						return "invalid auto-tick level";
					}
				}
			}
			if (items != null)
			{
				if (items.size() > MAX_LIST)
				{
					return "list too long";
				}
				for (ItemNeed i : items)
				{
					if (i == null || i.problem() != null)
					{
						return "invalid auto-tick item";
					}
				}
			}
			return null;
		}
	}

	/** A skill level for auto-tick: the key as in the app ("attack", "fishing") and the level. */
	@Data
	public static class LevelNeed
	{
		private String skill;
		private int level;
	}

	/**
	 * An item for auto-tick: how many of it the player must have, in the bag, worn, as notes and in the bank together.
	 * Several names are counted together ("Shrimps" and "Anchovies"). The ID is for when different items share one
	 * name (the Dragon Slayer I map pieces): then only the ID is counted.
	 */
	@Data
	public static class ItemNeed
	{
		private List<String> names;
		private Integer id;
		private int count;

		String problem()
		{
			if (names == null || names.isEmpty() || names.size() > MAX_LIST)
			{
				return "names required";
			}
			for (String n : names)
			{
				if (n == null || n.trim().isEmpty() || tooLong(n))
				{
					return "invalid name";
				}
			}
			if (id != null && (id <= 0 || id >= NavTarget.MAX_ITEM_ID))
			{
				return "invalid ID";
			}
			if (count < 1 || count > ShoppingPlan.MAX_COUNT)
			{
				return "invalid count";
			}
			return null;
		}
	}

	/** A skill by the app's key ("attack", "fishing"), the same as OsrsPathBridgePlugin.skillKey. null means there is no such skill. */
	static Skill skillOf(String key)
	{
		if (key == null)
		{
			return null;
		}
		for (Skill s : Skill.values())
		{
			if (!"OVERALL".equals(s.name()) && s.getName().toLowerCase(Locale.ROOT).equals(key))
			{
				return s;
			}
		}
		return null;
	}

	/**
	 * Validation and preparation after JSON parsing. Returns an error text, or null if all is well.
	 * Names are compared without case and colour tags, as the game shows them.
	 */
	String prepare()
	{
		if (stepId == null || !stepId.matches("S\\d-\\d{2}"))
		{
			return "stepId must look like S1-03";
		}
		if (tooLong(title) || tooLong(goal) || (worldPoint != null && tooLong(worldPoint.label)))
		{
			return "text too long";
		}
		for (List<?> list : new List<?>[]{groundTiles, npcNames, npcIds, objectNames, objectIds, dialogChoices, highlightItems, checklist, pathWaypoints, watchItems})
		{
			if (list != null && list.size() > MAX_LIST)
			{
				return "list too long";
			}
		}
		if (groundTiles != null)
		{
			for (GroundTile t : groundTiles)
			{
				if (t == null || tooLong(t.label))
				{
					return "invalid tile";
				}
			}
		}
		if (pathWaypoints != null)
		{
			for (WorldPointDto p : pathWaypoints)
			{
				if (p == null || tooLong(p.label) || p.plane < 0 || p.plane > 3)
				{
					return "invalid waypoint";
				}
			}
		}
		if (checklist != null)
		{
			for (ChecklistItem i : checklist)
			{
				if (i == null || i.name == null || i.name.isEmpty() || tooLong(i.name) || i.count < 1 || i.count > ShoppingPlan.MAX_COUNT)
				{
					return "invalid check item";
				}
			}
		}
		if (useOn != null)
		{
			if (useOn.size() > 8)
			{
				return "list too long";
			}
			for (UseOn u : useOn)
			{
				if (u == null || u.item == null || u.item.isEmpty() || u.target == null || u.target.isEmpty() || tooLong(u.item) || tooLong(u.target)
					|| (u.kind != null && !u.kind.matches("object|npc|item|")))
				{
					return "invalid 'use' action";
				}
			}
		}
		if (maxHit != null && (maxHit < 1 || maxHit > 200))
		{
			return "invalid max hit";
		}
		if (pacing != null && pacing.problem() != null)
		{
			return pacing.problem();
		}
		if (guide != null && guide.problem() != null)
		{
			return guide.problem();
		}
		if (completionTrigger != null && completionTrigger.problem() != null)
		{
			return completionTrigger.problem();
		}
		for (List<String> list : List.of(nonNull(npcNames), nonNull(objectNames), nonNull(dialogChoices), nonNull(highlightItems), nonNull(watchItems)))
		{
			for (String s : list)
			{
				if (s == null || tooLong(s))
				{
					return "invalid name";
				}
			}
		}
		npcNameSet = names(npcNames);
		objectNameSet = names(objectNames);
		itemNameSet = names(highlightItems);
		// The target and item of the "use" action are highlighted like everything else from the step.
		for (UseOn u : nonNull(useOn))
		{
			itemNameSet.add(nameKey(u.item));
			if (u.isObject())
			{
				objectNameSet.add(nameKey(u.target));
			}
			else if (u.isNpc())
			{
				npcNameSet.add(nameKey(u.target));
			}
			else
			{
				itemNameSet.add(nameKey(u.target));
			}
		}
		dialogSet = new HashSet<>();
		for (String d : nonNull(dialogChoices))
		{
			dialogSet.add(dialogKey(d));
		}
		npcIdSet = npcIds == null ? Collections.emptySet() : new HashSet<>(npcIds);
		objectIdSet = objectIds == null ? Collections.emptySet() : new HashSet<>(objectIds);
		return null;
	}

	/** A name as a comparison key: without tags, without non-breaking spaces, in lower case. */
	static String nameKey(String s)
	{
		if (s == null)
		{
			return "";
		}
		String t = TAGS.matcher(s).replaceAll("").replace(' ', ' ');
		return SPACES.matcher(t).replaceAll(" ").trim().toLowerCase(Locale.ROOT);
	}

	/** A dialogue option as a key: also without a trailing full stop or exclamation mark, which the wiki writes inconsistently. */
	static String dialogKey(String s)
	{
		String t = nameKey(s).replace('’', '\'');
		return TRAILING_PUNCT.matcher(t).replaceAll("").trim();
	}

	static Set<String> names(List<String> list)
	{
		Set<String> out = new HashSet<>();
		for (String s : nonNull(list))
		{
			out.add(nameKey(s));
		}
		return out;
	}

	private static <T> List<T> nonNull(List<T> list)
	{
		return list == null ? Collections.emptyList() : list;
	}

	static boolean tooLong(String s)
	{
		return s != null && s.length() > MAX_TEXT;
	}
}
