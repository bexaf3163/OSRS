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
		}, Collections.singletonList("https://osrs-put.example"));
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
	public void чужойOriginОтклоняетсяСвойИЛокальныйПускаются() throws Exception
	{
		assertEquals(403, get("/status", "Origin", "https://evil.example").statusCode());
		assertEquals(403, post("/active-step", COOK, BridgeServer.HEADER, "1", "Origin", "https://evil.example").statusCode());
		assertTrue(targets.isEmpty());

		HttpResponse<String> local = get("/status", "Origin", "http://localhost:5173");
		assertEquals(200, local.statusCode());
		assertEquals("http://localhost:5173", local.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
		assertEquals(200, get("/status", "Origin", "https://osrs-put.example").statusCode());
	}

	@Test
	public void preflightРазрешаетЗаголовокИЛокальнуюСеть() throws Exception
	{
		HttpRequest req = HttpRequest.newBuilder(URI.create(base + "/active-step"))
			.method("OPTIONS", HttpRequest.BodyPublishers.noBody())
			.header("Origin", "https://osrs-put.example")
			.header("Access-Control-Request-Method", "POST")
			.header("Access-Control-Request-Headers", "content-type, x-osrs-path")
			.header("Access-Control-Request-Private-Network", "true")
			.build();
		HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
		assertEquals(204, r.statusCode());
		assertTrue(r.headers().firstValue("Access-Control-Allow-Headers").orElse("").contains(BridgeServer.HEADER));
		assertEquals("true", r.headers().firstValue("Access-Control-Allow-Private-Network").orElse(null));
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
