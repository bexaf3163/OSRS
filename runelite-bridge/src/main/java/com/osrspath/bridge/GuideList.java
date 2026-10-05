package com.osrspath.bridge;

import java.awt.Color;
import java.awt.FontMetrics;
import java.util.ArrayList;
import java.util.List;
import lombok.Value;

/**
 * The "What you need" list right on the game screen, under the HUD: the step's items (have, in bank, missing, during the step) with "where to get it"
 * and the step's points with NPCs. A line with a place is a button: a click sets a temporary target (arrow, tile, Shortest Path,
 * NPC highlight), and on arrival the arrow returns to the step. This used to be only in the app; in the game the HUD wrote
 * "Bag: missing 1 of 1".
 *
 * Only the row layout is here: pure logic for tests. {@link OsrsPathGuideOverlay} draws it and catches the clicks,
 * {@link GuideMouse}.
 */
final class GuideList
{
	enum Kind
	{
		/** Not a button: a click on the list simply does not go through to the game. */
		NONE,
		/** The heading: collapse or expand the list. */
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
		/** Switch the list tab: "Steps" / "Tip". */
		TAB,
		/** The purchase detour: the arrow and the path to the stop the app suggests. */
		DETOUR,
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
		static final Action TAB = new Action(Kind.TAB, -1);
		static final Action DETOUR = new Action(Kind.DETOUR, -1);

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

	/** One line of text: left and (optionally) right. small is a small font ("where to get it", the hint). */
	@Value
	static class Line
	{
		String left;
		Color leftColor;
		String right;
		Color rightColor;
		boolean small;
	}

	@Value
	static class Row
	{
		List<Line> lines;
		Action action;
		/** The hint at the bottom of the list while the mouse is over a line: the full text and what a click does; null means none. */
		String hint;
	}

	static final Color TITLE = OsrsPathHudOverlay.TITLE;
	static final Color TEXT = OsrsPathHudOverlay.TEXT;
	static final Color MUTED = new Color(175, 175, 175);
	/** The "where to get it" of a button line in link colour: it can be clicked. */
	static final Color LINK = new Color(140, 200, 255);
	static final int MAX_ITEMS = 8;
	static final int MAX_PLACES = 8;
	/** More than this many items or places: "where to get it" and labels go on one line. */
	static final int COMPACT_ITEMS = 4;
	static final int COMPACT_PLACES = 3;
	/** Lines of "where to get it" and place labels; the full text is in the hover hint. */
	static final int WHERE_LINES = 2;
	static final int PLACE_LINES = 2;
	private static final String INDENT = "   ";
	private static final String GAP = "  ";

	private GuideList()
	{
	}

	/**
	 * Whether the list is visible on screen now: enabled, not collapsed (a collapsed one is a single line, with no details), has something
	 * to show and, in the smart view, the moment is right (while travelling and at the exchange it would block the view).
	 */
	static boolean shown(boolean enabled, boolean collapsed, StepGuide.View v, boolean smart, SmartView.Context context)
	{
		return enabled && !collapsed && worthShowing(v) && !(smart && !SmartView.showsGuide(context));
	}

	/** Whether to show the list: there are items, several places, a temporary target or a message. Otherwise the HUD is enough. */
	static boolean worthShowing(StepGuide.View v)
	{
		return v != null && v.getTitle() != null
			&& (!v.getItems().isEmpty() || v.getPlaces().size() > 1 || v.getDetour() != null || v.getNote() != null || v.getStage() != null);
	}

	/** In the brief view (the "smart reveal"): "where to get it" and places on one line, long lists shorter. */
	static final int TERSE_ITEMS = 5;
	static final int TERSE_PLACES = 3;

	/** The list lines. fm is the normal font, small the small one; width is the plate's width. */
	static List<Row> rows(StepGuide.View v, boolean collapsed, FontMetrics fm, FontMetrics small, int width)
	{
		return rows(v, collapsed, fm, small, width, false);
	}

