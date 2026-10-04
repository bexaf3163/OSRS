package com.osrspath.bridge;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.LongSupplier;

/**
 * Где игрок на этапе квеста: текущий шаг списка. Курсор считается только по тому, что видно в игре, — вперёд его двигают
 * не клики, а факты, иначе по списку легко «прощёлкать» мимо шага и не понять, где ты (так было в The Knight's Sword:
 * руду добыли, шаг не засчитался, «сделано» нажали мимо сдачи руды Thurgo — и список показывал «Отнеси меч Squire» с
 * рудой в сумке). Факты:
 *
 *  — положение: игрок дошёл до одного из ближайших следующих шагов с клеткой (StepGuide.advance);
 *  — шаг с has («накопай X», «купи X», «получишь X») сделан, когда X в сумке; шаги без условий перед ним — тоже;
 *  — шаг с need («верни X NPC») сделан, когда X, что был в сумке, ушёл рядом с точкой шага (отдан). Пока X в сумке, дальше
 *    этого шага курсор не уйдёт, — вернётся и скажет почему;
 *  — этап сменила игра (переменная квеста) — отсчёт заново.
 * Вперёд по клику можно только там, где игра сама ничего не покажет ({@link #needsManualStep}: шаги подряд на одном
 * месте — «опусти рычаг A», «опусти рычаг B», — их по положению и предметам не различить). Остальные шаги пропустить нельзя:
 * курсор ведут факты. «Назад» — посмотреть предыдущий шаг: курсор держится {@link #PEEK_MS}, потом автоматика снова ведёт
 * по фактам; «к текущему» возвращает сразу.
 *
 * Чистая логика — только данные и состояние; плагин зовёт {@link #update} каждый тик, клики — {@link #back}, {@link #resume}
 * и {@link #forward}.
 */
final class StageTracker
{
	/** Дальше этого от точки шага исчезновение предмета не считается сдачей: потерял, выбросил, положил в банк. */
	static final int DELIVER_RADIUS = 12;
	/** Сколько держится просмотр прежнего шага, мс: хватает перечитать и вернуться к делу, не успев запутаться. */
	static final long PEEK_MS = 45_000;
	/** Побывав у точки шага, отошёл дальше этого — шаг сделан (путь в доме петляет: прямо к следующей точке игрок не идёт). */
	static final int LEAVE_RADIUS = 6;
	/** Игрок «был у шага», если подходил к его точке ближе этого: NPC и объекты стоят не ровно на точке из данных. */
	static final int VISIT_RADIUS = 8;
	/**
	 * Шаг-переход: дойти — значит сделать; в отличие от «положи», «наполни», «убей», где пройти мимо — не значит сделать. Перед глаголом
	 * бывает название места («Seaman на пристани: плыви на Musa Point») и короткая подготовка («Подготовься к бою и войди в…»,
	 * «С Dramen staff в руке войди в…») — это тот же переход, иначе после лодки курсор остаётся на «плыви» и стрелка ведёт назад.
	 */
	private static final java.util.regex.Pattern MOVE = java.util.regex.Pattern.compile(
		"^(?:[^:]{1,60}:\\s*)?(?:(?:Подготовься к бою и|С [^,:]{1,40} в руке)\\s+)?"
			+ "(?:Иди|Идти|Войди|Зайди|Спустись|Поднимись|Поднимайся|Спускайся|Плыви|Проплыви|Отплыви|Переплыви|Поплыви|Отправляйся|Направляйся|Вернись|Доберись|"
			+ "Пройди|Выйди|Выберись|Телепортируйся|Беги|Залезь|Перелезь|Перейди|Поезжай|Лети|Улети|Сядь|Обойди|Следуй|Прыгни|Пройдись)(?![\\p{L}])",
		java.util.regex.Pattern.CASE_INSENSITIVE | java.util.regex.Pattern.UNICODE_CASE);

