package com.osrspath.bridge;

import java.awt.Color;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import lombok.Value;

/**
 * Что показывают список «Что нужно» в игре и боковая панель «OSRS Путь»: предметы шага — есть ли (сумка, банк),
 * где взять и к какой точке повести стрелку, — и точки шага. Чистая логика: плагин считает её на потоке клиента,
 * список и панель только рисуют.
 */
final class StepGuide
{
	enum Have
	{
		/** В сумке или надето сколько нужно. */
		BAG,
		/** Не в сумке, но в банке хватает. */
		BANK,
		/** Нет нигде (банк открывали). */
		NONE,
		/** Банк в этой сессии не открывали — неизвестно. */
		UNKNOWN,
		/** Добывается по ходу шага, заранее брать не нужно. */
		IN_STEP,
		/** Уже было в сумке в этом шаге, а теперь нет — отдали, съели или использовали. Снова искать не надо. */
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
		/** Для панели: «Lobster ×5 (Омар)». */
		String title;
		/** Для панели: «в банке — возьми (1+9/5)». */
		String status;
		Have have;
		String where;
		/** Номер точки, где берут этот предмет; -1 — такой точки нет. */
		int place;
		/** Для списка в игре: английское название, как в сумке, — «Lobster ×5». */
		String name;
		/** Русское название или null. */
		String ru;
		/** Для списка в игре: коротко справа — «есть», «в банке», «нет», «2/5», «по ходу», «в банке?». */
		String tag;
	}

	@Value
	static class PlaceLine
	{
		String label;
		int index;
		/** Стрелка сейчас ведёт сюда. */
		boolean active;
		/** NPC у точки (подсветится, когда стрелка ведёт сюда) или null. */
		String npc;
		/** Здесь берут предметы шага — подпись о предмете («Лук — грядка»), а не о NPC. */
		boolean items;
	}

	@Value
	static class View
	{
		String title;
		String goal;
		List<ItemLine> items;
		List<PlaceLine> places;
		/** Стрелка ведёт не к шагу, а к этой временной цели; null — к шагу. */
		String detour;
		/** Сообщение вместо шага: «шаг не выбран», «навигация выключена»… */
		String note;
		/** Что делать дальше, когда всё нужное уже собрано (последний пункт быстрого пути шага); null — рано. */
		String next;
		/** Последний пункт быстрого пути шага — всегда (с кем закончить); null — пунктов нет. */
		String finale;
		/** Этап квеста по переменной игры; null — у шага этапов нет или игра переменную не отдала. */
		StageView stage;

		View(String title, String goal, List<ItemLine> items, List<PlaceLine> places, String detour, String note, String next, String finale)
		{
			this(title, goal, items, places, detour, note, next, finale, null);
		}

		View(String title, String goal, List<ItemLine> items, List<PlaceLine> places, String detour, String note, String next,
			String finale, StageView stage)
		{
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

		/** То же с другим состоянием этапа (предупреждение и «вручную»). */
		View withStage(StageView s)
		{
			return new View(title, goal, items, places, detour, note, next, finale, s);
		}

		/** То же с другим сообщением (guideMessage плагина). */
		View withNote(String message)
		{
			return new View(title, goal, items, places, detour, message, next, finale, stage);
		}
	}

	/** Где игрок в квесте: этап k из n, что делать сейчас и пройден ли квест. */
	@Value
	static class StageView
	{
		/** С единицы. */
		int index;
		int total;
		/** Что делать на этапе — шаги по порядку. */
		List<ActiveTarget.StageLine> steps;
		/** Номер шага, на котором игрок сейчас (с нуля): до него — сделано. */
		int cursor;
		/** Квест пройден (Quest.getState) — этапы больше не нужны. */
		boolean finished;
		/** Что не так с шагом («Blurite ore ещё в сумке — сначала: …»); null — всё в порядке. */
		String warning;
		/** Игрок вернул шаг сам — автоматика не двигает его, пока не нажато «сделано». */
		boolean held;

		StageView(int index, int total, List<ActiveTarget.StageLine> steps, int cursor, boolean finished)
		{
			this(index, total, steps, cursor, finished, null, false);
		}

