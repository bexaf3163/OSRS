package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

/** The app's readiness verdict in the game (2.62.0): at the top of the bank card. The one HUD (2.74.0) says its own live preparation instead. */
public class ReadinessRowTest
{
	private static final Gson GSON = new Gson();

	private static PrepPlan plan(String readiness)
	{
		PrepPlan p = GSON.fromJson("{\"stepId\":\"S3-08\",\"lines\":[{\"name\":\"Salmon\",\"need\":26,\"where\":\"BANK\",\"priority\":\"CRITICAL\",\"timing\":\"NOW\"}]"
			+ (readiness == null ? "" : ",\"readiness\":" + readiness) + "}", PrepPlan.class);
		assertNull(p.prepare());
		return p;
	}

	private static StepGuide.View view(PrepPlan p)
	{
		return new StepGuide.View("[S3-08] Attack to 30", "goal", Arrays.asList(
			new StepGuide.ItemLine("Salmon ×26", "status", StepGuide.Have.BANK, "exchange", -1, "Salmon ×26", "tag")), Collections.emptyList(), null, null, null, null, null, p);
	}

	private static final String PREP = "{\"status\":\"PREP_NEEDED\",\"headline\":\"Bank: withdraw 13 Salmon — you already own it. Then buy about 13 Salmon.\"}";

	@Test
	public void theBankCardStartsWithTheVerdict()
	{
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.BANK, view(plan(PREP)));
		assertEquals("Preparation needed — Bank: withdraw 13 Salmon — you already own it. Then buy about 13 Salmon.", r.getRows().get(0).getText());
		assertEquals(ShopWindow.Mark.INFO, r.getRows().get(0).getMark());
		ShopWindow.Result shop = ShopWindow.build(ShopWindow.Place.SHOP, view(plan(PREP)));
		assertFalse("only at the bank", shop.getRows().get(0).getText().startsWith("Preparation needed"));
	}

	@Test
	public void theGuideSaysItsOwnLivePreparation_notTheVerdictAgain()
	{
		// The verdict is the app's reading of a moment; the guide counts the bag and the bank itself, so it does not repeat the verdict (2.74.0).
		StepGuide.View v = view(plan(PREP));
		HudModel.Card c = HudModel.build(HudModelTest.input(v, HudModelTest.quiet(), null));
		String all = c.plain(true, true);
		assertFalse(all, all.contains("Preparation needed"));
		assertEquals("the live preparation leads", "Withdraw Salmon", c.getHeadline());
	}

	@Test
	public void aPlainReadyIsNotSaid_andAHeadlineWithItsStatusIsNotDoubled()
	{
		PrepPlan ready = plan("{\"status\":\"READY\",\"headline\":\"Ready: your kit and food suit Minotaur (level 12).\"}");
		assertFalse(ready.hasReadiness());
		PrepPlan p = plan("{\"status\":\"PREP_NEEDED\",\"headline\":\"Preparation needed: bring food before going.\"}");
		assertEquals("Preparation needed: bring food before going.", p.getReadiness().line());
		PrepPlan unknown = plan("{\"status\":\"UNKNOWN\",\"headline\":\"Bank contents have not been checked; visit a bank to assess owned supplies.\"}");
		assertEquals("Cannot assess yet — Bank contents have not been checked; visit a bank to assess owned supplies.", unknown.getReadiness().line());
	}

	@Test
	public void aVerdictThePluginCannotReadIsLeftOut_thePlanStands()
	{
		PrepPlan p = plan("{\"status\":\"MAYBE\",\"headline\":\"x\"}");
		assertNull(p.getReadiness());
		assertEquals(1, p.getLines().size());
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.BANK, view(p));
		assertFalse(r.getRows().get(0).getText().contains("MAYBE"));
	}
}
