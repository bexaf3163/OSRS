package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.function.IntUnaryOperator;

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

	/** Сколько предметов с этим ID. */
	int idCount(int id)
	{
		return byId.getOrDefault(id, 0);
	}

	/** Число по ID предметов — для сохранения банка между сеансами. Копия: счётчики не изменить снаружи. */
	Map<Integer, Integer> idCounts()
	{
		return new HashMap<>(byId);
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

	/** Ступени инструментов по возрастанию: Iron pickaxe годится вместо Bronze pickaxe. */
	private static final String[] TIERS = {"bronze", "iron", "steel", "black", "mithril", "adamant", "rune", "dragon"};

	int count(Integer id, String name)
	{
		int n = id == null ? 0 : byId.getOrDefault(id, 0);
		String key = ActiveTarget.nameKey(name);
		int own = Math.max(n, byName.getOrDefault(key, 0));
		return Math.max(own, betterToolCount(key));
	}

	/**
	 * Топор или кирка не хуже названной: нужен Bronze pickaxe — Iron, Steel и выше тоже подходят. Сумма по ступеням от
	 * названной и выше; не инструмент — 0. Боевые «Black axe» и прочие названия вне шаблона не затрагиваются.
	 */
	private int betterToolCount(String key)
	{
		for (String kind : new String[]{" pickaxe", " axe"})
		{
			if (!key.endsWith(kind))
			{
				continue;
			}
			String tier = key.substring(0, key.length() - kind.length());
			int from = java.util.Arrays.asList(TIERS).indexOf(tier);
			if (from < 0)
			{
				return 0;
			}
			int total = 0;
			for (int i = from; i < TIERS.length; i++)
			{
				total += byName.getOrDefault(TIERS[i] + kind, 0);
			}
			return total;
		}
		return 0;
	}

	/**
	 * Для автоотметки: с ID — только этот предмет (у кусков карты Dragon Slayer I одно название на троих),
	 * без ID — все названия вместе.
	 */
	int count(ActiveTarget.ItemNeed need)
	{
		if (need.getId() != null)
		{
			return byId.getOrDefault(need.getId(), 0);
		}
		int n = 0;
		for (String name : need.getNames())
		{
			n += byName.getOrDefault(ActiveTarget.nameKey(name), 0);
		}
		return n;
	}

	boolean isEmpty()
	{
		return byId.isEmpty();
	}

	/** Что изменилось с прошлого раза: название → разница (положительная — прибавилось). Для журнала отладки. */
	Map<String, Integer> deltaFrom(ItemCounts before)
	{
		Map<String, Integer> out = new java.util.TreeMap<>();
		Map<String, Integer> prev = before == null ? Collections.emptyMap() : before.byName;
		for (Map.Entry<String, Integer> e : byName.entrySet())
		{
			int d = e.getValue() - prev.getOrDefault(e.getKey(), 0);
			if (d != 0)
			{
				out.put(e.getKey(), d);
			}
		}
		for (Map.Entry<String, Integer> e : prev.entrySet())
		{
			if (!byName.containsKey(e.getKey()))
			{
				out.put(e.getKey(), -e.getValue());
			}
		}
		return out;
	}

	/** Число, которое меняется вместе с содержимым: сторожу движка нужно знать только «менялась ли сумка». */
	int fingerprint()
	{
		return byName.hashCode();
	}

	/**
	 * Оценка стоимости по ценам биржи: price(id) — цена одного, у неторгуемых 0. Монеты (skip) не входят —
	 * они считаются отдельно, как точные деньги. Каждый предмет — один раз: ID, а не имя.
	 */
	long value(IntUnaryOperator price, int skip)
	{
		long sum = 0;
		for (Map.Entry<Integer, Integer> e : byId.entrySet())
		{
			if (e.getKey() != skip)
			{
				sum += (long) Math.max(0, price.applyAsInt(e.getKey())) * e.getValue();
			}
		}
		return sum;
	}
}
