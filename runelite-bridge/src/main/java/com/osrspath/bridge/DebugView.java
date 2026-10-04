package com.osrspath.bridge;

import java.awt.Color;
import java.util.ArrayList;
import java.util.List;
import lombok.Value;

/**
 * The developer badge (Ctrl+Shift+D): the engine status in green and red over the game screen:
 * {@code ActiveStep: S2-05 | Stage: 3/9 | Cursor: 2/5 | Trigger: Item(Lobster ×5) = FALSE | QueueDepth: 1}.
 * Only the row layout by state is here (pure logic for tests); the plugin collects the state, and
 * {@link OsrsPathDebugOverlay} draws it. Each line is marked with a level: "fine" in green, "wrong" in red.
 */
final class DebugView
{
	enum Level
	{
		GOOD(new Color(90, 220, 120)),
		BAD(new Color(255, 100, 90)),
		WARN(new Color(255, 190, 70)),
		INFO(new Color(200, 200, 200));

		final Color color;

		Level(Color color)
		{
			this.color = color;
		}
	}

	@Value
	static class Row
	{
		String text;
		Level level;
	}

	/** Everything the badge shows. Immutable: the plugin replaces it whole once per tick while the badge is open. */
	@Value
	static class State
	{
		String stepId;
		/** "3/9"; null means the step has no stages. */
		String stage;
		/** The quest variable's value; null means none. */
		Integer stageValue;
		int cursor;
		int size;
		String lineText;
		boolean manualOnly;
		boolean peeking;
		String warning;
		/** The conditions of the current step: "has Blurite ore = FALSE", "need Blurite ore = TRUE"; a line starts with the condition. */
		List<String> lineConditions;
		/** The step's auto-tick condition, as in {@link AutoCompletionManager#describe}. */
		List<String> trigger;
		/** How many "needed now" plan lines are still not done; -1 means no plan. */
		int queueDepth;
		/** "seq 1712... 3 s ago", null means there were no snapshots. */
		String snapshot;
		Integer planPercent;
		String reason;
		String bag;
		String pos;
		long tick;
		boolean hudShown;
		boolean guideShown;
		boolean logging;
		String logFile;
		int events;
		int anomalies;
		/** The latest anomalies (up to three), the freshest last. */
		List<String> recentAnomalies;
		/** The name of the last screenshot; null means none was taken. */
		String lastShot;
	}

	private DebugView()
	{
	}

	static boolean isFalse(String condition)
	{
		return condition.contains("FALSE");
	}

	static List<Row> rows(State s)
	{
		List<Row> out = new ArrayList<>();
		StringBuilder head = new StringBuilder("ActiveStep: ").append(s.getStepId() == null ? "—" : s.getStepId());
		if (s.getStage() != null)
		{
			head.append(" | Stage: ").append(s.getStage());
			if (s.getStageValue() != null)
			{
				head.append(" (var=").append(s.getStageValue()).append(')');
			}
			head.append(" | Cursor: ").append(s.getCursor() + 1).append('/').append(s.getSize());
			head.append(s.isPeeking() ? " [peek]" : s.isManualOnly() ? " [manual-only]" : " [auto]");
		}
		out.add(new Row(head.toString(), s.getStepId() == null ? Level.BAD : s.getWarning() != null ? Level.BAD : s.isPeeking() ? Level.WARN : Level.GOOD));
		if (s.getLineText() != null)
		{
			out.add(new Row("Line: " + s.getLineText(), Level.INFO));
		}
		for (String c : s.getLineConditions())
		{
			out.add(new Row("  " + c, isFalse(c) ? Level.BAD : Level.GOOD));
		}
		if (s.getWarning() != null)
		{
			out.add(new Row("Warning: " + s.getWarning(), Level.BAD));
		}
		if (s.getReason() != null && !s.getReason().isEmpty())
		{
			out.add(new Row("Why: " + s.getReason(), Level.INFO));
		}
		StringBuilder trig = new StringBuilder("Trigger: ");
		boolean bad = false;
		if (s.getTrigger().isEmpty())
		{
			trig.append("—");
		}
		else
		{
			trig.append(String.join(" & ", s.getTrigger()));
			bad = s.getTrigger().stream().anyMatch(DebugView::isFalse);
		}
		trig.append(" | QueueDepth: ").append(s.getQueueDepth() < 0 ? "—" : String.valueOf(s.getQueueDepth()));
		out.add(new Row(trig.toString(), s.getTrigger().isEmpty() ? Level.INFO : bad ? Level.BAD : Level.GOOD));
		StringBuilder snap = new StringBuilder("Snapshot: ").append(s.getSnapshot() == null ? "none" : s.getSnapshot());
		if (s.getPlanPercent() != null)
		{
			snap.append(" | Plan: ").append(s.getPlanPercent()).append('%');
		}
		out.add(new Row(snap.toString(), s.getSnapshot() == null ? Level.WARN : Level.GOOD));
		out.add(new Row("Bag: " + s.getBag() + " | Pos: " + s.getPos() + " | Tick: " + s.getTick(), Level.INFO));
		boolean empty = s.getStepId() != null && !s.isHudShown() && !s.isGuideShown();
		out.add(new Row("Screen: HUD " + yes(s.isHudShown()) + ", list " + yes(s.isGuideShown()), empty ? Level.BAD : Level.GOOD));
		for (String a : s.getRecentAnomalies())
		{
			out.add(new Row("⚠ " + a, Level.BAD));
		}
		out.add(new Row(s.isLogging()
			? "Log: " + s.getEvents() + " events, " + s.getAnomalies() + " anomalies -> " + s.getLogFile()
			: "Log: off (setting 'Debug log')", s.getAnomalies() > 0 ? Level.WARN : Level.INFO));
		if (s.getLastShot() != null)
		{
			out.add(new Row("Shot: " + s.getLastShot(), Level.INFO));
		}
		return out;
	}

	private static String yes(boolean b)
	{
		return b ? "yes" : "NO";
	}

	/** The lines of text in a row, for the log and tests. */
	static String plain(List<Row> rows)
	{
		StringBuilder sb = new StringBuilder();
		for (Row r : rows)
		{
			if (sb.length() > 0)
			{
				sb.append('\n');
			}
			sb.append(r.getText());
		}
		return sb.toString();
	}
}
