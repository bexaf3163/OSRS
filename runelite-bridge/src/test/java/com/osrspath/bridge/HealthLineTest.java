package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Collections;
import org.junit.Test;

/** The health line in the HUD: when it shows, when it stays silent and what comes from the app. */
public class HealthLineTest
{
	@Test
	public void silentWhileHealthSufficesOrHitUnknown()
	{
		assertNull(OsrsPathBridgePlugin.healthLine(40, 40, 10));
		assertNull("exactly two hits is still early", OsrsPathBridgePlugin.healthLine(20, 40, 10));
		assertNull("hit unknown", OsrsPathBridgePlugin.healthLine(5, 40, null));
		assertNull("not in the game", OsrsPathBridgePlugin.healthLine(0, 0, 10));
	}

	@Test
	public void warnsBelowTwoHitsAndShoutsBelowOne()
	{
		assertEquals("HP 19/40 - time to eat. Hits up to 10", OsrsPathBridgePlugin.healthLine(19, 40, 10));
		assertEquals("HP 10/40 - EAT NOW! Hits up to 10", OsrsPathBridgePlugin.healthLine(10, 40, 10));
		assertEquals("HP 1/10 - EAT NOW! Hits up to 3", OsrsPathBridgePlugin.healthLine(1, 10, 3));
	}

	@Test
	public void maxHitComesFromTheAppAndIsValidated()
	{
		ActiveTarget t = new Gson().fromJson("{\"stepId\":\"S5-08\",\"title\":\"Elvarg\",\"maxHit\":10}", ActiveTarget.class);
		assertNull(t.prepare());
		assertEquals(Integer.valueOf(10), t.getMaxHit());
		ActiveTarget bad = new Gson().fromJson("{\"stepId\":\"S5-08\",\"title\":\"Elvarg\",\"maxHit\":900}", ActiveTarget.class);
		assertNotNull(bad.prepare());
	}

	@Test
	public void theLineIsTheGuidesWarning()
	{
		StepGuide.View v = new StepGuide.View("[S5-08] Elvarg", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null);
		Hud.State s = new Hud.State("[S5-08] Elvarg", "Home", null, false, null, false, null, false, null, false, null,
			"HP 10/40 - EAT NOW! Hits up to 10", true);
		HudModel.Card c = HudModel.build(HudModelTest.input(v, s, null));
		assertEquals("HP 10/40 - EAT NOW! Hits up to 10", c.getWarning().getText());
		assertEquals(HudModel.Tone.DANGER, c.getWarning().getTone());
		Hud.State caution = new Hud.State("[S5-08] Elvarg", "Home", null, false, null, false, null, false, null, false, null,
			"HP 19/40 - time to eat. Hits up to 10", false);
		assertEquals(HudModel.Tone.CAUTION, HudModel.build(HudModelTest.input(v, caution, null)).getWarning().getTone());
		// Without the health line there is no warning (the old constructor).
		assertNull(HudModel.build(HudModelTest.input(v, new Hud.State("[S5-08] Elvarg", "Home", null, false, null, false, null, false, null, false, null), null))
			.getWarning());
	}

	@Test
	public void useReminderOnlyWhenTheItemIsInTheBagAndTheTargetIsHighlighted()
	{
		ActiveTarget t = new Gson().fromJson("{\"stepId\":\"S2-03\",\"title\":\"Witch's Potion\","
			+ "\"useOn\":[{\"item\":\"Raw rat meat\",\"target\":\"Fireplace\"}]}", ActiveTarget.class);
		assertNull(t.prepare());
		assertNull("no meat yet", OsrsPathBridgePlugin.useLine(t, StepGuideTest.counts()));
		assertEquals("Use Raw rat meat on Fireplace", OsrsPathBridgePlugin.useLine(t, StepGuideTest.counts(2134, "Raw rat meat", 1)));
		assertTrue("the fireplace is highlighted as the step's object", t.getObjectNameSet().contains("fireplace"));
		assertTrue("the meat is highlighted in the bag", t.getItemNameSet().contains("raw rat meat"));
		assertNull(OsrsPathBridgePlugin.useLine(null, StepGuideTest.counts()));
		ActiveTarget bad = new Gson().fromJson("{\"stepId\":\"S2-03\",\"title\":\"x\",\"useOn\":[{\"item\":\"\",\"target\":\"Fireplace\"}]}", ActiveTarget.class);
		assertNotNull(bad.prepare());
		ActiveTarget npc = new Gson().fromJson("{\"stepId\":\"S2-03\",\"title\":\"x\",\"useOn\":[{\"item\":\"Bones\",\"target\":\"Cow\",\"kind\":\"npc\"}]}", ActiveTarget.class);
		assertNull(npc.prepare());
		assertTrue(npc.getNpcNameSet().contains("cow"));
	}
}
