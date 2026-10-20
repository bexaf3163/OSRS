package com.osrspath.bridge;

import java.awt.Color;
import java.util.ArrayList;
import java.util.List;
import lombok.Value;

/**
 * The in-game guide's clicks and the text rules it shares with the side panel. Until 2.73 this class also laid out the "What you need" card; since 2.74.0
 * the one HUD's content comes from {@link HudModel} and its drawing from {@link OsrsPathGuideOverlay}. What stays here: what a click on the guide does
 * ({@link Action}), and how a quest's fixed stage text is read against the bag (an errand already done is cut, an alternative is set apart).
 */
final class GuideList
{
	enum Kind
	{
		/** Not a button: a click on the guide simply does not go through to the game. */
		NONE,
		/** The header: open or close the details. */
		TOGGLE,
		/** A line with a place: the arrow and the path there. */
		PLACE,
		/** The arrow back to the step. */
		BACK,
		/** A step the game will not see by itself (several in a row at one place) is done: show the next one. */
		NEXT,
		/** View the previous step of the stage (briefly: after that the cursor is led by the facts in the game again). */
		PREV,
		/** End viewing: the cursor follows the facts again. */
		RESUME,
		/** The purchase detour: the arrow and the path to the stop the app suggests. */
		DETOUR,
		/** The recommended way that is not walking: the arrow to its first stop and a frame on the item it uses. */
		TRANSPORT,
		/** "More advice": show or hide the optional recommendations under the guide's details. */
		MORE,
	}

	@Value
	static class Action
	{
		static final Action NONE = new Action(Kind.NONE, -1);
		static final Action TOGGLE = new Action(Kind.TOGGLE, -1);
		static final Action BACK = new Action(Kind.BACK, -1);
		static final Action NEXT = new Action(Kind.NEXT, -1);
		static final Action PREV = new Action(Kind.PREV, -1);
		static final Action RESUME = new Action(Kind.RESUME, -1);
		static final Action DETOUR = new Action(Kind.DETOUR, -1);
		static final Action TRANSPORT = new Action(Kind.TRANSPORT, -1);
		static final Action MORE = new Action(Kind.MORE, -1);

		Kind kind;
		/** The number of the step's point for PLACE. */
		int place;

		static Action place(int index)
		{
			return new Action(Kind.PLACE, index);
		}

		boolean isClickable()
		{
			return kind != Kind.NONE;
		}
	}

	/** The colour of a clickable line: it can be clicked. */
	static final Color LINK = new Color(140, 200, 255);

	private GuideList()
	{
	}

	/**
	 * Where a second way of doing the same thing begins ("Defeat the Guardian or mine 4 pillars"): the index of " or ", or -1. Only a whole
	 * alternative is set apart: not an "or" inside a bracket ("essence (rune or pure)") and not one in a restriction after a colon
	 * ("melee or ranged only"), where muting the tail would hide part of the instruction itself.
	 */
	static int alternativeAt(String action)
	{
		if (action == null)
		{
			return -1;
		}
		int at = action.indexOf(" or ");
		if (at <= 0)
		{
			return -1;
		}
		String head = action.substring(0, at);
		long open = head.chars().filter(ch -> ch == '(').count();
		long close = head.chars().filter(ch -> ch == ')').count();
		return open != close || head.indexOf(':') >= 0 ? -1 : at;
	}

	/**
	 * The step line without its recipe: a tail after ";" goes ("; buy rope too"), a bracket keeps only what stands before a colon, that is who
	 * ("(Aggie: 2 onions + 5 gp)" becomes "(Aggie)"), and a bracket with no colon is the recipe and goes ("(3 balls of wool)"), unless it is only a
	 * name or two: a place or a menu option ("(Falador)", "(Drink From)") stays.
	 */
	static String concise(String s)
	{
		if (s == null)
		{
			return "";
		}
		String t = s;
		int semi = t.indexOf(';');
		if (semi > 0)
		{
			t = t.substring(0, semi);
		}
		StringBuilder out = new StringBuilder();
		for (int i = 0; i < t.length(); i++)
		{
			char c = t.charAt(i);
			if (c != '(')
			{
				out.append(c);
				continue;
			}
			int depth = 0;
			int end = -1;
			for (int j = i; j < t.length(); j++)
			{
				if (t.charAt(j) == '(')
				{
					depth++;
				}
				else if (t.charAt(j) == ')' && --depth == 0)
				{
					end = j;
					break;
				}
			}
			if (end < 0)
			{
				out.append(c);
				continue;
			}
			String inner = t.substring(i + 1, end);
			int colon = inner.indexOf(':');
			if (colon > 0)
			{
				out.append('(').append(inner.substring(0, colon).trim()).append(')');
			}
			else if (NAME.matcher(inner.trim()).matches())
			{
				out.append('(').append(inner.trim()).append(')');
			}
			i = end;
		}
		return out.toString().replaceAll("\\s+", " ").replaceAll("\\s+([,.;:!?])", "$1").trim();
	}

	/** One to three words, each with a capital and no digit: a name ("Falador", "Drink From", "Port Sarim"), not a recipe ("3 balls of wool"). */
	private static final java.util.regex.Pattern NAME = java.util.regex.Pattern.compile("\\p{Lu}[\\p{L}'-]*(?: \\p{Lu}[\\p{L}'-]*){0,2}");

