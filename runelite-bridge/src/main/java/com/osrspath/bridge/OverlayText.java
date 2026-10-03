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
 * Текст плашек плагина: один шрифт на всю строку и перенос по ширине панели.
 *
 * У шрифтов RuneScape нет кириллицы, и RuneLite подставляет русские буквы из системного шрифта. В одной
 * строке латиница и цифры выходили мелкими, а кириллица крупной («от Lumbridge», «~62 клетки»). Поэтому,
 * если выбранный в RuneLite шрифт сам не умеет кириллицу, текст плагина целиком рисуется шрифтом Dialog того
 * же размера и начертания — из него RuneLite и так брал русские буквы.
 *
 * TitleComponent RuneLite строки не переносит: длинное название шага центрировалось и вылезало за рамку с
 * обеих сторон. LineComponent переносит только по словам. Здесь строки режутся заранее, чтобы каждая
 * помещалась целиком, — и компоненты RuneLite получают уже готовые строки.
 */
final class OverlayText
{
	/** Буквы, которых нет в шрифтах RuneScape. */
	private static final String PROBE = "ЖжЁё";
	/** Отступ между левой и правой частью строки («✗ Rope    0/1»). */
	private static final String GAP = "  ";

	/** Шрифты по (шрифт RuneLite, масштаб): плашки и подписи на земле берут разные — кадр за кадром одни и те же. */
	private static final Map<List<Object>, Font> FONTS = new HashMap<>();

	private OverlayText()
	{
	}

	/** Шрифт плашек плагина из шрифта, выбранного в RuneLite; scale — крупный HUD (1.25). */
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
			// «Мелкий» шрифт RuneScape — мельче и в замене, чтобы выбор игрока не терялся.
			float size = base.getFamily().toLowerCase().contains("small") ? base.getSize2D() * 0.85f : base.getSize2D();
			f = new Font(Font.DIALOG, base.getStyle(), Math.round(size));
		}
		if (scale != 1f)
		{
			// Целый размер: у дробного (17,5 pt) округление высоты строк и хвостов букв расходилось на точку.
			f = f.deriveFont((float) Math.round(f.getSize2D() * scale));
		}
		if (FONTS.size() > 16)
		{
			// Игрок перебирает шрифты в настройках RuneLite — старые не нужны.
			FONTS.clear();
		}
		FONTS.put(key, f);
		return f;
	}

	/** Поля карточки ({@link OverlayCard}): слева шире — там цветная полоска. */
	static final int PAD_LEFT = OverlayCard.BAR + 7;
	static final int PAD_RIGHT = 8;
	static final int PAD_TOP = 6;

	/** Ширина текста внутри панели шириной width. */
	static int inner(int width)
	{
		return width - PAD_LEFT - PAD_RIGHT;
	}

	/**
	 * Рамка панели. LineComponent и TitleComponent ставят строку на нижний край своей высоты, и хвосты букв
	 * («у», «р», «д») с тенью уходят ниже: у крупного шрифта последняя строка вылезала за рамку на точку.
	 * Нижний отступ — не меньше хвоста и точки тени.
	 */
	static void frame(PanelComponent panel, FontMetrics fm)
	{
		panel.setBorder(new Rectangle(PAD_LEFT, PAD_TOP, PAD_RIGHT, Math.max(PAD_TOP, fm.getDescent() + 3)));
		// Фон — карточка OverlayCard, её рисует плашка до панели.
		panel.setBackgroundColor(null);
	}

	/**
	 * Строки не шире width. Переносится по связкам слов ({@link #groups}): связка шире строки — по словам,
	 * слово шире строки — по буквам. Так ничего не вылезает, а «14» не остаётся на строке одно. Связки не
	 * стоят лишней строки: если с ними строк больше, чем при переносе по словам, берётся перенос по словам.
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

	/** Жадная раскладка по единицам (связкам или словам). */
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
			// Связка не влезает и в целую строку — по словам, а слово длиннее строки — по буквам.
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
	 * Слова, которые перенос не разрывает, — как неразрывный пробел в русской типографике: предлог со
	 * следующим словом («из 14», «в зоне», «to depart»), число с короткой единицей («+20 HP», «10 000»),
	 * тире и «·» не начинают строку, короткий хвост текста не остаётся один («14», «Путь», «↓»).
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

	/** Сколько первых символов слова помещается (хотя бы один; суррогатная пара не рвётся). */
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

	/** Заголовок по центру; длинный — несколькими строками. */
	static void title(List<LayoutableRenderableEntity> out, String text, Color color, FontMetrics fm, int width)
	{
		for (String l : wrap(text, fm, width))
		{
			out.add(TitleComponent.builder().text(l).color(color).build());
		}
	}

	/** Строка слева; длинная — несколькими строками. */
	static void line(List<LayoutableRenderableEntity> out, String text, Color color, FontMetrics fm, int width)
	{
		for (String l : wrap(text, fm, width))
		{
			out.add(LineComponent.builder().left(l).leftColor(color).build());
		}
	}

	/**
	 * Строка с правой частью («✗ Cooked chicken · +3 HP» … «2/5 · в банке 3»). Помещается — одной строкой;
	 * нет — левое переносится, а правое встаёт в конец последней строки или отдельной строкой справа.
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