	private final LongSupplier clock;
	private String key;
	private int cursor;
	/** Наибольшее число предмета need, замеченное в сумке с начала этапа, — по ключу nameKey. */
	private final Map<String, Integer> peak = new HashMap<>();
	/** Шаги с need, которые считаются сданными: предмет ушёл у точки шага. */
	private final Set<Integer> delivered = new HashSet<>();
	/** До какого момента держится просмотр прежнего шага (мс по часам); 0 — не просматриваем. */
	private long peekUntil;
	private String warning;
	/** Игрок побывал у точки текущего шага (visitedAt — у какого именно): уйдя к следующей точке, он считается сделавшим этот шаг. */
	private boolean visited;
	/** Шаги, к точке которых игрок подходил в этом этапе (в пределах {@link #VISIT_RADIUS}). */
	private final Set<Integer> seen = new HashSet<>();
	private int visitedAt = -1;
	/** Почему курсор сдвинулся в последний раз: «POSITION», «ITEM», «DELIVERED», «CLAMP», «BACK», «MANUAL», «RESET» и подробности. */
	private String reason = "";

	StageTracker()
	{
		this(System::currentTimeMillis);
	}

	StageTracker(LongSupplier clock)
	{
		this.clock = clock;
	}

	/** Ключ «шаг#этап»: смена — этап другой. null — этапов нет. */
	String key()
	{
		return key;
	}

	int cursor()
	{
		return cursor;
	}

	/** Что не так с курсором: «Blurite ore ещё в сумке — сначала: Верни Thurgo…»; null — всё в порядке. */
	String warning()
	{
		return warning;
	}

	/** Причина последнего сдвига курсора — для журнала отладки: «POSITION: дошёл до шага 3», «DELIVERED: Blurite ore». */
	/** Предмет текущей строки уже сдан — для плашки разработчика. */
	boolean delivered()
	{
		return delivered.contains(cursor);
	}

	/** Причина последнего сдвига курсора — для журнала отладки: «POSITION: дошёл до шага 3», «DELIVERED: Blurite ore». */
	String reason()
	{
		return reason;
	}

