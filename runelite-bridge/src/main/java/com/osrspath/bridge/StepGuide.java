package com.osrspath.bridge;

import java.awt.Color;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import lombok.Value;

/**
 * What the "What you need" list in the game and the "OSRS Path" side panel show: the step's items (whether you have them: bag, bank),
 * where to get them and which point to aim the arrow at, and the step's points. Pure logic: the plugin computes it on the client thread,
 * the list and the panel only draw it.
 */
final class StepGuide
{
	enum Have
	{
		/** In the bag or worn, as many as needed. */
		BAG,
		/** Not in the bag, but the bank has enough. */
		BANK,
		/** Nowhere (the bank has been opened). */
		NONE,
		/** The bank has not been opened in this session, so unknown. */
		UNKNOWN,
		/** Obtained during the step, no need to take it beforehand. */
		IN_STEP,
		/** It was in the bag during this step and now is not: handed in, eaten or used. No need to look for it again. */
		DONE,
	}

	static final Color GOOD = new Color(90, 220, 120);
	static final Color BANK = new Color(255, 190, 70);
	static final Color MISSING = new Color(255, 110, 90);
	static final Color IN_STEP = new Color(120, 210, 255);
	static final Color UNKNOWN = new Color(170, 170, 170);

	@Value
	static class ItemLine
	{
		/** For the panel: "Lobster ×5". */
		String title;
		/** For the panel: "in bank - take it (1+9/5)". */
		String status;
		Have have;
		String where;
		/** The number of the point where this item is obtained; -1 means there is no such point. */
		int place;
		/** For the in-game list: the name as in the bag, "Lobster ×5". */
		String name;
		/** For the in-game list: short on the right, "have", "in bank", "none", "2/5", "in step", "bank?". */
		String tag;
	}

	@Value
	static class PlaceLine
	{
		String label;
		int index;
		/** The arrow now points here. */
		boolean active;
		/** The NPC at the point (highlighted when the arrow points here) or null. */
		String npc;
		/** Items of the step are obtained here: the label is about the item ("Onion - patch"), not an NPC. */
		boolean items;
	}

	@Value
	static class View
	{
		String title;
		String goal;
		List<ItemLine> items;
		List<PlaceLine> places;
		/** The arrow points not at the step but at this temporary target; null means at the step. */
		String detour;
		/** A message instead of a step: "no step selected", "navigation is off"... */
		String note;
		/** What to do next when everything needed is collected (the last item of the step's quick path); null means too early. */
		String next;
		/** The last item of the step's quick path, always (who to finish with); null means there are no items. */
		String finale;
		/** The quest stage by a game variable; null means the step has no stages or the game did not give the variable. */
		StageView stage;
		/** The preparation plan from the app (protocol 6): percent, importance, "don't take now", recovery; null means the app sent no plan. */
		PrepPlan prep;
		/** The in-game list has the "Tip" tab open (the red and grey from the app: "Don't take now", weight, bag) rather than "Steps". */
		boolean adviceTab;

		View(String title, String goal, List<ItemLine> items, List<PlaceLine> places, String detour, String note, String next, String finale)
		{
			this(title, goal, items, places, detour, note, next, finale, null, null);
		}

		View(String title, String goal, List<ItemLine> items, List<PlaceLine> places, String detour, String note, String next,
			String finale, StageView stage)
		{
			this(title, goal, items, places, detour, note, next, finale, stage, null);
		}

		View(String title, String goal, List<ItemLine> items, List<PlaceLine> places, String detour, String note, String next,
			String finale, StageView stage, PrepPlan prep)
		{
			this(title, goal, items, places, detour, note, next, finale, stage, prep, false);
		}

		View(String title, String goal, List<ItemLine> items, List<PlaceLine> places, String detour, String note, String next,
			String finale, StageView stage, PrepPlan prep, boolean adviceTab)
		{
			this.adviceTab = adviceTab;
			this.prep = prep;
			this.title = title;
			this.goal = goal;
			this.items = items;
			this.places = places;
			this.detour = detour;
			this.note = note;
			this.next = next;
			this.finale = finale;
			this.stage = stage;
		}

