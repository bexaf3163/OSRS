package com.osrspath.bridge;

import java.util.Collections;
import java.util.List;
import java.util.Set;
import lombok.Data;

/**
 * The app's gear advice (POST /gear-hint): a line for the HUD ("⚡ Wear Iron scimitar - it is in the bank"),
 * items to report the bank count of (they go into the OWNED event), and items to highlight
 * in the bag and bank. There may be no line, then the app only asks about the bank. {"clear":true} clears it.
 * The plugin wears and buys nothing itself.
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
			return "invalid hint text";
		}
		for (List<String> list : List.of(nonNull(watchItems), nonNull(highlightItems)))
		{
			if (list.size() > MAX_ITEMS)
			{
				return "list too long";
			}
			for (String s : list)
			{
				if (s == null || s.isEmpty() || ActiveTarget.tooLong(s))
				{
					return "invalid item name";
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
