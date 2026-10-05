package com.osrspath.bridge;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.LongSupplier;

/**
 * Where the player is within a quest stage: the current step of the list. The cursor is counted only from what is visible in the game; it is moved
 * by facts, not by clicks, otherwise it is easy to click past a step and lose track of where you are (that happened in The Knight's Sword:
 * the ore was mined, the step was not counted, "done" was clicked past handing the ore to Thurgo, and the list showed "Bring the sword to the Squire" with
 * the ore still in the bag). The facts:
 *
 *  - position: the player reached one of the nearest next steps that has a tile (StepGuide.advance);
 *  - a step with has ("mine X", "buy X", "you receive X") is done when X is in the bag; steps without conditions before it are done too;
 *  - a step with need ("give X to an NPC") is done when X, which was in the bag, disappeared near the step's point (handed in). While X is in the bag,
 *    the cursor does not go past this step; it comes back and says why;
 *  - the game changed the stage (quest variable): count again from the start.
 * Moving forward by click is only possible where the game itself shows nothing ({@link #needsManualStep}: steps in a row at the same
 * place, such as "pull lever A", "pull lever B", which position and items cannot tell apart). Other steps cannot be skipped:
 * the facts lead the cursor. "Back" views the previous step: the cursor holds for {@link #PEEK_MS}, then the automation follows
 * the facts again; "to current" returns at once.
 *
 * Pure logic: only data and state; the plugin calls {@link #update} every tick, clicks call {@link #back}, {@link #resume}
 * and {@link #forward}.
 */
final class StageTracker
{
	/** Beyond this distance from the step's point a vanished item does not count as handed in: lost, dropped, put in the bank. */
	static final int DELIVER_RADIUS = 12;
	/** How long viewing a previous step lasts, ms: enough to reread and get back to work without getting confused. */
	static final long PEEK_MS = 45_000;
	/** After visiting the step's point and moving farther than this, the step is done (the path inside a house winds: the player does not walk straight to the next point). */
	static final int LEAVE_RADIUS = 6;
	/**
	 * The player "was at the step" if they came closer to its point than this. The same as "arrived" (STEP_RADIUS): with eight tiles the player,
	 * running past Zembo at seven and Luthas at eight, "visited" both and the cursor jumped over "buy rum" and "pick bananas" (S2-09, live game).
	 */
	static final int VISIT_RADIUS = StepGuide.STEP_RADIUS;
	/**
	 * A transition step: arriving means doing it, unlike "put", "fill", "kill", where walking past does not mean doing it. Before the verb there may be
	 * a place name ("Seaman on the docks: sail to Musa Point") and a short preparation ("Prepare for combat and enter...",
	 * "With the Dramen staff in hand, enter...") - it is the same transition, otherwise after the boat the cursor stays on "sail" and the arrow points back.
	 */
	private static final java.util.regex.Pattern MOVE = java.util.regex.Pattern.compile(
		"^(?:[^:]{1,60}:\\s*)?(?:(?:Prepare for combat and|With [^,:]{1,40} in hand,?)\\s+)?"
			+ "(?:Go|Walk|Run|Head|Travel|Enter|Exit|Leave|Climb|Descend|Ascend|Sail|Swim|Row|Return|Teleport|Fly|Jump|Cross|Follow|Board|Get out|Get to)"
			+ "(?![\\p{L}])",
		java.util.regex.Pattern.CASE_INSENSITIVE | java.util.regex.Pattern.UNICODE_CASE);

	private final LongSupplier clock;
	private String key;
	private int cursor;
	/** The largest count of a need item seen in the bag since the stage began, by nameKey. */
	private final Map<String, Integer> peak = new HashMap<>();
	/** Steps with need that count as handed in: the item left near the step's point. */
	private final Set<Integer> delivered = new HashSet<>();
	/** Until when viewing a previous step lasts (ms by the clock); 0 means not viewing. */
	private long peekUntil;
	private String warning;
	/** The player visited the current step's point (visitedAt is which one exactly): after leaving for the next point they count as having done this step. */
	private boolean visited;
	/** Steps whose point the player approached in this stage (within {@link #VISIT_RADIUS}). */
	private final Set<Integer> seen = new HashSet<>();
	private int visitedAt = -1;
	/** Why the cursor moved last: "POSITION", "ITEM", "DELIVERED", "CLAMP", "BACK", "MANUAL", "RESET" and details. */
	private String reason = "";
	/** The line before which the Quest Helper machine does not return the cursor: the player pressed "done" themselves and is responsible for it. -1 means not pressed. */
	private int floor = -1;
	/** The cursor is currently set by the Quest Helper machine (it has evidence), not by position and items. */
	private boolean qhStrong;
	/** The Quest Helper machine does not decide this step (a condition it cannot read): nothing may hold the player on it, so "done" is always offered. */
	private boolean qhUndecided;

