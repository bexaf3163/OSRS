package com.osrspath.bridge;

import java.awt.Color;
import java.awt.FontMetrics;
import java.util.ArrayList;
import java.util.List;
import lombok.Value;

/**
 * Список «Что нужно» прямо на экране игры, под HUD: предметы шага (есть, в банке, нет, по ходу шага) с «где взять»
 * и точки шага с NPC. Строка с местом — кнопка: клик ставит временную цель (стрелка, клетка, Shortest Path,
 * подсветка NPC), по приходу стрелка возвращается к шагу. Раньше это было только в программе — в игре HUD писал
 * «Сумка: не хватает 1 из 1».
 *
 * Здесь только раскладка строк — чистая логика для тестов. Рисует {@link OsrsPathGuideOverlay}, клики ловит
 * {@link GuideMouse}.
 */
final class GuideList
{
	enum Kind
	{
		/** Не кнопка: клик по списку просто не уходит в игру. */
		NONE,
		/** Заголовок: свернуть или развернуть список. */
		TOGGLE,
		/** Строка с местом: стрелка и путь туда. */
		PLACE,
		/** Стрелку — снова к шагу. */
		BACK,
	}

	@Value
	static class Action
	{
		static final Action NONE = new Action(Kind.NONE, -1);
		static final Action TOGGLE = new Action(Kind.TOGGLE, -1);
		static final Action BACK = new Action(Kind.BACK, -1);

		Kind kind;
		/** Номер точки шага для PLACE. */
		int place;

		static Action place(int index)
		{
			return new Action(Kind.PLACE, index);
		}

		boolean isClickable()
		{
			return kind != Kind.NONE;
		}
	}

	/** Одна строка текста: слева и (необязательно) справа. small — мелкий шрифт («где взять», подсказка). */
	@Value
	static class Line
	{
		String left;
		Color leftColor;
		String right;
		Color rightColor;
		boolean small;
	}

	@Value
	static class Row
	{
		List<Line> lines;
		Action action;
		/** Подсказка внизу списка, пока мышь над строкой: полный текст и что сделает клик; null — без неё. */
		String hint;
	}

	static final Color TITLE = OsrsPathHudOverlay.TITLE;
	static final Color TEXT = OsrsPathHudOverlay.TEXT;
	static final Color MUTED = new Color(175, 175, 175);
	/** «Где взять» у строки-кнопки — цветом ссылки: по ней можно нажать. */
	static final Color LINK = new Color(140, 200, 255);
	static final int MAX_ITEMS = 8;
	static final int MAX_PLACES = 8;
	/** Больше стольких предметов или мест — «где взять» и подписи в одну строку. */
	static final int COMPACT_ITEMS = 4;
	static final int COMPACT_PLACES = 3;
	/** Строк «где взять» и подписи места; полностью — в подсказке при наведении. */
	static final int WHERE_LINES = 2;
	static final int PLACE_LINES = 2;
	private static final String INDENT = "   ";
	private static final String GAP = "  ";

	private GuideList()
	{
	}

	/** Показывать ли список: есть предметы, несколько мест, временная цель или сообщение. Иначе хватает HUD. */
	static boolean worthShowing(StepGuide.View v)
	{
		return v != null && v.getTitle() != null
			&& (!v.getItems().isEmpty() || v.getPlaces().size() > 1 || v.getDetour() != null || v.getNote() != null);
	}

