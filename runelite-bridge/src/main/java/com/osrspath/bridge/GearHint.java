package com.osrspath.bridge;

import java.util.Collections;
import java.util.List;
import java.util.Set;
import lombok.Data;

/**
 * Совет приложения по снаряжению (POST /gear-hint): строка для HUD («⚡ Надень Iron scimitar — он в банке»),
 * предметы, про которые сказать, сколько их в банке (уходят в событие OWNED), и предметы, которые подсветить
 * в сумке и банке. Строки может не быть — тогда приложение только спрашивает про банк. {"clear":true} — снять.
 * Плагин сам ничего не надевает и не покупает.
 */
@Data
public class GearHint
{
	static final int MAX_ITEMS = 32;

	private boolean clear;
	private String text;
	private List<String> watchItems;
	private List<String> highlightItems;

	private transient Set<String> highlightSet = Collections.emptySet();

	String prepare()
	{
		if (clear)
		{
			return null;
		}
		if (text != null && (text.isEmpty() || ActiveTarget.tooLong(text)))
		{
			return "неверный текст подсказки";
		}
		for (List<String> list : List.of(nonNull(watchItems), nonNull(highlightItems)))
		{
			if (list.size() > MAX_ITEMS)
			{
				return "слишком длинный список";
			}
			for (String s : list)
			{
				if (s == null || s.isEmpty() || ActiveTarget.tooLong(s))
				{
					return "неверное имя предмета";
				}
			}
		}
		highlightSet = ActiveTarget.names(highlightItems);
		return null;
	}

	List<String> watched()
	{
		return nonNull(watchItems);
	}

	private static List<String> nonNull(List<String> l)
	{
		return l == null ? Collections.emptyList() : l;
	}
}