	void qhUndecided(boolean undecided)
	{
		qhUndecided = undecided;
	}

	/**
	 * The Quest Helper state machine's pick for this tick: the stage line and why. There is a line only when the machine decided by a fulfilled
	 * condition (not "by default") and its step is among the stage's lines.
	 */
	@lombok.Value
	static class QhPick
	{
		int line;
		String why;
	}

	StageTracker()
	{
		this(System::currentTimeMillis);
	}

	StageTracker(LongSupplier clock)
	{
		this.clock = clock;
	}

	/** Key "step#stage": a change means a different stage. null means no stages. */
	String key()
	{
		return key;
	}

	int cursor()
	{
		return cursor;
	}

	/** What is wrong with the cursor: "Blurite ore is still in your bag - first: Give Thurgo..."; null means all is well. */
	String warning()
	{
		return warning;
	}

	/** Why the cursor moved last, for the debug log: "POSITION: reached step 3", "DELIVERED: Blurite ore". */
	/** The current line's item has been handed in, for the developer badge. */
	boolean delivered()
	{
		return delivered.contains(cursor);
	}

	/** Why the cursor moved last, for the debug log: "POSITION: reached step 3", "DELIVERED: Blurite ore". */
	String reason()
	{
		return reason;
	}

	/** The player is viewing a previous step (the "back" button): the automation does not move the cursor for now. */
	boolean peeking()
	{
		return peekUntil > clock.getAsLong();
	}

	void reset()
	{
		key = null;
		cursor = 0;
		peak.clear();
		delivered.clear();
		peekUntil = 0;
		warning = null;
		reason = "";
		visited = false;
		visitedAt = -1;
		seen.clear();
		floor = -1;
		qhStrong = false;
	}

	/**
	 * Recalculate the cursor. stepId and stage are which step and which stage are shown; lines are its steps; x, y, plane are the player;
	 * bag is the bag, worn items and notes. Returns the current step (zero-based).
	 */
	int update(String stepId, int stage, List<ActiveTarget.StageLine> lines, int x, int y, int plane, ItemCounts bag)
	{
		return update(stepId, stage, lines, x, y, plane, bag, null);
	}

	/**
	 * The same, but with a Quest Helper machine pick. If it has evidence (pick is not null), it sets the cursor, as in Quest Helper:
	 * position and items keep counting, but only when there is no evidence. Viewing "back" and a pressed "done" are stronger.
	 */
	int update(String stepId, int stage, List<ActiveTarget.StageLine> lines, int x, int y, int plane, ItemCounts bag, QhPick pick)
	{
		qhStrong = false;
		int before = cursor;
		int result = updateByFacts(stepId, stage, lines, x, y, plane, bag);
		if (pick != null && lines != null && !lines.isEmpty() && !peeking() && pick.getLine() >= 0 && pick.getLine() < lines.size() && pick.getLine() >= floor)
		{
			qhStrong = true;
			if (pick.getLine() != result || pick.getLine() != before)
			{
				reason = "QH: " + pick.getWhy();
			}
			cursor = pick.getLine();
			warning = null;
			result = cursor;
		}
		return result;
	}

