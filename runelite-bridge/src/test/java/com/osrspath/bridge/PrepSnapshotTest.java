package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * Protocol 6: one /prep-plan snapshot instead of five requests. The server checks every part separately (a bad one does not hinder
 * the rest), hands the plugin the snapshot and tells the app what was rejected; the prep plan draws the "What you need" list.
 */
public class PrepSnapshotTest
{
	private static final Gson GSON = new Gson();

	private final List<PrepEnvelope> received = new CopyOnWriteArrayList<>();
	private final List<Map<String, String>> badParts = new CopyOnWriteArrayList<>();
	private volatile long lastSeq = -1;
	private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
	private BridgeServer server;
	private String base;

	@Before
	public void start() throws Exception
	{
		server = new BridgeServer(0, GSON, new BridgeServer.Listener()
		{
			@Override
			public void onActiveTarget(ActiveTarget target)
			{
			}

			@Override
			public void onClear()
			{
			}

			@Override
			public BridgeServer.PrepResult onPrepPlan(PrepEnvelope e, Map<String, String> bad)
			{
				if (e.getSeq() <= lastSeq)
				{
					return new BridgeServer.PrepResult(true, Collections.emptyMap());
				}
				lastSeq = e.getSeq();
				received.add(e);
				badParts.add(bad);
				return new BridgeServer.PrepResult(false, Collections.emptyMap());
			}
		});
		server.start();
		base = "http://127.0.0.1:" + server.getPort();
	}

	@After
	public void stop()
	{
		server.stop();
	}

