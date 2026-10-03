package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.List;
import lombok.Value;

/**
 * Сторож движка: ищет в том, что видит игрок, состояния, которых быть не должно, — их и пишет в журнал и на плашку
 * разработчика. Не чинит и ничего не меняет, только замечает:
 *
 *  — {@code STUCK}: шаг этапа не меняется три минуты, хотя игрок ходил и менял сумку, а шаг не из «ручных»;
 *  — {@code CLAMP}: предупреждение «предмет ещё в сумке» висит больше полутора минут (список может держать зря);
 *  — {@code EMPTY}: шаг выбран, а на экране нет ни плашки, ни списка — игрок остался без подсказок;
 *  — {@code QUEST_DONE}: квест пройден, а список этапов это не показывает.
 *
 * Чистая логика: время приходит в наблюдении, поэтому правила проверяются тестами без игры.
 */
final class EngineWatchdog
{
	static final long STUCK_MS = 180_000;
	static final long CLAMP_MS = 90_000;
	static final long EMPTY_MS = 20_000;
	static final long QUEST_DONE_MS = 10_000;
	/** Сколько клеток надо пройти, чтобы считать, что игрок «ходил». */
	static final int MOVED_TILES = 40;
	/** Сколько раз должна измениться сумка, чтобы считать, что игрок «что-то делал». */
	static final int BAG_CHANGES = 3;

	/** Что видно сейчас. stageKey null — у шага этапов нет. */
	@Value
	static class Observation
	{
		long now;
		String stepId;
		String stageKey;
		int cursor;
		int size;
		/** Текущий шаг игра сама не видит — «сделано» вручную; ждать его можно долго. */
		boolean manualOnly;
		/** Шаг просматривают кнопкой «назад». */
		boolean peeking;
		boolean warning;
		int x;
		int y;
		int plane;
		/** Любое число, меняющееся с содержимым сумки. */
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
		/** Ключ для повторов: та же странность на том же шаге не повторяется. */
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
	/** Когда началось условие; -1 — не идёт. Ноль — настоящее время для тестов, поэтому не годится в метки. */
	private long warnSince = -1;
	private long emptySince = -1;
	private long doneSince = -1;

	/** Наблюдение раз в тик (или раз в секунду): вернуть, что стало странным. */
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
			if (o.getPlane() == lastPlane)
			{
				walked += Math.max(Math.abs(o.getX() - lastX), Math.abs(o.getY() - lastY));
			}
			else
			{
				walked += MOVED_TILES;
			}
			if (o.getBagHash() != bagHash)
			{
				bagChanges++;
			}
		}
		lastX = o.getX();
		lastY = o.getY();
		lastPlane = o.getPlane();
		bagHash = o.getBagHash();

		if (o.getStageKey() != null && o.getSize() > 1 && !o.isManualOnly() && !o.isPeeking()
			&& o.getCursor() < o.getSize() - 1 && o.getNow() - cursorSince >= STUCK_MS && (walked >= MOVED_TILES || bagChanges >= BAG_CHANGES))
		{
			out.add(new Finding("STUCK", o.getStageKey() + "@" + o.getCursor(), "Шаг " + (o.getCursor() + 1) + "/" + o.getSize() + " этапа "
				+ o.getStageKey() + " не меняется " + (o.getNow() - cursorSince) / 1000 + " с, хотя пройдено ~" + walked + " клеток и сумка менялась "
				+ bagChanges + " раз"));
		}
		if (o.isWarning())
		{
			if (warnSince < 0)
			{
				warnSince = o.getNow();
			}
			if (o.getNow() - warnSince >= CLAMP_MS)
			{
				out.add(new Finding("CLAMP", o.getStageKey() + "@" + o.getCursor(), "Предупреждение «предмет ещё в сумке» держится " + (o.getNow() - warnSince) / 1000
					+ " с на шаге " + (o.getCursor() + 1) + "/" + o.getSize() + " — список может держать шаг зря"));
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
				out.add(new Finding("EMPTY", o.getStepId(), "Шаг " + o.getStepId() + " выбран, а на экране нет ни плашки, ни списка уже "
					+ (o.getNow() - emptySince) / 1000 + " с"));
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
				out.add(new Finding("QUEST_DONE", o.getStepId(), "Квест шага " + o.getStepId() + " пройден, а список этапов этого не показывает"));
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
		walked = 0;
		bagChanges = 0;
		bagHash = o.getBagHash();
		lastX = o.getX();
		lastY = o.getY();
		lastPlane = o.getPlane();
	}
}
