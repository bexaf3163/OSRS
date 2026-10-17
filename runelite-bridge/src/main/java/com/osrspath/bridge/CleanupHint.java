package com.osrspath.bridge;

import java.awt.Color;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * The app's inventory cleanup advice (snapshot part "cleanup", since 2.61.0): what in the bag can be sold, dropped, destroyed or looked at because
 * nothing ahead in the route asks for it. The plugin only shows it: rows on the bank, merchant and exchange card, a section under the guide's Advice
 * tab and, when the player turns it on, a dashed frame on the slot. It sells, drops and destroys nothing.
 *
 * The advice is for one character and for the bag as the app saw it. {@link #visible} shows a line only while that character is logged in and the
 * stack is still in the bag (with the count capped at what is there), and nothing once the app has been gone for {@link #STALE_MS}: it can no longer
 * follow the route, so its "no use ahead" may be out of date.
 */
@Data
public class CleanupHint
{
	static final int MAX_LINES = 16;
	static final int MAX_WORDS = 80;
	/** How long the advice stays after the app was last connected. */
	static final long STALE_MS = 10 * 60_000L;
	private static final Set<String> ACTIONS = Set.of("sell", "drop", "destroy", "review");
	/** Sell: a calm blue, apart from the gold and green of the step's items and the amber of gear advice. */
	static final Color SELL = new Color(110, 180, 255);
	/** Drop or destroy: a soft red. */
	static final Color DROP = new Color(235, 115, 100);
	/** Look at it yourself: grey. */
	static final Color REVIEW = new Color(180, 180, 180);

	/** The character the advice was made for. */
	private String player;
	private List<Line> lines;

	@Data
	@NoArgsConstructor
	@AllArgsConstructor
	static class Line
	{
		private String name;
		/** The bag stack's item id (a banknote has its own). */
		private int id;
		private int qty;
		private boolean noted;
		/** sell, drop, destroy or review. */
		private String action;
		/** A few words: "no use ahead". */
		private String why;
		/** The estimated sale in gp before the exchange tax; 0 is none. */
		private long proceeds;

		/** "Sell: Oak logs ×40 (noted) — no use ahead · ~3.6k gp": a row of the bank or shop card. */
		String text()
		{
			StringBuilder sb = new StringBuilder(label()).append(": ").append(name);
			if (qty > 1)
			{
				sb.append(" ×").append(qty);
			}
			if (noted)
			{
				sb.append(" (noted)");
			}
			if (why != null && !why.isEmpty())
			{
				sb.append(" — ").append(why);
			}
			if (proceeds > 0)
			{
				sb.append(" · ~").append(gp(proceeds));
			}
			return sb.toString();
		}

		Color color()
		{
			return "sell".equals(action) ? SELL : "review".equals(action) ? REVIEW : DROP;
		}

		String label()
		{
			switch (action)
			{
				case "sell":
					return "Sell";
				case "drop":
					return "Drop";
				case "destroy":
					return "Destroy";
				default:
					return "Review";
			}
		}
	}

	String prepare()
	{
		if (player == null || player.trim().isEmpty() || ActiveTarget.tooLong(player))
		{
			return "invalid player";
		}
		if (lines == null || lines.isEmpty())
		{
			return "no lines";
		}
		if (lines.size() > MAX_LINES)
		{
			return "too many lines";
		}
		for (Line l : lines)
		{
			if (l == null || l.name == null || l.name.trim().isEmpty() || l.name.length() > MAX_WORDS)
			{
				return "invalid item name";
			}
			if (l.id <= 0 || l.qty <= 0 || l.proceeds < 0)
			{
				return "invalid count";
			}
			if (l.action == null || !ACTIONS.contains(l.action))
			{
				return "invalid action";
			}
			if (l.why != null && l.why.length() > MAX_WORDS)
			{
				return "reason too long";
			}
		}
		return null;
	}

	/**
	 * The lines to show now: for this character, with the stack still in the bag; a smaller stack shows what is left (and the estimate shrinks with it).
	 * bag is the count by item id (a banknote under its own id). Empty when the app has been gone longer than STALE_MS.
	 */
	List<Line> visible(String me, Map<Integer, Integer> bag, long now, long appSeenAt)
	{
		if (lines == null || bag == null || !samePlayer(player, me) || now - appSeenAt > STALE_MS)
		{
			return Collections.emptyList();
		}
		List<Line> out = new ArrayList<>();
		for (Line l : lines)
		{
			int have = bag.getOrDefault(l.id, 0);
			if (have <= 0)
			{
				continue;
			}
			int qty = Math.min(l.qty, have);
			long proceeds = qty == l.qty ? l.proceeds : l.proceeds * qty / l.qty;
			out.add(new Line(l.name, l.id, qty, l.noted, l.action, l.why, proceeds));
		}
		return out;
	}

	static boolean samePlayer(String a, String b)
	{
		return a != null && b != null && norm(a).equals(norm(b));
	}

	private static String norm(String s)
	{
		return s.replace('\u00A0', ' ').replace('_', ' ').replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
	}

	/** "950 gp", "3.6k gp", "1.2M gp". */
	static String gp(long n)
	{
		if (n < 1_000)
		{
			return n + " gp";
		}
		if (n < 1_000_000)
		{
			return trim(n / 1_000.0) + "k gp";
		}
		return trim(n / 1_000_000.0) + "M gp";
	}

	private static String trim(double v)
	{
		String s = v >= 100 ? String.valueOf(Math.round(v)) : String.format(Locale.ROOT, "%.1f", v);
		return s.endsWith(".0") ? s.substring(0, s.length() - 2) : s;
	}
}