	/**
	 * The list lines. terse is the brief view for the game: "where to get" descriptions are not stretched over several lines, and stay in full
	 * in the hover hint and in the app window.
	 */
	static List<Row> rows(StepGuide.View v, boolean collapsed, FontMetrics fm, FontMetrics small, int width, boolean terse)
	{
		final int maxItems = terse ? TERSE_ITEMS : MAX_ITEMS;
		final int maxPlaces = terse ? TERSE_PLACES : MAX_PLACES;
		int inner = OverlayText.inner(width);
		List<Row> out = new ArrayList<>();
		// The step has no items: it is a list of places, so the heading is "Where to go", without a second one below.
		StepGuide.StageView stage = v.getStage();
		boolean placesOnly = v.getItems().isEmpty() && stage == null;
		String heading = stage != null ? stageTitle(stage) : placesOnly ? "Where to go" : "What you need";
		// The step code goes first: the HUD with the step name is gone, and which task you are on must always be visible.
		out.add(headerRow(v, collapsed, heading, fm, inner));
		if (collapsed)
		{
			return out;
		}
		recoveryRows(out, v.getPrep(), fm, small, inner);
		// The app's tips ("Don't take now", weight, bag) are on a separate tab: on the game screen they do not belong among the steps.
		int advice = adviceCount(v.getPrep());
		boolean onAdvice = v.isAdviceTab() && advice > 0;
		if (advice > 0)
		{
			out.add(tabRow(onAdvice, advice, fm, inner));
		}
		if (onAdvice)
		{
			adviceRows(out, v.getPrep(), small, inner);
			return out;
		}
		if (v.getNote() != null)
		{
			out.add(new Row(text(v.getNote(), MUTED, small, inner, true), Action.NONE, null));
		}
		if (v.getDetour() != null)
		{
			out.add(new Row(text("← Arrow back to the step", StepGuide.BANK, fm, inner, false), Action.BACK,
				"The arrow now points to: " + v.getDetour() + ". Click to point the arrow and path back to the step."));
		}
		if (stage != null)
		{
			if (stage.isFinished())
			{
				out.add(new Row(text("Quest complete - the step will tick itself.", StepGuide.GOOD, fm, inner, false), Action.NONE, null));
				return out;
			}
			stageRows(out, stage, fm, small, inner);
			Row bag = bagRow(v.getItems(), small, inner);
			if (bag != null)
			{
				out.add(bag);
			}
		}
		if (v.getPrep() != null && v.getPrep().hasDetour())
		{
			out.add(detourRow(v.getPrep(), fm, inner));
		}
		// A long list (Prince Ali Rescue: 12 items and 8 NPCs) must not cover half the screen: "where to get it" and places go
		// on one line, in full in the hover hint. What is missing goes on top, what is already in the bag goes down.
		List<StepGuide.ItemLine> all = ordered(v.getItems());
		// On a stage only what is still needed: what was taken and handed in ("✓ done", "✓ have") no longer asks for attention and takes space for nothing.
		// "In step" (you get it yourself in this quest) is not shown among "Needed now": it is not something to take now, and it is already visible in the stage lines
		// and the highlighted items.
		List<StepGuide.ItemLine> items = stage != null ? pendingNow(all) : all;
		if (stage != null && !items.isEmpty())
		{
			out.add(new Row(text("Needed now", MUTED, small, inner, true), Action.NONE, null));
		}
		int whereLines = terse || items.size() > COMPACT_ITEMS ? 1 : WHERE_LINES;
		for (int i = 0; i < Math.min(items.size(), maxItems); i++)
		{
			out.add(item(items.get(i), v.getPlaces(), fm, small, inner, whereLines, v.getPrep()));
		}
		if (items.size() > maxItems)
		{
			out.add(new Row(text("… " + (items.size() - maxItems) + " more", MUTED, small, inner, true), Action.NONE, "The rest is in the OSRS Path panel on the right."));
		}
		// Everything is collected, so what to do next: the last item of the step's quick path ("Give everything to Hetty...").
		if (v.getNext() != null)
		{
			out.add(new Row(text("▶ Next: " + ShortText.of(v.getNext()), StepGuide.GOOD, fm, inner, true), Action.NONE, "Next: " + v.getNext()));
		}
		// The places where the items of the list above are obtained are already buttons in the item lines: we do not show them a second time.
		// Except the first: the step's own point (the quest NPC) is always in "Where to go", even if they hand out an item.
		List<StepGuide.PlaceLine> places = new ArrayList<>();
		for (StepGuide.PlaceLine p : v.getPlaces())
		{
			// A stage of several steps with a tile: the current step says where to go (the arrow already leads to it); the stage's point
			// as a whole ("dungeon entrance") goes stale towards the end of the stage and only gets in the way.
			if (leadsByStep(stage))
			{
				break;
			}
			if (p.getIndex() == 0 || !itemPlace(all, p, v.getFinale(), maxItems))
			{
				places.add(p);
			}
		}
		if (!places.isEmpty())
		{
			if (stage != null)
			{
				out.add(new Row(text("Where to go", MUTED, small, inner, true), Action.NONE, null));
			}
			else if (!placesOnly)
			{
				out.add(new Row(text("Where to go", TITLE, fm, inner, false), Action.NONE, null));
			}
			int placeLines = terse || places.size() > COMPACT_PLACES ? 1 : PLACE_LINES;
			for (int i = 0; i < Math.min(places.size(), maxPlaces); i++)
			{
				out.add(place(places.get(i), fm, inner, placeLines));
			}
			if (places.size() > maxPlaces)
			{
				out.add(new Row(text("… " + (places.size() - maxPlaces) + " more", MUTED, small, inner, true), Action.NONE, "The rest is in the OSRS Path panel on the right."));
			}
		}
		return out;
	}

