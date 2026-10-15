package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import org.junit.Test;

public class TrainingFoodTest
{
	@Test
	public void theBagsFoodInKillsFromTheAppsEstimate()
	{
		// S3-08 at Defence 1: about 3.4 health a level 12 Minotaur, net of regeneration; 8 Salmon heal 72.
		assertEquals("Food: 8 Salmon · ~21 kills", TrainingFood.line("Salmon", 8, 9, 3.4));
		assertEquals("without an estimate the food only", "Food: 8 Salmon", TrainingFood.line("Salmon", 8, 9, null));
	}

	@Test
	public void nearlyOutIsAnAlertAndNoneLeftSaysBankNow()
	{
		assertEquals("Food: 2 Salmon · ~5 kills - bank soon", TrainingFood.line("Salmon", 2, 9, 3.4));
		assertTrue(TrainingFood.low(2));
		assertFalse(TrainingFood.low(3));
		assertEquals("No Salmon left - bank now", TrainingFood.line("Salmon", 0, 9, 3.4));
	}

	@Test
	public void theFoodRowIsTheFirstWithHealing()
	{
		Checklist.Row sword = new Checklist.Row("Mithril scimitar", 1, 1, 0, null, Checklist.State.IN_BAG_READY);
		Checklist.Row salmon = new Checklist.Row("Salmon", 8, 26, 5, 9, Checklist.State.MISSING_FROM_BAG);
		assertEquals(salmon, TrainingFood.foodRow(Arrays.asList(sword, salmon)));
		assertNull(TrainingFood.foodRow(Arrays.asList(sword)));
	}

	@Test
	public void thePlateWhileTrainingCarriesTheFoodAndTurnsRedWhenItRunsOut()
	{
		OsrsPathHudOverlay.State s = new OsrsPathHudOverlay.State("[S3-08] Strength to 20 and Attack to 30", "Point 2/2", "~21 tiles", false,
			"Bag: missing Salmon 7", false, null, false, "9 minotaurs to 20 Strength on Aggressive (~2 min)", false, null, null, false, null, 21, null, 0.5, true,
			TrainingFood.line("Salmon", 8, 9, 3.4), false);
		OsrsPathHudOverlay.State lean = OsrsPathHudOverlay.lean(s, false);
		assertEquals("Food: 8 Salmon · ~21 kills", lean.getFood());
		assertNull("the departure check still waits for the bank", lean.getBag());
		assertEquals(OverlayCard.GOLD, OsrsPathHudOverlay.accent(lean));
		OsrsPathHudOverlay.State low = new OsrsPathHudOverlay.State(s.getTitle(), null, null, false, null, false, null, false, s.getPacing(), false, null,
			null, false, null, -1, null, 0.5, true, TrainingFood.line("Salmon", 1, 9, 3.4), true);
		assertEquals(OverlayCard.RED, OsrsPathHudOverlay.accent(low));
		assertTrue(OsrsPathHudOverlay.plain(low).startsWith("[S3-08] Strength to 20 and Attack to 30\nFood: 1 Salmon"));
	}

	@Test
	public void foodPerKillIsChecked()
	{
		ActiveTarget.Pacing p = new ActiveTarget.Pacing();
		p.setSkill("strength");
		p.setTargetLevel(20);
		p.setTargetExp(4470);
		p.setActionName("minotaur|minotaurs");
		p.setExpPerAction(40);
		p.setFoodHpPerKill(3.4);
		assertNull(p.problem());
		p.setFoodHpPerKill(-1.0);
		assertEquals("invalid food per kill", p.problem());
	}
}
