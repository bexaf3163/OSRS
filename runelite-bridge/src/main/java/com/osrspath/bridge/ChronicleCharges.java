package com.osrspath.bridge;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The charges of the Chronicle, read from the game's own chat messages: checking the book, teleporting with it, adding Teleport cards, running out.
 * These are the messages RuneLite's Item Charges plugin reads (ItemChargePlugin). The game keeps no variable for the count, so a number is known only
 * after one of these messages, or from what the Item Charges plugin last saved; until then it is unknown, never zero.
 *
 * Pure, so a test can check it.
 */
final class ChronicleCharges
{
	/** Where RuneLite's Item Charges plugin keeps its last count (ItemChargeConfig.GROUP and KEY_CHRONICLE), per RuneScape profile. */
	static final String ITEM_CHARGE_GROUP = "itemCharge";
	static final String ITEM_CHARGE_KEY = "chronicle";
	/** Our own copy, per RuneScape profile, in the plugin's group. */
	static final String KEY = "chronicleCharges";
	/** The book holds at most this many charges (OSRS Wiki, Chronicle). */
	static final int MAX = 1000;

	private static final Pattern ADD = Pattern.compile("You add (?:[\\d,]+|a single) charges? to your book\\. It now has ([\\d,]+|one) charges?\\.");
	private static final Pattern LEFT = Pattern.compile("Your book has ([\\d,]+) charges? left\\.");
	private static final String ONE = "You have one charge left in your book.";
	private static final String EMPTY = "Your book has run out of charges.";
	private static final String NONE = "Your book does not have any charges. Purchase some Teleport Cards from Diango.";
	private static final String FULL = "Your book is fully charged! It has 1,000 charges already.";

	private ChronicleCharges()
	{
	}

	/** The charges a game message tells (tags already removed), or null when it says nothing about the book. */
	static Integer parse(String message)
	{
		if (message == null)
		{
			return null;
		}
		String m = message.trim();
		if (m.equals(ONE))
		{
			return 1;
		}
		if (m.equals(EMPTY) || m.equals(NONE))
		{
			return 0;
		}
		if (m.equals(FULL))
		{
			return MAX;
		}
		Matcher add = ADD.matcher(m);
		if (add.find())
		{
			return "one".equals(add.group(1)) ? Integer.valueOf(1) : number(add.group(1));
		}
		Matcher left = LEFT.matcher(m);
		if (left.find())
		{
			return number(left.group(1));
		}
		return null;
	}

	/** A stored value: a whole number from 0 to the maximum; anything else (absent, garbage) is unknown. */
	static Integer read(String stored)
	{
		if (stored == null)
		{
			return null;
		}
		return number(stored.trim());
	}

	private static Integer number(String s)
	{
		try
		{
			int n = Integer.parseInt(s.replace(",", ""));
			return n >= 0 && n <= MAX ? n : null;
		}
		catch (NumberFormatException ex)
		{
			return null;
		}
	}
}
