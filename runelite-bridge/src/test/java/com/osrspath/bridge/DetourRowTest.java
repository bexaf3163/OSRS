package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.awt.FontMetrics;
import java.awt.image.BufferedImage;
import java.util.Collections;
import java.util.List;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/**
 * The purchase detour the app suggests ("Detour: Get Red dye at Aggie..."): it arrives in the plan, shows as one clickable row in the list (also in the
 * strict closed card, where only warnings may appear), counts as a tip, and a click points the arrow at the stop. A bad detour is refused whole.
 */
public class DetourRowTest
{
	private static final FontMetrics FM = metrics(1f);
	private static final FontMetrics SMALL = metrics(OsrsPathGuideOverlay.SMALL);
	private static final String PLAN = "{\"stepId\":\"S2-12\",\"lines\":[],\"later\":[],\"activeDetour\":{\"text\":\"Detour: Get Red dye at Aggie (+10 tiles, saves ~3 min)\","
		+ "\"label\":\"Aggie\",\"targetTile\":{\"x\":3086,\"y\":3257,\"plane\":0},\"costTiles\":10,\"actionType\":\"GET\"},"
		+ "\"recommendedTransport\":{\"type\":\"Item teleport\",\"destination\":\"Falador\",\"interactionId\":0,\"item\":\"Falador teleport\","
		+ "\"tile\":{\"x\":2965,\"y\":3378,\"plane\":0},\"text\":\"Falador teleport saves ~120 tiles\"},"
		+ "\"bankWithdrawals\":[{\"itemId\":8007,\"itemName\":\"Falador teleport\",\"quantity\":2}]}";

	private static FontMetrics metrics(float scale)
	{
		return new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics().getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), scale));
	}

	private static PrepPlan plan(String json)
	{
		return new Gson().fromJson(json, PrepPlan.class);
	}

	private static StepGuide.View view(PrepPlan p)
	{
		return new StepGuide.View("[S2-12] Goblin Diplomacy", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null, null).withPrep(p);
	}

	private static String flat(List<GuideList.Row> rows)
	{
		return GuideList.plain(rows).replace("\n", " ");
	}

	@Test
	public void theDetourIsAcceptedAndBecomesAnArrowTarget()
	{
		PrepPlan p = plan(PLAN);
		assertNull(p.prepare());
		assertTrue(p.hasDetour());
		NavTarget n = p.getActiveDetour().navTarget("S2-12");
		assertNotNull(n);
		assertEquals(3086, n.getX());
		assertEquals("Aggie", n.getLabel());
		assertEquals("S2-12", n.getStepId());
	}

	@Test
	public void aBrokenDetourIsRefusedWhole()
	{
		assertEquals("invalid detour", plan(PLAN.replace("\"x\":3086", "\"x\":0")).prepare());
		assertEquals("invalid detour", plan(PLAN.replace("\"costTiles\":10", "\"costTiles\":-5")).prepare());
		assertEquals("invalid detour", plan(PLAN.replace("Detour: Get Red dye at Aggie (+10 tiles, saves ~3 min)", "")).prepare());
		assertEquals("invalid detour", plan(PLAN.replace("\"plane\":0", "\"plane\":9")).prepare());
	}

	@Test
	public void theClosedStrictCardShowsItAsAClickableRow()
	{
		PrepPlan p = plan(PLAN);
		p.prepare();
		List<GuideList.Row> alerts = GuideList.alertRows(view(p), FM, OsrsPathGuideOverlay.WIDTH);
		assertEquals(1, alerts.size());
		assertTrue(flat(alerts), flat(alerts).contains("⚡ Detour: Get Red dye at Aggie"));
		assertEquals(GuideList.Kind.DETOUR, alerts.get(0).getAction().getKind());
		assertTrue(alerts.get(0).getAction().isClickable());
	}

	@Test
	public void theFullListAndTheTipTabCarryIt()
	{
		PrepPlan p = plan(PLAN);
		p.prepare();
		StepGuide.View v = view(p);
		assertTrue(flat(GuideList.rows(v, false, FM, SMALL, OsrsPathGuideOverlay.WIDTH)).contains("Detour: Get Red dye at Aggie"));
		// The detour, the withdrawal tip and the transport are three tips.
		assertEquals(3, GuideList.adviceCount(p));
		java.util.List<GuideList.Row> advice = new java.util.ArrayList<>();
		GuideList.adviceRows(advice, p, SMALL, OverlayText.inner(OsrsPathGuideOverlay.WIDTH));
		assertTrue(flat(advice).contains("Detour: Get Red dye at Aggie"));
	}

	@Test
	public void theTransportAndTheWithdrawalsAreAcceptedAndShownAsTips()
	{
		PrepPlan p = plan(PLAN);
		assertNull(p.prepare());
		assertTrue(p.hasTransport());
		assertTrue(p.hasWithdrawals());
		assertNotNull(p.getRecommendedTransport().navTarget("S2-12"));
		assertTrue(p.withdrawsItem(8007, null));
		assertTrue(p.withdrawsItem(0, ActiveTarget.nameKey("Falador teleport")));
		assertFalse(p.withdrawsItem(1, ActiveTarget.nameKey("Pot")));
		assertTrue(p.usesTransportItem(ActiveTarget.nameKey("Falador teleport")));
		assertEquals(3, GuideList.adviceCount(p));
		java.util.List<GuideList.Row> advice = new java.util.ArrayList<>();
		GuideList.adviceRows(advice, p, SMALL, OverlayText.inner(OsrsPathGuideOverlay.WIDTH));
		String text = flat(advice);
		assertTrue(text, text.contains("Bank: Withdraw Falador teleport x2"));
		assertTrue(text, text.contains("Falador teleport saves ~120 tiles"));
		boolean clickable = false;
		for (GuideList.Row r : advice)
		{
			clickable |= r.getAction().getKind() == GuideList.Kind.TRANSPORT && r.getAction().isClickable();
		}
		assertTrue(clickable);
	}

	@Test
	public void aBadTransportOrWithdrawalIsRefusedWhole()
	{
		assertEquals("invalid transport", plan(PLAN.replace("\"Item teleport\"", "\"\"")).prepare());
		assertEquals("invalid transport", plan(PLAN.replace("\"plane\":0},\"text\":\"Falador", "\"plane\":7},\"text\":\"Falador")).prepare());
		assertEquals("invalid bank withdrawals", plan(PLAN.replace("\"quantity\":2", "\"quantity\":0")).prepare());
		assertEquals("invalid bank withdrawals", plan(PLAN.replace("\"itemName\":\"Falador teleport\"", "\"itemName\":\"\"")).prepare());
	}

	@Test
	public void noDetourNoRow()
	{
		PrepPlan p = plan("{\"stepId\":\"S2-12\",\"lines\":[],\"later\":[]}");
		p.prepare();
		assertFalse(p.hasDetour());
		assertEquals(0, GuideList.alertRows(view(p), FM, OsrsPathGuideOverlay.WIDTH).size());
		assertEquals(0, GuideList.adviceCount(p));
	}
}
