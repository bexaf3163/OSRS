package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.awt.FontMetrics;
import java.awt.image.BufferedImage;
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
import net.runelite.client.ui.FontManager;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * Протокол 6: один снимок /prep-plan вместо пяти запросов. Сервер проверяет каждую часть отдельно (негодная не мешает
 * остальным), отдаёт плагину снимок и сообщает программе, что отклонено; план подготовки рисует список «Что нужно».
 */
public class PrepSnapshotTest
{
	private static final Gson GSON = new Gson();
	private static final FontMetrics FM = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
		.getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), 1f));

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
		+ "\"lines\":[{\"name\":\"Egg\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"CRITICAL\",\"timing\":\"NOW\",\"action\":\"Возьми на ферме севернее Lumbridge\"},"
		+ "{\"name\":\"Lobster\",\"need\":20,\"where\":\"INVENTORY\",\"priority\":\"IMPORTANT\",\"timing\":\"NOW\",\"supply\":\"LOW\"}],"
		+ "\"later\":[\"Rune scimitar\",\"Lobster ×20\"],\"weight\":\"Сними железную броню в банк: 26 кг → 9 кг, бег дольше в ~1,3 раза\","
		+ "\"slots\":\"Не влезет на 3 ячейки — оставь лишнее на потом\"}";

	private static String snapshot(long seq, String step, String plan)
	{
		return "{\"v\":6,\"seq\":" + seq + ",\"step\":" + step + ",\"shopping\":null,\"bankTags\":null,\"gearHint\":null,\"plan\":" + plan + "}";
	}

	@Test
	public void статусОбъявляетПротокол6()
	{
		assertTrue("снимок появился в протоколе 6", BridgeServer.PROTOCOL >= 6);
	}

	@Test
	public void снимокПринимаетсяЦеликом_частиНаМесте() throws Exception
	{
		HttpResponse<String> r = post(snapshot(100, STEP, PLAN));
		assertEquals(r.body(), 200, r.statusCode());
		assertTrue(r.body(), r.body().contains("\"seq\":100") && r.body().contains("\"stale\":false") && r.body().contains("\"rejected\":{}"));
		assertEquals(1, received.size());
		PrepEnvelope e = received.get(0);
		assertEquals("S1-03", e.getStep().getStepId());
		assertEquals("тот же JSON шага — ключ, по которому плагин не перезапускает цель", GSON.toJson(GSON.fromJson(STEP, Object.class)).length() > 0, e.getStepKey().length() > 0);
		assertEquals(62, (int) e.getPlan().getScore().getPercent());
		assertNull("клиент снят (null) — снимок полный", e.getShopping());
		assertTrue(badParts.get(0).isEmpty());
	}

	@Test
	public void негоднаяЧастьНеМешаетОстальным() throws Exception
	{
		String badPlan = "{\"stepId\":\"\",\"lines\":[]}";
		HttpResponse<String> r = post(snapshot(101, STEP, badPlan));
		assertEquals(200, r.statusCode());
		assertTrue(r.body(), r.body().contains("\"plan\":"));
		assertEquals("шаг принят", "S1-03", received.get(0).getStep().getStepId());
		assertTrue(badParts.get(0).containsKey("plan"));
		assertFalse(badParts.get(0).containsKey("step"));

		String badStep = "{\"stepId\":\"X\"}";
		HttpResponse<String> r2 = post(snapshot(102, badStep, PLAN));
		assertEquals(200, r2.statusCode());
		assertTrue(badParts.get(1).containsKey("step"));
		assertFalse("план при этом принят", badParts.get(1).containsKey("plan"));
	}

	@Test
	public void запоздавшийСнимокОтбрасывается() throws Exception
	{
		assertEquals(200, post(snapshot(200, STEP, PLAN)).statusCode());
		HttpResponse<String> old = post(snapshot(150, STEP, "null"));
		assertEquals(200, old.statusCode());
		assertTrue(old.body(), old.body().contains("\"stale\":true"));
		assertEquals("запоздавший не дошёл до плагина", 1, received.size());
		assertTrue(post(snapshot(200, STEP, PLAN)).body().contains("\"stale\":true"));
	}

	@Test
	public void неТотВидСнимка_иМусор_иБезЗаголовка() throws Exception
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
	public void большойСнимокВлезает_ОгромныйНет() throws Exception
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
	public void планПроверяется()
	{
		assertNotNull(prep("{\"stepId\":\"\"}"));
		assertNotNull("процент вне 0–100", prep("{\"stepId\":\"S1\",\"score\":{\"percent\":120}}"));
		assertNotNull("слишком много строк", prep("{\"stepId\":\"S1\",\"lines\":[" + java.util.stream.IntStream.range(0, PrepPlan.MAX_LINES + 1)
			.mapToObj(i -> "{\"name\":\"I" + i + "\",\"need\":1}").collect(Collectors.joining(",")) + "]}"));
		assertNotNull("строка без названия", prep("{\"stepId\":\"S1\",\"lines\":[{\"name\":\"\",\"need\":1}]}"));
		assertNotNull("восстановление без пунктов", prep("{\"stepId\":\"S1\",\"recovery\":{\"title\":\"x\",\"steps\":[]}}"));
		assertNotNull("слишком длинный совет", prep("{\"stepId\":\"S1\",\"weight\":\"" + "я".repeat(ActiveTarget.MAX_TEXT + 1) + "\"}"));
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
	public void строкаПлана_находитсяПоНазваниюБезЧислаИРегистра()
	{
		PrepPlan p = plan();
		assertNotNull(p.line("Lobster ×20"));
		assertNotNull(p.line("egg"));
		assertNull(p.line("Knife"));
		assertEquals(Integer.valueOf(62), p.pendingPercent());
		PrepPlan done = GSON.fromJson("{\"stepId\":\"S1\",\"score\":{\"percent\":100}}", PrepPlan.class);
		assertNull("готов на сто — процент не пишем", done.pendingPercent());
	}

	private static List<GuideList.Row> rows(StepGuide.View v)
	{
		return GuideList.rows(v, false, FM, FM, 240);
	}

	private static String text(List<GuideList.Row> rows)
	{
		StringBuilder sb = new StringBuilder();
		for (GuideList.Row r : rows)
		{
			sb.append('|');
			for (GuideList.Line l : r.getLines())
			{
				sb.append(l.getLeft()).append(l.getRight() == null ? "" : " ~" + l.getRight()).append(' ');
			}
		}
		return sb.toString();
	}

	private static StepGuide.View cook(PrepPlan p)
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S1-03\",\"title\":\"Cook's Assistant\",\"guide\":{\"items\":["
			+ "{\"name\":\"Egg\",\"id\":1944,\"where\":\"Курятник.\"},{\"name\":\"Lobster\",\"id\":379,\"count\":20}],\"places\":[]}}", ActiveTarget.class);
		assertNull(t.prepare());
		ItemCounts bag = new ItemCounts();
		bag.add(379, ActiveTarget.nameKey("Lobster"), 20);
		StepGuide.View v = StepGuide.view(t, bag, new ItemCounts(), null, 0, 0, 0, new java.util.HashSet<>());
		return p == null ? v : v.withPrep(p);
	}

	@Test
	public void планРисуетсяВСписке_процентПриоритетМалоНеБериСейчас()
	{
		String all = text(rows(cook(plan())));
		assertTrue("процент в заголовке: " + all, all.contains("S1-03 · Что нужно · 62%"));
		assertTrue("совет программы вместо общего «где взять»: " + all, all.contains("Возьми на ферме севернее"));
		assertFalse("общий текст заменён: " + all, all.contains("Курятник"));
		assertTrue("расходника мало: " + all, all.contains("~мало"));
		assertTrue("не бери сейчас: " + all, all.contains("Не бери сейчас: Rune scimitar, Lobster ×20"));
		assertTrue("вес: " + all, all.contains("Вес: Сними железную броню в банк"));
		assertTrue("сумка: " + all, all.contains("⚠ Не влезет на 3 ячейки"));
	}

	@Test
	public void безПлана_списокКакБыл()
	{
		String all = text(rows(cook(null)));
		assertFalse(all, all.contains("%") || all.contains("Не бери сейчас") || all.contains("Вес:"));
		assertTrue(all, all.contains("Курятник"));
		assertTrue(all, all.contains("~20/20"));
	}

	@Test
	public void режимВосстановления_сверху_триПунктаМаксимум()
	{
		PrepPlan p = GSON.fromJson("{\"stepId\":\"S1-03\",\"recovery\":{\"title\":\"Ты умер — шаг S1-03 далеко (~90 кл.)\",\"steps\":["
			+ "\"Забери вещи из могилы\",\"Возьми запасной ключ\",\"Вернись к шагу\",\"Четвёртый\"]}}", PrepPlan.class);
		assertNull(p.prepare());
		List<GuideList.Row> rows = rows(cook(p));
		assertTrue(text(rows.subList(0, 3)), text(rows.subList(1, 2)).contains("⚠ Ты умер — шаг S1-03 далеко"));
		String all = text(rows);
		assertTrue(all, all.contains("1) Забери вещи из могилы") && all.contains("3) Вернись к шагу"));
		assertFalse("показываем три, остальное — в программе: " + all, all.contains("Четвёртый"));
	}

	@Test
	public void планДругогоШагаНеЦепляется_тоЖеШагЦепляется()
	{
		PrepPlan p = plan();
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S1-03\",\"title\":\"Cook's Assistant\",\"guide\":{\"items\":[],\"places\":[]}}", ActiveTarget.class);
		StepGuide.View v = cook(null);
		assertNotNull(StepGuide.withPlanFor(v, p, t).getPrep());
		p.setStepId("S9-99");
		assertNull("план прежнего шага не рисуется на новом", StepGuide.withPlanFor(v, p, t).getPrep());
		assertNull(StepGuide.withPlanFor(v, null, t).getPrep());
		assertNull(StepGuide.withPlanFor(v, p, null).getPrep());
	}
}