	/** The heading row: the step code, the stage or "What you need", the readiness percent, and the fold arrow. */
	static Row headerRow(StepGuide.View v, boolean collapsed, String heading, FontMetrics fm, int inner)
	{
		StepGuide.StageView stage = v.getStage();
		return new Row(pair(code(v) + (collapsed ? summary(v) : heading) + percent(v), stage != null && stage.isFinished() ? StepGuide.GOOD : TITLE,
			collapsed ? "▼" : "▲", MUTED, fm, inner, false),
			Action.TOGGLE, (v.getTitle() == null ? "" : v.getTitle() + ". ")
				+ (collapsed ? "Click to expand: what you need and where to go." : "Click to collapse the list to one line."));
	}

	// ------------------------------------------------------------------------------------------------------------
	// The strict two-line view. By default the list is the heading and the step you are on; everything else opens while the mouse is over the card.

	/** The card opens in this many steps (rows are revealed one portion at a time), over about this long. */
	static final int EXPAND_STEPS = 8;
	static final long EXPAND_NANOS = 160_000_000L;
	/** The card stays open this long after the mouse left it, so a pixel of edge or a tick of lag never makes it blink. */
	static final long COLLAPSE_GRACE_NANOS = 350_000_000L;

	/** Whether the card should be open: the mouse is over it, or just left (sinceOverNanos is negative if it never was over). */
	static boolean expandWanted(boolean over, long sinceOverNanos)
	{
		return over || (sinceOverNanos >= 0 && sinceOverNanos < COLLAPSE_GRACE_NANOS);
	}

	/** How many of the {@link #EXPAND_STEPS} portions are shown this long after the card started to open: at least one at once, all after EXPAND_NANOS. */
	static int revealSteps(long sinceExpandNanos)
	{
		long s = Math.max(0, sinceExpandNanos);
		return (int) Math.min(EXPAND_STEPS, 1 + s * EXPAND_STEPS / EXPAND_NANOS);
	}

	/**
	 * The step line without its recipe: a tail after ";" goes ("; buy rope too"), a bracket keeps only what stands before a colon, that is who
	 * ("(Aggie: 2 onions + 5 gp)" becomes "(Aggie)"), and a bracket with no colon is the recipe and goes ("(3 balls of wool)").
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
			i = end;
		}
		return out.toString().replaceAll("\\s+", " ").replaceAll("\\s+([,.;:!?])", "$1").trim();
	}

	// ------------------------------------------------------------------------------------------------------------
	// Stage lines that know the bag. A stage line is the quest's fixed walkthrough text ("buy rope too"), so it cannot know what you already hold. The
	// item list of the step can, so the items a line talks about are found in it and the line is read against the bag. Nothing is rewritten on a guess:
	// only a clause whose every mentioned item is in the bag is dropped, and the bag check is a separate row.

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

	/**
	 * What the bag says about the items a step line names: "You have: Rope · in the bank: Bronze bar · still needed: Onion ×2 · not checked: Ashes". Every state is
	 * said apart, so an item that was not checked is never called missing. null when the line names none of the step's items.
	 */
	static Row bagCheckRow(StepGuide.View v, String lineText, FontMetrics small, int inner)
	{
		List<String> have = new ArrayList<>();
		List<String> bank = new ArrayList<>();
		List<String> need = new ArrayList<>();
		List<String> unknown = new ArrayList<>();
		for (StepGuide.ItemLine i : mentioned(v, lineText))
		{
			switch (i.getHave())
			{
				case BAG:
				case DONE:
					have.add(i.getName());
					break;
				case BANK:
					bank.add(i.getName());
					break;
				case NONE:
					need.add(i.getName());
					break;
				case UNKNOWN:
					unknown.add(i.getName());
					break;
				default:
					break;
			}
		}
		List<String> parts = new ArrayList<>();
		if (!have.isEmpty())
		{
			parts.add("You have: " + String.join(", ", have));
		}
		if (!bank.isEmpty())
		{
			parts.add("in the bank: " + String.join(", ", bank));
		}
		if (!need.isEmpty())
		{
			parts.add("still needed: " + String.join(", ", need));
		}
		if (!unknown.isEmpty())
		{
			parts.add("not checked: " + String.join(", ", unknown));
		}
		if (parts.isEmpty())
		{
			return null;
		}
		String text = String.join(" · ", parts);
		boolean allGood = bank.isEmpty() && need.isEmpty() && unknown.isEmpty();
		return new Row(clip("", text, allGood ? StepGuide.GOOD : MUTED, small, inner, 2, true), Action.NONE, text);
	}

	/** The step on the cursor of the stage, or null if the list has no stage or it is done. */
	private static ActiveTarget.StageLine nowLine(StepGuide.View v)
	{
		StepGuide.StageView s = v.getStage();
		if (s == null || s.isFinished() || s.getSteps() == null || s.getSteps().isEmpty())
		{
			return null;
		}
		return s.getSteps().get(Math.max(0, Math.min(s.getCursor(), s.getSteps().size() - 1)));
	}

