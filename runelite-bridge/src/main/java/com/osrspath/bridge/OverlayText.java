package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Rectangle;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;
import net.runelite.client.ui.overlay.components.LineComponent;
import net.runelite.client.ui.overlay.components.PanelComponent;
import net.runelite.client.ui.overlay.components.TitleComponent;

/**
 * Plugin plate text: one font for the whole line and wrapping to the panel width.
 *
 * The RuneScape fonts lack some symbols the plugin uses (✓ ✗ ⚠ ▶ ◀ ●), and RuneLite substitutes them from a system font. In one
 * line the letters and digits came out small and the symbols large ("from Lumbridge", "~62 tiles"). So,
 * if the font chosen in RuneLite cannot display these symbols itself, the whole plugin text is drawn in the Dialog font of the same
 * size and style, which is where RuneLite took those symbols from anyway.
 *
 * RuneLite's TitleComponent does not wrap lines: a long step name was centred and stuck out of the frame on
 * both sides. LineComponent wraps only by words. Here the lines are cut in advance so that each
 * fits completely, and RuneLite's components receive ready-made lines.
 */
final class OverlayText
{
	/** Symbols that the RuneScape fonts lack. */
	private static final String PROBE = "✓✗⚠▶◀●";
	/** The gap between the left and right part of a line ("✗ Rope    0/1"). */
	private static final String GAP = "  ";

	/** Fonts by (RuneLite font, scale): the plates and the ground labels take different ones, the same frame after frame. */
	private static final Map<List<Object>, Font> FONTS = new HashMap<>();

	private OverlayText()
	{
	}

	/** The plugin plate font from the font chosen in RuneLite; scale is the large HUD (1.25). */
	static synchronized Font font(Font base, float scale)
	{
		List<Object> key = Arrays.asList(base, scale);
		Font hit = FONTS.get(key);
		if (hit != null)
		{
			return hit;
		}
		Font own = new Font(base.getFamily(), base.getStyle(), base.getSize());
		Font f;
		if (own.canDisplayUpTo(PROBE) == -1)
		{
			f = base;
		}
		else
		{
			// The "small" RuneScape font is smaller in the replacement too, so the player's choice is not lost.
			float size = base.getFamily().toLowerCase().contains("small") ? base.getSize2D() * 0.85f : base.getSize2D();
			f = new Font(Font.DIALOG, base.getStyle(), Math.round(size));
		}
		if (scale != 1f)
		{
			// A whole size: with a fractional one (17.5 pt) the rounding of line heights and letter descenders differed by a pixel.
			f = f.deriveFont((float) Math.round(f.getSize2D() * scale));
		}
		if (FONTS.size() > 16)
		{
			// The player cycles through fonts in the RuneLite settings, so the old ones are not needed.
			FONTS.clear();
		}
		FONTS.put(key, f);
		return f;
	}

	/** The card margins ({@link OverlayCard}): wider on the left, where the colour strip is. */
	static final int PAD_LEFT = OverlayCard.BAR + 7;
	static final int PAD_RIGHT = 8;
	static final int PAD_TOP = 6;

	/** The text width inside a panel of the given width. */
	static int inner(int width)
	{
		return width - PAD_LEFT - PAD_RIGHT;
	}

	/**
	 * The panel frame. LineComponent and TitleComponent put a line at the bottom edge of its height, and the descenders of letters
	 * ("y", "g", "p") with the shadow go lower: with a large font the last line stuck out of the frame by a pixel.
	 * The bottom padding is at least the descender plus the shadow's dot.
	 */
	static void frame(PanelComponent panel, FontMetrics fm)
	{
		panel.setBorder(new Rectangle(PAD_LEFT, PAD_TOP, PAD_RIGHT, Math.max(PAD_TOP, fm.getDescent() + 3)));
		// The background is the OverlayCard card, which the plate draws before the panel.
		panel.setBackgroundColor(null);
	}

	/**
	 * Lines no wider than width. Wrapping follows word groups ({@link #groups}): a group wider than the line is wrapped by words,
	 * a word wider than the line by letters. So nothing sticks out, and "14" is not left alone on a line. Groups do not
	 * cost an extra line: if there are more lines with them than with wrapping by words, wrapping by words is taken.
	 */
	static List<String> wrap(String text, FontMetrics fm, int width)
	{
		if (text == null || text.trim().isEmpty())
		{
			return new ArrayList<>();
		}
		String[] words = text.trim().split(" +");
		List<String> glued = layout(groups(words), fm, width);
		List<String> plain = layout(Arrays.asList(words), fm, width);
		return glued.size() <= plain.size() ? glued : plain;
	}

