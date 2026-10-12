package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.Test;

/** Where the explanation of a line goes: beside the plate, never over it, always inside the canvas. */
public class OverlayTooltipTest
{
	private static final Rectangle CANVAS = new Rectangle(0, 0, 800, 600);
	private static final Dimension TIP = new Dimension(200, 80);

	@Test
	public void roomOnTheRight_theTipStandsBesideThePlateAtTheHeightOfTheLine()
	{
		Rectangle plate = new Rectangle(10, 40, 240, 300);
		Rectangle line = new Rectangle(14, 120, 232, 16);
		Rectangle at = OverlayTooltip.place(plate, line, TIP, CANVAS);
		assertEquals(plate.x + plate.width + OverlayTooltip.GAP, at.x);
		assertEquals(120, at.y);
		assertFalse("the plate is not covered", at.intersects(plate));
	}

	@Test
	public void plateAtTheRightEdge_theTipGoesToTheLeft()
	{
		Rectangle plate = new Rectangle(560, 40, 240, 300);
		Rectangle at = OverlayTooltip.place(plate, new Rectangle(564, 100, 232, 16), TIP, CANVAS);
		assertEquals(plate.x - OverlayTooltip.GAP - TIP.width, at.x);
		assertFalse(at.intersects(plate));
		assertTrue(CANVAS.contains(at));
	}

	@Test
	public void aLineNearTheBottom_theTipIsKeptInsideTheCanvas()
	{
		Rectangle plate = new Rectangle(10, 300, 240, 290);
		Rectangle at = OverlayTooltip.place(plate, new Rectangle(14, 585, 232, 14), TIP, CANVAS);
		assertTrue("inside: " + at, CANVAS.contains(at));
		assertEquals(CANVAS.y + CANVAS.height - TIP.height, at.y);
	}

	@Test
	public void noRoomOnEitherSide_theTipGoesUnderThePlate_thenOverIt()
	{
		Rectangle narrow = new Rectangle(0, 0, 260, 400);
		Rectangle plate = new Rectangle(10, 20, 240, 200);
		Rectangle under = OverlayTooltip.place(plate, new Rectangle(14, 40, 232, 14), TIP, new Rectangle(0, 0, 260, 400));
		assertEquals(plate.y + plate.height + OverlayTooltip.GAP, under.y);
		assertTrue(narrow.contains(under));
		Rectangle tall = new Rectangle(10, 20, 240, 380);
		Rectangle over = OverlayTooltip.place(tall, new Rectangle(14, 40, 232, 14), TIP, narrow);
		assertTrue("kept inside the canvas: " + over, narrow.contains(over));
	}

	/** Renders the plate with its tip beside it to build/overlay-render, so the layout can be looked at and not only measured. */
	@Test
	public void rendersATipBesideAPlate() throws Exception
	{
		BufferedImage img = new BufferedImage(560, 220, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setColor(new Color(40, 52, 40));
		g.fillRect(0, 0, 560, 220);
		Rectangle plate = new Rectangle(12, 12, 240, 150);
		g.setColor(new Color(18, 22, 30, 230));
		g.fillRoundRect(plate.x, plate.y, plate.width, plate.height, 12, 12);
		Font font = new Font("Dialog", Font.PLAIN, 12);
		g.setFont(font);
		g.setColor(new Color(235, 235, 235));
		g.drawString("Quest items in your bag: 2 of 5", 24, 40);
		g.drawString("Needed now: Bones x25", 24, 62);
		Rectangle line = new Rectangle(14, 48, 236, 18);
		g.setColor(new Color(255, 255, 255, 40));
		g.fill(line);
		FontMetrics fm = g.getFontMetrics(font);
		List<String> lines = OverlayTooltip.wrap("Bones x25: take them from the bank first. The quest asks for them on the later line; this one only needs the bucket of water.", fm);
		Rectangle at = OverlayTooltip.place(plate, line, OverlayTooltip.size(lines, fm), new Rectangle(0, 0, 560, 220));
		OverlayTooltip.paint(g, at, lines, font);
		g.dispose();
		assertFalse(at.intersects(plate));
		File out = new File("build/overlay-render");
		out.mkdirs();
		ImageIO.write(img, "png", new File(out, "guide-tooltip.png"));
	}

	@Test
	public void aTipLargerThanTheCanvasIsShrunkToIt()
	{
		Rectangle at = OverlayTooltip.place(new Rectangle(0, 0, 100, 100), new Rectangle(0, 0, 100, 14), new Dimension(900, 700), new Rectangle(0, 0, 300, 200));
		assertTrue(at.width <= 300 && at.height <= 200);
	}
}
