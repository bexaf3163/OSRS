package com.osrspath.bridge;

import java.awt.Color;
import java.util.ArrayList;
import java.util.List;
import lombok.Value;

/**
 * Плашка разработчика (Ctrl+Shift+D): статус движка зелёным и красным поверх экрана игры —
 * {@code ActiveStep: S2-05 | Stage: 3/9 | Cursor: 2/5 | Trigger: Item(Lobster ×5) = FALSE | QueueDepth: 1}.
 * Здесь только раскладка строк по состоянию (чистая логика для тестов); состояние собирает плагин, рисует
 * {@link OsrsPathDebugOverlay}. Каждая строка помечена уровнем: «в порядке» — зелёным, «не так» — красным.
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

	/** Всё, что показывает плашка. Неизменяемое: плагин заменяет его целиком раз в тик, пока плашка открыта. */
	@Value
	static class State
	{
		String stepId;
		/** «3/9»; null — у шага нет этапов. */
		String stage;
		/** Значение переменной квеста; null — нет. */
		Integer stageValue;
		int cursor;
		int size;
		String lineText;
		boolean manualOnly;
		boolean peeking;
		String warning;
		/** Условия текущего шага: «has Blurite ore = FALSE», «need Blurite ore = TRUE»; строка начинается с условия. */
		List<String> lineConditions;
		/** Условие автоотметки шага — как в {@link AutoCompletionManager#describe}. */
		List<String> trigger;
		/** Сколько строк плана «нужно сейчас» ещё не выполнено; -1 — плана нет. */
		int queueDepth;
		/** «seq 1712… 3 с назад», null — снимков не было. */
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
		/** Последние странности (до трёх), свежие последними. */
		List<String> recentAnomalies;
		/** Имя последнего скриншота; null — не делали. */
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
		StringBuilder snap = new StringBuilder("Snapshot: ").append(s.getSnapshot() == null ? "нет" : s.getSnapshot());
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
			? "Log: " + s.getEvents() + " событий, " + s.getAnomalies() + " странностей → " + s.getLogFile()
			: "Log: выключен (настройка «Журнал для отладки»)", s.getAnomalies() > 0 ? Level.WARN : Level.INFO));
		if (s.getLastShot() != null)
		{
			out.add(new Row("Shot: " + s.getLastShot(), Level.INFO));
		}
		return out;
	}

	private static String yes(boolean b)
	{
		return b ? "да" : "НЕТ";
	}

	/** Текст строк подряд — для журнала и тестов. */
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
