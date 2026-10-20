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
	public void theGuideWhileTrainingCarriesTheFood_andWarnsWhenItRunsOut()
	{
		Hud.State s = new Hud.State("[S3-08] Strength to 20 and Attack to 30", "Point 2/2", "~21 tiles", false,
			"Bag: missing Salmon 7", false, null, false, "9 minotaurs to 20 Strength on Aggressive (~2 min)", false, null, null, false, null, 21, null, 0.5, true,
			TrainingFood.line("Salmon", 8, 9, 3.4), false);
		StepGuide.View v = new StepGuide.View(s.getTitle(), null, java.util.Collections.emptyList(), java.util.Collections.emptyList(), null, null, null, null);
		HudModel.Pace pace = new HudModel.Pace("Strength", 19, 20, "Aggressive", false, 9, "minotaurs", "~2 min", true, 0.5, false, "Strength 20, Attack 30");
		HudModel.Card c = HudModel.build(HudModelTest.input(v, s, pace));
		assertNull("enough food: no warning", c.getWarning());
		assertTrue("the food in the details: " + c.plain(true, false), c.plain(true, false).contains("Food: 8 Salmon · ~21 kills"));
		assertFalse("the departure check still waits for the bank", c.plain(true, true).contains("Bag:"));
		Hud.State low = new Hud.State(s.getTitle(), null, null, false, null, false, null, false, s.getPacing(), false, null,
			null, false, null, -1, null, 0.5, true, TrainingFood.line("Salmon", 1, 9, 3.4), true);
		HudModel.Card lowCard = HudModel.build(HudModelTest.input(v, low, pace));
		assertEquals("Food: 1 Salmon · ~2 kills - bank soon", lowCard.getWarning().getText());
		assertEquals(HudModel.Tone.CAUTION, lowCard.getWarning().getTone());
		assertTrue(lowCard.plain(false, false).startsWith("Train Strength to 20\n"));
		Hud.State none = new Hud.State(s.getTitle(), null, null, false, null, false, null, false, s.getPacing(), false, null,
			null, false, null, -1, null, 0.5, true, TrainingFood.line("Salmon", 0, 9, 3.4), true);
		assertEquals(HudModel.Tone.DANGER, HudModel.build(HudModelTest.input(v, none, pace)).getWarning().getTone());
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