	/** Строки списка. fm — обычный шрифт, small — мелкий; width — ширина плашки. */
	static List<Row> rows(StepGuide.View v, boolean collapsed, FontMetrics fm, FontMetrics small, int width)
	{
		int inner = OverlayText.inner(width);
		List<Row> out = new ArrayList<>();
		// Предметов у шага нет — это список мест: заголовок «Куда идти», без второго такого же ниже.
		boolean placesOnly = v.getItems().isEmpty();
		out.add(new Row(pair(collapsed ? summary(v) : placesOnly ? "Куда идти" : "Что нужно", TITLE, collapsed ? "▼" : "▲", MUTED, fm, inner, false),
			Action.TOGGLE, collapsed ? "Клик — развернуть: что нужно и куда идти." : "Клик — свернуть список в одну строку."));
		if (collapsed)
		{
			return out;
		}
		if (v.getNote() != null)
		{
			out.add(new Row(text(v.getNote(), MUTED, small, inner, true), Action.NONE, null));
		}
		if (v.getDetour() != null)
		{
			out.add(new Row(text("← Стрелку — снова к шагу", StepGuide.BANK, fm, inner, false), Action.BACK,
				"Сейчас стрелка ведёт: " + v.getDetour() + ". Клик — стрелка и путь снова к шагу."));
		}
		// Длинный список (Prince Ali Rescue — 12 предметов и 8 NPC) не должен закрывать полэкрана: «где взять» и места —
		// в одну строку, целиком — в подсказке при наведении. Чего не хватает — сверху, что уже в сумке — вниз.
		List<StepGuide.ItemLine> items = ordered(v.getItems());
		int whereLines = items.size() > COMPACT_ITEMS ? 1 : WHERE_LINES;
		for (int i = 0; i < Math.min(items.size(), MAX_ITEMS); i++)
		{
			out.add(item(items.get(i), v.getPlaces(), fm, small, inner, whereLines));
		}
		if (items.size() > MAX_ITEMS)
		{
			out.add(new Row(text("… ещё " + (items.size() - MAX_ITEMS) + " — в панели «OSRS Путь» справа", MUTED, small, inner, true),
				Action.NONE, null));
		}
		// Места, где берут предметы из списка выше, — уже кнопки в строках предметов: второй раз не показываем.
		// Кроме первой — точки самого шага (NPC квеста): она в «Куда идти» всегда, даже если он выдаёт предмет.
		List<StepGuide.PlaceLine> places = new ArrayList<>();
		for (StepGuide.PlaceLine p : v.getPlaces())
		{
			if (p.getIndex() == 0 || !itemPlace(items, p))
			{
				places.add(p);
			}
		}
		if (!places.isEmpty())
		{
			if (!placesOnly)
			{
				out.add(new Row(text("Куда идти", TITLE, fm, inner, false), Action.NONE, null));
			}
			int placeLines = places.size() > COMPACT_PLACES ? 1 : PLACE_LINES;
			for (int i = 0; i < Math.min(places.size(), MAX_PLACES); i++)
			{
				out.add(place(places.get(i), fm, inner, placeLines));
			}
			if (places.size() > MAX_PLACES)
			{
				out.add(new Row(text("… ещё " + (places.size() - MAX_PLACES) + " — в панели «OSRS Путь» справа", MUTED, small, inner, true),
					Action.NONE, null));
			}
		}
		return out;
	}

	/** Сначала то, чего не хватает (в порядке маршрута), потом — что уже в сумке. */
	static List<StepGuide.ItemLine> ordered(List<StepGuide.ItemLine> items)
	{
		List<StepGuide.ItemLine> out = new ArrayList<>();
		for (StepGuide.ItemLine i : items)
		{
			if (i.getHave() != StepGuide.Have.BAG)
			{
				out.add(i);
			}
		}
		for (StepGuide.ItemLine i : items)
		{
			if (i.getHave() == StepGuide.Have.BAG)
			{
				out.add(i);
			}
		}
		return out;
	}

	/**
	 * Место не нужно в «Куда идти»: туда ведёт строка показанного предмета (он ещё не в сумке — строка кнопка или
	 * «● ведёт туда»), или там только берут предметы, и всё уже с собой (грядка лука). Место с NPC, где всё уже
	 * взято, снова в «Куда идти»: к этому NPC ещё может быть дело по квесту.
	 */
	private static boolean itemPlace(List<StepGuide.ItemLine> items, StepGuide.PlaceLine place)
	{
		boolean linked = false;
		for (int i = 0; i < Math.min(items.size(), MAX_ITEMS); i++)
		{
			if (items.get(i).getPlace() != place.getIndex())
			{
				continue;
			}
			linked = true;
			if (items.get(i).getHave() != StepGuide.Have.BAG)
			{
				return true;
			}
		}
		return linked && place.getNpc() == null;
	}