	/** Greedy layout by units (groups or words). */
	static List<String> layout(List<String> units, FontMetrics fm, int width)
	{
		List<String> lines = new ArrayList<>();
		StringBuilder line = new StringBuilder();
		for (String group : units)
		{
			if (fits(line, group, fm, width))
			{
				append(line, group);
				continue;
			}
			flush(line, lines);
			if (fm.stringWidth(group) <= width)
			{
				line.append(group);
				continue;
			}
			// A group does not fit even a whole line: by words, and a word longer than the line by letters.
			for (String word : group.split(" "))
			{
				if (fits(line, word, fm, width))
				{
					append(line, word);
					continue;
				}
				flush(line, lines);
				while (fm.stringWidth(word) > width)
				{
					int n = fitting(word, fm, width);
					lines.add(word.substring(0, n));
					word = word.substring(n);
				}
				line.append(word);
			}
		}
		flush(line, lines);
		return lines;
	}

	/**
	 * Words the wrapping does not break, like a non-breaking space in typography: a preposition with the
	 * next word ("of 14", "in zone", "to depart"), a number with a short unit ("+20 HP", "10 000"),
	 * a dash and "·" do not start a line, a short tail of text is not left alone ("14", "Path", "↓").
	 */
	static List<String> groups(String[] words)
	{
		List<String> out = new ArrayList<>();
		String prev = null;
		for (int i = 0; i < words.length; i++)
		{
			String w = words[i];
			if (w.isEmpty())
			{
				continue;
			}
			boolean last = i == words.length - 1;
			boolean glue = prev != null && (shortWord(prev) || separator(w)
				|| (hasDigit(prev) && w.length() <= 3) || (last && w.length() <= 4));
			if (glue)
			{
				out.set(out.size() - 1, out.get(out.size() - 1) + " " + w);
			}
			else
			{
				out.add(w);
			}
			prev = w;
		}
		return out;
	}

	private static boolean shortWord(String w)
	{
		return w.length() <= 2 && w.chars().allMatch(Character::isLetter);
	}

	private static boolean separator(String w)
	{
		return "—".equals(w) || "–".equals(w) || "·".equals(w);
	}

	private static boolean hasDigit(String w)
	{
		return w.chars().anyMatch(Character::isDigit);
	}

	private static boolean fits(StringBuilder line, String next, FontMetrics fm, int width)
	{
		return fm.stringWidth(line.length() == 0 ? next : line + " " + next) <= width;
	}

	private static void append(StringBuilder line, String next)
	{
		if (line.length() > 0)
		{
			line.append(' ');
		}
		line.append(next);
	}

	private static void flush(StringBuilder line, List<String> lines)
	{
		if (line.length() > 0)
		{
			lines.add(line.toString());
			line.setLength(0);
		}
	}

	/** How many leading characters of a word fit (at least one; a surrogate pair is not split). */
	private static int fitting(String word, FontMetrics fm, int width)
	{
		int n = 1;
		while (n < word.length() && fm.stringWidth(word.substring(0, n + 1)) <= width)
		{
			n++;
		}
		if (n < word.length() && Character.isHighSurrogate(word.charAt(n - 1)))
		{
			n = n > 1 ? n - 1 : n + 1;
		}
		return n;
	}

	/** A heading centred; a long one in several lines. */
	static void title(List<LayoutableRenderableEntity> out, String text, Color color, FontMetrics fm, int width)
	{
		for (String l : wrap(text, fm, width))
		{
			out.add(TitleComponent.builder().text(l).color(color).build());
		}
	}

	/** A line on the left; a long one in several lines. */
	static void line(List<LayoutableRenderableEntity> out, String text, Color color, FontMetrics fm, int width)
	{
		for (String l : wrap(text, fm, width))
		{
			out.add(LineComponent.builder().left(l).leftColor(color).build());
		}
	}

	/**
	 * A line with a right part ("✗ Cooked chicken · +3 HP" ... "2/5 · in bank 3"). If it fits, one line;
	 * if not, the left wraps and the right goes at the end of the last line or on a separate line on the right.
	 */
	static void pair(List<LayoutableRenderableEntity> out, String left, Color leftColor, String right, Color rightColor,
		FontMetrics fm, int width)
	{
		int rightWidth = fm.stringWidth(right) + fm.stringWidth(GAP);
		if (fm.stringWidth(left) + rightWidth <= width)
		{
			out.add(LineComponent.builder().left(left).leftColor(leftColor).right(right).rightColor(rightColor).build());
			return;
		}
		List<String> lefts = wrap(left, fm, width);
		String last = lefts.isEmpty() ? "" : lefts.remove(lefts.size() - 1);
		for (String l : lefts)
		{
			out.add(LineComponent.builder().left(l).leftColor(leftColor).build());
		}
		if (fm.stringWidth(last) + rightWidth <= width)
		{
			out.add(LineComponent.builder().left(last).leftColor(leftColor).right(right).rightColor(rightColor).build());
			return;
		}
		if (!last.isEmpty())
		{
			out.add(LineComponent.builder().left(last).leftColor(leftColor).build());
		}
		for (String r : wrap(right, fm, width))
		{
			out.add(LineComponent.builder().left("").right(r).rightColor(rightColor).build());
		}
	}
}