		/** The same with another stage state (a warning and "manually"). */
		View withStage(StageView s)
		{
			return new View(title, goal, items, places, detour, note, next, finale, s, prep, adviceTab);
		}

		/** The same with the preparation plan from the app. */
		View withPrep(PrepPlan p)
		{
			return new View(title, goal, items, places, detour, note, next, finale, stage, p, adviceTab);
		}

		/** The same with another message (the plugin's guideMessage). */
		View withNote(String message)
		{
			return new View(title, goal, items, places, detour, message, next, finale, stage, prep, adviceTab);
		}

		/** The same with the "Tip" (or "Steps") tab open. */
		View withAdviceTab(boolean on)
		{
			return new View(title, goal, items, places, detour, note, next, finale, stage, prep, on);
		}
	}

	/** Where the player is in the quest: stage k of n, what to do now and whether the quest is complete. */
	@Value
	static class StageView
	{
		/** One-based. */
		int index;
		int total;
		/** What to do in the stage: the steps in order. */
		List<ActiveTarget.StageLine> steps;
		/** The number of the step the player is on now (zero-based): everything before it is done. */
		int cursor;
		/** The quest is complete (Quest.getState): stages are not needed any more. */
		boolean finished;
		/** What is wrong with the step ("Blurite ore is still in your bag - first: ..."); null means all is well. */
		String warning;
		/** The player is viewing a previous step (the "back" button): the automation does not move the cursor until viewing ends. */
		boolean peeking;
		/** The game will not see the current step by itself (several in a row at one place): then there is a "done" button; the other steps have none. */
		boolean manual;

		StageView(int index, int total, List<ActiveTarget.StageLine> steps, int cursor, boolean finished)
		{
			this(index, total, steps, cursor, finished, null, false, false);
		}

		StageView(int index, int total, List<ActiveTarget.StageLine> steps, int cursor, boolean finished, String warning, boolean peeking)
		{
			this(index, total, steps, cursor, finished, warning, peeking, false);
		}

		StageView(int index, int total, List<ActiveTarget.StageLine> steps, int cursor, boolean finished, String warning, boolean peeking,
			boolean manual)
		{
			this.manual = manual;
			this.index = index;
			this.total = total;
			this.steps = steps;
			this.cursor = cursor;
			this.finished = finished;
			this.warning = warning;
			this.peeking = peeking;
		}

		StageView with(String warning, boolean peeking, boolean manual)
		{
			return new StageView(index, total, steps, cursor, finished, warning, peeking, manual);
		}
	}

	/** The app's plan belongs only to its own step: the plan of the previous step must not be drawn on the new one until the app sends a fresh one. */
	static View withPlanFor(View v, PrepPlan plan, ActiveTarget target)
	{
		return plan != null && target != null && plan.getStepId() != null && plan.getStepId().equals(target.getStepId()) ? v.withPrep(plan) : v;
	}

	static final View EMPTY = new View(null, null, Collections.emptyList(), Collections.emptyList(), null,
		"No step selected. In the OSRS Path app press 'Show in game' on a step: what you need and where to go will appear here.", null, null);

	private StepGuide()
	{
	}

	static Color color(Have h)
	{
		switch (h)
		{
			case BAG:
			case DONE:
				return GOOD;
			case BANK:
				return BANK;
			case NONE:
				return MISSING;
			case IN_STEP:
				return IN_STEP;
			default:
				return UNKNOWN;
		}
	}

	/**
	 * Rows for the panel and the list. carried is the bag and worn items (with notes), bank is null if the bank has not been opened.
	 * navLabel is the label of the temporary target or null; navX/navY is its tile, to mark the active point.
	 */
	static View view(ActiveTarget t, ItemCounts carried, ItemCounts bank, String navLabel, int navX, int navY, int navPlane)
	{
		return view(t, carried, bank, navLabel, navX, navY, navPlane, null);
	}