	/** Подсказка под списком для строки под мышью — мелким шрифтом, целиком. */
	static Row hint(String text, FontMetrics small, int width)
	{
		return new Row(text(text, TEXT, small, OverlayText.inner(width), true), Action.NONE, null);
	}

	/** Свёрнутый список — одной строкой: «Что нужно: нет 2 · в банке 1». */
	static String summary(StepGuide.View v)
	{
		if (v.getItems().isEmpty())
		{
			int n = v.getPlaces().size();
			int m10 = n % 10;
			int m100 = n % 100;
			String word = m100 >= 11 && m100 <= 14 ? "мест" : m10 == 1 ? "место" : m10 >= 2 && m10 <= 4 ? "места" : "мест";
			return "Куда идти: " + n + " " + word;
		}
		int none = 0;
		int bank = 0;
		int inStep = 0;
		int unknown = 0;
		for (StepGuide.ItemLine i : v.getItems())
		{
			switch (i.getHave())
			{
				case NONE:
					none++;
					break;
				case BANK:
					bank++;
					break;
				case IN_STEP:
					inStep++;
					break;
				case UNKNOWN:
					unknown++;
					break;
				default:
					break;
			}
		}
		List<String> parts = new ArrayList<>();
		if (none > 0)
		{
			parts.add("нет " + none);
		}
		if (bank > 0)
		{
			parts.add("в банке " + bank);
		}
		if (unknown > 0)
		{
			parts.add("в банке? " + unknown);
		}
		if (inStep > 0)
		{
			parts.add("по ходу " + inStep);
		}
		return "Что нужно: " + (parts.isEmpty() ? "всё с собой" : String.join(" · ", parts));
	}

	static String mark(StepGuide.Have h)
	{
		switch (h)
		{
			case BAG:
				return "✓";
			case NONE:
				return "✗";
			case UNKNOWN:
				return "?";
			default:
				return "•";
		}
	}

	/**
	 * Предмет: «✗ Eye of newt … нет», под ним «где взять» (до двух строк). Есть точка, где его берут, — строка
	 * кнопка, «где взять» цветом ссылки. В сумке — одна зелёная строка, не кнопка.
	 */
	static Row item(StepGuide.ItemLine i, List<StepGuide.PlaceLine> places, FontMetrics fm, FontMetrics small, int inner)
	{
		return item(i, places, fm, small, inner, WHERE_LINES);
	}

	static Row item(StepGuide.ItemLine i, List<StepGuide.PlaceLine> places, FontMetrics fm, FontMetrics small, int inner, int whereLines)
	{
		boolean bag = i.getHave() == StepGuide.Have.BAG;
		StepGuide.PlaceLine at = i.getPlace() >= 0 && i.getPlace() < places.size() ? places.get(i.getPlace()) : null;
		boolean go = !bag && at != null && !at.isActive();
		List<Line> lines = pair(mark(i.getHave()) + " " + i.getName(), bag ? StepGuide.GOOD : TEXT, i.getTag(),
			StepGuide.color(i.getHave()), fm, inner, false);
		if (!bag && i.getWhere() != null && !i.getWhere().isEmpty())
		{
			lines.addAll(clip(INDENT, i.getWhere(), go ? LINK : MUTED, small, inner, whereLines, true));
		}
		if (!bag && at != null && at.isActive())
		{
			lines.addAll(text(INDENT + "● стрелка ведёт туда", StepGuide.GOOD, small, inner, true));
		}
		List<String> hint = new ArrayList<>();
		hint.add(i.getName() + (i.getRu() != null ? " — " + i.getRu() : "") + ".");
		if (i.getWhere() != null && !i.getWhere().isEmpty())
		{
			hint.add("Где взять: " + i.getWhere());
		}
		if (go)
		{
			hint.add("Клик — стрелка и путь: " + at.getLabel() + (at.getNpc() != null ? ", " + at.getNpc() + " подсветится" : "") + ".");
		}
		return new Row(lines, go ? Action.place(i.getPlace()) : Action.NONE, String.join(" ", hint));
	}

