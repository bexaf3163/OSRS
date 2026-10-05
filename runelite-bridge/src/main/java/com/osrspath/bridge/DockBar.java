package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;

/**
 * The docked bar: the HUD and the "What you need" summary in a single row. The list opens under the bar only while the mouse is over the bar
 * or the list, at the open bank, or for a moment after the mouse left. Everything is computed from the same HUD state and guide view as the
 * normal plates, so nothing is added to the plan: only the drawing and the moment of showing differ. No client here, a test draws it.
 */
final class DockBar
{
	/** The bar width without the large text; the large text and the width set with Alt scale it the same way as the other plates. */
	static final int WIDTH = 400;
	static final int PAD_V = 5;
	/** For how long after the mouse left the bar and the list the list stays open, so crossing the gap between them does not close it. */
	static final long GRACE_NANOS = 700_000_000L;
	private static final int GAP = 10;
	private static final int DOT = 6;
	private static final int DOT_GAP = 3;
	private static final int COUNT_GAP = 6;

	private DockBar()
	{
	}

	/** What the bar says. Counts are from the guide view; an unchecked item is counted apart and never as missing. */
	static final class Model
	{
		final String title;
		final String goal;
		final boolean danger;
		final String distance;
		final int bag;
		final int bank;
		final int missing;
		final int unknown;
		/** How prepared the step is by the app's plan; null means the plan has not arrived. */
		final Integer percent;
		final Color accent;

		Model(String title, String goal, boolean danger, String distance, int bag, int bank, int missing, int unknown, Integer percent, Color accent)
		{
			this.title = title;
			this.goal = goal;
			this.danger = danger;
			this.distance = distance;
			this.bag = bag;
			this.bank = bank;
			this.missing = missing;
			this.unknown = unknown;
			this.percent = percent;
			this.accent = accent;
		}
	}

	/** null when there is nothing to say (no HUD state). */
	static Model model(OsrsPathHudOverlay.State s, StepGuide.View v)
	{
		if (s == null)
		{
			return null;
		}
		int bag = 0;
		int bank = 0;
		int missing = 0;
		int unknown = 0;
		if (v != null)
		{
			for (StepGuide.ItemLine i : v.getItems())
			{
				switch (i.getHave())
				{
					case BAG:
					case DONE:
						bag++;
						break;
					case BANK:
						bank++;
						break;
					case NONE:
						missing++;
						break;
					case UNKNOWN:
						unknown++;
						break;
					default:
						break;
				}
			}
		}
		boolean danger = s.getDanger() != null && !s.getDanger().isEmpty();
		String goal = danger ? s.getDanger() : first(s.getHealth() != null && s.isHealthCritical() ? s.getHealth() : null, s.getAction(), s.getGoal());
		Integer percent = v == null || v.getPrep() == null ? null : v.getPrep().pendingPercent();
		return new Model(nz(s.getTitle()), nz(goal), danger, nz(s.getDistance()), bag, bank, missing, unknown, percent, OsrsPathHudOverlay.accent(s));
	}

	private static String first(String... options)
	{
		for (String o : options)
		{
			if (o != null && !o.isEmpty())
			{
				return o;
			}
		}
		return null;
	}

	private static String nz(String s)
	{
		return s == null ? "" : s;
	}

	/**
	 * Whether the list is open under the bar. At the open bank it is the departure check, so it is always open there; otherwise the mouse over the
	 * bar or the list opens it, and it stays open for {@link #GRACE_NANOS} after the mouse left (sinceHoverNanos is negative if it never was over).
	 */
	static boolean expanded(boolean overBar, boolean overList, SmartView.Context context, long sinceHoverNanos)
	{
		return context == SmartView.Context.BANK || overBar || overList || (sinceHoverNanos >= 0 && sinceHoverNanos < GRACE_NANOS);
	}

	/** The text cut to the width with three dots; the whole text if it fits. */
	static String fit(String text, FontMetrics fm, int width)
	{
		if (text == null || text.isEmpty() || width <= 0)
		{
			return "";
		}
		if (fm.stringWidth(text) <= width)
		{
			return text;
		}
		String dots = "...";
		int end = text.length();
		while (end > 0 && fm.stringWidth(text.substring(0, end).trim() + dots) > width)
		{
			end--;
		}
		return end == 0 ? "" : text.substring(0, end).trim() + dots;
	}

	/** The bar height for the font. */
	static int height(FontMetrics fm)
	{
		return fm.getHeight() + 2 * PAD_V;
	}

	/** Draws the bar from the top-left corner (0, 0) with the given width; returns its size. */
	static Dimension paint(Graphics2D g, Model m, FontMetrics fm, int width, int opacity, OsrsPathBridgeConfig.OverlayTheme theme)
	{
		int h = height(fm);
		OverlayCard.paint(g, width, h, m.accent, opacity, theme);
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		int base = PAD_V + fm.getAscent();

		// The right block, from the right edge: percent, the counts, the distance.
		int right = width - OverlayText.PAD_RIGHT;
		if (m.percent != null)
		{
			String p = m.percent + "%";
			right -= fm.stringWidth(p);
			text(g, p, right, base, m.percent >= 100 ? OverlayCard.GREEN : OsrsPathHudOverlay.TEXT);
			right -= GAP;
		}
		int[] counts = {m.bag, m.bank, m.missing, m.unknown};
		Color[] colors = {OverlayCard.GREEN, OverlayCard.GOLD, OverlayCard.RED, new Color(150, 156, 168)};
		for (int k = counts.length - 1; k >= 0; k--)
		{
			if (counts[k] <= 0)
			{
				continue;
			}
			String n = Integer.toString(counts[k]);
			right -= fm.stringWidth(n);
			text(g, n, right, base, OsrsPathHudOverlay.TEXT);
			right -= DOT_GAP + DOT;
			g.setColor(colors[k]);
			g.fillOval(right, PAD_V + (fm.getAscent() - DOT) / 2 + 1, DOT, DOT);
			right -= COUNT_GAP;
		}
		if (!m.distance.isEmpty())
		{
			right -= fm.stringWidth(m.distance);
			text(g, m.distance, right, base, OsrsPathHudOverlay.DISTANCE);
			right -= GAP;
		}

		// The left text takes what is left: the step, then what to do or the warning.
		int x = OverlayText.PAD_LEFT;
		int room = right - x;
		// A warning takes the whole row (the step name can wait); otherwise a long step name leaves room for what to do.
		String title = m.danger ? "" : fit(m.title, fm, m.goal.isEmpty() ? room : room * 55 / 100);
		text(g, title, x, base, OverlayCard.GOLD);
		int used = fm.stringWidth(title);
		if (!m.goal.isEmpty() && room - used > fm.stringWidth("..."))
		{
			int gx = x + used + (title.isEmpty() ? 0 : GAP);
			text(g, fit(m.goal, fm, right - gx), gx, base, m.danger ? OverlayCard.RED : OsrsPathHudOverlay.TEXT);
		}
		return new Dimension(width, h);
	}

	private static void text(Graphics2D g, String s, int x, int y, Color c)
	{
		if (s.isEmpty())
		{
			return;
		}
		g.setColor(Color.BLACK);
		g.drawString(s, x + 1, y + 1);
		g.setColor(c);
		g.drawString(s, x, y);
	}
}