	/**
	 * got is the step's items that have already been in the bag (nameKey keys). They are topped up here: what was taken and then
	 * handed in (Hetty, the cauldron, a shop) stays ticked in the list instead of being asked for again. null means no memory.
	 */
	static View view(ActiveTarget t, ItemCounts carried, ItemCounts bank, String navLabel, int navX, int navY, int navPlane, Set<String> got)
	{
		return view(t, carried, bank, navLabel, navX, navY, navPlane, got, null, false);
	}

	/**
	 * stageValue is the quest variable's value from the game (null means unknown), questDone is Quest.getState == FINISHED.
	 * For a step with stages only the current one is shown: what to do, the items of this stage and one point. A completed quest shows
	 * only "complete". With no value or no stages, the step's whole list as before.
	 */
	static View view(ActiveTarget t, ItemCounts carried, ItemCounts bank, String navLabel, int navX, int navY, int navPlane, Set<String> got,
		Integer stageValue, boolean questDone)
	{
		return view(t, carried, bank, navLabel, navX, navY, navPlane, got, stageValue, questDone, 0);
	}

	/** The "reached the step" radius, in tiles. */
	static final int STEP_RADIUS = 4;
	/** How far ahead of the current step the next one is searched: someone else's step passed on the way must not skip half a stage. */
	static final int STEP_WINDOW = 4;

	/**
	 * Where to move the current stage step by the player's position. Standing at their own step: stays; reached one of the nearest
	 * next ones: moves to it. Steps without a tile (think, wait) are skipped when the player has gone further.
	 */
	static int advance(List<ActiveTarget.StageLine> lines, int cursor, int x, int y, int plane)
	{
		return advance(lines, cursor, x, y, plane, STEP_WINDOW);
	}

	/**
	 * How far ahead to look for a step when the stage has just been shown. The stage changed before our eyes (the player talked to an NPC and the game
	 * moved the quest on): no step of the new stage is done yet, so start from the first; otherwise a player standing by the NPC
	 * "has already reached" a step further down the list like "give it back to him", and the arrow leads to where they already stand. The stage is opened
	 * for the first time (login, new step): the player may have done some steps, so search the whole list.
	 */
	static int freshWindow(boolean changedWhileWatching, int size)
	{
		return changedWhileWatching ? 0 : size;
	}

	/**
	 * window is how far ahead to look. The stage is opened for the first time (the cursor is at zero, the player may have done some steps already, for example
	 * a stage that is a whole route): search the whole list, the first match.
	 */
	static int advance(List<ActiveTarget.StageLine> lines, int cursor, int x, int y, int plane, int window)
	{
		return advance(lines, cursor, x, y, plane, window, null);
	}

	/**
	 * carried is what is in the bag: a step with a need condition ("give back the ore") counts by place only if the item is there.
	 * null means items are unknown, conditions are not checked.
	 */
	static int advance(List<ActiveTarget.StageLine> lines, int cursor, int x, int y, int plane, int window, ItemCounts carried)
	{
		if (lines == null || lines.isEmpty())
		{
			return 0;
		}
		int at = Math.max(0, Math.min(cursor, lines.size() - 1));
		if (reached(lines.get(at), x, y, plane, carried))
		{
			return at;
		}
		for (int i = at + 1; i < lines.size() && i <= at + window; i++)
		{
			if (reached(lines.get(i), x, y, plane, carried))
			{
				return i;
			}
		}
		return at;
	}

	private static boolean reached(ActiveTarget.StageLine l, int x, int y, int plane, ItemCounts carried)
	{
		if (!near(l, x, y, plane))
		{
			return false;
		}
		return carried == null || l.getNeed() == null || l.getNeed().isEmpty() || carried.count(null, l.getNeed()) > 0;
	}