	/**
	 * Место шага: «► Hetty — дом в Rimmington». Сюда ведёт стрелка — «●». NPC, которого нет в подписи, — впереди
	 * («Cook — кухня замка»): список — это и «к кому идти». Места с предметами подписаны по предмету, им не нужно.
	 */
	static Row place(StepGuide.PlaceLine p, FontMetrics fm, int inner)
	{
		return place(p, fm, inner, PLACE_LINES);
	}

	static Row place(StepGuide.PlaceLine p, FontMetrics fm, int inner, int lines)
	{
		String label = p.getLabel();
		if (p.getNpc() != null && !p.isItems() && !label.toLowerCase().contains(p.getNpc().toLowerCase()))
		{
			label = p.getNpc() + " — " + label;
		}
		if (p.isActive())
		{
			return new Row(clip("", "● " + label, StepGuide.GOOD, fm, inner, lines, false), Action.NONE,
				label + ". Стрелка ведёт сюда; дойдёшь — вернётся к шагу.");
		}
		return new Row(clip("", "► " + label, TEXT, fm, inner, lines, false), Action.place(p.getIndex()),
			label + ". Клик — стрелка и путь сюда" + (p.getNpc() != null ? ", " + p.getNpc() + " подсветится" : "") + ".");
	}

	/** Текст с переносом по ширине, без ограничения строк. */
	static List<Line> text(String s, Color color, FontMetrics fm, int width, boolean small)
	{
		List<Line> out = new ArrayList<>();
		for (String l : OverlayText.wrap(s, fm, width))
		{
			out.add(new Line(l, color, null, null, small));
		}
		return out;
	}

	/**
	 * Текст не длиннее max строк: последняя обрезается многоточием. prefix — отступ перед каждой строкой.
	 * Полный текст — в подсказке при наведении.
	 */
	static List<Line> clip(String prefix, String s, Color color, FontMetrics fm, int width, int max, boolean small)
	{
		int room = width - fm.stringWidth(prefix);
		List<String> lines = OverlayText.wrap(s, fm, room);
		if (lines.size() > max)
		{
			lines = new ArrayList<>(lines.subList(0, max));
			String last = lines.get(max - 1);
			while (!last.isEmpty() && fm.stringWidth(last + "…") > room)
			{
				last = last.substring(0, last.length() - 1).trim();
			}
			lines.set(max - 1, last + "…");
		}
		List<Line> out = new ArrayList<>();
		for (String l : lines)
		{
			out.add(new Line(prefix + l, color, null, null, small));
		}
		return out;
	}

	/**
	 * Строка с правой частью, как OverlayText.pair: помещается — одной строкой; нет — левое переносится,
	 * правое встаёт в конец последней строки или отдельной строкой справа.
	 */
	static List<Line> pair(String left, Color leftColor, String right, Color rightColor, FontMetrics fm, int width, boolean small)
	{
		List<Line> out = new ArrayList<>();
		int rightWidth = fm.stringWidth(right) + fm.stringWidth(GAP);
		if (fm.stringWidth(left) + rightWidth <= width)
		{
			out.add(new Line(left, leftColor, right, rightColor, small));
			return out;
		}
		List<String> lefts = OverlayText.wrap(left, fm, width);
		String last = lefts.isEmpty() ? "" : lefts.remove(lefts.size() - 1);
		for (String l : lefts)
		{
			out.add(new Line(l, leftColor, null, null, small));
		}
		if (fm.stringWidth(last) + rightWidth <= width)
		{
			out.add(new Line(last, leftColor, right, rightColor, small));
			return out;
		}
		if (!last.isEmpty())
		{
			out.add(new Line(last, leftColor, null, null, small));
		}
		for (String r : OverlayText.wrap(right, fm, width))
		{
			out.add(new Line("", leftColor, r, rightColor, small));
		}
		return out;
	}
}
