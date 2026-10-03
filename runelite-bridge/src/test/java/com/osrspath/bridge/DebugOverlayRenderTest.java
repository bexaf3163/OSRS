package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import javax.imageio.ImageIO;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/**
 * Плашка разработчика, нарисованная настоящим шрифтом RuneLite: помещается в свою рамку, зелёное и красное
 * различимы на тёмной подложке. Картинки для глаза — в build/overlay-render/debug-*.png.
 */
public class DebugOverlayRenderTest
{
	private static final File OUT = new File("build/overlay-render");
	private static final int SPARE = 200;

	private static DebugView.State healthy()
	{
		return new DebugView.State("S2-05", "3/9", 5, 1, 5, "Добудь руду", false, false, null, Arrays.asList("has Iron ore = TRUE"),
			Collections.singletonList("Quest(The Knight's Sword) = FALSE"), 1, "seq 1712000000, 3 с назад", 80, "POSITION: дошёл до шага 2 «Добудь руду»", "12/28", "3200,3200,0", 4242, true,
			true, true, "session-20260101-120000.jsonl", 57, 0, Collections.emptyList(), null);
	}

	private static DebugView.State broken()
	{
		return new DebugView.State("S2-08", "2/6", 3, 2, 5, "Отдай Bronze bar Thurgo, чтобы он выковал меч", false, false, "Bronze bar ещё в сумке: сначала отдай его",
			Arrays.asList("has Bronze bar = TRUE", "need Bronze bar (сдан) = FALSE"), Collections.singletonList("Item(2349) = FALSE"), 3, null, null,
			"CLAMP: Bronze bar ещё в сумке: сначала отдай его", "26/28", "2998,3144,0", 99000, false, false, true, "session-20260101-120000.jsonl", 412, 2,
			Arrays.asList("STUCK: Шаг 3/5 этапа S2-08#2 не меняется 184 с, хотя пройдено ~96 клеток и сумка менялась 7 раз", "EMPTY: шаг S2-08 выбран, а на экране пусто 22 с"),
			"shot-20260101-120311-anomaly_STUCK.png");
	}

	private static BufferedImage render(DebugView.State s, Dimension[] size)
	{
		BufferedImage img = new BufferedImage(OsrsPathDebugOverlay.WIDTH + SPARE, 600, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setFont(FontManager.getRunescapeFont());
		size[0] = OsrsPathDebugOverlay.paint(g, s);
		g.dispose();
		return img;
	}

	private static int count(BufferedImage img, int x0, int x1, java.util.function.IntPredicate color)
	{
		int n = 0;
		for (int y = 0; y < img.getHeight(); y++)
		{
			for (int x = x0; x < x1; x++)
			{
				if (color.test(img.getRGB(x, y)))
				{
					n++;
				}
			}
		}
		return n;
	}

	private static boolean green(int argb)
	{
		return ((argb >> 24) & 0xFF) > 200 && ((argb >> 8) & 0xFF) > 180 && ((argb >> 16) & 0xFF) < 130 && (argb & 0xFF) < 150;
	}

	private static boolean red(int argb)
	{
		return ((argb >> 24) & 0xFF) > 200 && ((argb >> 16) & 0xFF) > 220 && ((argb >> 8) & 0xFF) < 130 && (argb & 0xFF) < 130;
	}

	private static void save(BufferedImage img, Dimension size, String name) throws IOException
	{
		assertTrue(OUT.isDirectory() || OUT.mkdirs());
		BufferedImage crop = img.getSubimage(0, 0, size.width, size.height);
		BufferedImage flat = new BufferedImage(size.width, size.height, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = flat.createGraphics();
		g.setColor(new java.awt.Color(60, 90, 50));
		g.fillRect(0, 0, size.width, size.height);
		g.drawImage(crop, 0, 0, null);
		g.dispose();
		ImageIO.write(flat, "png", new File(OUT, name));
	}

	@Test
	public void вПорядкеЗелёноеИСерое_красногоНет() throws IOException
	{
		Dimension[] size = new Dimension[1];
		BufferedImage img = render(healthy(), size);
		assertEquals(OsrsPathDebugOverlay.WIDTH, size[0].width);
		assertEquals("за рамкой ничего не нарисовано", 0, count(img, OsrsPathDebugOverlay.WIDTH, img.getWidth(), p -> ((p >> 24) & 0xFF) != 0));
		assertEquals("ниже рамки тоже", 0, countBelow(img, size[0].height));
		assertTrue("зелёный текст есть", count(img, 0, OsrsPathDebugOverlay.WIDTH, DebugOverlayRenderTest::green) > 100);
		save(img, size[0], "debug-healthy.png");
	}

	private static int countBelow(BufferedImage img, int h)
	{
		int n = 0;
		for (int y = h; y < img.getHeight(); y++)
		{
			for (int x = 0; x < img.getWidth(); x++)
			{
				if (((img.getRGB(x, y) >> 24) & 0xFF) != 0)
				{
					n++;
				}
			}
		}
		return n;
	}

	@Test
	public void сломанноеКрасноеИДлинныеСтрокиПереносятсяВРамку() throws IOException
	{
		Dimension[] size = new Dimension[1];
		BufferedImage img = render(broken(), size);
		assertEquals(0, count(img, OsrsPathDebugOverlay.WIDTH, img.getWidth(), p -> ((p >> 24) & 0xFF) != 0));
		assertEquals(0, countBelow(img, size[0].height));
		assertTrue("красный текст есть", count(img, 0, OsrsPathDebugOverlay.WIDTH, DebugOverlayRenderTest::red) > 200);
		assertTrue("есть и зелёное: плашка различает", count(img, 0, OsrsPathDebugOverlay.WIDTH, DebugOverlayRenderTest::green) > 20);
		assertTrue("высота плашки разумна: " + size[0].height, size[0].height < 360);
		save(img, size[0], "debug-broken.png");
	}
}