	/**
	 * Steps that are already done by items: the step names an item (has) and it is in the bag, so we move on. The last step
	 * of the stage is not skipped: the stage ends by itself when the game changes the variable's value.
	 */
	static int skipDone(List<ActiveTarget.StageLine> lines, int cursor, ItemCounts carried)
	{
		if (lines == null || lines.isEmpty() || carried == null)
		{
			return cursor;
		}
		int at = Math.max(0, Math.min(cursor, lines.size() - 1));
		while (at < lines.size() - 1 && lines.get(at).getHas() != null && !lines.get(at).getHas().isEmpty()
			&& carried.count(null, lines.get(at).getHas()) > 0)
		{
			at++;
		}
		return at;
	}

	private static boolean near(ActiveTarget.StageLine l, int x, int y, int plane)
	{
		return l.hasPoint() && l.getPlane() == plane && Math.abs(l.getX() - x) <= STEP_RADIUS && Math.abs(l.getY() - y) <= STEP_RADIUS;
	}

	/** cursor is the current stage step (advance); out of range means the nearest valid one. */
	static View view(ActiveTarget t, ItemCounts carried, ItemCounts bank, String navLabel, int navX, int navY, int navPlane, Set<String> got,
		Integer stageValue, boolean questDone, int cursor)
	{
		if (t == null)
		{
			return EMPTY;
		}
		ActiveTarget.Guide g = t.getGuide();
		List<ActiveTarget.GuidePlace> places = g == null || g.getPlaces() == null ? Collections.emptyList() : g.getPlaces();
		ActiveTarget.Stage stage = g == null ? null : g.getStage();
		StageView stageView = null;
		ActiveTarget.StageStep cur = null;
		List<ActiveTarget.GuideItem> source = g == null || g.getItems() == null ? Collections.emptyList() : g.getItems();
		if (stage != null && (stageValue != null || questDone))
		{
			int idx = stageValue == null ? stage.getStages().size() - 1 : stage.indexFor(stageValue);
			cur = stage.getStages().get(idx);
			stageView = new StageView(idx + 1, stage.getStages().size(), cur.getSteps(), Math.max(0, Math.min(cursor, cur.getSteps().size() - 1)), questDone);
			if (questDone)
			{
				source = Collections.emptyList();
			}
			else if (cur.getItems() != null)
			{
				source = cur.getItems();
			}
		}
		List<ItemLine> items = new ArrayList<>();
		for (ActiveTarget.GuideItem i : source)
		{
			ItemLine line = remembered(item(i, places, carried, bank), i.getName(), got);
			// The stage has no list of its own, so the quest's whole list stands in: what the finished lines used up (wool for the wig) is not "needed now".
			if (stageView != null && !questDone && cur.getItems() == null && spentByEarlierLines(line, i.getName(), stageView.getSteps(), stageView.getCursor()))
			{
				line = new ItemLine(line.getTitle(), "✓ already handled - handed in or used", Have.DONE, line.getWhere(), line.getPlace(), line.getName(), "done");
			}
			items.add(line);
		}
		List<PlaceLine> placeLines = new ArrayList<>();
		for (int i = 0; i < places.size(); i++)
		{
			if (stageView != null && (stageView.isFinished() || cur.getGo() == null || cur.getGo() != i))
			{
				// A stage has one point, where to go now; the step's other places do not belong to it.
				continue;
			}
			ActiveTarget.GuidePlace p = places.get(i);
			boolean active = navLabel != null && p.getX() == navX && p.getY() == navY && p.getPlane() == navPlane;
			String npc = p.getNpc() == null || p.getNpc().isEmpty() ? null : p.getNpc();
			placeLines.add(new PlaceLine(p.getLabel(), i, active, npc, stageView == null && p.getItems() != null && !p.getItems().isEmpty()));
		}
		String title = "[" + t.getStepId() + "] " + (t.getTitle() == null ? "" : t.getTitle());
		String note = g == null ? "The app is older than the plugin: it sent no 'what you need' list. Update the OSRS Path app." : null;
		boolean staged = stageView != null;
		// The stage arrow (to the current step or to a stage point) is not a "detour": "Arrow back to the step" is needed only after choosing your own place.
		String detour = navLabel;
		if (staged && !stageView.isFinished() && navLabel != null)
		{
			ActiveTarget.StageLine now = stageView.getSteps().get(stageView.getCursor());
			boolean atStep = now.hasPoint() && now.getX() == navX && now.getY() == navY && now.getPlane() == navPlane;
			boolean atGo = cur.getGo() != null && cur.getGo() >= 0 && cur.getGo() < places.size()
				&& places.get(cur.getGo()).getX() == navX && places.get(cur.getGo()).getY() == navY && places.get(cur.getGo()).getPlane() == navPlane;
			if (atStep || atGo)
			{
				detour = null;
			}
		}
		return new View(title, t.getGoal(), items, placeLines, detour, note, staged ? null : next(g, items), staged ? null : finale(g), stageView);
	}

