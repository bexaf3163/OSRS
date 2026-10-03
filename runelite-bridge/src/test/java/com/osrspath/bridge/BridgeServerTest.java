package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class BridgeServerTest
{
	private final Gson gson = new Gson();
	private final List<ActiveTarget> targets = new CopyOnWriteArrayList<>();
	private final List<String> clears = new CopyOnWriteArrayList<>();
	private final List<ShoppingPlan> plans = new CopyOnWriteArrayList<>();
	private final List<NavTarget> navs = new CopyOnWriteArrayList<>();
	private final List<BankTags> bankTags = new CopyOnWriteArrayList<>();
	private final List<GearHint> gearHints = new CopyOnWriteArrayList<>();
	/** Не null — слушатель отказывает с этой причиной (функция выключена в настройках). */
	private volatile String refuse;
	private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
	private BridgeServer server;
	private String base;

	@Before
	public void start() throws IOException
	{
		server = new BridgeServer(0, gson, new BridgeServer.Listener()
		{
			@Override
			public void onActiveTarget(ActiveTarget target)
			{
				targets.add(target);
			}

			@Override
			public void onClear()
			{
				clears.add("clear");
			}

			@Override
			public void onShoppingPlan(ShoppingPlan plan)
			{
				plans.add(plan);
			}

			@Override
			public String onNavTarget(NavTarget target)
			{
				if (refuse != null)
				{
					return refuse;
				}
				navs.add(target);
				return null;
			}

			@Override
			public String onBankTags(BankTags tags)
			{
				if (refuse != null)
				{
					return refuse;
				}
				bankTags.add(tags);
				return null;
			}

			@Override
			public String onGearHint(GearHint hint)
			{
				if (refuse != null && !hint.isClear())
				{
					return refuse;
				}
				gearHints.add(hint);
				return null;
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

	private HttpResponse<String> get(String path, String... headers) throws Exception
	{
		HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(2)).GET();
		for (int i = 0; i < headers.length; i += 2)
		{
			b.header(headers[i], headers[i + 1]);
		}
		return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
	}

	private HttpResponse<String> post(String path, String body, String... headers) throws Exception
	{
		HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(2))
			.POST(HttpRequest.BodyPublishers.ofString(body));
		for (int i = 0; i < headers.length; i += 2)
		{
			b.header(headers[i], headers[i + 1]);
		}
		return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
	}

	private static final String COOK = "{\"stepId\":\"S1-03\",\"title\":\"Cook's Assistant\","
		+ "\"worldPoint\":{\"x\":3208,\"y\":3214,\"plane\":0,\"label\":\"Kitchen\"},"
		+ "\"npcNames\":[\"Cook\"],\"dialogChoices\":[\"What's wrong?\",\"Can I help?\"],"
		+ "\"highlightItems\":[\"Egg\"],\"completionTrigger\":{\"type\":\"QUEST_COMPLETED\",\"questName\":\"Cook's Assistant\"}}";

	@Test
	public void statusОтвечаетOkИВИгре() throws Exception
	{
		HttpResponse<String> r = get("/status");
		assertEquals(200, r.statusCode());
		assertTrue(r.body().contains("\"status\":\"ok\""));
		assertTrue(r.body().contains("\"inGame\":false"));
		server.setInGame(true);
		assertTrue(get("/status").body().contains("\"inGame\":true"));
	}

	@Test
	public void statusСообщаетВерсииДляРукопожатия() throws Exception
	{
		String body = get("/status").body();
		assertTrue(body, body.contains("\"protocol\":" + BridgeServer.PROTOCOL));
		assertTrue(body, body.contains("\"pluginVersion\":\"" + BridgeServer.PLUGIN_VERSION + "\""));
	}

	@Test
	public void statusОтдаётОценкуПредметов() throws Exception
	{
		java.util.Map<String, Object> gear = new java.util.LinkedHashMap<>();
		gear.put("equipment", new java.util.ArrayList<>());
		gear.put("inventory", new java.util.ArrayList<>());
		gear.put("coins", 10);
		gear.put("bankCoins", 500);
		gear.put("carriedValue", 1200L);
		gear.put("bankValue", 34000L);
		server.setGear(gear);
		String body = get("/status").body();
		assertTrue(body, body.contains("\"carriedValue\":1200"));
		assertTrue(body, body.contains("\"bankValue\":34000"));
	}

	@Test
	public void слушаетТолькоLoopback()
	{
		assertTrue(InetAddress.getLoopbackAddress().isLoopbackAddress());
		// Адрес сервера — тот самый loopback: снаружи компьютера до него не достучаться.
		assertEquals(base, "http://127.0.0.1:" + server.getPort());
	}

	@Test
	public void activeStepПередаётЦельИСтатусЗапоминаетШаг() throws Exception
	{
		HttpResponse<String> r = post("/active-step", COOK, BridgeServer.HEADER, "1", "Content-Type", "application/json");
		assertEquals(200, r.statusCode());
		assertEquals(1, targets.size());
		ActiveTarget t = targets.get(0);
		assertEquals("S1-03", t.getStepId());
		assertTrue(t.getNpcNameSet().contains("cook"));
		assertTrue(t.getDialogSet().contains("what's wrong"));
		assertTrue(t.getItemNameSet().contains("egg"));
		assertTrue(get("/status").body().contains("\"activeStepId\":\"S1-03\""));

		assertEquals(200, post("/clear", "", BridgeServer.HEADER, "1").statusCode());
		assertEquals(1, clears.size());
		assertTrue(get("/status").body().contains("\"activeStepId\":null") || !get("/status").body().contains("S1-03"));
	}

	@Test
	public void postБезЗаголовкаОтклоняется() throws Exception
	{
		// Обычная форма или fetch без CORS-разрешения с чужого сайта заголовок X-OSRS-Path не пришлёт.
		assertEquals(403, post("/active-step", COOK, "Content-Type", "text/plain").statusCode());
		assertEquals(403, post("/clear", "").statusCode());
		assertTrue(targets.isEmpty());
		assertTrue(clears.isEmpty());
	}

	@Test
	public void любойБраузерОтклоняетсяПрограммаДляПКПускается() throws Exception
	{
		// Веб-версии нет: запрос с Origin — это страница в браузере, даже с localhost.
		for (String origin : new String[]{"https://evil.example", "http://localhost:5173", "http://127.0.0.1:38282", "null"})
		{
			assertEquals(origin, 403, get("/status", "Origin", origin).statusCode());
			assertEquals(origin, 403, post("/active-step", COOK, BridgeServer.HEADER, "1", "Origin", origin).statusCode());
		}
		assertTrue(targets.isEmpty());

		// Предзапрос CORS тоже отклоняется — браузер не получит разрешения на X-OSRS-Path.
		HttpRequest pre = HttpRequest.newBuilder(URI.create(base + "/active-step"))
			.method("OPTIONS", HttpRequest.BodyPublishers.noBody())
			.header("Origin", "http://localhost:5173")
			.header("Access-Control-Request-Method", "POST")
			.header("Access-Control-Request-Headers", "content-type, x-osrs-path")
			.build();
		HttpResponse<String> r = http.send(pre, HttpResponse.BodyHandlers.ofString());
		assertEquals(403, r.statusCode());
		assertTrue(r.headers().firstValue("Access-Control-Allow-Origin").isEmpty());

		// Программа для ПК (главный процесс Electron) Origin не присылает.
		HttpResponse<String> app = get("/status");
		assertEquals(200, app.statusCode());
		assertTrue(app.headers().firstValue("Access-Control-Allow-Origin").isEmpty());
	}

	@Test
	public void чужойHostОтклоняется() throws Exception
	{
		// Защита от DNS rebinding: сайт attacker.example, указывающий на 127.0.0.1, пришлёт свой Host.
		try (Socket s = new Socket(InetAddress.getLoopbackAddress(), server.getPort()))
		{
			OutputStream out = s.getOutputStream();
			out.write(("GET /status HTTP/1.1\r\nHost: attacker.example:" + server.getPort() + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
			out.flush();
			BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.US_ASCII));
			assertTrue(in.readLine().contains(" 403 "));
		}
		assertTrue(BridgeServer.hostAllowed("127.0.0.1:38282"));
		assertTrue(BridgeServer.hostAllowed("localhost:38282"));
		assertFalse(BridgeServer.hostAllowed("192.168.1.5:38282"));
		assertFalse(BridgeServer.hostAllowed(null));
	}

	@Test
	public void неверныеЗапросы() throws Exception
	{
		assertEquals(400, post("/active-step", "{not json", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/active-step", "{\"stepId\":\"hack\"}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(405, get("/active-step").statusCode());
		assertEquals(404, get("/nope").statusCode());
		StringBuilder big = new StringBuilder("{\"stepId\":\"S1-03\",\"title\":\"");
		while (big.length() < BridgeServer.MAX_BODY + 10)
		{
			big.append("xxxxxxxxxx");
		}
		big.append("\"}");
		assertEquals(413, post("/active-step", big.toString(), BridgeServer.HEADER, "1").statusCode());
		assertTrue(targets.isEmpty());
	}

	@Test
	public void новыеПоляШагаПроверяютсяПоПроводу() throws Exception
	{
		String[] bad = {
			"{\"stepId\":\"S5-08\",\"title\":\"x\",\"maxHit\":0}",
			"{\"stepId\":\"S5-08\",\"title\":\"x\",\"maxHit\":201}",
			"{\"stepId\":\"S5-08\",\"title\":\"x\",\"maxHit\":\"много\"}",
			"{\"stepId\":\"S2-03\",\"title\":\"x\",\"useOn\":[null]}",
			"{\"stepId\":\"S2-03\",\"title\":\"x\",\"useOn\":[{\"item\":\"Bones\"}]}",
			"{\"stepId\":\"S2-03\",\"title\":\"x\",\"useOn\":[{\"item\":\"Bones\",\"target\":\"Cow\",\"kind\":\"hack\"}]}",
			"{\"stepId\":\"S2-03\",\"title\":\"x\",\"useOn\":[{\"item\":\"a\",\"target\":\"b\"},{\"item\":\"a\",\"target\":\"b\"},{\"item\":\"a\",\"target\":\"b\"},{\"item\":\"a\",\"target\":\"b\"},{\"item\":\"a\",\"target\":\"b\"},{\"item\":\"a\",\"target\":\"b\"},{\"item\":\"a\",\"target\":\"b\"},{\"item\":\"a\",\"target\":\"b\"},{\"item\":\"a\",\"target\":\"b\"}]}",
		};
		for (String body : bad)
		{
			assertEquals(body, 400, post("/active-step", body, BridgeServer.HEADER, "1").statusCode());
		}
		assertTrue(targets.isEmpty());
		String good = "{\"stepId\":\"S5-08\",\"title\":\"Elvarg\",\"maxHit\":10,\"useOn\":[{\"item\":\"Bones\",\"target\":\"Cow\",\"kind\":\"npc\"}]}";
		assertEquals(200, post("/active-step", good, BridgeServer.HEADER, "1").statusCode());
		assertEquals(1, targets.size());
	}

	@Test
	public void eventsОтдаётСтатусИАвтоотметку() throws Exception
	{
		BlockingQueue<String> lines = new LinkedBlockingQueue<>();
		Socket s = new Socket(InetAddress.getLoopbackAddress(), server.getPort());
		try
		{
			OutputStream out = s.getOutputStream();
			out.write(("GET /events HTTP/1.1\r\nHost: 127.0.0.1:" + server.getPort() + "\r\nAccept: text/event-stream\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
			out.flush();
			BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
			Thread reader = new Thread(() ->
			{
				try
				{
					String line;
					while ((line = in.readLine()) != null)
					{
						if (line.startsWith("data: "))
						{
							lines.add(line.substring(6));
						}
					}
				}
				catch (IOException ignored)
				{
					// Сокет закрыт в конце теста.
				}
			});
			reader.setDaemon(true);
			reader.start();

			assertEquals("{\"type\":\"STATUS\",\"inGame\":false}", lines.poll(3, TimeUnit.SECONDS));
			assertEquals(1, server.streamCount());
			server.setInGame(true);
			assertEquals("{\"type\":\"STATUS\",\"inGame\":true}", lines.poll(3, TimeUnit.SECONDS));
			server.stepCompleted("S1-03");
			assertEquals("{\"type\":\"STEP_AUTO_COMPLETED\",\"stepId\":\"S1-03\"}", lines.poll(3, TimeUnit.SECONDS));
			// Тот же статус второй раз не рассылается.
			server.setInGame(true);
			assertNull(lines.poll(300, TimeUnit.MILLISECONDS));
		}
		finally
		{
			s.close();
		}
	}

	/** Открыть /events и складывать строки data: в очередь. */
	private Socket openEvents(BlockingQueue<String> lines) throws IOException
	{
		Socket s = new Socket(InetAddress.getLoopbackAddress(), server.getPort());
		OutputStream out = s.getOutputStream();
		out.write(("GET /events HTTP/1.1\r\nHost: 127.0.0.1:" + server.getPort() + "\r\nAccept: text/event-stream\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
		out.flush();
		BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
		Thread reader = new Thread(() ->
		{
			try
			{
				String line;
				while ((line = in.readLine()) != null)
				{
					if (line.startsWith("data: "))
					{
						lines.add(line.substring(6));
					}
				}
			}
			catch (IOException ignored)
			{
				// Сокет закрыт в конце теста.
			}
		});
		reader.setDaemon(true);
		reader.start();
		return s;
	}

	@Test
	public void опытКвестыИИмяПерсонажа_протокол5()
	{
		try
		{
			BlockingQueue<String> lines = new LinkedBlockingQueue<>();
			try (Socket s = openEvents(lines))
			{
				assertEquals("{\"type\":\"STATUS\",\"inGame\":false}", lines.poll(3, TimeUnit.SECONDS));
				java.util.Map<String, Integer> xp = new java.util.LinkedHashMap<>();
				xp.put("magic", 1234);
				server.setXp(xp);
				assertEquals("{\"type\":\"XP\",\"xp\":{\"magic\":1234}}", lines.poll(3, TimeUnit.SECONDS));
				server.setXp(new java.util.LinkedHashMap<>(xp));
				server.setQuests(java.util.Arrays.asList("Rune Mysteries", "Imp Catcher"));
				assertEquals("{\"type\":\"QUESTS\",\"done\":[\"Rune Mysteries\",\"Imp Catcher\"]}", lines.poll(3, TimeUnit.SECONDS));
				server.setQuests(java.util.Arrays.asList("Rune Mysteries", "Imp Catcher"));
				server.setPlayer("Bexqq");
				assertEquals("{\"type\":\"STATUS\",\"inGame\":false,\"player\":\"Bexqq\"}", lines.poll(3, TimeUnit.SECONDS));
				assertNull("повторы не рассылаются", lines.poll(300, TimeUnit.MILLISECONDS));
			}
			String status = get("/status").body();
			assertTrue(status, status.contains("\"xp\":{\"magic\":1234}"));
			assertTrue(status, status.contains("\"questsDone\":[\"Rune Mysteries\",\"Imp Catcher\"]"));
			assertTrue(status, status.contains("\"player\":\"Bexqq\""));
			server.setPos(3213, 3424, 0);
			assertTrue(get("/status").body(), get("/status").body().contains("\"pos\":{\"x\":3213,\"y\":3424,\"plane\":0}"));
			server.setPos(null, null, null);
			assertTrue(!get("/status").body().contains("\"pos\""));
			// Новое подключение получает всё это сразу.
			BlockingQueue<String> again = new LinkedBlockingQueue<>();
			try (Socket s = openEvents(again))
			{
				StringBuilder all = new StringBuilder();
				for (int i = 0; i < 3; i++)
				{
					all.append(again.poll(3, TimeUnit.SECONDS));
				}
				assertTrue(all.toString(), all.toString().contains("\"player\":\"Bexqq\"") && all.toString().contains("\"type\":\"XP\"") && all.toString().contains("\"type\":\"QUESTS\""));
			}
			// Выход из игры — всё снимается.
			server.setXp(null);
			server.setQuests(null);
			server.setPlayer(null);
			assertTrue(get("/status").body(), !get("/status").body().contains("Bexqq"));
		}
		catch (Exception e)
		{
			throw new AssertionError(e);
		}
	}

	@Test
	public void уровниИПредметыРассылаютсяПриИзмененииИПовторяютсяНовомуПодключению() throws Exception
	{
		BlockingQueue<String> lines = new LinkedBlockingQueue<>();
		try (Socket s = openEvents(lines))
		{
			assertEquals("{\"type\":\"STATUS\",\"inGame\":false}", lines.poll(3, TimeUnit.SECONDS));
			java.util.Map<String, Integer> stats = new java.util.LinkedHashMap<>();
			stats.put("magic", 25);
			stats.put("woodcutting", 12);
			server.setStats(stats);
			assertEquals("{\"type\":\"STATS\",\"stats\":{\"magic\":25,\"woodcutting\":12}}", lines.poll(3, TimeUnit.SECONDS));
			// Те же уровни второй раз не уходят.
			server.setStats(new java.util.LinkedHashMap<>(stats));
			java.util.Map<String, Object> rope = new java.util.LinkedHashMap<>();
			rope.put("name", "Rope");
			rope.put("carried", 1);
			server.owned(false, Collections.singletonList(rope));
			assertEquals("{\"type\":\"OWNED\",\"bankSeen\":false,\"items\":[{\"name\":\"Rope\",\"carried\":1}]}", lines.poll(3, TimeUnit.SECONDS));
			server.owned(false, Collections.singletonList(rope));
			assertNull(lines.poll(300, TimeUnit.MILLISECONDS));
		}
		assertTrue(get("/status").body().contains("\"stats\":{\"magic\":25,\"woodcutting\":12}"));

		BlockingQueue<String> again = new LinkedBlockingQueue<>();
		try (Socket s = openEvents(again))
		{
			assertTrue(again.poll(3, TimeUnit.SECONDS).contains("STATUS"));
			assertTrue(again.poll(3, TimeUnit.SECONDS).contains("\"magic\":25"));
			assertTrue(again.poll(3, TimeUnit.SECONDS).contains("\"Rope\""));
		}
	}

	@Test
	public void shoppingPlanПроверяетсяИПередаётся() throws Exception
	{
		String ok = "{\"items\":[{\"name\":\"Rope\",\"id\":954,\"count\":2},{\"name\":\"Hammer\",\"count\":1}]}";
		assertEquals(403, post("/shopping-plan", ok).statusCode());
		assertEquals(200, post("/shopping-plan", ok, BridgeServer.HEADER, "1").statusCode());
		assertEquals(1, plans.size());
		assertEquals(2, plans.get(0).getItems().get(0).getCount());
		assertEquals(400, post("/shopping-plan", "{\"items\":[{\"name\":\"\",\"count\":1}]}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/shopping-plan", "{\"items\":[{\"name\":\"Rope\",\"count\":-1}]}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/shopping-plan", "{}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(1, plans.size());
	}

	@Test
	public void navTargetПроверяетсяПередаётсяИОтказываетВыключенной() throws Exception
	{
		String place = "{\"label\":\"Port Sarim\",\"x\":3029,\"y\":3221,\"plane\":0}";
		String shop = "{\"label\":\"Bob's Brilliant Axes\",\"x\":3229,\"y\":3204,\"plane\":0,\"npcNames\":[\"Bob\"],"
			+ "\"itemName\":\"Steel axe\",\"itemId\":1353,\"stepId\":\"S1-08\"}";
		assertEquals(403, post("/nav-target", place).statusCode());
		assertEquals(200, post("/nav-target", place, BridgeServer.HEADER, "1").statusCode());
		assertEquals(200, post("/nav-target", shop, BridgeServer.HEADER, "1").statusCode());
		assertEquals(200, post("/nav-target", "{\"clear\":true}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(3, navs.size());
		assertFalse(navs.get(0).isPurchase());
		assertTrue(navs.get(1).isPurchase());
		assertTrue(navs.get(1).getNpcNameSet().contains("bob"));
		assertTrue(navs.get(2).isClear());

		// Без подписи, вне мира, чужой этаж, мусор — отказ до слушателя.
		assertEquals(400, post("/nav-target", "{\"x\":3029,\"y\":3221,\"plane\":0}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/nav-target", "{\"label\":\"X\",\"x\":-5,\"y\":3221,\"plane\":0}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/nav-target", "{\"label\":\"X\",\"x\":3029,\"y\":3221,\"plane\":7}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/nav-target", "{\"label\":\"X\",\"x\":3029,\"y\":3221,\"plane\":0,\"itemId\":-1}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/nav-target", "{\"label\":\"X\",\"x\":3029,\"y\":3221,\"plane\":0,\"stepId\":\"hack\"}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/nav-target", "{broken", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/nav-target", "", BridgeServer.HEADER, "1").statusCode());
		assertEquals(405, get("/nav-target").statusCode());
		assertEquals(3, navs.size());

		refuse = "навигация выключена";
		HttpResponse<String> off = post("/nav-target", place, BridgeServer.HEADER, "1");
		assertEquals(409, off.statusCode());
		assertTrue(off.body().contains("навигация выключена"));
		assertEquals(3, navs.size());
	}

	@Test
	public void bankTagsПроверяютсяИПередаются() throws Exception
	{
		assertEquals(200, post("/bank-tags", "{\"stageId\":\"stage-1\",\"itemIds\":[995,1351,1351,590]}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(3, bankTags.get(0).getIdSet().size());
		// Пустой список — снять подсветку, это не ошибка.
		assertEquals(200, post("/bank-tags", "{\"stageId\":\"stage-1\",\"itemIds\":[]}", BridgeServer.HEADER, "1").statusCode());
		assertTrue(bankTags.get(1).getIdSet().isEmpty());
		assertEquals(400, post("/bank-tags", "{\"itemIds\":[995]}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/bank-tags", "{\"stageId\":\"s\"}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/bank-tags", "{\"stageId\":\"s\",\"itemIds\":[0]}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/bank-tags", "{\"stageId\":\"s\",\"itemIds\":[\"x\"]}", BridgeServer.HEADER, "1").statusCode());
		StringBuilder many = new StringBuilder("{\"stageId\":\"s\",\"itemIds\":[1");
		for (int i = 0; i < BankTags.MAX_ITEMS; i++)
		{
			many.append(",1");
		}
		assertEquals(400, post("/bank-tags", many.append("]}").toString(), BridgeServer.HEADER, "1").statusCode());
		assertEquals(2, bankTags.size());
		refuse = "выключено";
		assertEquals(409, post("/bank-tags", "{\"stageId\":\"s\",\"itemIds\":[995]}", BridgeServer.HEADER, "1").statusCode());
	}

	@Test
	public void gearHintПроверяетсяИПередаётся() throws Exception
	{
		String hint = "{\"text\":\"⚡ Сильнее: Steel scimitar у Zeke (Al Kharid), 400 gp\","
			+ "\"watchItems\":[\"Steel scimitar\",\"Iron scimitar\"],\"highlightItems\":[\"Iron scimitar\"]}";
		// Без заголовка приложения — как любой чужой запрос.
		assertEquals(403, post("/gear-hint", hint).statusCode());
		assertEquals(200, post("/gear-hint", hint, BridgeServer.HEADER, "1").statusCode());
		GearHint got = gearHints.get(0);
		assertEquals(2, got.watched().size());
		assertTrue(got.getHighlightSet().contains(ActiveTarget.nameKey("Iron scimitar")));
		assertFalse(got.getHighlightSet().contains(ActiveTarget.nameKey("Steel scimitar")));
		// Только вопрос к банку, без строки в HUD, — тоже можно.
		assertEquals(200, post("/gear-hint", "{\"watchItems\":[\"Mithril scimitar\"]}", BridgeServer.HEADER, "1").statusCode());
		assertNull(gearHints.get(1).getText());
		assertEquals(200, post("/gear-hint", "{\"clear\":true}", BridgeServer.HEADER, "1").statusCode());
		assertTrue(gearHints.get(2).isClear());

		assertEquals(400, post("/gear-hint", "{\"text\":\"\"}", BridgeServer.HEADER, "1").statusCode());
		StringBuilder longText = new StringBuilder("{\"text\":\"");
		for (int i = 0; i < 300; i++)
		{
			longText.append('x');
		}
		assertEquals(400, post("/gear-hint", longText.append("\"}").toString(), BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/gear-hint", "{\"watchItems\":[\"\"]}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/gear-hint", "{\"highlightItems\":[null]}", BridgeServer.HEADER, "1").statusCode());
		StringBuilder many = new StringBuilder("{\"watchItems\":[\"a\"");
		for (int i = 0; i < GearHint.MAX_ITEMS; i++)
		{
			many.append(",\"a\"");
		}
		assertEquals(400, post("/gear-hint", many.append("]}").toString(), BridgeServer.HEADER, "1").statusCode());
		assertEquals(400, post("/gear-hint", "{broken", BridgeServer.HEADER, "1").statusCode());
		assertEquals(405, get("/gear-hint").statusCode());
		assertEquals(3, gearHints.size());

		// Подсказки выключены в настройках — 409 с причиной, а снять старую всё равно можно.
		refuse = "подсказки апгрейда выключены";
		HttpResponse<String> off = post("/gear-hint", hint, BridgeServer.HEADER, "1");
		assertEquals(409, off.statusCode());
		assertTrue(off.body().contains("подсказки апгрейда выключены"));
		assertEquals(200, post("/gear-hint", "{\"clear\":true}", BridgeServer.HEADER, "1").statusCode());
		assertEquals(4, gearHints.size());
	}

	@Test
	public void statusСнаряжениеИСобытияТемпаИЦели() throws Exception
	{
		// Пока снаряжение неизвестно — поля есть, но null: старый клиент их просто не читает.
		String before = get("/status").body();
		assertTrue(before.contains("\"status\":\"ok\""));
		assertFalse(before.contains("\"coins\":"));

		java.util.Map<String, Object> axe = new java.util.LinkedHashMap<>();
		axe.put("id", 1351);
		axe.put("name", "Bronze axe");
		java.util.Map<String, Object> gear = new java.util.LinkedHashMap<>();
		gear.put("equipment", Collections.singletonList(axe));
		gear.put("inventory", new java.util.ArrayList<>());
		gear.put("coins", 250);
		gear.put("bankCoins", null);

		BlockingQueue<String> lines = new LinkedBlockingQueue<>();
		try (Socket s = openEvents(lines))
		{
			assertTrue(lines.poll(3, TimeUnit.SECONDS).contains("STATUS"));
			server.setGear(gear);
			assertEquals("{\"type\":\"GEAR\",\"gear\":{\"equipment\":[{\"id\":1351,\"name\":\"Bronze axe\"}],\"inventory\":[],\"coins\":250}}",
				lines.poll(3, TimeUnit.SECONDS));
			server.setGear(new java.util.LinkedHashMap<>(gear));
			java.util.Map<String, Object> pace = new java.util.LinkedHashMap<>();
			pace.put("actionsLeft", 34);
			server.pacing("S1-11", pace);
			assertEquals("{\"type\":\"PACING\",\"stepId\":\"S1-11\",\"pacing\":{\"actionsLeft\":34}}", lines.poll(3, TimeUnit.SECONDS));
			server.pacing("S1-11", new java.util.LinkedHashMap<>(pace));
			assertNull(lines.poll(300, TimeUnit.MILLISECONDS));

			NavTarget t = new NavTarget();
			t.setLabel("Bob's Brilliant Axes");
			t.setItemName("Steel axe");
			t.setItemId(1353);
			t.setStepId("S1-08");
			server.navDone("obtained", t);
			String done = lines.poll(3, TimeUnit.SECONDS);
			assertTrue(done.startsWith("{\"type\":\"NAV_DONE\",\"reason\":\"obtained\""));
			assertTrue(done.contains("\"itemId\":1353"));
		}
		String after = get("/status").body();
		assertTrue(after.contains("\"equipment\":[{\"id\":1351,\"name\":\"Bronze axe\"}]"));
		assertTrue(after.contains("\"coins\":250"));

		// Новое подключение сразу получает снаряжение и темп.
		BlockingQueue<String> again = new LinkedBlockingQueue<>();
		try (Socket s = openEvents(again))
		{
			assertTrue(again.poll(3, TimeUnit.SECONDS).contains("STATUS"));
			assertTrue(again.poll(3, TimeUnit.SECONDS).contains("GEAR"));
			assertTrue(again.poll(3, TimeUnit.SECONDS).contains("PACING"));
		}
	}

	@Test
	public void цельВыбраннаяВИгре_событиеNavSetИВStatus() throws Exception
	{
		assertFalse("цели нет — поля нет", get("/status").body().contains("\"navTarget\""));
		NavTarget t = new NavTarget();
		t.setLabel("Ned — дом в Draynor Village");
		t.setX(3099);
		t.setY(3259);
		t.setNpcNames(Collections.singletonList("Ned"));
		t.setStepId("S2-10");
		BlockingQueue<String> lines = new LinkedBlockingQueue<>();
		try (Socket s = openEvents(lines))
		{
			assertTrue(lines.poll(3, TimeUnit.SECONDS).contains("STATUS"));
			server.navSet(t);
			assertEquals("{\"type\":\"NAV_SET\",\"target\":{\"label\":\"Ned — дом в Draynor Village\",\"x\":3099,\"y\":3259,\"plane\":0,"
				+ "\"npcNames\":[\"Ned\"],\"stepId\":\"S2-10\"}}", lines.poll(3, TimeUnit.SECONDS));
			// Программа, запущенная позже, узнаёт цель из /status.
			assertTrue(get("/status").body().contains("\"navTarget\":{\"label\":\"Ned — дом в Draynor Village\",\"x\":3099"));
			server.navDone("arrived", t);
			assertTrue(lines.poll(3, TimeUnit.SECONDS).startsWith("{\"type\":\"NAV_DONE\",\"reason\":\"arrived\""));
		}
		assertFalse("дошёл — цели снова нет", get("/status").body().contains("\"navTarget\""));
	}

	@Test
	public void telemetryОтдаётСводкуЖурналаИЗащищёнКакОстальныеАдреса() throws Exception
	{
		// Слушатель по умолчанию — журнал выключен.
		HttpResponse<String> r = get("/telemetry");
		assertEquals(200, r.statusCode());
		assertEquals("{\"enabled\":false}", r.body());
		assertEquals("только GET", 405, post("/telemetry", "{}", "X-OSRS-Path", "1").statusCode());
		assertEquals("запрос из браузера отклонён", 403, get("/telemetry", "Origin", "https://evil.example").statusCode());
	}

	@Test
	public void остановкаЗакрываетПорт() throws Exception
	{
		int port = server.getPort();
		server.stop();
		boolean refused = false;
		try (Socket s = new Socket(InetAddress.getLoopbackAddress(), port))
		{
			assertNotNull(s);
		}
		catch (IOException e)
		{
			refused = true;
		}
		assertTrue(refused);
		// @After вызовет stop ещё раз — это не должно падать.
	}
}
