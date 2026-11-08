package com.osrspath.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.RejectedExecutionException;
import lombok.extern.slf4j.Slf4j;

/**
 * Local HTTP bridge for the "OSRS Path" app. Listens on 127.0.0.1 only.
 *
 * <pre>
 * GET  /status        {"status":"ok","inGame":true,"activeStepId":"S1-03","stats":{"magic":25,…},"shortestPath":true,
 *                      "equipment":[{"id":1351,"name":"Bronze axe"}],"inventory":[{"id":995,"name":"Coins","count":250}],
 *                      "coins":250,"bankCoins":null,"carriedValue":1200,"bankValue":null,"protocol":2,"pluginVersion":"2.9.0"}
 *                      - gear is null until in the game or while upgrade hints are off; item value is an estimate
 *                      by Grand Exchange prices without coins; protocol grows when the bridge's addresses or fields change
 * POST /active-step   the step's target (ActiveTarget): arrow, highlight, HUD, departure check, path, pace, auto-tick
 * POST /clear         remove everything
 * POST /shopping-plan the Grand Exchange bulk list (ShoppingPlan): the exchange hint
 * POST /nav-target    a temporary target over the step (NavTarget): a place from the map or a shop; {"clear":true} clears it
 * POST /bank-tags     the stage's items for soft highlighting in the bank (BankTags)
 * POST /gear-hint     gear advice (GearHint): the HUD line, what to ask the bank for and what to highlight; {"clear":true} clears it
 * GET  /telemetry     the debug log summary: file, counters, anomalies and latest events (since protocol 6; {"enabled":false} if the log is off)
 * GET  /events        text/event-stream: STATUS (with player), STATS, XP, QUESTS (since protocol 5), OWNED, GEAR, PACING, NAV_SET, NAV_DONE, STEP_AUTO_COMPLETED
 *                      and a ping every 15 seconds
 *
 * STATS, OWNED, GEAR and PACING go out only on change (at most once per game tick) and are repeated to
 * a new connection, so the app does not wait for the next change. A feature turned off in the settings
 * answers 409 with an explanation: the app shows it instead of staying silent.
 * </pre>
 *
 * Protection from websites in a browser: Host only local (against DNS rebinding), any request with an
 * Origin header is rejected, POST only with the X-OSRS-Path header. The bridge serves a single desktop app: it calls
 * from the Electron main process, with no Origin. There is no web version any more, so CORS is not needed either: a browser
 * without CORS permission cannot read the response or send X-OSRS-Path.
 *
 * The server does not depend on RuneLite, so it can be checked with an ordinary test.
 */
@Slf4j
public final class BridgeServer
{
	// Parts of this class in their own files: they reach the shared state through this class.
	final BridgeReports reports = new BridgeReports(this);

	public static final int DEFAULT_PORT = 38282;
	/**
	 * The bridge protocol version. 1 is before 2.9 (there was no field: the app counts such a plugin as old); 2 is since 2.9:
	 * the value of items in gear and the version handshake; 3 is since 2.10: guide in the step for the side panel;
	 * 4 is since 2.11: guide is also drawn as the "What you need" list on the game screen (clickable); the app asks to
	 * restart RuneLite if it still has plugin 2.10. Grows with the addresses, fields and what the plugin
	 * does with them. 6 is since 2.22: one /prep-plan state snapshot instead of five requests (step, shopping, bank highlight, gear
	 * advice, the preparation plan with a readiness percentage); the old addresses remain for an app with protocol 5.
	 */
	static final int PROTOCOL = 6;
	/** The plugin version, the same as the app it ships with in one exe. */
	static final String PLUGIN_VERSION = "2.82.3";
	public static final String HEADER = "X-OSRS-Path";
	static final int MAX_BODY = 64 * 1024;
	/** The whole snapshot: the step with the quest stages, shopping and plan in one body. */
	static final int MAX_SNAPSHOT = 384 * 1024;
	static final int MAX_STREAMS = 8;
	static final long PING_SECONDS = 15;