	/**
	 * An item that is not in the bag or the bank, that a finished stage line talks about and no line from the current one on does: it was used up by those lines
	 * (the wool for the wig, the ashes for the paste). An item nobody names, or one in the bag or bank, stays as it is.
	 */
	static boolean spentByEarlierLines(ItemLine l, String rawName, List<ActiveTarget.StageLine> lines, int cursor)
	{
		if (cursor <= 0 || l.getHave() == Have.BAG || l.getHave() == Have.BANK || l.getHave() == Have.DONE)
		{
			return false;
		}
		boolean before = false;
		for (int i = 0; i < lines.size(); i++)
		{
			ActiveTarget.StageLine s = lines.get(i);
			if (!names(s, rawName))
			{
				continue;
			}
			if (i >= cursor)
			{
				return false;
			}
			before = true;
		}
		return before;
	}

	/** Whether a stage line names the item, in its full or its short text; "Pot of flour" is also named by "flour" (a container is not what the line is about). */
	private static boolean names(ActiveTarget.StageLine s, String rawName)
	{
		String bare = GuideList.baseName(rawName).replaceFirst("(?i)^(pot|bucket|jug|vial|bowl|glass|bottle) of ", "");
		for (String text : new String[] {s.getT(), s.getS()})
		{
			if (text != null && (GuideList.mentions(text, rawName) || GuideList.mentions(text, bare)))
			{
				return true;
			}
		}
		return false;
	}

	/**
	 * Whether it is already taken: in the bag, we remember; it was and now is not, "done". What is obtained during the step (IN_STEP) is also remembered,
	 * but only when it has really been in the bag.
	 */
	private static ItemLine remembered(ItemLine l, String rawName, Set<String> got)
	{
		if (got == null)
		{
			return l;
		}
		String key = ActiveTarget.nameKey(rawName);
		if (l.getHave() == Have.BAG)
		{
			got.add(key);
			return l;
		}
		if (got.contains(key))
		{
			return new ItemLine(l.getTitle(), "✓ already handled - handed in or used", Have.DONE, l.getWhere(), l.getPlace(), l.getName(), "done");
		}
		return l;
	}

	private static String finale(ActiveTarget.Guide g)
	{
		return g == null || g.getSteps() == null || g.getSteps().isEmpty() ? null : g.getSteps().get(g.getSteps().size() - 1);
	}

	/** The last item of the step's quick path when everything needed is already collected; otherwise null, the item list is enough. */
	private static String next(ActiveTarget.Guide g, List<ItemLine> items)
	{
		if (g == null || g.getSteps() == null || g.getSteps().isEmpty() || items.isEmpty())
		{
			return null;
		}
		for (ItemLine i : items)
		{
			if (i.getHave() != Have.BAG && i.getHave() != Have.DONE)
			{
				return null;
			}
		}
		return g.getSteps().get(g.getSteps().size() - 1);
	}

