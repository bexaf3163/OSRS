package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import javax.imageio.ImageIO;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/**
 * The docked bar: what it counts, when the list under it is open, how a long step name is cut, and that it draws inside its frame with the real
 * RuneLite font. Pictures for the eye are in build/overlay-render/dock-*.png.
 */
public class DockBarTest
{
	private static final File OUT = new File("build/overlay-render");

	private static StepGuide.ItemLine item(StepGuide.Have have)
	{
		return new StepGuide.ItemLine("x", "x", have, "", -1, "x", "x");
	}

	private static StepGuide.View view(StepGuide.Have... have)
	{
		List<StepGuide.ItemLine> items = new ArrayList<>();
		for (StepGuide.Have h : have)
		{
			items.add(item(h));
		}
		return new StepGuide.View("S2-10", "goal", items, Collections.emptyList(), null, null, null, null);
	}

	private static OsrsPathHudOverlay.State hud(String danger)
	{
		return new OsrsPathHudOverlay.State("S2-10 Prince Ali Rescue", "Talk to Osman", "16 tiles", false, null, true, danger, false, null, false, null);
	}

	@Test
	public void countsEachKindOfItem_unknownIsNeverMissing()
	{
		DockBar.Model m = DockBar.model(hud(null), view(StepGuide.Have.BAG, StepGuide.Have.DONE, StepGuide.Have.BANK, StepGuide.Have.NONE,
			StepGuide.Have.NONE, StepGuide.Have.UNKNOWN, StepGuide.Have.IN_STEP));
		assertEquals(2, m.bag);
		assertEquals(1, m.bank);
		assertEquals("only the items known to be nowhere", 2, m.missing);
		assertEquals("an unchecked item is counted apart", 1, m.unknown);
	}

	@Test
	public void noHudStateMeansNoBar_noViewMeansNoCounts()
	{
		assertNull(DockBar.model(null, view(StepGuide.Have.BAG)));
		DockBar.Model m = DockBar.model(hud(null), null);
		assertEquals(0, m.bag + m.bank + m.missing + m.unknown);
		assertNull(m.percent);
	}

	@Test
	public void aWarningReplacesTheGoalAndTurnsTheBarRed()
	{
		DockBar.Model calm = DockBar.model(hud(null), null);
		assertEquals("Talk to Osman", calm.goal);
		assertFalse(calm.danger);
		DockBar.Model hot = DockBar.model(hud("Aggressive goblins nearby"), null);
		assertEquals("Aggressive goblins nearby", hot.goal);
		assertTrue(hot.danger);
		assertEquals(OverlayCard.RED, hot.accent);
	}

	@Test
	public void theListIsOpenAtTheBankAndWhileTheMouseIsNearAndForAMomentAfter()
	{
		SmartView.Context step = SmartView.Context.STEP;
		assertFalse("closed by default", DockBar.expanded(false, false, step, -1));
		assertTrue("over the bar", DockBar.expanded(true, false, step, 0));
		assertTrue("over the list", DockBar.expanded(false, true, step, 0));
		assertTrue("the departure check at the bank", DockBar.expanded(false, false, SmartView.Context.BANK, -1));
		assertTrue("just left the bar", DockBar.expanded(false, false, step, DockBar.GRACE_NANOS - 1));
		assertFalse("left a while ago", DockBar.expanded(false, false, step, DockBar.GRACE_NANOS));
		assertFalse("travelling does not open it", DockBar.expanded(false, false, SmartView.Context.TRAVEL, -1));
	}

	private static FontMetrics metrics(Graphics2D g)
	{
		Font f = FontManager.getRunescapeFont();
		g.setFont(f);
		return g.getFontMetrics(f);
	}

