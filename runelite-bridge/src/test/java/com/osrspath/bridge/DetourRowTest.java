package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/**
 * The purchase detour the app suggests ("Detour: Get Red dye at Aggie..."), its faster way and its bank withdrawals: they arrive in the plan, a bad one is
 * refused whole, and on the guide (2.74.0) each is one clickable line in its place: the faster way with how to do the step, an optional stop under
 * "More advice", never on the closed card. A click points the arrow at the stop.
 */
public class DetourRowTest
{
	private static final String PLAN = "{\"stepId\":\"S2-12\",\"lines\":[],\"later\":[],\"activeDetour\":{\"text\":\"Detour: Get Red dye at Aggie (+10 tiles, saves ~3 min)\","
		+ "\"label\":\"Aggie\",\"targetTile\":{\"x\":3086,\"y\":3257,\"plane\":0},\"costTiles\":10,\"actionType\":\"GET\"},"
		+ "\"recommendedTransport\":{\"type\":\"Item teleport\",\"destination\":\"Falador\",\"interactionId\":0,\"item\":\"Falador teleport\","
		+ "\"tile\":{\"x\":2965,\"y\":3378,\"plane\":0},\"text\":\"Falador teleport saves ~120 tiles\"},"
		+ "\"bankWithdrawals\":[{\"itemId\":8007,\"itemName\":\"Falador teleport\",\"quantity\":2}]}";

	private static PrepPlan plan(String json)
	{
		return new Gson().fromJson(json, PrepPlan.class);
	}

	private static StepGuide.View view(PrepPlan p)
	{
		return new StepGuide.View("[S2-12] Goblin Diplomacy", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null, null).withPrep(p);
	}

	private static HudModel.Card card(StepGuide.View v)
	{
		return HudModel.build(HudModelTest.input(v, HudModelTest.quiet(), null));
	}

	private static HudModel.Line find(List<HudModel.Line> lines, GuideList.Kind kind)
	{
		return lines.stream().filter(l -> l.getAction().getKind() == kind).findFirst().orElse(null);
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
	public void theDetourIsAClickableAdviceLine_notOnTheClosedCard()
	{
		PrepPlan p = plan(PLAN);
		assertNull(p.prepare());
		HudModel.Card c = card(view(p));
		HudModel.Line detour = find(c.getAdvice(), GuideList.Kind.DETOUR);
		assertNotNull(c.getAdvice().toString(), detour);
		assertEquals("Detour: Get Red dye at Aggie (+10 tiles, saves ~3 min)", detour.getText());
		assertTrue(detour.getHint(), detour.getHint().contains("Click to point the arrow at Aggie"));
		assertFalse(c.plain(false, false), c.plain(false, false).contains("Aggie"));
	}

	@Test
	public void aDetourForTheItemThatStopsTheStep_isHowToGetIt()
	{
		// Red dye is required now and not with you: the detour to Aggie is the way to it, under the headline, and not a second time as advice.
		PrepPlan p = plan(PLAN.replace("\"lines\":[]", "\"lines\":[{\"name\":\"Red dye\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"CRITICAL\",\"timing\":\"NOW\"}]"));
		assertNull(p.prepare());
		StepGuide.ItemLine dye = HudModelTest.item("Red dye", StepGuide.Have.NONE, 0, 1, 0, 0, null, false);
		StepGuide.View v = new StepGuide.View("[S2-12] Goblin Diplomacy", null, Collections.singletonList(dye), Collections.emptyList(), null, null, null, null, null)
			.withPrep(p);
		HudModel.Card c = card(v);
		assertEquals("Get Red dye", c.getHeadline());
		assertNotNull(c.getNow().toString(), find(c.getNow(), GuideList.Kind.DETOUR));
		assertNull(c.getAdvice().toString(), find(c.getAdvice(), GuideList.Kind.DETOUR));
	}

	@Test
	public void theTransportAndTheWithdrawalsAreAcceptedAndShownInTheirPlace()
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
		HudModel.Card c = card(view(p));
		// A ready way is how to get there: with the current action. The withdrawal and the stop are optional: under More advice.
		HudModel.Line way = find(c.getNow(), GuideList.Kind.TRANSPORT);
		assertNotNull(c.getNow().toString(), way);
		assertTrue(way.getText(), way.getText().startsWith("Falador teleport saves ~120 tiles"));
		assertTrue(way.getHint(), way.getHint().contains("frame Falador teleport in the bag"));
		assertTrue(c.getAdvice().stream().anyMatch(l -> l.getText().equals("Also take from the bank: Falador teleport ×2")));
		assertEquals("the stop and the withdrawal", 2, c.adviceCount());
		assertTrue(c.plain(true, false), c.plain(true, false).contains("More advice · 2"));
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
	public void noDetourNoLine()
	{
		PrepPlan p = plan("{\"stepId\":\"S2-12\",\"lines\":[],\"later\":[]}");
		assertNull(p.prepare());
		assertFalse(p.hasDetour());
		HudModel.Card c = card(view(p));
		assertTrue(c.getAdvice().toString(), c.getAdvice().isEmpty());
		assertNull(find(c.getNow(), GuideList.Kind.TRANSPORT));
		assertTrue(card(view(null)).getAdvice().isEmpty());
	}

	@Test
	public void withoutAFasterWay_theStopIsStillAdvice()
	{
		PrepPlan detourOnly = plan(PLAN.substring(0, PLAN.indexOf(",\"recommendedTransport\"")) + "}");
		assertNull(detourOnly.prepare());
		assertFalse(detourOnly.hasTransport());
		HudModel.Card c = card(view(detourOnly));
		assertNotNull(find(c.getAdvice(), GuideList.Kind.DETOUR));
		assertNull(find(c.getNow(), GuideList.Kind.TRANSPORT));
	}
}