	static ItemLine item(ActiveTarget.GuideItem i, List<ActiveTarget.GuidePlace> places, ItemCounts carried, ItemCounts bank)
	{
		int need = i.getCount() == null ? 1 : i.getCount();
		int have = carried == null ? 0 : carried.count(i.getId(), i.getName());
		int inBank = bank == null ? -1 : bank.count(i.getId(), i.getName());
		Have h;
		String status;
		String tag;
		if (have >= need)
		{
			h = Have.BAG;
			status = "✓ in bag" + (need > 1 ? " " + have + "/" + need : "");
			tag = need > 1 ? have + "/" + need : "have";
		}
		else if (inBank >= 0 && have + inBank >= need)
		{
			h = Have.BANK;
			status = "in bank - take it" + (need > 1 ? " (" + have + "+" + inBank + "/" + need + ")" : "");
			tag = "in bank";
		}
		else if (i.isInStep())
		{
			h = Have.IN_STEP;
			status = "you get it during the step" + (have > 0 ? " (" + have + "/" + need + ")" : "");
			tag = have > 0 ? have + "/" + need : "in step";
		}
		else if (inBank < 0)
		{
			h = Have.UNKNOWN;
			status = (have > 0 ? "in bag " + have + "/" + need + ", " : "") + "bank not opened";
			tag = have > 0 ? have + "/" + need + " · bank?" : "bank?";
		}
		else
		{
			h = Have.NONE;
			status = "missing" + (have + inBank > 0 ? " - have " + (have + inBank) + " of " + need : "");
			tag = have + inBank > 0 ? (have + inBank) + "/" + need : "none";
		}
		String name = i.getName() + (i.getCount() != null && need > 1 ? " ×" + need : "");
		return new ItemLine(name, status, h, i.getWhere(), placeOf(i.getName(), places), name, tag);
	}

	/** A temporary target at step point number index; null means there is no point. No item is set: the target is cleared on arrival. */
	static NavTarget navTo(ActiveTarget t, int index)
	{
		ActiveTarget.Guide g = t == null ? null : t.getGuide();
		if (g == null || g.getPlaces() == null || index < 0 || index >= g.getPlaces().size())
		{
			return null;
		}
		ActiveTarget.GuidePlace p = g.getPlaces().get(index);
		NavTarget n = new NavTarget();
		n.setLabel(p.getLabel());
		n.setX(p.getX());
		n.setY(p.getY());
		n.setPlane(p.getPlane());
		if (p.getNpc() != null && !p.getNpc().isEmpty())
		{
			n.setNpcNames(Collections.singletonList(p.getNpc()));
		}
		n.setStepId(t.getStepId());
		return n.prepare() == null ? n : null;
	}

	/** The arrow target is the stage step's tile; the label is the first sentence of its text. null means the step has no tile. */
	static NavTarget navToLine(ActiveTarget t, ActiveTarget.StageLine line)
	{
		if (t == null || line == null || !line.hasPoint())
		{
			return null;
		}
		String label = line.shown();
		if (label.length() > 60)
		{
			label = label.substring(0, 59) + "…";
		}
		NavTarget n = new NavTarget();
		n.setLabel(label);
		n.setX(line.getX());
		n.setY(line.getY());
		n.setPlane(line.getPlane());
		n.setStepId(t.getStepId());
		return n.prepare() == null ? n : null;
	}

	/** A point where an item is obtained: the point's items hold its name. */
	static int placeOf(String name, List<ActiveTarget.GuidePlace> places)
	{
		String key = ActiveTarget.nameKey(name);
		for (int p = 0; p < places.size(); p++)
		{
			List<String> items = places.get(p).getItems();
			if (items != null && items.stream().anyMatch(n -> ActiveTarget.nameKey(n).equals(key)))
			{
				return p;
			}
		}
		return -1;
	}
}
