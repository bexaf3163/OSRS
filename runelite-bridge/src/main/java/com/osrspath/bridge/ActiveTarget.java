package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.Data;
import net.runelite.api.Skill;
import com.osrspath.bridge.TargetGuide.ChecklistItem;
import com.osrspath.bridge.TargetGuide.Guide;
import com.osrspath.bridge.TargetNeeds.Pacing;
import com.osrspath.bridge.TargetNeeds.Trigger;
import com.osrspath.bridge.TargetStages.Stage;

/**
 * The current step sent by the app: the same as InGameTarget in src/types/inGame.ts, plus the step's code and title.
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
				if (i == null || i.name == null || i.name.isEmpty() || tooLong(i.name) || i.count < 1 || i.count > ShoppingPlan.MAX_COUNT
					|| (i.doses != null && (i.doses < 1 || i.doses > ShoppingPlan.MAX_COUNT)))
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
		// A quest without stage data still has its walkthrough: without this the game showed only "Reldo, ~7 tiles" for the whole of Shield of Arrav.
		if (guide != null && guide.stage == null && guide.steps != null && guide.steps.size() >= 2
			&& completionTrigger != null && "QUEST_COMPLETED".equals(completionTrigger.getType()))
		{
			guide.stage = Stage.manual(guide.steps);
		}
		return null;
	}

	/** A quoted answer in a line's "Dialogue: “A” → “B”". */
	private static final Pattern QUOTED = Pattern.compile("[“\"]([^”\"]{1,120})[”\"]");

	/**
	 * The dialogue options a stage line names, as comparison keys: what follows "Dialogue:" in its text, each answer in quotes. The game offers the
	 * options of a conversation one menu at a time; the widget overlay frames the one whose key is in this set (the step's own list in dialogChoices
	 * covers only the conversation the step starts with, and a stage line has its own: Baraek's "Can you tell me where I can find the Phoenix Gang?").
	 */
	static Set<String> dialogKeysOf(String text)
	{
		Set<String> out = new HashSet<>();
		int at = text == null ? -1 : text.indexOf("Dialogue:");
		if (at < 0)
		{
			return out;
		}
		java.util.regex.Matcher m = QUOTED.matcher(text.substring(at));
		while (m.find())
		{
			String key = dialogKey(m.group(1));
			if (!key.isEmpty())
			{
				out.add(key);
			}
		}
		return out;
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

	static <T> List<T> nonNull(List<T> list)
	{
		return list == null ? Collections.emptyList() : list;
	}

	static boolean tooLong(String s)
	{
		return s != null && s.length() > MAX_TEXT;
	}
}