		StageView(int index, int total, List<ActiveTarget.StageLine> steps, int cursor, boolean finished, String warning, boolean held)
		{
			this.index = index;
			this.total = total;
			this.steps = steps;
			this.cursor = cursor;
			this.finished = finished;
			this.warning = warning;
			this.held = held;
		}

		StageView with(String warning, boolean held)
		{
			return new StageView(index, total, steps, cursor, finished, warning, held);
		}
	}

	static final View EMPTY = new View(null, null, Collections.emptyList(), Collections.emptyList(), null,
		"Шаг не выбран. В программе «OSRS Путь» нажми «Показать в игре» у шага — здесь появится, что нужно и куда идти.", null, null);

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
	 * Строки панели и списка. carried — сумка и надетое (с банкнотами), bank — null, если банк не открывали.
	 * navLabel — подпись временной цели или null; navX/navY — её клетка, чтобы отметить активную точку.
	 */
	static View view(ActiveTarget t, ItemCounts carried, ItemCounts bank, String navLabel, int navX, int navY, int navPlane)
	{
		return view(t, carried, bank, navLabel, navX, navY, navPlane, null);
	}

	/**
	 * got — предметы шага, которые уже побывали в сумке (ключи nameKey). Они пополняются здесь же: то, что взяли и потом
	 * отдали (Hetty, котёл, лавка), в списке остаётся отмеченным, а не просится в сумку заново. null — без памяти.
	 */
	static View view(ActiveTarget t, ItemCounts carried, ItemCounts bank, String navLabel, int navX, int navY, int navPlane, Set<String> got)
	{
		return view(t, carried, bank, navLabel, navX, navY, navPlane, got, null, false);
	}

	/**
	 * stageValue — значение переменной квеста из игры (null — не знаем), questDone — Quest.getState == FINISHED.
	 * У шага с этапами показывается только текущий: что делать, предметы этого этапа и одна точка. Квест пройден —
	 * только «пройден». Нет значения или этапов — список шага целиком, как раньше.
	 */
	static View view(ActiveTarget t, ItemCounts carried, ItemCounts bank, String navLabel, int navX, int navY, int navPlane, Set<String> got,
		Integer stageValue, boolean questDone)
	{
		return view(t, carried, bank, navLabel, navX, navY, navPlane, got, stageValue, questDone, 0);
	}

	/** Радиус «дошёл до шага», клеток. */
	static final int STEP_RADIUS = 4;
	/** Насколько вперёд от текущего шага ищем следующий: пройденный по дороге чужой шаг не перескакивает полэтапа. */
	static final int STEP_WINDOW = 4;

	/**
	 * Куда сдвинуть текущий шаг этапа по положению игрока. Стоит у своего шага — остаётся; дошёл до одного из ближайших
	 * следующих — переходит на него. Шаги без клетки (подумать, подождать) перескакиваются, когда игрок дошёл дальше.
	 */
	static int advance(List<ActiveTarget.StageLine> lines, int cursor, int x, int y, int plane)
	{
		return advance(lines, cursor, x, y, plane, STEP_WINDOW);
	}

	/**
	 * Насколько вперёд искать шаг, когда этап только что показали. Этап сменился на глазах (игрок поговорил с NPC, и игра
	 * перевела квест дальше) — ни один шаг нового этапа ещё не сделан, начинаем с первого: иначе стоящий у NPC игрок
	 * «уже дошёл» до шага «верни ему предмет» дальше по списку, и стрелка ведёт туда, где он и так стоит. Этап открыт
	 * впервые (вход в игру, новый шаг): игрок мог пройти часть шагов — ищем по всему списку.
	 */
	static int freshWindow(boolean changedWhileWatching, int size)
	{
		return changedWhileWatching ? 0 : size;
	}

	/**
	 * window — насколько вперёд искать. Этап открыт впервые (курсор в нуле, игрок мог уже пройти часть шагов — например,
	 * у этапа весь маршрут целиком): ищем по всему списку, первый подходящий.
	 */
	static int advance(List<ActiveTarget.StageLine> lines, int cursor, int x, int y, int plane, int window)
	{
		return advance(lines, cursor, x, y, plane, window, null);
	}