	// ------------------------------------------------------------------------------------------------------------
	// Stage lines that know the bag. A stage line is the quest's fixed walkthrough text ("buy rope too"), so it cannot know what you already hold. The
	// item list of the step can, so the items a line talks about are found in it and the line is read against the bag. Nothing is rewritten on a guess:
	// only a clause whose every mentioned item is in the bag is dropped.

	private static final java.util.regex.Pattern WORD = java.util.regex.Pattern.compile("[\\p{L}\\p{N}']+");
	/** A clause that starts with one of these is an errand ("buy rope too"): it can be done already. */
	private static final java.util.regex.Pattern ERRAND = java.util.regex.Pattern.compile("^(buy|get|bring|take|grab|pick up|purchase|fetch|obtain|collect)\\b.*", java.util.regex.Pattern.CASE_INSENSITIVE);

	/** The item name without its count: "Ball of wool ×3" is "Ball of wool". */
	static String baseName(String name)
	{
		return name == null ? "" : name.replaceAll("\\s*[×x]\\s*\\d+\\+?\\s*$", "").trim();
	}

	/** Words in lower case, a plural "s" cut from words longer than three letters (the same cut on both sides): "3 balls of wool" holds "Ball of wool". */
	static List<String> stems(String s)
	{
		List<String> out = new ArrayList<>();
		java.util.regex.Matcher m = WORD.matcher(s == null ? "" : s.toLowerCase(java.util.Locale.ROOT));
		while (m.find())
		{
			String w = m.group();
			out.add(w.length() > 3 && w.endsWith("s") ? w.substring(0, w.length() - 1) : w);
		}
		return out;
	}

	/** Whether the text names the item: all the words of the item, in a row. */
	static boolean mentions(String text, String itemName)
	{
		List<String> t = stems(text);
		List<String> n = stems(baseName(itemName));
		if (n.isEmpty())
		{
			return false;
		}
		for (int i = 0; i + n.size() <= t.size(); i++)
		{
			if (t.subList(i, i + n.size()).equals(n))
			{
				return true;
			}
		}
		return false;
	}

	/** The items of the step that a line names. An item obtained during the step ("in step") is not an errand to check. */
	static List<StepGuide.ItemLine> mentioned(StepGuide.View v, String text)
	{
		List<StepGuide.ItemLine> out = new ArrayList<>();
		for (StepGuide.ItemLine i : v.getItems())
		{
			if (i.getHave() != StepGuide.Have.IN_STEP && mentions(text, i.getName()))
			{
				out.add(i);
			}
		}
		return out;
	}

	/**
	 * The full step text with the errands that are already done cut out: after a ";" a clause that starts with buy, get, bring... and whose every named item is in
	 * the bag goes ("; buy rope too" when the rope is in the bag). A clause that names no item of the step, or names one that is not in the bag, stays.
	 */
	static String withoutDoneErrands(StepGuide.View v, String full)
	{
		if (full == null || full.indexOf(';') < 0)
		{
			return full == null ? "" : full;
		}
		String[] parts = full.split(";");
		StringBuilder out = new StringBuilder(parts[0].trim());
		for (int i = 1; i < parts.length; i++)
		{
			String clause = parts[i].trim();
			List<StepGuide.ItemLine> named = mentioned(v, clause);
			boolean done = ERRAND.matcher(clause).matches() && !named.isEmpty() && named.stream().allMatch(GuideList::got);
			if (!done)
			{
				out.append("; ").append(clause);
			}
		}
		return out.toString();
	}

	/** Items that are not with you yet: neither taken nor handed in. */
	static List<StepGuide.ItemLine> pending(List<StepGuide.ItemLine> items)
	{
		List<StepGuide.ItemLine> out = new ArrayList<>();
		for (StepGuide.ItemLine i : items)
		{
			if (!got(i))
			{
				out.add(i);
			}
		}
		return out;
	}

	/** Items that must be taken right now: not yet obtained and not "during" the quest. */
	static List<StepGuide.ItemLine> pendingNow(List<StepGuide.ItemLine> items)
	{
		List<StepGuide.ItemLine> out = new ArrayList<>();
		for (StepGuide.ItemLine i : pending(items))
		{
			if (i.getHave() != StepGuide.Have.IN_STEP)
			{
				out.add(i);
			}
		}
		return out;
	}

	/** The item is already obtained: in the bag now or was in it during this step (handed in, used). */
	static boolean got(StepGuide.ItemLine i)
	{
		return i.getHave() == StepGuide.Have.BAG || i.getHave() == StepGuide.Have.DONE;
	}

	/** "S2-07 · " from a heading like "[S2-07] Title"; empty means there is no code. */
	static String code(StepGuide.View v)
	{
		String t = v.getTitle();
		if (t == null || !t.startsWith("["))
		{
			return "";
		}
		int end = t.indexOf(']');
		return end > 1 ? t.substring(1, end) + " · " : "";
	}

	static String stageTitle(StepGuide.StageView s)
	{
		return s.isFinished() ? "Quest complete ✓" : "Stage " + s.getIndex() + " of " + s.getTotal();
	}
}
