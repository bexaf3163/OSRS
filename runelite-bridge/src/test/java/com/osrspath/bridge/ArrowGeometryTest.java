package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.awt.Dimension;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Polygon;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import javax.imageio.ImageIO;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/**
 * Большая стрелка: направление как у миникарты при любом повороте камеры, плавность без дрожи,
 * состояния по расстоянию и рисунок внутри своей рамки настоящими шрифтами RuneLite.
 */
public class ArrowGeometryTest
{
	private static final double EPS = 1e-9;
	private static final double UP = -Math.PI / 2;
	private static final double DOWN = Math.PI / 2;
	/** Четверть оборота камеры в единицах клиента (16384 на оборот). */
	private static final int QUARTER = 4096;

	@Test
	public void камераНаСеверЦельСевернееСтрелкаВверх()
	{
		assertEquals(UP, ArrowGeometry.screenAngle(0, 10, 0), EPS);
		assertEquals(0, ArrowGeometry.screenAngle(10, 0, 0), EPS);
		assertEquals(DOWN, ArrowGeometry.screenAngle(0, -10, 0), EPS);
		assertEquals(Math.PI, Math.abs(ArrowGeometry.screenAngle(-10, 0, 0)), EPS);
	}

	@Test
	public void стрелкаПоворачиваетсяВместеСКамерой()
	{
		// Поворот камеры на четверть оборота (как у миникарты): север уходит вправо, а цель на западе
		// оказывается прямо по ходу — вверху.
		assertEquals(0, ArrowGeometry.screenAngle(0, 10, QUARTER), EPS);
		assertEquals(UP, ArrowGeometry.screenAngle(-10, 0, QUARTER), EPS);
		// Пол-оборота: север сзади.
		assertEquals(DOWN, ArrowGeometry.screenAngle(0, 10, 2 * QUARTER), EPS);
		// Старшие биты угла отбрасываются, как в Perspective.localToMinimap.
		assertEquals(ArrowGeometry.screenAngle(3, 7, 123), ArrowGeometry.screenAngle(3, 7, 123 + 16384), EPS);
	}

	@Test
	public void совпадаетСМиникартойRuneLite()
	{
		// Та же формула, что в Perspective.localToMinimap (1.12.39), с таблицами клиента.
		for (int yaw = 0; yaw < 16384; yaw += 777)
		{
			for (int[] d : new int[][]{{5, 0}, {0, 5}, {-7, 3}, {12, -9}})
			{
				int sin = net.runelite.api.Perspective.SINE14[yaw];
				int cos = net.runelite.api.Perspective.COSINE14[yaw];
				int mx = cos * d[0] * 128 + sin * d[1] * 128 >> 16;
				int my = sin * d[0] * 128 - cos * d[1] * 128 >> 16;
				double want = Math.atan2(my, mx);
				double got = ArrowGeometry.screenAngle(d[0], d[1], yaw);
				assertTrue("yaw " + yaw, Math.abs(ArrowGeometry.wrap(want - got)) < 0.02);
			}
		}
	}

	@Test
	public void поворотПлавныйБезДрожи()
	{
		assertEquals(1.0, ArrowGeometry.smooth(Double.NaN, 1.0), EPS);
		// Мелочь в мёртвой зоне не двигает стрелку.
		assertEquals(1.0, ArrowGeometry.smooth(1.0, 1.0 + Math.toRadians(1)), EPS);
		// Заметный поворот — плавно, часть пути за кадр.
		double next = ArrowGeometry.smooth(0, 0.5);
		assertTrue(next > 0 && next < 0.5);
		// По короткой дуге через ±π, а не через ноль.
		double wrapAround = ArrowGeometry.smooth(Math.PI - 0.2, -Math.PI + 0.2);
		assertTrue(Math.abs(wrapAround) > Math.PI - 0.2);
		// Развернул камеру — сразу, без полусекундного разворота.
		assertEquals(DOWN, ArrowGeometry.smooth(UP + 0.1, DOWN), EPS);
	}

	@Test
	public void подписьБезСторонСвета()
	{
		assertEquals("~62 клетки", OsrsPathArrowOverlay.label("~62 клетки ↑"));
		assertEquals("~139 клеток, этажом выше", OsrsPathArrowOverlay.label("~139 клеток ↘, этажом выше"));
		assertEquals("✓ Рядом", OsrsPathArrowOverlay.label("✓ Рядом"));
		assertEquals(null, OsrsPathArrowOverlay.label(null));
	}

	@Test
	public void состоянияПоРасстоянию()
	{
		assertEquals(ArrowGeometry.State.DEFAULT, ArrowGeometry.state(80, true, false));
		assertEquals(ArrowGeometry.State.APPROACHING, ArrowGeometry.state(ArrowGeometry.APPROACH, true, false));
		assertEquals(ArrowGeometry.State.VERY_CLOSE, ArrowGeometry.state(3, true, true));
		assertEquals(ArrowGeometry.State.OTHER_LEVEL, ArrowGeometry.state(3, false, false));
	}

	@Test
	public void стрелкаВнутриКругаПриЛюбомУгле()
	{
		for (double a = -Math.PI; a <= Math.PI; a += 0.1)
		{
			Polygon p = ArrowGeometry.arrow(50, 50, 40, a);
			for (int i = 0; i < p.npoints; i++)
			{
				assertTrue(Math.hypot(p.xpoints[i] - 50, p.ypoints[i] - 50) <= 40 + 1);
			}
		}
		// Нос — в сторону угла: при «вверх» самая верхняя точка — нос.
		Polygon up = ArrowGeometry.arrow(50, 50, 40, UP);
		int top = Integer.MAX_VALUE;
		for (int i = 0; i < up.npoints; i++)
		{
			top = Math.min(top, up.ypoints[i]);
		}
		assertEquals(14, top);
	}

	@Test
	public void рисунокНеВылезаетЗаРамку() throws IOException
	{
		File out = new File("build/overlay-render");
		out.mkdirs();
		String[] texts = {null, "~62 клетки", "~139 клеток, этажом выше", "Цель под землёй — найди спуск"};
		for (Font font : new Font[]{FontManager.getRunescapeFont(), FontManager.getRunescapeBoldFont(), FontManager.getRunescapeSmallFont()})
		{
			for (OsrsPathBridgeConfig.ArrowSize size : OsrsPathBridgeConfig.ArrowSize.values())
			{
				for (ArrowGeometry.State state : ArrowGeometry.State.values())
				{
					for (String text : texts)
					{
						for (int layer : new int[]{0, 1, 2, -2})
						{
							BufferedImage img = new BufferedImage(600, 300, BufferedImage.TYPE_INT_ARGB);
							Graphics2D g = img.createGraphics();
							Font f = OverlayText.font(font, 1f);
							Dimension d = OsrsPathArrowOverlay.draw(g, f, state, 0.7, layer, text, size.diameter, 75);
							g.dispose();
							for (int y = 0; y < img.getHeight(); y++)
							{
								for (int x = 0; x < img.getWidth(); x++)
								{
									if ((img.getRGB(x, y) >>> 24) != 0 && (x >= d.width || y >= d.height))
									{
										throw new AssertionError("за рамкой: " + state + " " + size + " «" + text + "» " + x + "," + y + " рамка " + d);
									}
								}
							}
							if (text != null && text.startsWith("~62") && layer == 0 && size == OsrsPathBridgeConfig.ArrowSize.MEDIUM && font == FontManager.getRunescapeFont())
							{
								ImageIO.write(img.getSubimage(0, 0, d.width, d.height), "png", new File(out, "arrow-" + state + ".png"));
							}
						}
					}
				}
			}
		}
	}
}
