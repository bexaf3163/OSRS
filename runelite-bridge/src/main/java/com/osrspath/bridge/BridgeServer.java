package com.osrspath.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
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
import java.util.ArrayList;
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
import lombok.extern.slf4j.Slf4j;

/**
 * Локальный HTTP-мост для приложения «OSRS Путь». Слушает только 127.0.0.1.
 *
 * <pre>
 * GET  /status        {"status":"ok","inGame":true,"activeStepId":"S1-03","stats":{"magic":25,…},"shortestPath":true,
 *                      "equipment":[{"id":1351,"name":"Bronze axe"}],"inventory":[{"id":995,"name":"Coins","count":250}],
 *                      "coins":250,"bankCoins":null,"carriedValue":1200,"bankValue":null,"protocol":2,"pluginVersion":"2.9.0"}
 *                      — снаряжение null, пока не в игре или подсказки апгрейда выключены; стоимость предметов — оценка
 *                      по ценам биржи без монет; protocol растёт, когда меняются адреса или поля моста
 * POST /active-step   цель шага (ActiveTarget) — стрелка, подсветка, HUD, проверка вылета, путь, темп, автоотметка
 * POST /clear         убрать всё
 * POST /shopping-plan оптовый список Grand Exchange (ShoppingPlan) — подсказка на бирже
 * POST /nav-target    временная цель поверх шага (NavTarget): место с карты или магазин; {"clear":true} — снять
 * POST /bank-tags     предметы этапа для мягкой подсветки в банке (BankTags)
 * POST /gear-hint     совет по снаряжению (GearHint): строка HUD, что спросить у банка и что подсветить; {"clear":true} — снять
 * GET  /events        text/event-stream: STATUS (с player), STATS, XP, QUESTS (с протокола 5), OWNED, GEAR, PACING, NAV_SET, NAV_DONE, STEP_AUTO_COMPLETED
 *                      и пинг каждые 15 секунд
 *
 * STATS, OWNED, GEAR и PACING уходят только при изменении (не чаще раза за игровой тик) и повторяются
 * новому подключению, чтобы приложению не ждать следующего изменения. Выключенная в настройках функция
 * отвечает 409 с объяснением — приложение показывает его, а не молчит.
 * </pre>
 *
 * Защита от сайтов в браузере: Host только локальный (против DNS rebinding), любой запрос с заголовком
 * Origin отклоняется, POST — только с заголовком X-OSRS-Path. Мост слушает одну программу для ПК: она ходит
 * сюда из главного процесса Electron, без Origin. Веб-версии больше нет, поэтому и CORS не нужен: браузер
 * без разрешения CORS не прочитает ответ и не отправит X-OSRS-Path.
 *
 * Сервер не зависит от RuneLite — его можно проверить обычным тестом.
 */
@Slf4j
public final class BridgeServer
{
	public static final int DEFAULT_PORT = 38282;
	/**
	 * Версия протокола моста. 1 — до 2.9 (поля не было: приложение считает такой плагин старым); 2 — с 2.9:
	 * стоимость предметов в снаряжении и рукопожатие версий; 3 — с 2.10: guide в шаге для боковой панели;
	 * 4 — с 2.11: guide рисуется и списком «Что нужно» на экране игры (кликабельным) — программа просит
	 * перезапустить RuneLite, если в нём остался плагин 2.10. Растёт вместе с адресами, полями и тем, что плагин
	 * делает с ними.
	 */
	static final int PROTOCOL = 5;
	/** Версия плагина — та же, что у программы, с которой он едет в одном exe. */
	static final String PLUGIN_VERSION = "2.15.1";
	public static final String HEADER = "X-OSRS-Path";
	static final int MAX_BODY = 64 * 1024;
	static final int MAX_STREAMS = 8;
	static final long PING_SECONDS = 15;

	public interface Listener
	{
		/** Пришла новая цель. Вызывается в потоке сервера — дальше передавать в поток клиента. */
		void onActiveTarget(ActiveTarget target);

		void onClear();

		default void onShoppingPlan(ShoppingPlan plan)
		{
		}

		/** Временная цель. Возвращает причину отказа (функция выключена) или null. */
		default String onNavTarget(NavTarget target)
		{
			return "не поддерживается";
		}

		/** Предметы этапа для подсветки в банке. Возвращает причину отказа или null. */
		default String onBankTags(BankTags tags)
		{
			return "не поддерживается";
		}