	/**
	 * carried — что в сумке: шаг с условием need («верни руду») засчитывается по месту, только если предмет есть.
	 * null — предметы неизвестны, условия не проверяются.
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
	 * Шаги, которые по предметам уже сделаны: у шага указан предмет (has), и он в сумке — идём дальше. Последний шаг
	 * этапа не пропускается: этап кончится сам, когда игра сменит значение переменной.
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

	/** cursor — текущий шаг этапа (advance); вне диапазона — ближайший допустимый. */
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
			items.add(remembered(item(i, places, carried, bank), i.getName(), got));
		}
		List<PlaceLine> placeLines = new ArrayList<>();
		for (int i = 0; i < places.size(); i++)
		{
			if (stageView != null && (stageView.isFinished() || cur.getGo() == null || cur.getGo() != i))
			{
				// У этапа одна точка — куда идти сейчас; остальные места шага к нему не относятся.
				continue;
			}
			ActiveTarget.GuidePlace p = places.get(i);
			boolean active = navLabel != null && p.getX() == navX && p.getY() == navY && p.getPlane() == navPlane;
			String npc = p.getNpc() == null || p.getNpc().isEmpty() ? null : p.getNpc();
			placeLines.add(new PlaceLine(p.getLabel(), i, active, npc, stageView == null && p.getItems() != null && !p.getItems().isEmpty()));
		}
		String title = "[" + t.getStepId() + "] " + (t.getTitle() == null ? "" : t.getTitle());
		String note = g == null ? "Программа старше плагина: списка «что нужно» от неё не пришло. Обнови программу «OSRS Путь»." : null;
		boolean staged = stageView != null;
		// Стрелка этапа (к текущему шагу или к точке этапа) — не «объезд»: «Стрелку снова к шагу» нужно только после выбора своего места.
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
	 * Взято ли уже: в сумке — запоминаем; было, а теперь нет — «готово». Добываемое по ходу шага (IN_STEP) тоже помнится,
	 * но только когда оно действительно побывало в сумке.
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
			return new ItemLine(l.getTitle(), "✓ уже было — отдано или использовано", Have.DONE, l.getWhere(), l.getPlace(), l.getName(), l.getRu(), "готово");
		}
		return l;
	}

	private static String finale(ActiveTarget.Guide g)
	{
		return g == null || g.getSteps() == null || g.getSteps().isEmpty() ? null : g.getSteps().get(g.getSteps().size() - 1);
	}

	/** Последний пункт быстрого пути шага, когда всё нужное уже собрано; иначе null — списка предметов достаточно. */
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
			status = "✓ в сумке" + (need > 1 ? " " + have + "/" + need : "");
			tag = need > 1 ? have + "/" + need : "есть";
		}
		else if (inBank >= 0 && have + inBank >= need)
		{
			h = Have.BANK;
			status = "в банке — возьми" + (need > 1 ? " (" + have + "+" + inBank + "/" + need + ")" : "");
			tag = "в банке";
		}
		else if (i.isInStep())
		{
			h = Have.IN_STEP;
			status = "добудешь по ходу шага" + (have > 0 ? " (" + have + "/" + need + ")" : "");
			tag = have > 0 ? have + "/" + need : "по ходу";
		}
		else if (inBank < 0)
		{
			h = Have.UNKNOWN;
			status = (have > 0 ? "в сумке " + have + "/" + need + ", " : "") + "банк не открывали";
			tag = have > 0 ? have + "/" + need + " · в банке?" : "в банке?";
		}
		else
		{
			h = Have.NONE;
			status = "нет" + (have + inBank > 0 ? " — есть " + (have + inBank) + " из " + need : "");
			tag = have + inBank > 0 ? (have + inBank) + "/" + need : "нет";
		}
		String name = i.getName() + (i.getCount() != null && need > 1 ? " ×" + need : "");
		String ru = i.getNameRu() == null || i.getNameRu().isEmpty() ? null : i.getNameRu();
		String title = name + (ru != null ? " (" + ru + ")" : "");
		return new ItemLine(title, status, h, i.getWhere(), placeOf(i.getName(), places), name, ru, tag);
	}

	/** Временная цель к точке шага номер index; null — точки нет. Предмет не задаётся: цель снимется по приходу. */
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

	/** Цель стрелки — клетка шага этапа; подпись — первое предложение его текста. null — у шага нет клетки. */
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

	/** Точка, где берут предмет: у точки в items есть его название. */
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