	public interface Listener
	{
		/** A new target arrived. Called on the server thread: pass it on to the client thread. */
		void onActiveTarget(ActiveTarget target);

		void onClear();

		default void onShoppingPlan(ShoppingPlan plan)
		{
		}

		/** A temporary target. Returns the reason for refusal (the feature is off) or null. */
		default String onNavTarget(NavTarget target)
		{
			return "not supported";
		}

		/** The stage's items for highlighting in the bank. Returns the reason for refusal or null. */
		default String onBankTags(BankTags tags)
		{
			return "not supported";
		}

		/** Gear advice. Returns the reason for refusal (the feature is off) or null. */
		default String onGearHint(GearHint hint)
		{
			return "not supported";
		}

		/**
		 * The state snapshot (protocol 6). bad are the parts that failed validation: they are not applied, the previous ones stay. Returns
		 * the outcome: a late snapshot and per-part refusals (the feature is turned off in the settings).
		 */
		default PrepResult onPrepPlan(PrepEnvelope envelope, Map<String, String> bad)
		{
			return new PrepResult(false, Map.of("all", "not supported"));
		}

		/** The debug log summary for the app (GET /telemetry): {"enabled":false} or counters, anomalies and latest events. */
		default Map<String, Object> onTelemetry()
		{
			return Map.of("enabled", false);
		}
	}

	/** The outcome of applying a snapshot: stale means an older one than already applied arrived; rejected are the parts that were not applied. */
	public static final class PrepResult
	{
		final boolean stale;
		final Map<String, String> rejected;

		PrepResult(boolean stale, Map<String, String> rejected)
		{
			this.stale = stale;
			this.rejected = rejected;
		}
	}

	private final int requestedPort;
	final Gson gson;
	private final Listener listener;
	final List<AsyncEventStream> streams = new CopyOnWriteArrayList<>();
	final Object streamLock = new Object();
	private ExecutorService streamWriters;
	private ExecutorService streamClosers;
	String pendingCompletionStep;
	String pendingCompletionPlayer;
	String pendingCompletionFrame;

	private HttpServer server;
	private ExecutorService executor;
	private ScheduledExecutorService pinger;
	volatile boolean inGame;
	volatile String activeStepId;
	/** Skill levels: {"magic": 25, ...}; null means not in the game or sending is off. */
	volatile Map<String, Integer> stats;
	/** XP per skill: {"magic": 1234, ...}; null means not in the game or sending is off. Since protocol 5. */
	volatile Map<String, Integer> xp;
	/** Names of completed quests; null means not in the game or sending is off. Since protocol 5. */
	volatile List<String> questsDone;
	/** The character name: the app switches profile by it; null means not in the game. Since protocol 5. */
	volatile String player;
	/** The last OWNED event, repeated to new connections. */
	volatile Map<String, Object> lastOwned;
	/** Gear, bag and coins: {"equipment":[...],"inventory":[...],"coins":...,"bankCoins":...}; null means unknown. */
	volatile Map<String, Object> gear;
	/** The last PACING event, repeated to new connections. */
	volatile Map<String, Object> lastPacing;

	public BridgeServer(int port, Gson gson, Listener listener)
	{
		this.requestedPort = port;
		this.gson = gson;
		this.listener = listener;
	}

	private final Object prepLock = new Object();
	private boolean stopped;