		/** Совет по снаряжению. Возвращает причину отказа (функция выключена) или null. */
		default String onGearHint(GearHint hint)
		{
			return "не поддерживается";
		}
	}

	private final int requestedPort;
	private final Gson gson;
	private final Listener listener;
	private final List<Stream> streams = new CopyOnWriteArrayList<>();

	private HttpServer server;
	private ExecutorService executor;
	private ScheduledExecutorService pinger;
	private volatile boolean inGame;
	private volatile String activeStepId;
	/** Уровни навыков: {"magic": 25, …}; null — не в игре или передача выключена. */
	private volatile Map<String, Integer> stats;
	/** Опыт по навыкам: {"magic": 1234, …}; null — не в игре или передача выключена. С протокола 5. */
	private volatile Map<String, Integer> xp;
	/** Названия завершённых квестов; null — не в игре или передача выключена. С протокола 5. */
	private volatile List<String> questsDone;
	/** Имя персонажа — программа переключает профиль по нему; null — не в игре. С протокола 5. */
	private volatile String player;
	/** Где стоит персонаж: {"x":…,"y":…,"plane":…}; только в /status (не рассылается — меняется с каждым шагом). С протокола 5. */
	private volatile Map<String, Integer> pos;
	private volatile boolean shortestPath;
	/** Текущая временная цель (как NAV_SET) или null — для /status. */
	private volatile JsonObject navTarget;
	/** Последнее событие OWNED — повторяется новым подключениям. */
	private volatile Map<String, Object> lastOwned;
	/** Снаряжение, сумка и монеты: {"equipment":[…],"inventory":[…],"coins":…,"bankCoins":…}; null — неизвестно. */
	private volatile Map<String, Object> gear;
	/** Последнее событие PACING — повторяется новым подключениям. */
	private volatile Map<String, Object> lastPacing;

	public BridgeServer(int port, Gson gson, Listener listener)
	{
		this.requestedPort = port;
		this.gson = gson;
		this.listener = listener;
	}

