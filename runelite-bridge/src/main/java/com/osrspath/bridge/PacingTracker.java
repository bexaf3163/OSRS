package com.osrspath.bridge;

import java.util.ArrayDeque;
import java.util.Deque;
import lombok.Value;

/**
 * Темп прокачки: сколько опыта и действий осталось до цели шага и сколько примерно на это уйдёт.
 *
 * Темп меряется по последним пяти прибавкам опыта: опыт между первой и последней из них, делённый на время.
 * Пока прибавок меньше трёх, время не выдумывается — только первая оценка из данных шага (secondsPerAction),
 * если она есть. Пауза дольше трёх минут начинает замер заново: перерыв на банк — не темп.
 * В бою опыт приходит за каждый удар, а действие — целый противник, поэтому там окно шире: последние
 * 30 прибавок, и замер начинается с восьми — иначе темп одного боя без ходьбы между противниками выходил бы
 * слишком быстрым.
 * Без RuneLite: чистый расчёт, проверяется обычным тестом.
 */
final class PacingTracker
{
	static final int HISTORY = 5;
	static final int MIN_GAINS = 3;
	static final int COMBAT_HISTORY = 30;
	static final int COMBAT_MIN_GAINS = 8;
	static final long PAUSE_MS = 3 * 60_000L;
	/** Меньше стольких действий — «почти готово». */
	static final int ALMOST = 5;

	/** Что показать: опыт и действия до цели, темп и время. actionsPerMinute и etaSeconds — null, пока их не знаем. */
	@Value
	static class Snapshot
	{
		int xp;
		int remainingXp;
		int actionsLeft;
		Double actionsPerMinute;
		Long etaSeconds;
		/** Время — оценка из данных шага, а не замер. */
		boolean estimated;
		boolean almost;
		boolean done;
	}

	private final ActiveTarget.Pacing pacing;
	/** Навык этого замера: у шага боя их несколько, у каждого свой. */
	private final String skill;
	private final int history;
	private final int minGains;
	private final Deque<long[]> gains = new ArrayDeque<>();
	private int xp = -1;

	PacingTracker(ActiveTarget.Pacing pacing)
	{
		this(pacing, pacing.getSkill());
	}

	PacingTracker(ActiveTarget.Pacing pacing, String skill)
	{
		this.pacing = pacing;
		this.skill = skill;
		boolean combat = ActiveTarget.Pacing.COMBAT.contains(skill);
		history = combat ? COMBAT_HISTORY : HISTORY;
		minGains = combat ? COMBAT_MIN_GAINS : MIN_GAINS;
	}

	String getSkill()
	{
		return skill;
	}

	/** Опыт навыка; -1 — ещё не знаем. */
	int getXp()
	{
		return xp;
	}

	ActiveTarget.Pacing getPacing()
	{
		return pacing;
	}

	/**
	 * Новое значение опыта навыка. true — что-то изменилось. Первое ненулевое значение — точка отсчёта, не прибавка:
	 * сразу после входа RuneLite ещё отдаёт 0, и весь накопленный опыт иначе засчитался бы одной прибавкой —
	 * темп взлетал до небес, и время показывалось «~0 мин», пока выброс не уходил из последних пяти.
	 */
	boolean update(int currentXp, long nowMs)
	{
		if (currentXp < 0 || currentXp == xp)
		{
			return false;
		}
		if (xp > 0 && currentXp > xp)
		{
			long[] last = gains.peekLast();
			if (last != null && nowMs - last[0] > PAUSE_MS)
			{
				gains.clear();
			}
			gains.addLast(new long[]{nowMs, currentXp - xp});
			while (gains.size() > history)
			{
				gains.removeFirst();
			}
		}
		xp = currentXp;
		return true;
	}

	boolean hasXp()
	{
		return xp > 0;
	}

	Snapshot snapshot()
	{
		int remaining = Math.max(pacing.getTargetExp() - Math.max(xp, 0), 0);
		int actions = (int) Math.ceil(remaining / pacing.getExpPerAction());
		boolean done = xp >= 0 && remaining == 0;
		Double perMinute = null;
		boolean estimated = false;
		if (gains.size() >= minGains)
		{
			long span = gains.peekLast()[0] - gains.peekFirst()[0];
			long gained = 0;
			boolean first = true;
			for (long[] g : gains)
			{
				// Опыт первой прибавки получен до начала отрезка — в темп не входит.
				if (!first)
				{
					gained += g[1];
				}
				first = false;
			}
			if (span > 0 && gained > 0)
			{
				perMinute = gained / pacing.getExpPerAction() / (span / 60_000.0);
			}
		}
		if (perMinute == null && pacing.getSecondsPerAction() != null)
		{
			perMinute = 60.0 / pacing.getSecondsPerAction();
			estimated = true;
		}
		Long eta = perMinute == null || done ? null : Math.round(actions / perMinute * 60);
		return new Snapshot(Math.max(xp, 0), remaining, actions, perMinute, eta, estimated, !done && actions < ALMOST, done);
	}

	/** Строка для HUD: «34 креветки до 20 Fishing (~7 мин)», «Почти готово», «Целевой уровень достигнут». */
	String hudLine(Snapshot s)
	{
		String name = skillName(skill);
		if (s.isDone())
		{
			return "✓ Целевой уровень достигнут: " + pacing.getTargetLevel() + " " + name;
		}
		String line = s.getActionsLeft() + " " + actionForm(pacing.getActionName(), s.getActionsLeft())
			+ " до " + pacing.getTargetLevel() + " " + name;
		if (s.isAlmost())
		{
			return "✓ Почти готово: " + line;
		}
		return line + " (" + eta(s) + ")";
	}

	/** «fishing» → «Fishing»: как навык называется во вкладке навыков игры. */
	static String skillName(String skill)
	{
		return Character.toUpperCase(skill.charAt(0)) + skill.substring(1);
	}

	static String eta(Snapshot s)
	{
		if (s.getEtaSeconds() == null)
		{
			return "время рассчитывается…";
		}
		long min = Math.round(s.getEtaSeconds() / 60.0);
		String time = min < 1 ? "<1 мин" : "~" + min + " мин";
		// Оценка из данных шага, а не замер, — так и написано: в бою она не учитывает ходьбу между противниками.
		return s.isEstimated() ? "оценка " + time : time;
	}

	/** Форма слова для числа: «креветка|креветки|креветок». */
	static String actionForm(String forms, int n)
	{
		String[] f = forms.split("\\|");
		if (f.length < 3)
		{
			return f[0];
		}
		int mod10 = n % 10;
		int mod100 = n % 100;
		if (mod10 == 1 && mod100 != 11)
		{
			return f[0];
		}
		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
		{
			return f[1];
		}
		return f[2];
	}
}