	private int updateByFacts(String stepId, int stage, List<ActiveTarget.StageLine> lines, int x, int y, int plane, ItemCounts bag)
	{
		String next = stepId + "#" + stage;
		boolean fresh = !next.equals(key);
		// The stage changed before our eyes (the player talked to an NPC and the game moved the quest on): no step of the new stage is
		// done yet. The stage is opened for the first time (login, new step): the player may have done some steps, so search the whole list.
		boolean changed = fresh && key != null && key.startsWith(stepId + "#");
		if (fresh)
		{
			reset();
			key = next;
		}
		if (lines == null || lines.isEmpty())
		{
			return cursor = 0;
		}
		int last = lines.size() - 1;
		cursor = Math.max(0, Math.min(cursor, last));
		warning = null;
		if (peekUntil != 0 && !peeking())
		{
			peekUntil = 0;
		}
		int c0 = cursor;
		observe(lines, x, y, plane, bag);
		if (peeking())
		{
			// The player is viewing a previous step: do not touch, only watch for items being handed in.
			return cursor;
		}
		int window = fresh ? StepGuide.freshWindow(changed, lines.size()) : StepGuide.STEP_WINDOW;
		int c1 = cursor;
		cursor = StepGuide.advance(lines, cursor, x, y, plane, window, bag);
		for (int i = 0; i < lines.size(); i++)
		{
			ActiveTarget.StageLine l = lines.get(i);
			if (l.hasPoint() && l.getPlane() == plane && Math.abs(l.getX() - x) <= VISIT_RADIUS && Math.abs(l.getY() - y) <= VISIT_RADIUS)
			{
				seen.add(i);
			}
		}
		boolean gated = false;
		if (!fresh && cursor > c1)
		{
			// By position one cannot jump over a step that must be done but cannot be seen: the player, having run to the next point, did not
			// tick "put the rum in the crate" and "fill the crate", and they were skipped silently (S2-09). The cursor stops on the first such step:
			// on "done" (the game will not show it) or going back to its place (not visited yet).
			for (int g = c1; g < cursor; g++)
			{
				boolean gate = needsManualStep(lines, g);
				if (gate || !passable(lines, g, bag))
				{
					cursor = g;
					gated = true;
					ActiveTarget.StageLine stop = lines.get(g);
					if (bag != null && stop.hasNeed() && !delivered.contains(g) && bag.count(null, stop.getNeed()) > 0)
					{
						warning = stop.getNeed() + " is still in your bag - first: " + stop.shown();
					}
					reason = (gate ? "GATE: step " + (g + 1) + " '" + lines.get(g).shown() + "' cannot be seen by the game - mark it 'done'"
						: "BLOCK: step " + (g + 1) + " '" + lines.get(g).shown() + "' is not done - go back to its place");
					break;
				}
			}
		}
		if (cursor != c1 && !gated)
		{
			reason = "POSITION: reached step " + (cursor + 1) + " '" + lines.get(cursor).shown() + "'";
		}
		int c2 = cursor;
		cursor = skip(lines, cursor, bag);
		if (cursor != c2)
		{
			reason = "ITEM: steps " + (c2 + 1) + "-" + cursor + " done by items, next is '" + lines.get(cursor).shown() + "'";
		}
		leave(lines, x, y, plane);
		int c3 = cursor;
		clamp(lines, bag);
		if (cursor != c3)
		{
			reason = "CLAMP: " + warning;
		}
		if (fresh && cursor != c0 && reason.isEmpty())
		{
			reason = "RESET";
		}
		return cursor;
	}

	/**
	 * Watch the items of "give X" steps: how many X were in the bag and whether it left near the step's point; then the step is handed in,
	 * and so is everything before it (you cannot hand in without having done the previous one).
	 */
	private void observe(List<ActiveTarget.StageLine> lines, int x, int y, int plane, ItemCounts bag)
	{
		if (bag == null)
		{
			return;
		}
		int last = lines.size() - 1;
		for (int i = 0; i < lines.size(); i++)
		{
			ActiveTarget.StageLine l = lines.get(i);
			if (!l.hasNeed() || delivered.contains(i))
			{
				continue;
			}
			String name = ActiveTarget.nameKey(l.getNeed());
			int have = bag.count(null, l.getNeed());
			int top = peak.getOrDefault(name, 0);
			if (have > top)
			{
				peak.put(name, have);
			}
			else if (have < top && (!l.hasPoint() || near(l, x, y, plane)))
			{
				delivered.add(i);
				peak.put(name, have);
				if (!peeking())
				{
					int before = cursor;
					cursor = Math.max(cursor, Math.min(i + 1, last));
					if (cursor != before)
					{
						reason = "DELIVERED: " + l.getNeed() + " left at step " + (i + 1) + " '" + l.shown() + "'";
					}
				}
			}
		}
	}

	private static boolean near(ActiveTarget.StageLine l, int x, int y, int plane)
	{
		return l.getPlane() == plane && Math.abs(l.getX() - x) <= DELIVER_RADIUS && Math.abs(l.getY() - y) <= DELIVER_RADIUS;
	}

	/** A step is done by itself: handed in (need) or the needed item is in the bag now (has). */
	private boolean ownSatisfied(List<ActiveTarget.StageLine> lines, int i, ItemCounts bag)
	{
		ActiveTarget.StageLine l = lines.get(i);
		return delivered.contains(i) || (bag != null && l.hasHas() && bag.count(null, l.getHas()) > 0);
	}