	/** The two rows that are always there: the heading and the step you are on ("▶ [2/6] Dye the wig yellow (Aggie)"). */
	static List<Row> coreRows(StepGuide.View v, FontMetrics fm, int width)
	{
		int inner = OverlayText.inner(width);
		StepGuide.StageView stage = v.getStage();
		String heading = stage != null ? stageTitle(stage) : v.getItems().isEmpty() ? "Where to go" : "What you need";
		List<Row> out = new ArrayList<>();
		out.add(headerRow(v, false, heading, fm, inner));
		ActiveTarget.StageLine now = nowLine(v);
		if (now != null)
		{
			int n = stage.getSteps().size();
			int cur = Math.max(0, Math.min(stage.getCursor(), n - 1));
			String text = "▶ [" + (cur + 1) + "/" + n + "] " + concise(now.shown());
			out.add(new Row(clip("", (stage.isPeeking() ? "viewing · " : "") + text, stage.isPeeking() ? MUTED : TITLE, fm, inner, 2, false), Action.NONE, now.getT()));
		}
		else if (stage != null && stage.isFinished())
		{
			out.add(new Row(text("Quest complete - the step will tick itself.", StepGuide.GOOD, fm, inner, false), Action.NONE, null));
		}
		else if (v.getNote() != null && v.getItems().isEmpty())
		{
			out.add(new Row(clip("", ShortText.of(v.getNote()), MUTED, fm, inner, 1, false), Action.NONE, v.getNote()));
		}
		else
		{
			out.add(new Row(clip("", summary(v), TEXT, fm, inner, 1, false), Action.NONE, null));
		}
		return out;
	}

	/** What must not be hidden even in the strict view: a warning about the step and the recovery mode after a death. */
	static List<Row> alertRows(StepGuide.View v, FontMetrics fm, int width)
	{
		int inner = OverlayText.inner(width);
		List<Row> out = new ArrayList<>();
		StepGuide.StageView s = v.getStage();
		if (s != null && s.getWarning() != null)
		{
			out.add(new Row(clip("", "⚠ " + s.getWarning(), StepGuide.BANK, fm, inner, 2, true), Action.NONE, s.getWarning()));
		}
		PrepPlan prep = v.getPrep();
		if (prep != null && prep.hasDetour())
		{
			out.add(detourRow(prep, fm, inner));
		}
		if (prep != null && prep.hasRecovery())
		{
			String title = prep.getRecovery().getTitle() == null || prep.getRecovery().getTitle().isEmpty() ? "Recovery mode" : prep.getRecovery().getTitle();
			out.add(new Row(clip("", "⚠ " + title, StepGuide.BANK, fm, inner, 2, true), Action.NONE, String.join(" ", prep.getRecovery().getSteps())));
		}
		return out;
	}

	/**
	 * The list for the strict view: reveal is how many of {@link #EXPAND_STEPS} portions of the rest are shown (0 is the closed card: two rows, plus a warning
	 * or the recovery mode if there is one). The open card is the same two rows with the whole list under them: the recipe of the step, the tab strip,
	 * the next steps, the buttons, the bag, the items, the places. Nothing the full list shows is lost, it only waits for the mouse.
	 */
	static List<Row> expandedRows(StepGuide.View v, int reveal, FontMetrics fm, FontMetrics small, int width, boolean terse)
	{
		List<Row> core = coreRows(v, fm, width);
		if (reveal <= 0)
		{
			List<Row> closed = new ArrayList<>(core);
			closed.addAll(alertRows(v, fm, width));
			return closed;
		}
		List<Row> full = rows(v, false, fm, small, width, terse);
		ActiveTarget.StageLine now = nowLine(v);
		List<Row> extra = new ArrayList<>();
		if (now != null)
		{
			// The recipe of the step, without the errands the bag has already done; and what the bag says about the items it names.
			String detail = withoutDoneErrands(v, now.shown());
			if (!concise(now.shown()).equals(detail))
			{
				extra.add(new Row(clip("", "Details: " + detail, MUTED, small, OverlayText.inner(width), 2, true), Action.NONE, now.getT()));
			}
			Row bag = bagCheckRow(v, now.shown(), small, OverlayText.inner(width));
			if (bag != null)
			{
				extra.add(bag);
			}
		}
		for (int i = 1; i < full.size(); i++)
		{
			Row r = full.get(i);
			// The step line of the stage is already the second core row.
			if (now != null && r.getAction() == Action.NONE && now.getT() != null && now.getT().equals(r.getHint()))
			{
				continue;
			}
			extra.add(r);
		}
		int shown = (int) Math.ceil(extra.size() * (double) Math.min(reveal, EXPAND_STEPS) / EXPAND_STEPS);
		List<Row> out = new ArrayList<>(core);
		out.addAll(extra.subList(0, Math.min(shown, extra.size())));
		return out;
	}

	/** The suggested stop on the way, as one clickable row: a click points the arrow there. The app only suggests it. */
	static Row detourRow(PrepPlan prep, FontMetrics fm, int inner)
	{
		String text = prep.getDetour().getText();
		return new Row(clip("", "⚡ " + text, StepGuide.GOOD, fm, inner, 2, true), Action.DETOUR,
			text + ". Click to point the arrow at " + prep.getDetour().getLabel() + ". The app only suggests it: it buys nothing.");
	}

