package com.osrspath.bridge;

import static org.junit.Assert.assertTrue;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.image.BufferedImage;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.ConfigSection;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/**
 * Названия настроек плагина помещаются в панель RuneLite без многоточия.
 *
 * Панель шириной 225 точек: пункт подписан обычным шрифтом RuneScape (кириллица — из системного), справа —
 * галочка, поле числа или цвет; раздел — жирным. Мерки сняты с живого клиента 1.12.39: «Проверка вылета у
 * банка» рядом с галочкой видна целиком, «Непрозрачность HUD» рядом с полем процентов обрезалась до
 * «Непрозрачност…», заголовок «Места, банк, опасность, темп» — до «Места, банк, опасност…». Этим шрифтом
 * все видимые целиком названия не шире 184 точек, а все обрезанные — шире: мерка совпадает с клиентом.
 */
public class ConfigNamesTest
{
	private static FontMetrics metrics(Font f)
	{
		return new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics().getFontMetrics(f);
	}

	@Test
	public void названияВлезаютВПанельНастроек()
	{
		FontMetrics small = metrics(FontManager.getRunescapeFont());
		FontMetrics bold = metrics(FontManager.getRunescapeBoldFont());
		int checkbox = small.stringWidth("Проверка вылета у банка");
		int spinner = small.stringWidth("Непрозрачност");
		int color = small.stringWidth("Цвет подсветки");
		int section = bold.stringWidth("Места, банк, опасност");
		List<String> bad = new ArrayList<>();
		int items = 0;
		for (Method m : OsrsPathBridgeConfig.class.getDeclaredMethods())
		{
			ConfigItem item = m.getAnnotation(ConfigItem.class);
			if (item == null)
			{
				continue;
			}
			items++;
			Class<?> type = m.getReturnType();
			int budget = type == int.class ? spinner : type == Color.class ? color : checkbox;
			int w = small.stringWidth(item.name());
			if (w > budget)
			{
				bad.add("«" + item.name() + "» " + w + " > " + budget);
			}
			// Всплывающая подсказка — шрифтом RuneLite с подстановкой системного: чего он не умеет, выходит
			// квадратиком (так было с 🧭 в 2.5.1). Запрета на значки нет — ⚡, ✓ и стрелки он рисует.
			int missing = FontManager.getRunescapeFont().canDisplayUpTo(item.description());
			if (missing >= 0)
			{
				bad.add("«" + new String(Character.toChars(item.description().codePointAt(missing))) + "» не рисуется в подсказке «" + item.name() + "»");
			}
		}
		int sections = 0;
		for (Field f : OsrsPathBridgeConfig.class.getDeclaredFields())
		{
			ConfigSection s = f.getAnnotation(ConfigSection.class);
			if (s == null)
			{
				continue;
			}
			sections++;
			if (bold.stringWidth(s.name()) > section)
			{
				bad.add("раздел «" + s.name() + "» " + bold.stringWidth(s.name()) + " > " + section);
			}
		}
		// 2.7: 19 пунктов — убраны «Путевые точки на земле» и «Разрешённые сайты» (веб-версии больше нет).
		assertTrue("пунктов: " + items, items >= 19);
		assertTrue("разделов: " + sections, sections >= 2);
		assertTrue("не влезает в панель RuneLite:\n" + String.join("\n", bad), bad.isEmpty());
	}

	@Test
	public void меркаЛовитСтарыеНазвания()
	{
		// Так было до исправления — в живом клиенте эти названия обрезались многоточием.
		FontMetrics small = metrics(FontManager.getRunescapeFont());
		int checkbox = small.stringWidth("Проверка вылета у банка");
		for (String old : new String[]{"Звук при выполнении шага", "Маршрут через Shortest Path", "Навигация к местам из приложения",
			"Подсветка предметов этапа в банке", "Звук при входе в опасную зону"})
		{
			assertTrue(old, small.stringWidth(old) > checkbox);
		}
		assertTrue(small.stringWidth("Непрозрачность HUD") > small.stringWidth("Непрозрачност"));
	}
}