	/**
	 * A step is done: by itself, or because the item it obtained (has) has already moved on - the next step handed it in
	 * (need of the same item). So "buy beer" stays done when the beer has been given to Dr. Harlow and the stake is in the bag instead.
	 */
	private boolean satisfied(List<ActiveTarget.StageLine> lines, int i, ItemCounts bag)
	{
		if (ownSatisfied(lines, i, bag))
		{
			return true;
		}
		ActiveTarget.StageLine l = lines.get(i);
		if (!l.hasHas())
		{
			return false;
		}
		String item = ActiveTarget.nameKey(l.getHas());
		for (int j = i + 1; j < lines.size(); j++)
		{
			ActiveTarget.StageLine later = lines.get(j);
			if (later.hasNeed() && ActiveTarget.nameKey(later.getNeed()).equals(item) && ownSatisfied(lines, j, bag))
			{
				return true;
			}
		}
		return false;
	}

	/**
	 * Steps that are already done by items, forward from the cursor. Besides the step itself, also those before it without conditions
	 * (go down into the cave, walk): there is ore, so the cave has been visited. We do not jump over steps with has/need:
	 * items can be collected in any order. The last step of a stage is not skipped: the stage ends when the game changes the
	 * variable's value.
	 */
	private int skip(List<ActiveTarget.StageLine> lines, int from, ItemCounts bag)
	{
		int last = lines.size() - 1;
		int at = from;
		while (at < last)
		{
			if (satisfied(lines, at, bag))
			{
				at++;
				continue;
			}
			int ahead = -1;
			for (int k = at + 1; k < last && k <= at + StepGuide.STEP_WINDOW; k++)
			{
				ActiveTarget.StageLine skipped = lines.get(k - 1);
				if (skipped.hasHas() || skipped.hasNeed())
				{
					break;
				}
				if (satisfied(lines, k, bag))
				{
					ahead = k;
					break;
				}
			}
			if (ahead < 0)
			{
				break;
			}
			at = ahead;
		}
		return at;
	}

	/** The first not-yet-handed-in "give X" step while X is in the bag: the cursor does not go past it. -1 means there is none. */
	private int blocker(List<ActiveTarget.StageLine> lines, int upTo, ItemCounts bag)
	{
		if (bag == null)
		{
			return -1;
		}
		for (int i = 0; i <= Math.min(upTo, lines.size() - 1); i++)
		{
			ActiveTarget.StageLine l = lines.get(i);
			if (l.hasNeed() && !satisfied(lines, i, bag) && bag.count(null, l.getNeed()) > 0)
			{
				return i;
			}
		}
		return -1;
	}

	private void clamp(List<ActiveTarget.StageLine> lines, ItemCounts bag)
	{
		int b = blocker(lines, cursor - 1, bag);
		if (b >= 0 && b < cursor)
		{
			warning = lines.get(b).getNeed() + " is still in your bag - first: " + lines.get(b).shown();
			cursor = b;
		}
	}

	/**
	 * Click "back": view an earlier step. The automation does not carry the cursor forward for {@link #PEEK_MS}, then returns it by the facts;
	 * another click goes one more step back (and for as long again).
	 */
	void back()
	{
		if (cursor <= 0)
		{
			return;
		}
		cursor--;
		peekUntil = clock.getAsLong() + PEEK_MS;
		warning = null;
		reason = "BACK: viewing step " + (cursor + 1);
	}

	/** A transition step ("Enter...", "Go down...", "Return to..."): arriving at the place means doing it. */
	static boolean isMove(ActiveTarget.StageLine l)
	{
		return !l.hasHas() && !l.hasNeed() && MOVE.matcher(l.shown().trim()).find();
	}

	/** Whether this step can be passed by position: it is a transition, confirmed by an item, or the player was at its point. */
	private boolean passable(List<ActiveTarget.StageLine> lines, int j, ItemCounts bag)
	{
		ActiveTarget.StageLine l = lines.get(j);
		if (isMove(l) || satisfied(lines, j, bag))
		{
			return true;
		}
		if (l.hasHas() || l.hasNeed())
		{
			return false;
		}
		return l.hasPoint() && seen.contains(j);
	}

