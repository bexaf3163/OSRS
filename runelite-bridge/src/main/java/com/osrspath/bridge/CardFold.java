package com.osrspath.bridge;

import java.awt.Point;
import java.util.Arrays;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The small cards (departure check, bulk list, shop window) fold to their title with a click on it, like the guide's
 * header; the choice is saved (hidden setting foldedCards). The shop card, which places itself beside the game window,
 * keeps where it was moved with Alt+drag (hidden setting shopCardOffset); RuneLite moves the others.
 */
final class CardFold
{
	static final String CHECK = "check";
	static final String BULK = "bulk";
	static final String SHOP = "shop";

	private CardFold()
	{
	}

	static boolean folded(String saved, String card)
	{
		return Arrays.asList(saved.split(",")).contains(card);
	}

	/** The saved list with this card switched. */
	static String toggled(String saved, String card)
	{
		Stream<String> others = Arrays.stream(saved.split(",")).filter(c -> !c.isEmpty() && !c.equals(card));
		return Stream.concat(others, folded(saved, card) ? Stream.empty() : Stream.of(card)).collect(Collectors.joining(","));
	}

	/** The title's mark: what a click on it does. */
	static String mark(boolean folded)
	{
		return folded ? "  [+]" : "  [-]";
	}

	/** "x,y" as saved; no offset when it is missing or broken. */
	static Point offset(String saved)
	{
		String[] p = saved.split(",");
		try
		{
			return p.length == 2 ? new Point(Integer.parseInt(p[0].trim()), Integer.parseInt(p[1].trim())) : new Point();
		}
		catch (NumberFormatException e)
		{
			return new Point();
		}
	}
}