	@Test
	public void aLongTextIsCutWithDotsAndAShortOneIsKept()
	{
		BufferedImage img = new BufferedImage(10, 10, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		FontMetrics fm = metrics(g);
		assertEquals("Talk to Osman", DockBar.fit("Talk to Osman", fm, 500));
		String cut = DockBar.fit("Give the Bronze bar to Thurgo so he forges the sword", fm, 120);
		assertTrue(cut, cut.endsWith("..."));
		assertTrue("the cut text fits: " + fm.stringWidth(cut), fm.stringWidth(cut) <= 120);
		assertEquals("", DockBar.fit("anything", fm, 0));
		assertEquals("", DockBar.fit(null, fm, 100));
		g.dispose();
	}

	@Test
	public void theBarDrawsInsideItsFrameAndFollowsTheTheme()
	{
		BufferedImage img = new BufferedImage(DockBar.WIDTH + 40, 60, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		FontMetrics fm = metrics(g);
		DockBar.Model m = DockBar.model(hud(null), view(StepGuide.Have.BAG, StepGuide.Have.BANK, StepGuide.Have.NONE));
		Dimension d = DockBar.paint(g, m, fm, DockBar.WIDTH, 75, OsrsPathBridgeConfig.OverlayTheme.GLASS);
		g.dispose();
		assertEquals(DockBar.WIDTH, d.width);
		assertEquals(DockBar.height(fm), d.height);
		assertTrue("one row, not a plate", d.height < 40);
		for (int x = 0; x < img.getWidth(); x++)
		{
			for (int y = d.height + 1; y < img.getHeight(); y++)
			{
				assertEquals("nothing is drawn below the bar at " + x + "," + y, 0, img.getRGB(x, y) >>> 24);
			}
		}
		for (int y = 0; y < d.height; y++)
		{
			assertEquals("nothing is drawn right of the bar at " + y, 0, img.getRGB(DockBar.WIDTH + 1, y) >>> 24);
		}
		assertNotEquals("a dot, not a strip, on the left edge in the glass style", OverlayCard.GOLD.getRGB(), img.getRGB(1, d.height / 2));
	}

	@Test
	public void theDockIsOffByDefault_underANewStableKey() throws Exception
	{
		assertFalse("the HUD stays as it was until the player turns the bar on", new OsrsPathBridgeConfig() { }.dockBar());
		ConfigItem item = OsrsPathBridgeConfig.class.getMethod("dockBar").getAnnotation(ConfigItem.class);
		assertEquals("dockBar", item.keyName());
	}

	/** A picture for the eye: the bar calm, with a long step name, and in danger, over a bright and a dark scene. Not asserted. */
	@Test
	public void picturesForTheEye() throws IOException
	{
		OUT.mkdirs();
		BufferedImage img = new BufferedImage(900, 190, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setColor(new Color(176, 150, 98));
		g.fillRect(0, 0, 450, 190);
		g.setColor(new Color(40, 78, 36));
		g.fillRect(450, 0, 450, 190);
		Font f = FontManager.getRunescapeFont();
		g.setFont(f);
		FontMetrics fm = g.getFontMetrics(f);
		OsrsPathBridgeConfig.OverlayTheme[] themes = {OsrsPathBridgeConfig.OverlayTheme.CLASSIC, OsrsPathBridgeConfig.OverlayTheme.GLASS};
		for (int col = 0; col < 2; col++)
		{
			OsrsPathHudOverlay.State[] states = {hud(null), hud("Danger: aggressive goblins nearby"),
				new OsrsPathHudOverlay.State("S2-08 Give the Bronze bar to Thurgo so he forges the sword", "Use Bronze bar on Thurgo", "120 tiles", false, null, false, null, false, null, false, null)};
			StepGuide.View v = view(StepGuide.Have.BAG, StepGuide.Have.BAG, StepGuide.Have.BANK, StepGuide.Have.NONE, StepGuide.Have.UNKNOWN);
			for (int i = 0; i < 3; i++)
			{
				Graphics2D c = (Graphics2D) g.create();
				c.translate(20 + col * 450, 20 + i * 50);
				DockBar.paint(c, DockBar.model(states[i], v), fm, DockBar.WIDTH, 75, themes[col]);
				c.dispose();
			}
		}
		g.dispose();
		ImageIO.write(img, "png", new File(OUT, "dock-bar.png"));
	}
}