	/**
	 * Visited the step's point and moved away from it (farther than {@link #LEAVE_RADIUS} tiles or closer to the next one): the step is done. Without this the cursor stood on "enter the house" until the player
	 * got within four tiles of the next point: inside the house the arrow stayed at the door they had already reached (S2-08, the basement of
	 * Draynor Manor). Only for steps where the game has no other way to confirm the deed: this and the next step have a tile,
	 * there are no has/need conditions on them, the points differ and are on the same plane. Standing by an NPC without leaving keeps the step.
	 */
	private void leave(List<ActiveTarget.StageLine> lines, int x, int y, int plane)
	{
		if (visitedAt != cursor)
		{
			visitedAt = cursor;
			visited = false;
		}
		ActiveTarget.StageLine cur = lines.get(cursor);
		if (!isMove(cur))
		{
			// Walking away from "fill the crate" does not mean filling it: only transitions are closed by leaving.
			return;
		}
		if (cur.hasPoint() && cur.getPlane() == plane && Math.abs(cur.getX() - x) <= StepGuide.STEP_RADIUS && Math.abs(cur.getY() - y) <= StepGuide.STEP_RADIUS)
		{
			visited = true;
		}
		if (!visited || cursor >= lines.size() - 1)
		{
			return;
		}
		ActiveTarget.StageLine nx = lines.get(cursor + 1);
		// The next step may have its own conditions (an item in the bag): that does not prevent finishing the transition - it is finished when the player left.
		if (!cur.hasPoint() || !nx.hasPoint() || cur.hasNeed() || cur.hasHas() || cur.getPlane() != plane || nx.getPlane() != plane || sameSpot(cur, nx))
		{
			return;
		}
		int toCur = Math.max(Math.abs(cur.getX() - x), Math.abs(cur.getY() - y));
		int toNext = Math.max(Math.abs(nx.getX() - x), Math.abs(nx.getY() - y));
		if (toNext < toCur || toCur > LEAVE_RADIUS)
		{
			cursor++;
			reason = "LEFT: was at step " + cursor + " '" + cur.shown() + "' and went on to the next '" + nx.shown() + "'";
		}
	}

	/**
	 * Whether the player leaves the step by themselves: the next step has a tile not at the same place (arrived: the cursor moved on) or an item (obtained
	 * or handed in); the last step of a stage is changed by the game. Otherwise the step is manual only: in a row at one place or without a place, nothing tells them apart.
	 */
	static boolean needsManualStep(List<ActiveTarget.StageLine> lines, int i)
	{
		if (lines == null || i < 0 || i >= lines.size() - 1)
		{
			return false;
		}
		// It is the next step that decides: while it is not visible in the game, its text will not show (two levers in a row: the second is hidden).
		ActiveTarget.StageLine cur = lines.get(i);
		ActiveTarget.StageLine nx = lines.get(i + 1);
		if (nx.hasHas() || nx.hasNeed())
		{
			return false;
		}
		// A step with no tile and no item cannot be confirmed by anything: "Pick bananas", "Use X on Y" - only by a tick.
		if (!cur.hasPoint() && !cur.hasHas() && !cur.hasNeed())
		{
			return true;
		}
		return !(nx.hasPoint() && !(cur.hasPoint() && sameSpot(cur, nx)));
	}

	private static boolean sameSpot(ActiveTarget.StageLine a, ActiveTarget.StageLine b)
	{
		return a.getPlane().equals(b.getPlane()) && Math.abs(a.getX() - b.getX()) <= StepGuide.STEP_RADIUS
			&& Math.abs(a.getY() - b.getY()) <= StepGuide.STEP_RADIUS;
	}

	/** Whether "done" can be pressed on the current step: it is one the game will not see by itself. */
	boolean canStepForward(List<ActiveTarget.StageLine> lines)
	{
		// The button also stays when the step is led by the Quest Helper machine: if the game message did not arrive or was reworded, the player is not stuck.
		// A pressed "done" is stronger than the machine (floor): it will not return the cursor back.
		// And when the machine cannot decide (a flag of its own that the plugin cannot read), place and items may not see the step either (S2-10: the key print
		// obtained at Keli, the next step is far away): then the player can always move on by hand.
		return !peeking() && (needsManualStep(lines, cursor) || (qhUndecided && lines != null && cursor < lines.size() - 1));
	}

	/** The cursor was set by the Quest Helper machine (not by position and items). */
	boolean qhStrong()
	{
		return qhStrong;
	}

	/** Click "done": only on a step that cannot be determined by the game; it does nothing on the others. true means the cursor moved. */
	boolean forward(List<ActiveTarget.StageLine> lines)
	{
		if (!canStepForward(lines))
		{
			return false;
		}
		cursor++;
		floor = cursor;
		warning = null;
		reason = "MANUAL: 'done' on step " + cursor + " (the game cannot see it by itself)";
		return true;
	}

	/** Click "to current": viewing is over, the cursor is counted by the facts again, at once, without waiting. */
	void resume()
	{
		peekUntil = 0;
		reason = "RESUME";
	}
}
