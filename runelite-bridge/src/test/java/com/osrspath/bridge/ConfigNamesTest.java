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
 * The plugin's setting names fit the RuneLite panel without an ellipsis.
 *
 * The panel is 225 points wide: an item is labelled with the regular RuneScape font, with a checkbox, a number field, a colour
 * or a dropdown on the right; a section is in bold. The budgets are measured on the live client 1.12.39: a name next to a
 * checkbox is shown whole up to 184 points, next to a number field up to 111, next to a colour up to 114, next to a dropdown up
 * to 81, and a section heading (bold) up to 176. With this font every name that was shown whole is no wider than its budget and
 * every one that was cut is wider: the measure matches the client.
 */
public class ConfigNamesTest
{
	private static final int CHECKBOX = 184;
	private static final int SPINNER = 111;
	private static final int COLOR = 114;
	private static final int DROPDOWN = 81;
	private static final int SECTION = 176;

	private static FontMetrics metrics(Font f)
	{
		return new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics().getFontMetrics(f);
	}

	@Test
	public void namesFitTheSettingsPanel()
	{
		FontMetrics small = metrics(FontManager.getRunescapeFont());
		FontMetrics bold = metrics(FontManager.getRunescapeBoldFont());
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
			int budget = type == int.class ? SPINNER : type == Color.class ? COLOR : type.isEnum() ? DROPDOWN : CHECKBOX;
			int w = small.stringWidth(item.name());
			if (w > budget)
			{
				bad.add("'" + item.name() + "' " + w + " > " + budget);
			}
			// The tooltip is drawn with the RuneLite font with a system fallback: what it cannot draw comes out as a
			// box (it happened with the compass emoji in 2.5.1). Symbols are not banned - it draws the lightning bolt, the check mark and arrows.
			int missing = FontManager.getRunescapeFont().canDisplayUpTo(item.description());
			if (missing >= 0)
			{
				bad.add("'" + new String(Character.toChars(item.description().codePointAt(missing))) + "' is not drawn in the tooltip of '" + item.name() + "'");
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
			if (bold.stringWidth(s.name()) > SECTION)
			{
				bad.add("section '" + s.name() + "' " + bold.stringWidth(s.name()) + " > " + SECTION);
			}
		}
		// 2.7: 19 items - "Waypoints on the ground" and "Allowed sites" were removed (there is no web version any more).
		assertTrue("items: " + items, items >= 19);
		assertTrue("sections: " + sections, sections >= 2);
		assertTrue("does not fit the RuneLite panel:\n" + String.join("\n", bad), bad.isEmpty());
	}

	@Test
	public void theMeasureCatchesLongNames()
	{
		// Names like these were cut with an ellipsis in the live client.
		FontMetrics small = metrics(FontManager.getRunescapeFont());
		for (String old : new String[]{"Play a sound when the current step is completed", "Show the route through the Shortest Path plugin",
			"Navigation to the places chosen in the app", "Highlight the items of the whole stage in the bank", "Play a sound when entering a danger zone"})
		{
			assertTrue(old, small.stringWidth(old) > CHECKBOX);
		}
		assertTrue(small.stringWidth("HUD opacity in percent of the full colour") > SPINNER);
	}
}
