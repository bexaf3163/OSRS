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
 * The big arrow: the direction as on the minimap at any camera rotation, smoothness without jitter,
 * states by distance and the drawing inside its own frame with the real RuneLite fonts.
 */
public class ArrowGeometryTest
{
	private static final double EPS = 1e-9;
	private static final double UP = -Math.PI / 2;
	private static final double DOWN = Math.PI / 2;
	/** A quarter turn of the camera in client units (16384 per turn). */
	private static final int QUARTER = 4096;

	@Test
	public void cameraFacingNorth_targetToTheNorth_arrowUp()
	{
		assertEquals(UP, ArrowGeometry.screenAngle(0, 10, 0), EPS);
		assertEquals(0, ArrowGeometry.screenAngle(10, 0, 0), EPS);
		assertEquals(DOWN, ArrowGeometry.screenAngle(0, -10, 0), EPS);
		assertEquals(Math.PI, Math.abs(ArrowGeometry.screenAngle(-10, 0, 0)), EPS);
	}

	@Test
	public void arrowTurnsWithTheCamera()
	{
		// A quarter turn of the camera (as on the minimap): north goes to the right, and a target in the west
		// ends up straight ahead - at the top.
		assertEquals(0, ArrowGeometry.screenAngle(0, 10, QUARTER), EPS);
		assertEquals(UP, ArrowGeometry.screenAngle(-10, 0, QUARTER), EPS);
		// Half a turn: north is behind.
		assertEquals(DOWN, ArrowGeometry.screenAngle(0, 10, 2 * QUARTER), EPS);
		// The high bits of the angle are dropped, as in Perspective.localToMinimap.
		assertEquals(ArrowGeometry.screenAngle(3, 7, 123), ArrowGeometry.screenAngle(3, 7, 123 + 16384), EPS);
	}

	@Test
	public void matchesTheRuneLiteMinimap()
	{
		// The same formula as in Perspective.localToMinimap (1.12.39), with the client's tables.
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
	public void turnIsSmoothWithoutJitter()
	{
		assertEquals(1.0, ArrowGeometry.smooth(Double.NaN, 1.0), EPS);
		// A small change in the dead zone does not move the arrow.
		assertEquals(1.0, ArrowGeometry.smooth(1.0, 1.0 + Math.toRadians(1)), EPS);
		// A noticeable turn is smooth, a part of the way per frame.
		double next = ArrowGeometry.smooth(0, 0.5);
		assertTrue(next > 0 && next < 0.5);
		// Along the short arc through ±π, not through zero.
		double wrapAround = ArrowGeometry.smooth(Math.PI - 0.2, -Math.PI + 0.2);
		assertTrue(Math.abs(wrapAround) > Math.PI - 0.2);
		// The camera was turned sharply: at once, without a half-second swing.
		assertEquals(DOWN, ArrowGeometry.smooth(UP + 0.1, DOWN), EPS);
	}

	@Test
	public void labelWithoutCompassDirections()
	{
		assertEquals("~62 tiles", OsrsPathArrowOverlay.label("~62 tiles ↑"));
		assertEquals("~139 tiles, a floor up", OsrsPathArrowOverlay.label("~139 tiles ↘, a floor up"));
		assertEquals("✓ Nearby", OsrsPathArrowOverlay.label("✓ Nearby"));
		assertEquals(null, OsrsPathArrowOverlay.label(null));
	}

	@Test
	public void statesByDistance()
	{
		assertEquals(ArrowGeometry.State.DEFAULT, ArrowGeometry.state(80, true, false));
		assertEquals(ArrowGeometry.State.APPROACHING, ArrowGeometry.state(ArrowGeometry.APPROACH, true, false));
		assertEquals(ArrowGeometry.State.VERY_CLOSE, ArrowGeometry.state(3, true, true));
		assertEquals(ArrowGeometry.State.OTHER_LEVEL, ArrowGeometry.state(3, false, false));
	}

	@Test
	public void arrowInsideTheCircleAtAnyAngle()
	{
		for (double a = -Math.PI; a <= Math.PI; a += 0.1)
		{
			Polygon p = ArrowGeometry.arrow(50, 50, 40, a);
			for (int i = 0; i < p.npoints; i++)
			{
				assertTrue(Math.hypot(p.xpoints[i] - 50, p.ypoints[i] - 50) <= 40 + 1);
			}
		}
		// The nose points in the direction of the angle: for "up" the topmost point is the nose.
		Polygon up = ArrowGeometry.arrow(50, 50, 40, UP);
		int top = Integer.MAX_VALUE;
		for (int i = 0; i < up.npoints; i++)
		{
			top = Math.min(top, up.ypoints[i]);
		}
		assertEquals(14, top);
	}

	@Test
	public void drawingDoesNotStickOutOfTheFrame() throws IOException
	{
		File out = new File("build/overlay-render");
		out.mkdirs();
		String[] texts = {null, "~62 tiles", "~139 tiles, a floor up", "Target is underground - find the way down"};
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
							Dimension d = OsrsPathArrowOverlay.draw(g, f, state, 0.7, layer, text, size.diameter);
							g.dispose();
							for (int y = 0; y < img.getHeight(); y++)
							{
								for (int x = 0; x < img.getWidth(); x++)
								{
									if ((img.getRGB(x, y) >>> 24) != 0 && (x >= d.width || y >= d.height))
									{
										throw new AssertionError("outside the frame: " + state + " " + size + " '" + text + "' " + x + "," + y + " frame " + d);
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
