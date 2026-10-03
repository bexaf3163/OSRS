package com.osrspath.bridge;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Где игрок на этапе квеста: текущий шаг списка. Раньше курсор только полз вперёд — по положению игрока и по клику
 * «шаг сделан» — и проверялся один раз; из-за этого пропущенное уже нельзя было вернуть: игрок добыл руду (шаг не
 * засчитался), прокликал «шаг сделан» мимо сдачи руды Thurgo и остался на «Отнеси меч Squire» с рудой в сумке, не понимая,
 * на каком он шаге. Теперь курсор считается по состоянию, а не только по кликам:
 *
 *  — шаг с has («накопай X») сделан, когда X в сумке;
 *  — шаг с need («верни X NPC») сделан, когда X, что был в сумке, ушёл рядом с точкой шага (отдан) — или игрок сам
 *    подтвердил двойным кликом; пока X в сумке, дальше этого шага курсор не уйдёт — ни по клику, ни по положению;
 *  — если курсор оказался дальше шага «верни X», а X всё ещё в сумке, он возвращается к этому шагу и говорит почему;
 *  — «назад» ставит курсор на шаг раньше и удерживает его: автоматика не прыгает вперёд, пока игрок снова не нажмёт «сделано».
 *
 * Чистая логика — только данные и состояние; плагин зовёт {@link #update} каждый тик, клики — {@link #next} и {@link #back}.
 */
final class StageTracker
{
	/** Дальше этого от точки шага исчезновение предмета не считается сдачей: потерял, выбросил, положил в банк. */
	static final int DELIVER_RADIUS = 12;

	private String key;
	private int cursor;
	/** Наибольшее число предмета need, замеченное в сумке с начала этапа, — по ключу nameKey. */
	private final Map<String, Integer> peak = new HashMap<>();
	/** Шаги с need, которые считаются сданными: предмет ушёл у точки шага или игрок подтвердил. */
	private final Set<Integer> delivered = new HashSet<>();
	/** Игрок вернул курсор сам: автоматика не двигает его вперёд, пока он не нажмёт «шаг сделан». */
	private boolean held;
	/** Первое нажатие «шаг сделан» на шаге «верни X», пока X в сумке: ждём второго. */
	private int pendingSkip = -1;
	private String warning;

	/** Ключ «шаг#этап»: смена — этап другой. null — этапов нет. */
	String key()
	{
		return key;
	}

	int cursor()
	{
		return cursor;
	}

	/** Что не так с курсором: «Blurite ore ещё в сумке — сначала верни его»; null — всё в порядке. */
	String warning()
	{
		return warning;
	}

	boolean held()
	{
		return held;
	}

	void reset()
	{
		key = null;
		cursor = 0;
		peak.clear();
		delivered.clear();
		held = false;
		pendingSkip = -1;
		warning = null;
	}

	/**
	 * Пересчитать курсор. stepId и stage — какой шаг и какой этап показан; lines — его шаги; x, y, plane — игрок;
	 * bag — сумка, надетое и банкноты. Возвращает текущий шаг (с нуля).
	 */
	int update(String stepId, int stage, List<ActiveTarget.StageLine> lines, int x, int y, int plane, ItemCounts bag)
	{
		String next = stepId + "#" + stage;
		boolean fresh = !next.equals(key);
		// Этап сменился у нас на глазах (игрок поговорил с NPC, игра перевела квест дальше): ни один шаг нового этапа ещё не
		// сделан. Этап открыт впервые (вход в игру, новый шаг): игрок мог пройти часть шагов — ищем по всему списку.
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
		observe(lines, x, y, plane, bag);
		if (held)
		{
			// Игрок вернул курсор сам — не трогаем, только следим за сдачей предметов.
			return cursor;
		}
		int window = fresh ? StepGuide.freshWindow(changed, lines.size()) : StepGuide.STEP_WINDOW;
		cursor = StepGuide.advance(lines, cursor, x, y, plane, window, bag);
		cursor = skip(lines, cursor, bag);
		clamp(lines, bag);
		remind(lines, bag);
		return cursor;
	}

	/** Игрок нажал «шаг сделан» на несданном шаге и ещё не подтвердил: предупреждение висит, пока предмет в сумке. */
	private void remind(List<ActiveTarget.StageLine> lines, ItemCounts bag)
	{
		if (pendingSkip < 0)
		{
			return;
		}
		ActiveTarget.StageLine l = lines.get(Math.min(pendingSkip, lines.size() - 1));
		if (pendingSkip == cursor && bag != null && l.hasNeed() && bag.count(null, l.getNeed()) > 0)
		{
			warning = pendingText(l);
		}
		else
		{
			pendingSkip = -1;
		}
	}

	private static String pendingText(ActiveTarget.StageLine l)
	{
		return l.getNeed() + " ещё в сумке — не отдан. Нажми ещё раз, если уже отдал.";
	}

	/**
	 * Следим за предметами шагов «верни X»: сколько X побывало в сумке и не ушло ли оно у точки шага — тогда шаг сдан,
	 * и всё, что до него, тоже (сдать, не сделав предыдущего, нельзя).
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
				if (!held)
				{
					cursor = Math.max(cursor, Math.min(i + 1, last));
				}
			}
		}
	}

	private static boolean near(ActiveTarget.StageLine l, int x, int y, int plane)
	{
		return l.getPlane() == plane && Math.abs(l.getX() - x) <= DELIVER_RADIUS && Math.abs(l.getY() - y) <= DELIVER_RADIUS;
	}

	/** Шаг сделан по предметам: has — предмет в сумке; need — сдан. */
	private boolean satisfied(List<ActiveTarget.StageLine> lines, int i, ItemCounts bag)
	{
		ActiveTarget.StageLine l = lines.get(i);
		return delivered.contains(i) || (bag != null && l.hasHas() && bag.count(null, l.getHas()) > 0);
	}

	/**
	 * Шаги, которые по предметам уже сделаны, — вперёд от курсора. Кроме самого шага ещё и те, что перед ним без условий
	 * (спуститься в пещеру, дойти): есть руда — значит, в пещере уже были. Через шаги с has/need не перепрыгиваем:
	 * предметы можно собирать в любом порядке. Последний шаг этапа не пропускается — этап кончится, когда игра сменит
	 * значение переменной.
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

	/** Первый несданный шаг «верни X», пока X в сумке: дальше него курсор не уходит. -1 — такого нет. */
	private int blocker(List<ActiveTarget.StageLine> lines, int upTo, ItemCounts bag)
	{
		if (bag == null)
		{
			return -1;
		}
		for (int i = 0; i <= Math.min(upTo, lines.size() - 1); i++)
		{
			ActiveTarget.StageLine l = lines.get(i);
			if (l.hasNeed() && !delivered.contains(i) && bag.count(null, l.getNeed()) > 0)
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
			warning = lines.get(b).getNeed() + " ещё в сумке — сначала: " + lines.get(b).shown();
			cursor = b;
		}
	}

	/**
	 * Клик «шаг сделан». На шаге «верни X», пока X в сумке, — первое нажатие только предупреждает (X ещё не отдан), второе
	 * подтверждает. Возвращает false, если шаг не засчитан, — тогда {@link #warning()} объясняет почему.
	 */
	boolean next(List<ActiveTarget.StageLine> lines, ItemCounts bag)
	{
		if (lines == null || lines.isEmpty())
		{
			return false;
		}
		int last = lines.size() - 1;
		int at = Math.max(0, Math.min(cursor, last));
		ActiveTarget.StageLine l = lines.get(at);
		boolean holding = bag != null && l.hasNeed() && !delivered.contains(at) && bag.count(null, l.getNeed()) > 0;
		if (holding && pendingSkip != at)
		{
			pendingSkip = at;
			warning = pendingText(l);
			return false;
		}
		pendingSkip = -1;
		warning = null;
		held = false;
		if (l.hasNeed())
		{
			delivered.add(at);
		}
		cursor = Math.min(at + 1, last);
		return true;
	}

	/** Клик «назад»: шаг раньше, и автоматика не уносит курсор вперёд, пока игрок снова не нажмёт «шаг сделан». */
	void back()
	{
		if (cursor <= 0)
		{
			return;
		}
		cursor--;
		held = true;
		pendingSkip = -1;
		warning = null;
		// Вернулись к шагу «верни X» — он снова не сдан.
		delivered.remove(cursor);
	}
}