	public void start() throws IOException
	{
		server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), requestedPort), 16);
		executor = Executors.newCachedThreadPool(daemon("osrs-path-bridge-http"));
		server.setExecutor(executor);
		server.createContext("/", this::handle);
		server.start();
		pinger = Executors.newSingleThreadScheduledExecutor(daemon("osrs-path-bridge-ping"));
		pinger.scheduleAtFixedRate(() -> sendAll(": ping\n\n"), PING_SECONDS, PING_SECONDS, TimeUnit.SECONDS);
		log.info("OSRS Path Bridge слушает http://127.0.0.1:{}", getPort());
	}

	public void stop()
	{
		for (Stream s : streams)
		{
			s.close();
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
	}

	/** Фактический порт — в тестах сервер берёт свободный (порт 0). */
	public int getPort()
	{
		return server == null ? requestedPort : server.getAddress().getPort();
	}

	public void setInGame(boolean value)
	{
		if (inGame == value)
		{
			return;
		}
		inGame = value;
		broadcast(statusEvent());
	}

	public void setActiveStepId(String stepId)
	{
		activeStepId = stepId;
	}

	/** Новые уровни навыков. Одинаковые не рассылаются. */
	public void setStats(Map<String, Integer> value)
	{
		Map<String, Integer> copy = value == null ? null : new LinkedHashMap<>(value);
		if (Objects.equals(stats, copy))
		{
			return;
		}
		stats = copy;
		broadcast(statsEvent());
	}

	/** Опыт по навыкам (с протокола 5). Одинаковый не рассылается. */
	public void setXp(Map<String, Integer> value)
	{
		Map<String, Integer> copy = value == null ? null : new LinkedHashMap<>(value);
		if (Objects.equals(xp, copy))
		{
			return;
		}
		xp = copy;
		broadcast(xpEvent());
	}

	/** Завершённые квесты (с протокола 5). Тот же список не рассылается. */
	public void setQuests(List<String> value)
	{
		List<String> copy = value == null ? null : new ArrayList<>(value);
		if (Objects.equals(questsDone, copy))
		{
			return;
		}
		questsDone = copy;
		broadcast(questsEvent());
	}

	/** Где стоит персонаж (с протокола 5): отвечает /status, событий нет. */
	public void setPos(Integer x, Integer y, Integer plane)
	{
		if (x == null || y == null || plane == null)
		{
			pos = null;
			return;
		}
		Map<String, Integer> p = new LinkedHashMap<>();
		p.put("x", x);
		p.put("y", y);
		p.put("plane", plane);
		pos = p;
	}

	/** Имя персонажа (с протокола 5); приходит в событии STATUS. */
	public void setPlayer(String value)
	{
		if (Objects.equals(player, value))
		{
			return;
		}
		player = value;
		broadcast(statusEvent());
	}

	public void setShortestPath(boolean value)
	{
		shortestPath = value;
	}

	/**
	 * Сколько есть нужных предметов: carried — в сумке и надето, noted — банкнотами в сумке,
	 * bank — в банке (null, пока банк в этой сессии не открывали). Одинаковое не рассылается.
	 */
	public void owned(boolean bankSeen, List<Map<String, Object>> items)
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "OWNED");
		e.put("bankSeen", bankSeen);
		e.put("items", items);
		if (e.equals(lastOwned))
		{
			return;
		}
		lastOwned = e;
		broadcast(e);
	}

	/** Снаряжение и монеты для подсказки апгрейда. null — неизвестно (не в игре или функция выключена). */
	public void setGear(Map<String, Object> value)
	{
		Map<String, Object> copy = value == null ? null : new LinkedHashMap<>(value);
		if (Objects.equals(gear, copy))
		{
			return;
		}
		gear = copy;
		broadcast(gearEvent());
	}

	/** Темп прокачки шага; value null — у шага темпа нет или он выключен. */
	public void pacing(String stepId, Map<String, Object> value)
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "PACING");
		e.put("stepId", stepId);
		e.put("pacing", value);
		if (e.equals(lastPacing))
		{
			return;
		}
		lastPacing = e;
		broadcast(e);
	}

	/**
	 * Временная цель поставлена — программой (/nav-target) или игроком в игре (список «Что нужно», боковая панель).
	 * Программа показывает ту же цель («● Стрелка ведёт сюда», метка на карте), даже если её выбрали в игре.
	 */
	public void navSet(NavTarget t)
	{
		JsonObject target = navJson(t);
		navTarget = target;
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "NAV_SET");
		e.put("target", target);
		broadcast(e);
	}

	/**
	 * Цель в том же виде, в каком программа шлёт её на /nav-target (те же поля NavTarget), — программа сравнивает её со
	 * своими кнопками. Служебный clear не нужен.
	 */
	private JsonObject navJson(NavTarget t)
	{
		JsonObject o = gson.toJsonTree(t).getAsJsonObject();
		o.remove("clear");
		return o;
	}

	/** Временная цель снята: arrived — дошёл, obtained — предмет получен, cleared — снята настройкой или /clear. */
	public void navDone(String reason, NavTarget t)
	{
		navTarget = null;
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "NAV_DONE");
		e.put("reason", reason);
		e.put("label", t == null ? null : t.getLabel());
		e.put("stepId", t == null ? null : t.getStepId());
		e.put("itemId", t == null ? null : t.getItemId());
		e.put("itemName", t == null ? null : t.getItemName());
		broadcast(e);
	}

	public void stepCompleted(String stepId)
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "STEP_AUTO_COMPLETED");
		e.put("stepId", stepId);
		broadcast(e);
	}

	int streamCount()
	{
		return streams.size();
	}

	private Map<String, Object> statusEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "STATUS");
		e.put("inGame", inGame);
		e.put("player", player);
		return e;
	}

	private Map<String, Object> xpEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "XP");
		e.put("xp", xp);
		return e;
	}

	private Map<String, Object> questsEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "QUESTS");
		e.put("done", questsDone);
		return e;
	}

	private Map<String, Object> statsEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "STATS");
		e.put("stats", stats);
		return e;
	}

	private Map<String, Object> gearEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "GEAR");
		e.put("gear", gear);
		return e;
	}

	private void broadcast(Object event)
	{
		sendAll("data: " + gson.toJson(event) + "\n\n");
	}

	private void sendAll(String frame)
	{
		for (Stream s : streams)
		{
			if (!s.send(frame))
			{
				streams.remove(s);
			}
		}
	}

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
			// Origin присылает только браузер. Программа для ПК ходит из главного процесса — без него.
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
					Map<String, Object> status = new LinkedHashMap<>();
					status.put("status", "ok");
					status.put("inGame", inGame);
					status.put("activeStepId", activeStepId);
					status.put("stats", stats);
					status.put("xp", xp);
					status.put("questsDone", questsDone);
					status.put("player", player);
					status.put("pos", pos);
					status.put("shortestPath", shortestPath);
					// Куда сейчас ведёт временная цель — программа после перезапуска показывает ту же, что в игре.
					status.put("navTarget", navTarget);
					Map<String, Object> g = gear;
					status.put("equipment", g == null ? null : g.get("equipment"));
					status.put("inventory", g == null ? null : g.get("inventory"));
					status.put("coins", g == null ? null : g.get("coins"));
					status.put("bankCoins", g == null ? null : g.get("bankCoins"));
					status.put("carriedValue", g == null ? null : g.get("carriedValue"));
					status.put("bankValue", g == null ? null : g.get("bankValue"));
					// Рукопожатие версий: приложение сверяет протокол и просит обновить плагин, если он старше.
					status.put("protocol", PROTOCOL);
					status.put("pluginVersion", PLUGIN_VERSION);
					json(ex, 200, status);
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
					activeStepId = target.getStepId();
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
				case "/clear":
					if (!postAllowed(ex, method))
					{
						return;
					}
					activeStepId = null;
					listener.onClear();
					json(ex, 200, ok());
					return;
				case "/events":
					if (!"GET".equals(method))
					{
						json(ex, 405, error("method"));
						return;
					}
					openStream(ex);
					keepOpen = true;
					return;
				default:
					json(ex, 404, error("not found"));
			}
		}
		catch (IOException | RuntimeException e)
		{
			log.debug("Запрос к мосту не обработан", e);
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
	 * POST с JSON-телом нужного вида. null — ответ об ошибке уже отправлен (метод, заголовок, размер, разбор).
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

	private void openStream(HttpExchange ex) throws IOException
	{
		Headers h = ex.getResponseHeaders();
		h.set("Content-Type", "text/event-stream; charset=utf-8");
		h.set("Cache-Control", "no-cache");
		ex.sendResponseHeaders(200, 0);
		Stream s = new Stream(ex);
		// Лишние соединения (забытые вкладки) закрываем, начиная со старых.
		while (streams.size() >= MAX_STREAMS)
		{
			Stream old = streams.remove(0);
			old.close();
		}
		streams.add(s);
		StringBuilder hello = new StringBuilder("retry: 5000\n\ndata: ").append(gson.toJson(statusEvent())).append("\n\n");
		if (stats != null)
		{
			hello.append("data: ").append(gson.toJson(statsEvent())).append("\n\n");
		}
		if (xp != null)
		{
			hello.append("data: ").append(gson.toJson(xpEvent())).append("\n\n");
		}
		if (questsDone != null)
		{
			hello.append("data: ").append(gson.toJson(questsEvent())).append("\n\n");
		}
		Map<String, Object> owned = lastOwned;
		if (owned != null)
		{
			hello.append("data: ").append(gson.toJson(owned)).append("\n\n");
		}
		if (gear != null)
		{
			hello.append("data: ").append(gson.toJson(gearEvent())).append("\n\n");
		}
		Map<String, Object> pace = lastPacing;
		if (pace != null)
		{
			hello.append("data: ").append(gson.toJson(pace)).append("\n\n");
		}
		if (!s.send(hello.toString()))
		{
			streams.remove(s);
		}
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

	/** Тело запроса целиком, но не больше MAX_BODY; null — если больше. */
	static String readBody(InputStream in) throws IOException
	{
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		byte[] buf = new byte[8192];
		int n;
		while ((n = in.read(buf)) != -1)
		{
			if (out.size() + n > MAX_BODY)
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

	/** Открытый поток событий одного клиента. */
	private static final class Stream
	{
		private final HttpExchange exchange;
		private final OutputStream out;

		Stream(HttpExchange exchange)
		{
			this.exchange = exchange;
			this.out = exchange.getResponseBody();
		}

		synchronized boolean send(String frame)
		{
			try
			{
				out.write(frame.getBytes(StandardCharsets.UTF_8));
				out.flush();
				return true;
			}
			catch (IOException e)
			{
				close();
				return false;
			}
		}

		void close()
		{
			try
			{
				out.close();
			}
			catch (IOException ignored)
			{
				// Клиент уже ушёл.
			}
			exchange.close();
		}
	}
}
