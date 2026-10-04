package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.awt.FontMetrics;
import java.util.List;
import net.runelite.client.ui.overlay.components.PanelComponent;
import org.junit.Test;

/** "Smart view": what is visible in the game while travelling, at the bank, at the exchange and near the step; what always stays. */
public class SmartViewTest
{
	@Test
	public void whileTravelling_farFromTarget_onlyTheArrowAndOneLine()
	{
		SmartView.Context c = SmartView.of(false, false, SmartView.TRAVEL_TILES + 1);
		assertEquals(SmartView.Context.TRAVEL, c);
		assertFalse("the step list would block the view while travelling", SmartView.showsGuide(c));
		assertTrue(SmartView.compactHud(c));
	}

	@Test
	public void nearTheStepOrWithoutTarget_normalView()
	{
		for (int tiles : new int[] {-1, 0, 5, SmartView.TRAVEL_TILES})
		{
			SmartView.Context c = SmartView.of(false, false, tiles);
			assertEquals("tiles: " + tiles, SmartView.Context.STEP, c);
			assertTrue(SmartView.showsGuide(c));
			assertFalse(SmartView.compactHud(c));
		}
	}

	@Test
	public void atTheBank_theListIsVisible_evenIfTheTargetIsFar()
	{
		SmartView.Context c = SmartView.of(true, false, 500);
		assertEquals(SmartView.Context.BANK, c);
		assertTrue(SmartView.showsGuide(c));
		assertFalse("at the bank the HUD is normal: the departure check is drawn separately", SmartView.compactHud(c));
	}

	@Test
	public void atTheExchange_theStepListHides_theHudIsOneLine()
	{
		SmartView.Context c = SmartView.of(false, true, 3);
		assertEquals(SmartView.Context.EXCHANGE, c);
		assertFalse(SmartView.showsGuide(c));
		assertTrue(SmartView.compactHud(c));
	}

	@Test
	public void bankOutranksExchange_andTarget()
	{
		assertEquals(SmartView.Context.BANK, SmartView.of(true, true, 100));
	}

	@Test
	public void radar_inSmartView_onlyWhenAlreadyInTheZone()
	{
		assertFalse(SmartView.dangerVisible(true, DangerRadar.Level.NONE));
		assertFalse(SmartView.dangerVisible(true, DangerRadar.Level.NEAR));
		assertFalse("on approach we do not pop up", SmartView.dangerVisible(true, DangerRadar.Level.WARNING));
		assertTrue(SmartView.dangerVisible(true, DangerRadar.Level.INSIDE));
		// Smart view is off: as before, also on approach.
		assertTrue(SmartView.dangerVisible(false, DangerRadar.Level.WARNING));
		assertTrue(SmartView.dangerVisible(false, DangerRadar.Level.INSIDE));
		assertFalse(SmartView.dangerVisible(false, DangerRadar.Level.NEAR));
	}

	private static OsrsPathHudOverlay.State full(String danger, boolean inside, String health, boolean critical)
	{
		return new OsrsPathHudOverlay.State("Go to: Draynor Bank", "Then: step [S9-01] Lost City", "~42 tiles ↗", false,
			"Bag: missing 2", false, danger, inside, "34 shrimps to 20 Fishing", false, "⚡ Wear Iron scimitar",
			health, critical, "Use Knife on Tree", 42);
	}

	@Test
	public void compactHud_actionAndDistanceInOneLine_restRemoved()
	{
		OsrsPathHudOverlay.State s = SmartView.compact(full(null, false, null, false));
		assertEquals("Go to: Draynor Bank · ~42 tiles ↗", s.getTitle());
		assertNull(s.getGoal());
		assertNull(s.getDistance());
		assertNull(s.getBag());
		assertNull(s.getPacing());
		assertNull(s.getUpgrade());
		assertNull(s.getAction());
		assertNull(s.getDanger());
		assertEquals(42, s.getTiles());
	}

	@Test
	public void compactHud_criticalRemains_dangerOnlyInsideTheZone()
	{
		assertNull("on approach we do not show it", SmartView.compact(full("Dark wizards", false, null, false)).getDanger());
		OsrsPathHudOverlay.State inside = SmartView.compact(full("Dark wizards", true, null, false));
		assertEquals("Dark wizards", inside.getDanger());
		assertTrue(inside.isDangerInside());
		OsrsPathHudOverlay.State low = SmartView.compact(full(null, false, "HP 5/40 - EAT NOW! Hits up to 8", true));
		assertEquals("HP 5/40 - EAT NOW! Hits up to 8", low.getHealth());
		assertTrue(low.isHealthCritical());
		assertNull("time to eat, but not critical: that is not for one line", SmartView.compact(full(null, false, "HP 15/40 - time to eat. Hits up to 8", false)).getHealth());
	}

	@Test
	public void compactHud_withoutTitleOrDistance_doesNotCrash()
	{
		OsrsPathHudOverlay.State onlyDistance = SmartView.compact(new OsrsPathHudOverlay.State(null, null, "~30 tiles", false, null, false, null, false, null, false, null));
		assertEquals("~30 tiles", onlyDistance.getTitle());
		OsrsPathHudOverlay.State onlyTitle = SmartView.compact(new OsrsPathHudOverlay.State("[S1-01] Step", null, null, false, null, false, null, false, null, false, null));
		assertEquals("[S1-01] Step", onlyTitle.getTitle());
		OsrsPathHudOverlay.State nothing = SmartView.compact(new OsrsPathHudOverlay.State("", null, null, false, null, false, null, false, null, false, null));
		assertEquals("OSRS Path", nothing.getTitle());
	}

	@Test
	public void compactHud_drawnAsAShortCard()
	{
		FontMetrics fm = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_ARGB).createGraphics()
			.getFontMetrics(OverlayText.font(net.runelite.client.ui.FontManager.getRunescapeFont(), 1f));
		PanelComponent normal = new PanelComponent();
		PanelComponent compact = new PanelComponent();
		OsrsPathHudOverlay.build(normal, full(null, false, null, false), fm, OsrsPathHudOverlay.WIDTH, 70);
		OsrsPathHudOverlay.build(compact, SmartView.compact(full(null, false, null, false)), fm, OsrsPathHudOverlay.WIDTH, 70);
		List<?> a = normal.getChildren();
		List<?> b = compact.getChildren();
		assertTrue("while travelling there are noticeably fewer lines (" + b.size() + " against " + a.size() + ")", b.size() < a.size());
	}

	@Test
	public void distanceInTiles_comesFromTheReadyCalculation()
	{
		assertEquals(30, Navigation.readout(3200, 3200, 0, 3200, 3230, 0, false).getTiles());
		assertEquals("when near, also a number", 3, Navigation.readout(3200, 3200, 0, 3203, 3200, 0, false).getTiles());
		assertEquals("another floor is not 'travelling'", -1, Navigation.readout(3200, 3200, 0, 3200, 3300, 1, false).getTiles());
		assertEquals("underground is unknown", -1, Navigation.readout(3200, 3200, 0, 3200, 9700, 0, false).getTiles());
	}
}
