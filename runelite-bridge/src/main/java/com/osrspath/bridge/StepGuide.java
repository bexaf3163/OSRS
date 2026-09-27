package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.Value;

/**
 * Что показывает боковая панель «OSRS Путь»: предметы шага — есть ли (сумка, банк), где взять и к какой точке
 * повести стрелку, — и точки шага. Чистая логика: плагин считает её на потоке клиента, панель только рисует.
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
	}

	@Value
	static class ItemLine
	{
		String title;
		String status;
		Have have;
		String where;
		/** Номер точки, где берут этот предмет; -1 — такой точки нет. */
		int place;
	}

	@Value
	static class PlaceLine
	{
		String label;
		int index;
		/** Стрелка сейчас ведёт сюда. */
		boolean active;
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
	}

	static final View EMPTY = new View(null, null, Collections.emptyList(), Collections.emptyList(), null,
		"Шаг не выбран. В программе «OSRS Путь» нажми «Показать в игре» у шага — здесь появится, что нужно и куда идти.");

	private StepGuide()
	{
	}

	/**
	 * Строки панели. carried — сумка и надетое (с банкнотами), bank — null, если банк не открывали.
	 * navLabel — подпись временной цели или null; navX/navY — её клетка, чтобы отметить активную точку.
	 */
	static View view(ActiveTarget t, ItemCounts carried, ItemCounts bank, String navLabel, int navX, int navY, int navPlane)
	{
		if (t == null)
		{
			return EMPTY;
		}
		ActiveTarget.Guide g = t.getGuide();
		List<ActiveTarget.GuidePlace> places = g == null || g.getPlaces() == null ? Collections.emptyList() : g.getPlaces();
		List<ItemLine> items = new ArrayList<>();
		if (g != null && g.getItems() != null)
		{
			for (ActiveTarget.GuideItem i : g.getItems())
			{
				items.add(item(i, places, carried, bank));
			}
		}
		List<PlaceLine> placeLines = new ArrayList<>();
		for (int i = 0; i < places.size(); i++)
		{
			ActiveTarget.GuidePlace p = places.get(i);
			boolean active = navLabel != null && p.getX() == navX && p.getY() == navY && p.getPlane() == navPlane;
			placeLines.add(new PlaceLine(p.getLabel(), i, active));
		}
		String title = "[" + t.getStepId() + "] " + (t.getTitle() == null ? "" : t.getTitle());
		String note = g == null ? "Программа старше плагина: списка «что нужно» от неё не пришло. Обнови программу «OSRS Путь»." : null;
		return new View(title, t.getGoal(), items, placeLines, navLabel, note);
	}

	static ItemLine item(ActiveTarget.GuideItem i, List<ActiveTarget.GuidePlace> places, ItemCounts carried, ItemCounts bank)
	{
		int need = i.getCount() == null ? 1 : i.getCount();
		int have = carried == null ? 0 : carried.count(i.getId(), i.getName());
		int inBank = bank == null ? -1 : bank.count(i.getId(), i.getName());
		Have h;
		String status;
		if (have >= need)
		{
			h = Have.BAG;
			status = "✓ в сумке" + (need > 1 ? " " + have + "/" + need : "");
		}
		else if (inBank >= 0 && have + inBank >= need)
		{
			h = Have.BANK;
			status = "в банке — возьми" + (need > 1 ? " (" + have + "+" + inBank + "/" + need + ")" : "");
		}
		else if (i.isInStep())
		{
			h = Have.IN_STEP;
			status = "добудешь по ходу шага" + (have > 0 ? " (" + have + "/" + need + ")" : "");
		}
		else if (inBank < 0)
		{
			h = Have.UNKNOWN;
			status = (have > 0 ? "в сумке " + have + "/" + need + ", " : "") + "банк не открывали";
		}
		else
		{
			h = Have.NONE;
			status = "нет" + (have + inBank > 0 ? " — есть " + (have + inBank) + " из " + need : "");
		}
		String title = i.getName() + (i.getCount() != null && need > 1 ? " ×" + need : "")
			+ (i.getNameRu() != null ? " (" + i.getNameRu() + ")" : "");
		return new ItemLine(title, status, h, i.getWhere(), placeOf(i.getName(), places));
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