	public void start() throws IOException
	{
		synchronized (prepLock) { stopped = false; }
		server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), requestedPort), 16);
		executor = Executors.newCachedThreadPool(daemon("osrs-path-bridge-http"));
		server.setExecutor(executor);
		server.createContext("/", this::handle);
		streamWriters = streamPool("osrs-path-bridge-events");
		streamClosers = streamPool("osrs-path-bridge-close");
		server.start();
		pinger = Executors.newSingleThreadScheduledExecutor(daemon("osrs-path-bridge-ping"));
		int[] seconds = {0};
		pinger.scheduleAtFixedRate(() -> {
			for (AsyncEventStream stream : streams)
			{
				stream.expire(System.nanoTime(), TimeUnit.SECONDS.toNanos(10));
				if (stream.isClosed()) streams.remove(stream);
			}
			if (++seconds[0] % PING_SECONDS == 0) reports.sendAll(": ping\n\n");
		}, 1, 1, TimeUnit.SECONDS);
		log.info("OSRS Path Bridge listening on http://127.0.0.1:{}", getPort());
	}

	public void stop()
	{
		synchronized (prepLock) { stopped = true; }
		for (AsyncEventStream s : streams)
		{
			s.closeAsync();
		}
		streams.clear();
		if (server != null)
		{
			server.stop(0);
			server = null;
		}
		if (pinger != null)
		{
			pinger.shutdownNow();
			pinger = null;
		}
		if (executor != null)
		{
			executor.shutdownNow();
			executor = null;
		}
		if (streamWriters != null) streamWriters.shutdownNow();
		if (streamClosers != null) streamClosers.shutdownNow();
	}

	/** The actual port: in tests the server takes a free one (port 0). */
	public int getPort()
	{
		return server == null ? requestedPort : server.getAddress().getPort();
	}

	// ---------- The game state the plugin reports, and the events pushed to the app ----------
	public void setInGame(boolean value)
	{
		reports.setInGame(value);
	}

	public void setQuestInstruction(String stepId, Integer stageAt, int lineIndex, boolean peeking)
	{
		reports.setQuestInstruction(stepId, stageAt, lineIndex, peeking);
	}

	public void setStats(Map<String, Integer> value)
	{
		reports.setStats(value);
	}

	public void setXp(Map<String, Integer> value)
	{
		reports.setXp(value);
	}

	public void setQuests(List<String> value)
	{
		reports.setQuests(value);
	}

	public void setPos(Integer x, Integer y, Integer plane)
	{
		reports.setPos(x, y, plane);
	}

	public void setTeleportMarks(int home, int minigame)
	{
		reports.setTeleportMarks(home, minigame);
	}

	public void setSpellbook(int value)
	{
		reports.setSpellbook(value);
	}

	public void setChronicleCharges(Integer value)
	{
		reports.setChronicleCharges(value);
	}

	public void setProgressTotals(Integer quests, Integer total)
	{
		reports.setProgressTotals(quests, total);
	}

	public void setAccountType(String kind)
	{
		reports.setAccountType(kind);
	}

	public void setCombatLog(String stepId, List<CombatLog.Entry> foes)
	{
		reports.setCombatLog(stepId, foes);
	}

	public void setPlayer(String value)
	{
		reports.setPlayer(value);
	}

	public void setShortestPath(boolean value)
	{
		reports.setShortestPath(value);
	}

	public void owned(boolean bankSeen, List<Map<String, Object>> items)
	{
		reports.owned(bankSeen, items);
	}

	public void owned(boolean bankSeen, Long bankSavedAt, List<Map<String, Object>> items)
	{
		reports.owned(bankSeen, bankSavedAt, items);
	}

	public void setGear(Map<String, Object> value)
	{
		reports.setGear(value);
	}

	public void pacing(String stepId, Map<String, Object> value)
	{
		reports.pacing(stepId, value);
	}

	public void navSet(NavTarget t)
	{
		reports.navSet(t);
	}

	public void navDone(String reason, NavTarget t)
	{
		reports.navDone(reason, t);
	}

	public void moved(String kind, int[] from, int[] to)
	{
		reports.moved(kind, from, to);
	}

	public void stepCompleted(String stepId)
	{
		reports.stepCompleted(stepId);
	}

	int streamCount()
	{
		return reports.streamCount();
	}

	// ---------- Requests from the app ----------
	private void handle(HttpExchange ex)
	{
		boolean keepOpen = false;
		try
		{
			String method = ex.getRequestMethod();
			String path = ex.getRequestURI().getPath();
			Headers req = ex.getRequestHeaders();
			if (!hostAllowed(req.getFirst("Host")))
			{
				json(ex, 403, error("host"));
				return;
			}
			// Origin is sent only by a browser. The desktop app calls from the main process, without it.
			if (req.getFirst("Origin") != null)
			{
				json(ex, 403, error("origin"));
				return;
			}

			switch (path)
			{
				case "/status":
					if (!"GET".equals(method))
					{
						json(ex, 405, error("method"));
						return;
					}
					json(ex, 200, reports.statusReport());
					return;
				case "/active-step":
				{
					if (!postAllowed(ex, method))
					{
						return;
					}
					String body = readBody(ex.getRequestBody());
					if (body == null)
					{
						json(ex, 413, error("body too large"));
						return;
					}
					ActiveTarget target;
					try
					{
						target = gson.fromJson(body, ActiveTarget.class);
					}
					catch (JsonParseException e)
					{
						json(ex, 400, error("bad json"));
						return;
					}
					String problem = target == null ? "empty" : target.prepare();
					if (problem != null)
					{
						json(ex, 400, error(problem));
						return;
					}
					reports.reportedStep(target.getStepId());
					listener.onActiveTarget(target);
					json(ex, 200, ok());
					return;
				}
				case "/shopping-plan":
				{
					if (!postAllowed(ex, method))
					{
						return;
					}
					String body = readBody(ex.getRequestBody());
					if (body == null)
					{
						json(ex, 413, error("body too large"));
						return;
					}
					ShoppingPlan plan;
					try
					{
						plan = gson.fromJson(body, ShoppingPlan.class);
					}
					catch (JsonParseException e)
					{
						json(ex, 400, error("bad json"));
						return;
					}
					String problem = plan == null ? "empty" : plan.prepare();
					if (problem != null)
					{
						json(ex, 400, error(problem));
						return;
					}
					listener.onShoppingPlan(plan);
					json(ex, 200, ok());
					return;
				}
				case "/nav-target":
				{
					NavTarget nav = readJson(ex, method, NavTarget.class);
					if (nav == null)
					{
						return;
					}
					String problem = nav.prepare();
					if (problem != null)
					{
						json(ex, 400, error(problem));
						return;
					}
					String refused = listener.onNavTarget(nav);
					json(ex, refused == null ? 200 : 409, refused == null ? ok() : error(refused));
					return;
				}
				case "/bank-tags":
				{
					BankTags tags = readJson(ex, method, BankTags.class);
					if (tags == null)
					{
						return;
					}
					String problem = tags.prepare();
					if (problem != null)
					{
						json(ex, 400, error(problem));
						return;
					}
					String refused = listener.onBankTags(tags);
					json(ex, refused == null ? 200 : 409, refused == null ? ok() : error(refused));
					return;
				}
				case "/gear-hint":
				{
					GearHint hint = readJson(ex, method, GearHint.class);
					if (hint == null)
					{
						return;
					}
					String problem = hint.prepare();
					if (problem != null)
					{
						json(ex, 400, error(problem));
						return;
					}
					String refused = listener.onGearHint(hint);
					json(ex, refused == null ? 200 : 409, refused == null ? ok() : error(refused));
					return;
				}
				case "/prep-plan":
				{
					if (!postAllowed(ex, method))
					{
						return;
					}
					String body = readBody(ex.getRequestBody(), MAX_SNAPSHOT);
					if (body == null)
					{
						json(ex, 413, error("body too large"));
						return;
					}
					PrepEnvelope env;
					try
					{
						JsonElement root = new JsonParser().parse(body);
						if (!root.isJsonObject())
						{
							json(ex, 400, error("bad json"));
							return;
						}
						env = gson.fromJson(root, PrepEnvelope.class);
						JsonElement stepJson = root.getAsJsonObject().get("step");
						if (env != null && stepJson != null && !stepJson.isJsonNull())
						{
							env.setStepKey(stepJson.toString());
						}
					}
					catch (JsonParseException e)
					{
						json(ex, 400, error("bad json"));
						return;
					}
					String versionProblem = env == null ? "empty" : env.versionProblem();
					if (versionProblem != null)
					{
						json(ex, 400, error(versionProblem));
						return;
					}
					Map<String, String> bad = env.prepare();
					PrepResult result;
					synchronized (prepLock)
					{
						result = stopped ? null : listener.onPrepPlan(env, bad);
						if (result != null && !result.stale && !bad.containsKey(PrepEnvelope.STEP))
						{
							reports.reportedStep(env.getStep() == null ? null : env.getStep().getStepId());
						}
					}
					if (result == null) { json(ex, 503, error("bridge stopping")); return; }
					Map<String, String> rejected = new LinkedHashMap<>(bad);
					rejected.putAll(result.rejected);
					Map<String, Object> answer = ok();
					answer.put("seq", env.getSeq());
					answer.put("stale", result.stale);
					answer.put("rejected", rejected);
					json(ex, 200, answer);
					return;
				}
				case "/telemetry":
					if (!"GET".equals(method))
					{
						json(ex, 405, error("method"));
						return;
					}
					json(ex, 200, listener.onTelemetry());
					return;
				case "/clear":
					if (!postAllowed(ex, method))
					{
						return;
					}
					reports.reportedStep(null);
					listener.onClear();
					json(ex, 200, ok());
					return;
				case "/events":
					if (!"GET".equals(method))
					{
						json(ex, 405, error("method"));
						return;
					}
					keepOpen = openStream(ex);
					return;
				default:
					json(ex, 404, error("not found"));
			}
		}
		catch (IOException | RuntimeException e)
		{
			log.debug("Bridge request not handled", e);
		}
		finally
		{
			if (!keepOpen)
			{
				ex.close();
			}
		}
	}

	/**
	 * A POST with a JSON body of the needed kind. null means an error response has already been sent (method, header, size, parsing).
	 */
	private <T> T readJson(HttpExchange ex, String method, Class<T> type) throws IOException
	{
		if (!postAllowed(ex, method))
		{
			return null;
		}
		String body = readBody(ex.getRequestBody());
		if (body == null)
		{
			json(ex, 413, error("body too large"));
			return null;
		}
		T value;
		try
		{
			value = gson.fromJson(body, type);
		}
		catch (JsonParseException e)
		{
			json(ex, 400, error("bad json"));
			return null;
		}
		if (value == null)
		{
			json(ex, 400, error("empty"));
		}
		return value;
	}

	private boolean postAllowed(HttpExchange ex, String method) throws IOException
	{
		if (!"POST".equals(method))
		{
			json(ex, 405, error("method"));
			return false;
		}
		if (!"1".equals(ex.getRequestHeaders().getFirst(HEADER)))
		{
			json(ex, 403, error("header " + HEADER + " required"));
			return false;
		}
		return true;
	}

	private boolean openStream(HttpExchange ex) throws IOException
	{
		Headers h = ex.getResponseHeaders();
		h.set("Content-Type", "text/event-stream; charset=utf-8");
		h.set("Cache-Control", "no-cache");
		ex.sendResponseHeaders(200, 0);
		AsyncEventStream s = new AsyncEventStream(ex.getResponseBody(), ex::close, streamClosers);
		synchronized (streamLock)
		{
			return registerStream(s);
		}
	}

	/** Initial snapshot and following events are queued in order under streamLock; no socket I/O here. */
	private boolean registerStream(AsyncEventStream s)
	{
		// Extra connections (forgotten tabs) are closed, starting from the old ones.
		while (streams.size() >= MAX_STREAMS)
		{
			AsyncEventStream old = streams.remove(0);
			old.closeAsync();
		}
		StringBuilder hello = new StringBuilder("retry: 5000\n\ndata: ").append(gson.toJson(reports.statusEvent())).append("\n\n");
		if (stats != null)
		{
			hello.append("data: ").append(gson.toJson(reports.statsEvent())).append("\n\n");
		}
		if (xp != null)
		{
			hello.append("data: ").append(gson.toJson(reports.xpEvent())).append("\n\n");
		}
		if (questsDone != null)
		{
			hello.append("data: ").append(gson.toJson(reports.questsEvent())).append("\n\n");
		}
		Map<String, Object> owned = lastOwned;
		if (owned != null)
		{
			hello.append("data: ").append(gson.toJson(owned)).append("\n\n");
		}
		if (gear != null)
		{
			hello.append("data: ").append(gson.toJson(reports.gearEvent())).append("\n\n");
		}
		Map<String, Object> pace = lastPacing;
		if (pace != null)
		{
			hello.append("data: ").append(gson.toJson(pace)).append("\n\n");
		}
		// The unacknowledged completion of the current target is replayed until the app advances/clears it.
		// Keep only this one current-character receipt, never historic completions after a manual reactivation.
		if (inGame && Objects.equals(pendingCompletionStep, activeStepId) && Objects.equals(pendingCompletionPlayer, player) && pendingCompletionFrame != null)
		{
			hello.append(pendingCompletionFrame);
		}
		if (!s.offer(hello.toString().getBytes(StandardCharsets.UTF_8))) return false;
		streams.add(s);
		try { streamWriters.execute(s); }
		catch (RejectedExecutionException ignored)
		{
			streams.remove(s);
			s.closeAsync();
			return false;
		}
		return true;
	}

	static boolean hostAllowed(String host)
	{
		if (host == null)
		{
			return false;
		}
		String name = host.replaceFirst(":\\d{1,5}$", "");
		return name.equals("127.0.0.1") || name.equals("localhost") || name.equals("[::1]");
	}

	private void json(HttpExchange ex, int code, Object body) throws IOException
	{
		byte[] bytes = gson.toJson(body).getBytes(StandardCharsets.UTF_8);
		ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
		ex.getResponseHeaders().set("Cache-Control", "no-store");
		ex.sendResponseHeaders(code, bytes.length);
		try (OutputStream os = ex.getResponseBody())
		{
			os.write(bytes);
		}
	}

	/** The whole request body, but no more than MAX_BODY; null if it is larger. */
	static String readBody(InputStream in) throws IOException
	{
		return readBody(in, MAX_BODY);
	}

	/** The whole request body, but no more than limit; null if it is larger. */
	static String readBody(InputStream in, int limit) throws IOException
	{
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		byte[] buf = new byte[8192];
		int n;
		while ((n = in.read(buf)) != -1)
		{
			if (out.size() + n > limit)
			{
				return null;
			}
			out.write(buf, 0, n);
		}
		return out.toString(StandardCharsets.UTF_8);
	}

	private static Map<String, Object> ok()
	{
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("status", "ok");
		return m;
	}

	private static Map<String, Object> error(String message)
	{
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("status", "error");
		m.put("error", message);
		return m;
	}

	private static ThreadFactory daemon(String name)
	{
		return r ->
		{
			Thread t = new Thread(r, name);
			t.setDaemon(true);
			return t;
		};
	}

	private static ExecutorService streamPool(String name)
	{
		return new ThreadPoolExecutor(MAX_STREAMS, MAX_STREAMS, 0L, TimeUnit.MILLISECONDS,
			new ArrayBlockingQueue<>(MAX_STREAMS), daemon(name), new ThreadPoolExecutor.AbortPolicy());
	}
}
