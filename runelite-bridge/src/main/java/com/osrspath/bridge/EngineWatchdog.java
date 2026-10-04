package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.List;
import lombok.Value;

/**
 * The engine watchdog: looks in what the player sees for states that should not exist, and writes them to the log and the developer badge.
 * It repairs nothing and changes nothing, it only notices:
 *
 *  - {@code STUCK}: the stage step has not changed for three minutes although the player walked and changed the bag (and has not walked away from the game), and the step is not a "manual" one;
 *  - {@code CLAMP}: the "item is still in your bag" warning has hung for more than a minute and a half (the list may be holding for nothing);
 *  - {@code EMPTY}: a step is chosen but there is neither a plate nor a list on screen: the player is left without hints;
 *  - {@code QUEST_DONE}: the quest is complete but the stage list does not show it.
 *
 * Pure logic: the time comes in the observation, so the rules are checked by tests without the game.
 */
final class EngineWatchdog
{
	static final long STUCK_MS = 180_000;
	static final long CLAMP_MS = 90_000;
	static final long EMPTY_MS = 20_000;
	static final long QUEST_DONE_MS = 10_000;
	/** How many tiles must be walked to count that the player "walked". */
	static final int MOVED_TILES = 40;
	/** How many times the bag must change to count that the player "did something". */
	static final int BAG_CHANGES = 3;
	/** The player stands and changes nothing for longer than this: they walked away from the computer; we no longer count that as a stuck step. */
	static final long IDLE_MS = 60_000;

	/** What is visible now. stageKey null means the step has no stages. */
	@Value
	static class Observation
	{
		long now;
		String stepId;
		String stageKey;
		int cursor;
		int size;
		/** The game does not see the current step by itself: "done" is manual; it can be waited for a long time. */
		boolean manualOnly;
		/** The step is being viewed with the "back" button. */
		boolean peeking;
		boolean warning;
		int x;
		int y;
		int plane;
		/** Any number that changes with the bag's contents. */
		int bagHash;
		boolean hudShown;
		boolean guideShown;
		boolean questDone;
		boolean stageFinished;
		boolean inGame;
	}

	@Value
	static class Finding
	{
		String code;
		/** The key for repeats: the same anomaly at the same step is not repeated. */
		String key;
		String message;
	}

	private String stageKey;
	private int cursor = -1;
	private long cursorSince;
	private int lastX;
	private int lastY;
	private int lastPlane;
	private int walked;
	private int bagHash;
	private int bagChanges;
	/** When the player last moved or changed the bag. */
	private long lastActive;
	/** When the condition began; -1 means not running. Zero is a real time for tests, so it does not do as a mark. */
	private long warnSince = -1;
	private long emptySince = -1;
	private long doneSince = -1;

	/** An observation once per tick (or once per second): return what became strange. */
	List<Finding> observe(Observation o)
	{
		List<Finding> out = new ArrayList<>();
		if (!o.isInGame())
		{
			reset(o);
			return out;
		}
		boolean same = o.getStageKey() != null && o.getStageKey().equals(stageKey) && o.getCursor() == cursor;
		if (!same)
		{
			reset(o);
		}
		else
		{
			int step = o.getPlane() == lastPlane ? Math.max(Math.abs(o.getX() - lastX), Math.abs(o.getY() - lastY)) : MOVED_TILES;
			walked += step;
			if (step > 0)
			{
				lastActive = o.getNow();
			}
			if (o.getBagHash() != bagHash)
			{
				bagChanges++;
				lastActive = o.getNow();
			}
		}
		lastX = o.getX();
		lastY = o.getY();
		lastPlane = o.getPlane();
		bagHash = o.getBagHash();

		if (o.getStageKey() != null && o.getSize() > 1 && !o.isManualOnly() && !o.isPeeking()
			&& o.getCursor() < o.getSize() - 1 && o.getNow() - cursorSince >= STUCK_MS && o.getNow() - lastActive < IDLE_MS && (walked >= MOVED_TILES || bagChanges >= BAG_CHANGES))
		{
			out.add(new Finding("STUCK", o.getStageKey() + "@" + o.getCursor(), "Step " + (o.getCursor() + 1) + "/" + o.getSize() + " of stage "
				+ o.getStageKey() + " has not changed for " + (o.getNow() - cursorSince) / 1000 + " s, although ~" + walked + " tiles were walked and the bag changed "
				+ bagChanges + " times"));
		}
		if (o.isWarning())
		{
			if (warnSince < 0)
			{
				warnSince = o.getNow();
			}
			if (o.getNow() - warnSince >= CLAMP_MS)
			{
				out.add(new Finding("CLAMP", o.getStageKey() + "@" + o.getCursor(), "The 'item is still in your bag' warning has held for " + (o.getNow() - warnSince) / 1000
					+ " s at step " + (o.getCursor() + 1) + "/" + o.getSize() + " - the list may be holding the step for nothing"));
			}
		}
		else
		{
			warnSince = -1;
		}
		if (o.getStepId() != null && !o.isHudShown() && !o.isGuideShown())
		{
			if (emptySince < 0)
			{
				emptySince = o.getNow();
			}
			if (o.getNow() - emptySince >= EMPTY_MS)
			{
				out.add(new Finding("EMPTY", o.getStepId(), "Step " + o.getStepId() + " is chosen but there has been neither a plate nor a list on screen for "
					+ (o.getNow() - emptySince) / 1000 + " s"));
			}
		}
		else
		{
			emptySince = -1;
		}
		if (o.isQuestDone() && o.getStageKey() != null && !o.isStageFinished())
		{
			if (doneSince < 0)
			{
				doneSince = o.getNow();
			}
			if (o.getNow() - doneSince >= QUEST_DONE_MS)
			{
				out.add(new Finding("QUEST_DONE", o.getStepId(), "The quest of step " + o.getStepId() + " is complete but the stage list does not show it"));
			}
		}
		else
		{
			doneSince = -1;
		}
		return out;
	}

	private void reset(Observation o)
	{
		stageKey = o.getStageKey();
		cursor = o.getCursor();
		cursorSince = o.getNow();
		lastActive = o.getNow();
		walked = 0;
		bagChanges = 0;
		bagHash = o.getBagHash();
		lastX = o.getX();
		lastY = o.getY();
		lastPlane = o.getPlane();
	}
}