	/** How many tips the app has for the step: a detour, blockers, "will not fit", "don't take now", weight. */
	static int adviceCount(PrepPlan prep)
	{
		if (prep == null)
		{
			return 0;
		}
		return (prep.hasDetour() ? 1 : 0) + (prep.getBlockers() == null ? 0 : prep.getBlockers().size())
			+ (prep.getSlots() != null && !prep.getSlots().isEmpty() ? 1 : 0)
			+ (prep.getLater() != null && !prep.getLater().isEmpty() ? 1 : 0)
			+ (prep.getWeight() != null && !prep.getWeight().isEmpty() ? 1 : 0);
	}

	/** The tab strip: "Steps" on the left, "Tip · N" on the right; the active one in gold, the other in link blue (it can be clicked). A click on either switches. */
	static Row tabRow(boolean onAdvice, int advice, FontMetrics fm, int inner)
	{
		List<Line> lines = new ArrayList<>();
		lines.add(new Line("Steps", onAdvice ? LINK : TITLE, "Tip · " + advice, onAdvice ? TITLE : LINK, true));
		return new Row(lines, Action.TAB, onAdvice ? "Click to go back to the steps." : "Click for the app's tips: what not to take now, weight, bag.");
	}

	/** The text of the list lines in a row, as the player sees it, for the debug log and tests: "left ~right", lines separated by newlines. */
	static String plain(List<Row> rows)
	{
		StringBuilder sb = new StringBuilder();
		for (Row r : rows)
		{
			for (Line l : r.getLines())
			{
				if (sb.length() > 0)
				{
					sb.append('\n');
				}
				sb.append(l.getLeft());
				if (l.getRight() != null)
				{
					sb.append(" ~").append(l.getRight());
				}
			}
		}
		return sb.toString();
	}

	/** " · 82%" in the heading: how prepared the step is by the app's plan; at one hundred we do not write it. */
	static String percent(StepGuide.View v)
	{
		Integer p = v.getPrep() == null ? null : v.getPrep().pendingPercent();
		return p == null ? "" : " · " + p + "%";
	}

	/**
	 * Recovery mode (the app's plan): you died or teleported in the middle of a step, so what to do in order. The app
	 * computes it (it knows the bag, bank, step and where you are); the plugin only draws it: an amber heading and up to three items.
	 */
	static void recoveryRows(List<Row> out, PrepPlan prep, FontMetrics fm, FontMetrics small, int inner)
	{
		if (prep == null || !prep.hasRecovery())
		{
			return;
		}
		String title = prep.getRecovery().getTitle() == null || prep.getRecovery().getTitle().isEmpty()
			? "Recovery mode" : prep.getRecovery().getTitle();
		out.add(new Row(text("⚠ " + title, StepGuide.BANK, fm, inner, false), Action.NONE, String.join(" ", prep.getRecovery().getSteps())));
		List<String> steps = prep.getRecovery().getSteps();
		for (int i = 0; i < Math.min(steps.size(), RECOVERY_SHOWN); i++)
		{
			out.add(new Row(clip("", (i + 1) + ") " + steps.get(i), TEXT, small, inner, 2, true), Action.NONE, steps.get(i)));
		}
	}

	static final int RECOVERY_SHOWN = 3;

	/**
	 * The app's tips under the list: "Don't take now" (needed later, do not use bag space), weight and running, the bag does not
	 * fit, not allowed by level or quest. Each is one or two small lines; the full text is in the hint.
	 */
	static void adviceRows(List<Row> out, PrepPlan prep, FontMetrics small, int inner)
	{
		if (prep == null)
		{
			return;
		}
		if (prep.hasDetour())
		{
			out.add(detourRow(prep, small, inner));
		}
		if (prep.getBlockers() != null)
		{
			for (String b : prep.getBlockers())
			{
				out.add(new Row(clip("", "⚠ " + b, StepGuide.MISSING, small, inner, 2, true), Action.NONE, b));
			}
		}
		if (prep.getSlots() != null && !prep.getSlots().isEmpty())
		{
			out.add(new Row(clip("", "⚠ " + prep.getSlots(), StepGuide.BANK, small, inner, 2, true), Action.NONE, prep.getSlots()));
		}
		if (prep.getLater() != null && !prep.getLater().isEmpty())
		{
			String all = String.join(", ", prep.getLater());
			out.add(new Row(clip("", "Don't take now: " + all, MUTED, small, inner, 2, true), Action.NONE, "You will need these later: " + all + "."));
		}
		if (prep.getWeight() != null && !prep.getWeight().isEmpty())
		{
			out.add(new Row(clip("", "Weight: " + prep.getWeight(), MUTED, small, inner, 2, true), Action.NONE, prep.getWeight()));
		}
	}

	/** First what is missing (in route order), then what is already in the bag. */
	static List<StepGuide.ItemLine> ordered(List<StepGuide.ItemLine> items)
	{
		List<StepGuide.ItemLine> out = new ArrayList<>();
		for (StepGuide.ItemLine i : items)
		{
			if (!got(i))
			{
				out.add(i);
			}
		}
		for (StepGuide.ItemLine i : items)
		{
			if (got(i))
			{
				out.add(i);
			}
		}
		return out;
	}