	/** Игрок смотрит прежний шаг (кнопка «назад»): автоматика пока не двигает курсор. */
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
		if (peekUntil != 0 && !peeking())
		{
			peekUntil = 0;
		}
		int c0 = cursor;
		observe(lines, x, y, plane, bag);
		if (peeking())
		{
			// Игрок смотрит прежний шаг — не трогаем, только следим за сдачей предметов.
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
			// По положению нельзя перепрыгнуть шаг, который сделать надо, а увидеть нечем: игрок, добежав до следующей точки, не
			// отметил «положи ром в ящик» и «наполни ящик» — они пропускались молча (S2-09). Курсор встаёт на первом таком шаге:
			// на «сделано» (игра его не покажет) или с возвратом к его месту (там ещё не были).
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
						warning = stop.getNeed() + " ещё в сумке — сначала: " + stop.shown();
					}
					reason = (gate ? "GATE: шаг " + (g + 1) + " «" + lines.get(g).shown() + "» игра сама не увидит — отметь «сделано»"
						: "BLOCK: шаг " + (g + 1) + " «" + lines.get(g).shown() + "» не сделан — вернись к его месту");
					break;
				}
			}
		}
		if (cursor != c1 && !gated)
		{
			reason = "POSITION: дошёл до шага " + (cursor + 1) + " «" + lines.get(cursor).shown() + "»";
		}
		int c2 = cursor;
		cursor = skip(lines, cursor, bag);
		if (cursor != c2)
		{
			reason = "ITEM: шаги " + (c2 + 1) + "–" + cursor + " сделаны по предметам, дальше «" + lines.get(cursor).shown() + "»";
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
				if (!peeking())
				{
					int before = cursor;
					cursor = Math.max(cursor, Math.min(i + 1, last));
					if (cursor != before)
					{
						reason = "DELIVERED: " + l.getNeed() + " ушёл у шага " + (i + 1) + " «" + l.shown() + "»";
					}
				}
			}
		}
	}

	private static boolean near(ActiveTarget.StageLine l, int x, int y, int plane)
	{
		return l.getPlane() == plane && Math.abs(l.getX() - x) <= DELIVER_RADIUS && Math.abs(l.getY() - y) <= DELIVER_RADIUS;
	}

	/** Шаг сделан сам по себе: сдан (need) или нужный предмет сейчас в сумке (has). */
	private boolean ownSatisfied(List<ActiveTarget.StageLine> lines, int i, ItemCounts bag)
	{
		ActiveTarget.StageLine l = lines.get(i);
		return delivered.contains(i) || (bag != null && l.hasHas() && bag.count(null, l.getHas()) > 0);
	}

	/**
	 * Шаг сделан: сам по себе или потому, что предмет, который он добывал (has), уже ушёл дальше — следующий шаг сдал его
	 * (need того же предмета). Так «купи пиво» остаётся сделанным, когда пиво уже отдано Dr. Harlow и в сумке вместо него кол.
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
			warning = lines.get(b).getNeed() + " ещё в сумке — сначала: " + lines.get(b).shown();
			cursor = b;
		}
	}

	/**
	 * Клик «назад»: посмотреть шаг раньше. Автоматика не уносит курсор вперёд {@link #PEEK_MS}, потом вернёт его по фактам;
	 * ещё клик — ещё шаг назад (и ещё столько же времени).
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
		reason = "BACK: просмотр шага " + (cursor + 1);
	}

	/** Шаг-переход («Войди в…», «Спустись…», «Вернись в…»): дойти до места — значит сделать. */
	static boolean isMove(ActiveTarget.StageLine l)
	{
		return !l.hasHas() && !l.hasNeed() && MOVE.matcher(l.shown().trim()).find();
	}

	/** Можно ли пройти этот шаг по положению: это переход, он подтверждён предметом или игрок был у его точки. */
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
	 * Побывал у точки шага и ушёл от неё (дальше {@link #LEAVE_RADIUS} клеток или ближе к следующей) — шаг сделан. Без этого курсор стоял на «войди в дом», пока игрок не
	 * подойдёт к следующей точке на четыре клетки: внутри дома стрелка оставалась у двери, куда он уже дошёл (S2-08, подвал
	 * Draynor Manor). Только для шагов, где игре больше нечем подтвердить дело: есть клетка у этого и у следующего шага, на
	 * них нет условий has/need, точки разные и на одном этаже. Постоять у NPC и не уйти — шаг остаётся.
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
			// Отойти от «наполни ящик» — не значит наполнить: только переходы закрываются уходом.
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
		// У следующего шага могут быть свои условия (предмет в сумке): это не мешает закончить переход — он закончен, когда ушёл.
		if (!cur.hasPoint() || !nx.hasPoint() || cur.hasNeed() || cur.hasHas() || cur.getPlane() != plane || nx.getPlane() != plane || sameSpot(cur, nx))
		{
			return;
		}
		int toCur = Math.max(Math.abs(cur.getX() - x), Math.abs(cur.getY() - y));
		int toNext = Math.max(Math.abs(nx.getX() - x), Math.abs(nx.getY() - y));
		if (toNext < toCur || toCur > LEAVE_RADIUS)
		{
			cursor++;
			reason = "LEFT: был у шага " + cursor + " «" + cur.shown() + "» и пошёл к следующему «" + nx.shown() + "»";
		}
	}

	/**
	 * Выйдет ли игрок из шага сам: следующий шаг с клеткой не на том же месте (дошёл — курсор перешёл) или с предметом (добыл
	 * или сдал); последний шаг этапа сменит игра. Иначе шаг только вручную: подряд на одном месте или без места — различить нечем.
	 */
	static boolean needsManualStep(List<ActiveTarget.StageLine> lines, int i)
	{
		if (lines == null || i < 0 || i >= lines.size() - 1)
		{
			return false;
		}
		// Решает именно следующий шаг: пока он не виден по игре, его текст не покажется (две рычага подряд — второй спрятан).
		ActiveTarget.StageLine cur = lines.get(i);
		ActiveTarget.StageLine nx = lines.get(i + 1);
		if (nx.hasHas() || nx.hasNeed())
		{
			return false;
		}
		// Шаг без клетки и без предмета ничем не подтвердить: «Нарви бананов», «Используй X на Y» — только отметкой.
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

	/** Можно ли нажать «сделано» на текущем шаге: он из тех, что игра сама не увидит. */
	boolean canStepForward(List<ActiveTarget.StageLine> lines)
	{
		return !peeking() && needsManualStep(lines, cursor);
	}

	/** Клик «сделано» — только на шаге, который по игре не определить; на остальных не делает ничего. true — курсор сдвинут. */
	boolean forward(List<ActiveTarget.StageLine> lines)
	{
		if (!canStepForward(lines))
		{
			return false;
		}
		cursor++;
		warning = null;
		reason = "MANUAL: «сделано» на шаге " + cursor + " (игра его сама не видит)";
		return true;
	}

	/** Клик «к текущему»: просмотр закончен, курсор снова считается по фактам — сразу, без ожидания. */
	void resume()
	{
		peekUntil = 0;
		reason = "RESUME";
	}
}
