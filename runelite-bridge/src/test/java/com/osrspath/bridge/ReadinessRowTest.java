package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.awt.FontMetrics;
import java.awt.image.BufferedImage;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/** The app's readiness verdict in the game (2.62.0): at the top of the bank card and under the Advice tab; never on the Steps tab. */
public class ReadinessRowTest
{
	private static final Gson GSON = new Gson();
	private static final FontMetrics FM = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
		.getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), 1f));

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

	private static String text(List<GuideList.Row> rows)
	{
		StringBuilder sb = new StringBuilder();
		for (GuideList.Row r : rows)
		{
			for (GuideList.Line l : r.getLines())
			{
				sb.append(l.getLeft()).append(l.getRight() == null ? "" : " ~" + l.getRight()).append('|');
			}
		}
		return sb.toString();
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
	public void theAdviceTabListsItFirst_theStepsTabDoesNot()
	{
		StepGuide.View v = view(plan(PREP));
		assertEquals("the verdict is one tip", 1, GuideList.adviceCount(v));
		String adv = text(GuideList.rows(v.withAdviceTab(true), false, FM, FM, 4000));
		assertTrue(adv, adv.contains("Preparation needed — Bank: withdraw 13 Salmon"));
		String steps = text(GuideList.rows(v, false, FM, FM, 4000));
		assertFalse(steps, steps.contains("Preparation needed"));
	}

	@Test
	public void aPlainReadyIsNotSaid_andAHeadlineWithItsStatusIsNotDoubled()
	{
		PrepPlan ready = plan("{\"status\":\"READY\",\"headline\":\"Ready: your kit and food suit Minotaur (level 12).\"}");
		assertFalse(ready.hasReadiness());
		assertEquals(0, GuideList.adviceCount(view(ready)));
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
