package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import org.junit.Test;

/**
 * The compact HUD: the top card does not repeat the "What you need" list (the step name, the target, the distance, "Bag ready": all of that is
 * already in the list, on the arrow and on the minimap) and disappears altogether when it has nothing to say.
 */
public class HudLeanTest
{
	/** As in the screenshot: a temporary target over the step, ~194 tiles, the bag is ready. */
	private static OsrsPathHudOverlay.State detour()
	{
		return new OsrsPathHudOverlay.State("Go to: Take the sword to the Squire", "Then: step [S2-07] The Knight's Sword", "~194 tiles ↑", false,
			"Bag ready to leave", true, null, false, null, false, null, null, false, null, 194);
	}

	private static StepGuide.View stageView()
	{
		StepGuide.StageView sv = new StepGuide.StageView(1, 1, Collections.emptyList(), 0, false);
		return new StepGuide.View("[S2-07] The Knight's Sword", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null, sv);
	}

	@Test
	public void listOnScreen_aCardWithDuplicatesDisappearsAltogether()
	{
		assertNull("the name, the target, the distance and 'bag ready' are all in the list", OsrsPathHudOverlay.lean(detour(), true));
	}

	@Test
	public void noList_nameTargetAndDistanceRemain_bagReadyDoesNot()
	{
		OsrsPathHudOverlay.State s = OsrsPathHudOverlay.lean(detour(), false);
		assertNotNull(s);
		assertEquals("Go to: Take the sword to the Squire", s.getTitle());
		assertEquals("~194 tiles ↑", s.getDistance());
		assertNull("good news is not needed", s.getBag());
	}

	@Test
	public void noList_butSomethingIsMissingInTheBag_theBagLineRemains()
	{
		OsrsPathHudOverlay.State s = new OsrsPathHudOverlay.State("Step", null, null, false, "Bag: no Knife", false, null, false, null, false, null);
		assertEquals("Bag: no Knife", OsrsPathHudOverlay.lean(s, false).getBag());
		assertNull("the list is next to it: what is missing is visible in it", OsrsPathHudOverlay.lean(s, true));
	}

	@Test
	public void warningsAlwaysRemain()
	{
		OsrsPathHudOverlay.State danger = new OsrsPathHudOverlay.State("Step", "target", "~5 tiles", false, null, false, "Skeleton nearby", true, null, false, null);
		OsrsPathHudOverlay.State lean = OsrsPathHudOverlay.lean(danger, true);
		assertNotNull(lean);
		assertEquals("Skeleton nearby", lean.getDanger());
		assertTrue(lean.isDangerInside());
		assertNull("the name and the target are removed", lean.getTitle());
		assertNull(lean.getGoal());

		OsrsPathHudOverlay.State health = new OsrsPathHudOverlay.State("Step", null, null, false, null, false, null, false, null, false, null,
			"HP 12/40 - eat!", true);
		assertEquals("HP 12/40 - eat!", OsrsPathHudOverlay.lean(health, true).getHealth());
		assertTrue(OsrsPathHudOverlay.lean(health, true).isHealthCritical());

		OsrsPathHudOverlay.State action = new OsrsPathHudOverlay.State("Step", null, null, false, null, false, null, false, null, false, null,
			null, false, "Use Knife on Bread");
		assertEquals("Use Knife on Bread", OsrsPathHudOverlay.lean(action, true).getAction());

		OsrsPathHudOverlay.State pacing = new OsrsPathHudOverlay.State("Step", null, null, false, null, false, null, false, "34 shrimps to 20 Fishing", true, null);
		assertEquals("34 shrimps to 20 Fishing", OsrsPathHudOverlay.lean(pacing, true).getPacing());

		OsrsPathHudOverlay.State upgrade = new OsrsPathHudOverlay.State("Step", null, null, false, null, false, null, false, null, false, "⚡ Wear Iron scimitar");
		assertEquals("⚡ Wear Iron scimitar", OsrsPathHudOverlay.lean(upgrade, true).getUpgrade());
	}

	@Test
	public void messagesWithoutWarnings_loseNothing_colourAndDistanceInTicksRemain()
	{
		OsrsPathHudOverlay.State s = new OsrsPathHudOverlay.State("Step", null, "nearby", true, null, false, null, false, "pace", false, null,
			null, false, null, 7);
		OsrsPathHudOverlay.State lean = OsrsPathHudOverlay.lean(s, true);
		assertTrue(lean.isNear());
		assertEquals(7, lean.getTiles());
	}

	@Test
	public void listVisible_onlyIfEnabledNotCollapsedAndHasSomethingToShow()
	{
		StepGuide.View v = stageView();
		assertTrue(GuideList.shown(true, false, v, false, SmartView.Context.STEP));
		assertFalse("turned off in the settings", GuideList.shown(false, false, v, false, SmartView.Context.STEP));
		assertFalse("collapsed: no details in it, the HUD stays full", GuideList.shown(true, true, v, false, SmartView.Context.STEP));
		assertFalse("empty", GuideList.shown(true, false, StepGuide.EMPTY, false, SmartView.Context.STEP));
		assertFalse("while travelling smart view hides the list", GuideList.shown(true, false, v, true, SmartView.Context.TRAVEL));
		assertTrue("at the bank it shows", GuideList.shown(true, false, v, true, SmartView.Context.BANK));
		assertTrue("smart view is off: the context does not matter", GuideList.shown(true, false, v, false, SmartView.Context.TRAVEL));
	}
}