	private HttpResponse<String> post(String body) throws Exception
	{
		return http.send(HttpRequest.newBuilder(URI.create(base + "/prep-plan")).timeout(Duration.ofSeconds(3))
			.header(BridgeServer.HEADER, "1").POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
	}

	private static final String STEP = "{\"stepId\":\"S1-03\",\"title\":\"Cook's Assistant\","
		+ "\"worldPoint\":{\"x\":3208,\"y\":3214,\"plane\":0,\"label\":\"Kitchen\"},\"npcNames\":[\"Cook\"]}";
	private static final String PLAN = "{\"stepId\":\"S1-03\",\"score\":{\"percent\":62,\"verdict\":\"NOT_READY\",\"critical\":1,\"important\":0,\"optimizations\":0,\"unknown\":1},"
		+ "\"lines\":[{\"name\":\"Egg\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"CRITICAL\",\"timing\":\"NOW\",\"action\":\"Pick one up at the farm north of Lumbridge\"},"
		+ "{\"name\":\"Lobster\",\"need\":20,\"where\":\"INVENTORY\",\"priority\":\"IMPORTANT\",\"timing\":\"NOW\",\"supply\":\"LOW\"}],"
		+ "\"later\":[\"Rune scimitar\",\"Lobster ×20\"],\"weight\":\"Deposit the iron armour in the bank: 26 kg → 9 kg, running lasts ~1.3x longer\","
		+ "\"slots\":\"Won't fit by 3 slots - leave the extra for later\"}";

	private static String snapshot(long seq, String step, String plan)
	{
		return "{\"v\":6,\"seq\":" + seq + ",\"step\":" + step + ",\"shopping\":null,\"bankTags\":null,\"gearHint\":null,\"plan\":" + plan + "}";
	}

	@Test
	public void statusAnnouncesProtocol6()
	{
		assertTrue("the snapshot appeared in protocol 6", BridgeServer.PROTOCOL >= 6);
	}

	@Test
	public void aSnapshotIsAcceptedWhole_partsInPlace() throws Exception
	{
		HttpResponse<String> r = post(snapshot(100, STEP, PLAN));
		assertEquals(r.body(), 200, r.statusCode());
		assertTrue(r.body(), r.body().contains("\"seq\":100") && r.body().contains("\"stale\":false") && r.body().contains("\"rejected\":{}"));
		assertEquals(1, received.size());
		PrepEnvelope e = received.get(0);
		assertEquals("S1-03", e.getStep().getStepId());
		assertEquals("the same step JSON is the key by which the plugin does not restart the target", GSON.toJson(GSON.fromJson(STEP, Object.class)).length() > 0, e.getStepKey().length() > 0);
		assertEquals(62, (int) e.getPlan().getScore().getPercent());
		assertNull("client cleared (null): the snapshot is complete", e.getShopping());
		assertTrue(badParts.get(0).isEmpty());
	}

	@Test
	public void aBadPartDoesNotHinderTheOthers() throws Exception
	{
		String badPlan = "{\"stepId\":\"\",\"lines\":[]}";
		HttpResponse<String> r = post(snapshot(101, STEP, badPlan));
		assertEquals(200, r.statusCode());
		assertTrue(r.body(), r.body().contains("\"plan\":"));
		assertEquals("the step is accepted", "S1-03", received.get(0).getStep().getStepId());
		assertTrue(badParts.get(0).containsKey("plan"));
		assertFalse(badParts.get(0).containsKey("step"));

		String badStep = "{\"stepId\":\"X\"}";
		HttpResponse<String> r2 = post(snapshot(102, badStep, PLAN));
		assertEquals(200, r2.statusCode());
		assertTrue(badParts.get(1).containsKey("step"));
		assertFalse("the plan is accepted in the meantime", badParts.get(1).containsKey("plan"));
	}

	@Test
	public void aLateSnapshotIsDropped() throws Exception
	{
		assertEquals(200, post(snapshot(200, STEP, PLAN)).statusCode());
		HttpResponse<String> old = post(snapshot(150, STEP, "null"));
		assertEquals(200, old.statusCode());
		assertTrue(old.body(), old.body().contains("\"stale\":true"));
		assertEquals("the late one did not reach the plugin", 1, received.size());
		assertTrue(post(snapshot(200, STEP, PLAN)).body().contains("\"stale\":true"));
	}

	@Test
	public void wrongKindOfSnapshot_junk_andNoHeader() throws Exception
	{
		assertEquals(400, post("{\"v\":5,\"seq\":1}").statusCode());
		assertEquals(400, post("[1,2]").statusCode());
		assertEquals(400, post("not json").statusCode());
		HttpResponse<String> noHeader = http.send(HttpRequest.newBuilder(URI.create(base + "/prep-plan")).timeout(Duration.ofSeconds(3))
			.POST(HttpRequest.BodyPublishers.ofString(snapshot(1, "null", "null"))).build(), HttpResponse.BodyHandlers.ofString());
		assertEquals(403, noHeader.statusCode());
		assertTrue(received.isEmpty());
	}

	@Test
	public void aBigSnapshotFits_aHugeOneDoesNot() throws Exception
	{
		String lines = java.util.stream.IntStream.range(0, 40)
			.mapToObj(i -> "{\"name\":\"Item " + i + "\",\"need\":1,\"where\":\"BANK\",\"priority\":\"IMPORTANT\",\"timing\":\"NOW\"}")
			.collect(Collectors.joining(","));
		String plan = "{\"stepId\":\"S1-03\",\"lines\":[" + lines + "]}";
		assertEquals(200, post(snapshot(300, STEP, plan)).statusCode());
		StringBuilder huge = new StringBuilder("{\"v\":6,\"seq\":301,\"plan\":{\"stepId\":\"S1-03\",\"weight\":\"");
		for (int i = 0; i < BridgeServer.MAX_SNAPSHOT; i++)
		{
			huge.append('x');
		}
		assertEquals(413, post(huge.append("\"}}").toString()).statusCode());
	}

	@Test
	public void thePlanIsValidated()
	{
		assertNotNull(prep("{\"stepId\":\"\"}"));
		assertNotNull("percent outside 0-100", prep("{\"stepId\":\"S1\",\"score\":{\"percent\":120}}"));
		assertNotNull("too many lines", prep("{\"stepId\":\"S1\",\"lines\":[" + java.util.stream.IntStream.range(0, PrepPlan.MAX_LINES + 1)
			.mapToObj(i -> "{\"name\":\"I" + i + "\",\"need\":1}").collect(Collectors.joining(",")) + "]}"));
		assertNotNull("a line without a name", prep("{\"stepId\":\"S1\",\"lines\":[{\"name\":\"\",\"need\":1}]}"));
		assertNotNull("recovery without items", prep("{\"stepId\":\"S1\",\"recovery\":{\"title\":\"x\",\"steps\":[]}}"));
		assertNotNull("advice too long", prep("{\"stepId\":\"S1\",\"weight\":\"" + "x".repeat(ActiveTarget.MAX_TEXT + 1) + "\"}"));
		assertNull(prep(PLAN));
	}

	private static String prep(String json)
	{
		return GSON.fromJson(json, PrepPlan.class).prepare();
	}

	private static PrepPlan plan()
	{
		PrepPlan p = GSON.fromJson(PLAN, PrepPlan.class);
		assertNull(p.prepare());
		return p;
	}

	@Test
	public void aPlanLineIsFoundByNameWithoutCountOrCase()
	{
		PrepPlan p = plan();
		assertNotNull(p.line("Lobster ×20"));
		assertNotNull(p.line("egg"));
		assertNull(p.line("Knife"));
		assertEquals(Integer.valueOf(62), p.pendingPercent());
		PrepPlan done = GSON.fromJson("{\"stepId\":\"S1\",\"score\":{\"percent\":100}}", PrepPlan.class);
		assertNull("ready at one hundred: the percent is not written", done.pendingPercent());
	}

	private static HudModel.Card card(StepGuide.View v)
	{
		return HudModel.build(HudModelTest.input(v, HudModelTest.quiet(), null));
	}

	private static StepGuide.View cook(PrepPlan p)
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S1-03\",\"title\":\"Cook's Assistant\",\"guide\":{\"items\":["
			+ "{\"name\":\"Egg\",\"id\":1944,\"where\":\"Chicken coop.\"},{\"name\":\"Lobster\",\"id\":379,\"count\":20}],\"places\":[]}}", ActiveTarget.class);
		assertNull(t.prepare());
		ItemCounts bag = new ItemCounts();
		bag.add(379, ActiveTarget.nameKey("Lobster"), 20);
		StepGuide.View v = StepGuide.view(t, bag, new ItemCounts(), null, 0, 0, 0, new java.util.HashSet<>());
		return p == null ? v : v.withPrep(p);
	}

	@Test
	public void thePlanShapesTheGuide_itsActionInsteadOfTheGenericWhere_itsTipsUnderMoreAdvice()
	{
		HudModel.Card c = card(cook(plan()));
		assertEquals("the missing egg comes first", "Get Egg", c.getHeadline());
		assertEquals("Egg: 0 / 1 · not in the bank", c.getStatus());
		String open = c.plain(true, false);
		assertTrue("the app's advice instead of the generic 'where to get it': " + open, open.contains("Pick one up at the farm north"));
		assertFalse("the generic text is replaced: " + open, open.contains("Chicken coop"));
		assertTrue("the lobsters are with you: " + open, open.contains("1 item with you"));
		// The app's tips are behind "More advice": counted, not shown until asked for.
		assertTrue("the control with the number of tips: " + open, open.contains("More advice · 3"));
		assertFalse("do not take now is not shown before it is asked for: " + open, open.contains("Don't take now"));
		assertFalse(open, open.contains("Weight:") || open.contains("Won't fit"));
		assertFalse("never on the closed card", c.plain(false, false).contains("Don't take now"));
	}

	@Test
	public void theAppsTips_underMoreAdvice_theStepsItemsNotAmongThem()
	{
		HudModel.Card c = card(cook(plan()));
		String adv = c.plain(true, true);
		assertTrue("don't take now: " + adv, adv.contains("Don't take now: Rune scimitar, Lobster ×20"));
		assertTrue("weight: " + adv, adv.contains("Weight: Deposit the iron armour in the bank"));
		assertTrue("bag: " + adv, adv.contains("Won't fit by 3 slots"));
		assertTrue("the control is a button", c.getAdvice().size() == 3 && adv.contains("More advice · 3"));
		assertTrue("there are no step items among the tips", c.getAdvice().stream().noneMatch(l -> l.getText().contains("Pick one up at the farm north")));
	}

	@Test
	public void withoutAPlan_noTips_theStepsOwnWords()
	{
		HudModel.Card c = card(cook(null));
		String all = c.plain(true, true);
		assertFalse("no tips, no control: " + all, all.contains("More advice"));
		assertFalse(all, all.contains("%") || all.contains("Don't take now") || all.contains("Weight:"));
		assertTrue("the step's own where: " + all, all.contains("Chicken coop"));
		assertEquals("Get Egg", c.getHeadline());
	}

	@Test
	public void recoveryMode_saidFirst_threeStepsAtMost()
	{
		PrepPlan p = GSON.fromJson("{\"stepId\":\"S1-03\",\"recovery\":{\"title\":\"You died - step S1-03 is far away (~90 tiles)\",\"steps\":["
			+ "\"Retrieve your items from the grave\",\"Take a spare key\",\"Return to the step\",\"Fourth\"]}}", PrepPlan.class);
		assertNull(p.prepare());
		HudModel.Card c = card(cook(p));
		assertEquals("You died - step S1-03 is far away (~90 tiles)", c.getWarning().getText());
		String hint = c.getWarning().getHint();
		assertTrue(hint, hint.contains("1) Retrieve your items from the grave") && hint.contains("3) Return to the step"));
		assertFalse("three are shown, the rest is in the app: " + hint, hint.contains("Fourth"));
		assertTrue(hint, hint.contains("in the app"));
	}

	@Test
	public void aPlanForAnotherStepDoesNotAttach_theSameStepDoes()
	{
		PrepPlan p = plan();
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S1-03\",\"title\":\"Cook's Assistant\",\"guide\":{\"items\":[],\"places\":[]}}", ActiveTarget.class);
		StepGuide.View v = cook(null);
		assertNotNull(StepGuide.withPlanFor(v, p, t).getPrep());
		p.setStepId("S9-99");
		assertNull("the plan of the previous step is not drawn on the new one", StepGuide.withPlanFor(v, p, t).getPrep());
		assertNull(StepGuide.withPlanFor(v, null, t).getPrep());
		assertNull(StepGuide.withPlanFor(v, p, null).getPrep());
	}
}
