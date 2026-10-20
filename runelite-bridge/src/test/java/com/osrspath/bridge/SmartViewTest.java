package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** "Smart view": what is visible in the game while travelling, at the bank, at the exchange and near the step; what always stays. */
public class SmartViewTest
{
	@Test
	public void whileTravelling_compactIsTheDefault_butThePlayerCanOpenDetails()
	{
		SmartView.Context c = SmartView.of(false, false, SmartView.TRAVEL_TILES + 1);
		assertEquals(SmartView.Context.TRAVEL, c);
		assertFalse(OsrsPathGuideOverlay.expanded(false));
		assertTrue("the header click must open details while travelling", OsrsPathGuideOverlay.expanded(true));
		assertTrue(SmartView.compactHud(c));
	}

	@Test
	public void nearTheStepOrWithoutTarget_normalView()
	{
		for (int tiles : new int[] {-1, 0, 5, SmartView.TRAVEL_TILES})
		{
			SmartView.Context c = SmartView.of(false, false, tiles);
			assertEquals("tiles: " + tiles, SmartView.Context.STEP, c);
			assertTrue(OsrsPathGuideOverlay.expanded(true));
			assertFalse(SmartView.compactHud(c));
		}
	}

	@Test
	public void atTheBank_theListIsVisible_evenIfTheTargetIsFar()
	{
		SmartView.Context c = SmartView.of(true, false, 500);
		assertEquals(SmartView.Context.BANK, c);
		assertTrue(OsrsPathGuideOverlay.expanded(true));
		assertFalse("at the bank the guide is as the player left it: the departure check is drawn separately", SmartView.compactHud(c));
	}

	@Test
	public void atTheExchange_theGuideHonorsTheExplicitChoice()
	{
		SmartView.Context c = SmartView.of(false, true, 3);
		assertEquals(SmartView.Context.EXCHANGE, c);
		assertFalse(OsrsPathGuideOverlay.expanded(false));
		assertTrue(OsrsPathGuideOverlay.expanded(true));
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

	private static Hud.State full(String danger, boolean inside, String health, boolean critical)
	{
		return new Hud.State("Go to: Draynor Bank", "Then: step [S9-01] Lost City", "~42 tiles ↗", false,
			"Bag: missing 2", false, danger, inside, "34 shrimps to 20 Fishing", false, "⚡ Wear Iron scimitar",
			health, critical, "Use Knife on Tree", 42);
	}

	/** A stop on the way over a step, with everything the plugin can know at once. */
	private static HudModel.Card card(Hud.State s)
	{
		StepGuide.View v = new StepGuide.View("[S9-01] Lost City", null, java.util.Collections.emptyList(), java.util.Collections.emptyList(), null, null, null, null);
		return HudModel.build(HudModelTest.with(HudModelTest.input(v, s, null), "detour", s.getTitle()));
	}

	@Test
	public void theClosedCard_actionAndDistance_theRestInTheDetails()
	{
		HudModel.Card c = card(full(null, false, null, false));
		assertEquals("Go to: Draynor Bank", c.getHeadline());
		assertEquals("~42 tiles ↗", c.getStatus());
		assertEquals("a quest name keeps its capital", "Then: Lost City", c.getThen());
		String closed = c.plain(false, false);
		for (String gone : new String[] {"Bag:", "34 shrimps", "Iron scimitar", "Use Knife on Tree"})
		{
			assertFalse(gone + " is not on the closed card: " + closed, closed.contains(gone));
		}
		assertNull(c.getWarning());
	}

	@Test
	public void theClosedCard_carriesTheOneWarningThatMatters()
	{
		HudModel.Card inside = card(full("Dark wizards", true, null, false));
		assertEquals("You are in a danger zone: Dark wizards", inside.getWarning().getText());
		assertEquals(HudModel.Tone.DANGER, inside.getWarning().getTone());
		HudModel.Card low = card(full("Dark wizards", true, "HP 5/40 - EAT NOW! Hits up to 8", true));
		assertEquals("critical health takes precedence over a general zone warning", "HP 5/40 - EAT NOW! Hits up to 8", low.getWarning().getText());
		assertTrue(low.plain(true, false), low.plain(true, false).contains("HP 5/40 - EAT NOW!"));
		assertTrue(low.plain(true, false).contains("You are in a danger zone: Dark wizards"));
		HudModel.Card eat = card(full(null, false, "HP 15/40 - time to eat. Hits up to 8", false));
		assertEquals(HudModel.Tone.CAUTION, eat.getWarning().getTone());
	}

	@Test
	public void withoutAStepOrATarget_noCard_andNoCrash()
	{
		assertNull(HudModel.build(HudModelTest.input(null, new Hud.State(null, null, "~30 tiles", false, null, false, null, false, null, false, null), null)));
		StepGuide.View v = new StepGuide.View("[S1-01] Step", null, java.util.Collections.emptyList(), java.util.Collections.emptyList(), null, null, null, null);
		assertEquals("Step", HudModel.build(HudModelTest.input(v, new Hud.State("[S1-01] Step", null, null, false, null, false, null, false, null, false, null), null))
			.getHeadline());
	}

	@Test
	public void theClosedCardIsMuchShorterThanTheOpenOne()
	{
		HudModel.Card c = card(full("Dark wizards", false, "HP 15/40 - time to eat. Hits up to 8", false));
		int closed = HudRenderTest.layout(c, false, false, OsrsPathGuideOverlay.WIDTH, 1f, 2000).getSize().height;
		int open = HudRenderTest.layout(c, true, true, OsrsPathGuideOverlay.WIDTH, 1f, 2000).getSize().height;
		assertTrue("closed " + closed + " against open " + open, closed < open);
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