	/** The current stage step says where to go by itself: there are several steps and the current one has a tile. */
	static boolean leadsByStep(StepGuide.StageView stage)
	{
		if (stage == null || stage.isFinished() || stage.getSteps().size() < 2)
		{
			return false;
		}
		return stage.getSteps().get(Math.max(0, Math.min(stage.getCursor(), stage.getSteps().size() - 1))).hasPoint();
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

	/**
	 * A place is not needed in "Where to go" if the shown item is obtained there: while it is missing, the item's line leads there
	 * (a button or "● arrow points there"), and once it is obtained there is no reason to go (Betty, the rat, the onion patch). The step's main point
	 * (index 0, the quest NPC) always stays: the quest business is there.
	 */
	private static boolean itemPlace(List<StepGuide.ItemLine> items, StepGuide.PlaceLine place, String finale, int shownItems)
	{
		boolean linked = false;
		boolean pending = false;
		for (int i = 0; i < Math.min(items.size(), shownItems); i++)
		{
			if (items.get(i).getPlace() != place.getIndex())
			{
				continue;
			}
			linked = true;
			pending |= !got(items.get(i));
		}
		if (!linked || pending || place.getNpc() == null)
		{
			return linked;
		}
		// Everything from here is taken and the place has an NPC: it is still needed only if the step ends with them ("Give everything to Hetty...").
		// There are no quick-path items, so we do not guess and keep the place: an extra line is better than a lost one.
		return finale != null && !finale.toLowerCase().contains(place.getNpc().toLowerCase());
	}

	/** The hint under the list for the line under the mouse, in a small font, in full. */
	static Row hint(String text, FontMetrics small, int width)
	{
		return new Row(text(text, TEXT, small, OverlayText.inner(width), true), Action.NONE, null);
	}

	/** Steps ahead of the current one that are shown: one is "Next", the rest as a counter; the full list is in the panel on the right. */
	static final int STAGE_AHEAD = 1;

	/**
	 * Stage steps: the current one bright, "3/4" on the right, under it in one grey line "Next" (with how many more after it on the right) and,
	 * if the step is not the first, "◀ Back" to reread the previous step. Moving forward by click is not possible: the current step is determined by
	 * what happens in the game (position, items), so you cannot click past it and get confused. The exception is "✓ Done -
	 * next" on steps the game does not see by itself (several in a row at one place): without it the list would get stuck. While you view a previous
	 * step, "▶ To current step" appears. The texts are short (StageLine.shown), the full text is in the hover
	 * hint. A warning ("Blurite ore is still in your bag") goes on top in amber.
	 */
	static void stageRows(List<Row> out, StepGuide.StageView stage, FontMetrics fm, FontMetrics small, int inner)
	{
		List<ActiveTarget.StageLine> lines = stage.getSteps();
		if (stage.getWarning() != null)
		{
			out.add(new Row(text("⚠ " + stage.getWarning(), StepGuide.BANK, small, inner, true), Action.NONE, stage.getWarning()));
		}
		if (lines.size() == 1)
		{
			out.add(new Row(clip("", lines.get(0).shown(), TEXT, fm, inner, 2, false), Action.NONE, lines.get(0).getT()));
			return;
		}
		int cur = Math.max(0, Math.min(stage.getCursor(), lines.size() - 1));
		ActiveTarget.StageLine now = lines.get(cur);
		String count = (stage.isPeeking() ? "viewing · " : "") + (cur + 1) + "/" + lines.size();
		out.add(new Row(pair("▶ " + now.shown(), stage.isPeeking() ? MUTED : TITLE, count, MUTED, fm, inner, false), Action.NONE, now.getT()));
		for (int i = cur + 1; i < Math.min(lines.size(), cur + 1 + STAGE_AHEAD); i++)
		{
			int after = lines.size() - i - 1;
			String next = "Next: " + lines.get(i).shown();
			List<Line> row = after > 0 ? pair(next, MUTED, "+" + after, MUTED, small, inner, true) : clip("", next, MUTED, small, inner, 1, true);
			out.add(new Row(row, Action.NONE, lines.get(i).getT() + (after > 0 ? " Steps after this one: " + after + " - in the OSRS Path panel on the right." : "")));
		}
		if (stage.isManual() && cur < lines.size() - 1)
		{
			out.add(new Row(text("✓ Done - next", LINK, small, inner, true), Action.NEXT,
				"Click: this step is done, show the next one. The button appears only on steps the game cannot see by itself: several in a row at one place."));
		}
		if (stage.isPeeking())
		{
			out.add(new Row(text("▶ To current step", LINK, small, inner, true), Action.RESUME,
				"Click to return to the step you are on according to the game. It returns by itself after a minute."));
		}
		if (cur > 0)
		{
			ActiveTarget.StageLine prev = lines.get(cur - 1);
			out.add(new Row(clip("", "◀ Back: " + prev.shown(), MUTED, small, inner, 1, true), Action.PREV,
				"Click to view the previous step: " + prev.getT() + " After a minute the list returns to the current step by itself."));
		}
	}

	/**
	 * On a stage the items already in the bag are left out of "Needed now" (a deliberate choice: they take space for nothing), so the list never
	 * said that the bag was read, and the stage lines ("buy rope too") are fixed walkthrough text. This one short row says how many of the step's
	 * items the game reports in the bag, and the hover hint names them. Only the bag counts as "in your bag"; handed-in items ("done") and ones
	 * obtained during the step are not part of the total. null means none of them is in the bag.
	 */
	static Row bagRow(List<StepGuide.ItemLine> items, FontMetrics small, int inner)
	{
		List<String> names = new ArrayList<>();
		int total = 0;
		for (StepGuide.ItemLine i : items)
		{
			if (i.getHave() == StepGuide.Have.BAG)
			{
				names.add(i.getName());
			}
			if (i.getHave() != StepGuide.Have.IN_STEP && i.getHave() != StepGuide.Have.DONE)
			{
				total++;
			}
		}
		if (names.isEmpty())
		{
			return null;
		}
		return new Row(clip("", "In your bag: " + names.size() + " of " + total + " items", StepGuide.GOOD, small, inner, 1, true), Action.NONE,
			"In your bag now, as the game reports it: " + String.join(", ", names) + ". The step lines above are the quest's fixed order; a line about something you already hold can be skipped.");
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

	/** The collapsed list in one line: "What you need: missing 2 · in bank 1". */
	static String summary(StepGuide.View v)
	{
		if (v.getStage() != null)
		{
			String base = stageTitle(v.getStage());
			if (v.getStage().isFinished() || v.getItems().isEmpty())
			{
				return base;
			}
			long missing = v.getItems().stream().filter(i -> !got(i) && i.getHave() != StepGuide.Have.IN_STEP).count();
			return missing > 0 ? base + " · " + missing + " missing" : base + " · all in your bag";
		}
		if (v.getItems().isEmpty())
		{
			int n = v.getPlaces().size();
			return "Where to go: " + n + (n == 1 ? " place" : " places");
		}
		int none = 0;
		int bank = 0;
		int inStep = 0;
		int unknown = 0;
		for (StepGuide.ItemLine i : v.getItems())
		{
			switch (i.getHave())
			{
				case NONE:
					none++;
					break;
				case BANK:
					bank++;
					break;
				case IN_STEP:
					inStep++;
					break;
				case UNKNOWN:
					unknown++;
					break;
				default:
					break;
			}
		}
		List<String> parts = new ArrayList<>();
		if (none > 0)
		{
			parts.add("missing " + none);
		}
		if (bank > 0)
		{
			parts.add("in bank " + bank);
		}
		if (unknown > 0)
		{
			parts.add("bank? " + unknown);
		}
		if (inStep > 0)
		{
			parts.add("in step " + inStep);
		}
		return "What you need: " + (parts.isEmpty() ? "all in your bag" : String.join(" · ", parts));
	}

	static String mark(StepGuide.Have h)
	{
		switch (h)
		{
			case BAG:
			case DONE:
				return "✓";
			case NONE:
				return "✗";
			case UNKNOWN:
				return "?";
			default:
				return "•";
		}
	}

	/**
	 * An item: "✗ Eye of newt ... none", under it "where to get it" (up to two lines). If there is a point where it is obtained, the line is a
	 * button, with "where to get it" in link colour. In the bag, one green line, not a button.
	 */
	static Row item(StepGuide.ItemLine i, List<StepGuide.PlaceLine> places, FontMetrics fm, FontMetrics small, int inner)
	{
		return item(i, places, fm, small, inner, WHERE_LINES);
	}

	static Row item(StepGuide.ItemLine i, List<StepGuide.PlaceLine> places, FontMetrics fm, FontMetrics small, int inner, int whereLines)
	{
		return item(i, places, fm, small, inner, whereLines, null);
	}

	/**
	 * An item with marks from the app's plan: instead of the generic "where to get it", what to do exactly for you ("Take it from the bank", "Buy it from
	 * Betty - 3 gp"), and for a supply that is running low, "low" instead of "have".
	 */
	static Row item(StepGuide.ItemLine i, List<StepGuide.PlaceLine> places, FontMetrics fm, FontMetrics small, int inner, int whereLines,
		PrepPlan prep)
	{
		PrepPlan.Line planned = prep == null ? null : prep.line(i.getName());
		boolean bag = got(i);
		StepGuide.PlaceLine at = i.getPlace() >= 0 && i.getPlace() < places.size() ? places.get(i.getPlace()) : null;
		boolean go = !bag && at != null && !at.isActive();
		boolean low = bag && planned != null && planned.lowSupply();
		String where = !bag && planned != null && planned.getAction() != null && !planned.getAction().isEmpty() ? planned.getAction() : i.getWhere();
		List<Line> lines = pair(mark(i.getHave()) + " " + i.getName(), bag ? StepGuide.GOOD : TEXT, low ? "low" : i.getTag(),
			low ? StepGuide.BANK : StepGuide.color(i.getHave()), fm, inner, false);
		if (!bag && where != null && !where.isEmpty())
		{
			lines.addAll(clip(INDENT, where, go ? LINK : MUTED, small, inner, whereLines, true));
		}
		if (!bag && at != null && at.isActive())
		{
			lines.addAll(text(INDENT + "● arrow points there", StepGuide.GOOD, small, inner, true));
		}
		List<String> hint = new ArrayList<>();
		hint.add(i.getName() + ".");
		if (i.getWhere() != null && !i.getWhere().isEmpty())
		{
			hint.add("Where to get it: " + i.getWhere());
		}
		if (planned != null && planned.getAction() != null && !planned.getAction().isEmpty() && !planned.getAction().equals(i.getWhere()))
		{
			hint.add("Tip: " + planned.getAction() + ".");
		}
		if (low)
		{
			hint.add("Running low on this supply - restock.");
		}
		if (go)
		{
			hint.add("Click for the arrow and path: " + at.getLabel() + (at.getNpc() != null ? ", " + at.getNpc() + " will be highlighted" : "") + ".");
		}
		return new Row(lines, go ? Action.place(i.getPlace()) : Action.NONE, String.join(" ", hint));
	}

	/**
	 * A step place: "► Hetty - house in Rimmington". The arrow leads here: "●". An NPC missing from the label goes first
	 * ("Cook - castle kitchen"): the list is also "who to go to". Places with items are labelled by the item and do not need it.
	 */
	static Row place(StepGuide.PlaceLine p, FontMetrics fm, int inner)
	{
		return place(p, fm, inner, PLACE_LINES);
	}

	static Row place(StepGuide.PlaceLine p, FontMetrics fm, int inner, int lines)
	{
		String label = p.getLabel();
		if (p.getNpc() != null && !p.isItems() && !label.toLowerCase().contains(p.getNpc().toLowerCase()))
		{
			label = p.getNpc() + " — " + label;
		}
		if (p.isActive())
		{
			return new Row(clip("", "● " + label, StepGuide.GOOD, fm, inner, lines, false), Action.NONE,
				label + ". The arrow points here; once you arrive it returns to the step.");
		}
		return new Row(clip("", "► " + label, TEXT, fm, inner, lines, false), Action.place(p.getIndex()),
			label + ". Click for the arrow and path here" + (p.getNpc() != null ? ", " + p.getNpc() + " will be highlighted" : "") + ".");
	}

	/** Text wrapped to the width, with no line limit. */
	static List<Line> text(String s, Color color, FontMetrics fm, int width, boolean small)
	{
		List<Line> out = new ArrayList<>();
		for (String l : OverlayText.wrap(s, fm, width))
		{
			out.add(new Line(l, color, null, null, small));
		}
		return out;
	}

	/**
	 * Text no longer than max lines: the last one is cut with an ellipsis. prefix is the indent before each line.
	 * The full text is in the hover hint.
	 */
	static List<Line> clip(String prefix, String s, Color color, FontMetrics fm, int width, int max, boolean small)
	{
		int room = width - fm.stringWidth(prefix);
		List<String> lines = OverlayText.wrap(s, fm, room);
		if (lines.size() > max)
		{
			lines = new ArrayList<>(lines.subList(0, max));
			String last = lines.get(max - 1);
			while (!last.isEmpty() && fm.stringWidth(last + "…") > room)
			{
				last = last.substring(0, last.length() - 1).trim();
			}
			lines.set(max - 1, last + "…");
		}
		List<Line> out = new ArrayList<>();
		for (String l : lines)
		{
			out.add(new Line(prefix + l, color, null, null, small));
		}
		return out;
	}

	/**
	 * A line with a right part, like OverlayText.pair: if it fits, one line; if not, the left wraps,
	 * the right goes at the end of the last line or on a separate line on the right.
	 */
	static List<Line> pair(String left, Color leftColor, String right, Color rightColor, FontMetrics fm, int width, boolean small)
	{
		List<Line> out = new ArrayList<>();
		int rightWidth = fm.stringWidth(right) + fm.stringWidth(GAP);
		if (fm.stringWidth(left) + rightWidth <= width)
		{
			out.add(new Line(left, leftColor, right, rightColor, small));
			return out;
		}
		List<String> lefts = OverlayText.wrap(left, fm, width);
		String last = lefts.isEmpty() ? "" : lefts.remove(lefts.size() - 1);
		for (String l : lefts)
		{
			out.add(new Line(l, leftColor, null, null, small));
		}
		if (fm.stringWidth(last) + rightWidth <= width)
		{
			out.add(new Line(last, leftColor, right, rightColor, small));
			return out;
		}
		if (!last.isEmpty())
		{
			out.add(new Line(last, leftColor, null, null, small));
		}
		for (String r : OverlayText.wrap(right, fm, width))
		{
			out.add(new Line("", leftColor, r, rightColor, small));
		}
		return out;
	}
}
