package com.osrspath.bridge;

import java.util.HashMap;
import java.util.Map;

/**
 * Сколько каких предметов в контейнере (сумка, надетое, банк). Считается один раз на событие
 * ItemContainerChanged, а не каждый кадр. Предмет ищется по ID, а если ID не задан или отличается
 * (у вики и игры бывают разные варианты одного предмета) — по имени; берётся большее.
 */
final class ItemCounts
{
	static final ItemCounts EMPTY = new ItemCounts();

	private final Map<Integer, Integer> byId = new HashMap<>();
	private final Map<String, Integer> byName = new HashMap<>();

	/** name — уже ключ сравнения (ActiveTarget.nameKey). Стопки складываются. */
	void add(int id, String name, int quantity)
	{
		if (quantity <= 0)
		{
			return;
		}
		byId.merge(id, quantity, Integer::sum);
		if (name != null && !name.isEmpty())
		{
			byName.merge(name, quantity, Integer::sum);
		}
	}

	/** Всё вместе: сумка + банкноты + банк — сколько предмета есть у игрока вообще. null пропускаются. */
	static ItemCounts sum(ItemCounts... parts)
	{
		ItemCounts out = new ItemCounts();
		for (ItemCounts p : parts)
		{
			if (p == null)
			{
				continue;
			}
			p.byId.forEach((k, v) -> out.byId.merge(k, v, Integer::sum));
			p.byName.forEach((k, v) -> out.byName.merge(k, v, Integer::sum));
		}
		return out;
	}

	int count(Integer id, String name)
	{
		int n = id == null ? 0 : byId.getOrDefault(id, 0);
		return Math.max(n, byName.getOrDefault(ActiveTarget.nameKey(name), 0));
	}

	boolean isEmpty()
	{
		return byId.isEmpty();
	}
}
