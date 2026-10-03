package com.osrspath.bridge;

import com.google.gson.Gson;
import com.google.inject.Provides;
import java.io.IOException;
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.function.IntUnaryOperator;
import javax.imageio.ImageIO;
import java.util.stream.Collectors;
import javax.inject.Inject;
import javax.swing.SwingUtilities;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.ChatMessageType;
import net.runelite.api.Client;
import net.runelite.api.GameObject;
import net.runelite.api.GameState;
import net.runelite.api.GrandExchangeOffer;
import net.runelite.api.GrandExchangeOfferState;
import net.runelite.api.Item;
import net.runelite.api.ItemComposition;
import net.runelite.api.EquipmentInventorySlot;
import net.runelite.api.ItemContainer;
import net.runelite.api.NPC;
import net.runelite.api.NPCComposition;
import net.runelite.api.ObjectComposition;
import net.runelite.api.Player;
import net.runelite.api.Quest;
import net.runelite.api.QuestState;
import net.runelite.api.Scene;
import net.runelite.api.Skill;
import net.runelite.api.SoundEffectID;
import net.runelite.api.Tile;
import net.runelite.api.TileObject;
import net.runelite.api.WorldView;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.MenuAction;
import net.runelite.api.events.ActorDeath;
import net.runelite.api.events.ChatMessage;
import net.runelite.api.events.PostMenuSort;
import net.runelite.api.events.DecorativeObjectDespawned;
import net.runelite.api.events.DecorativeObjectSpawned;
import net.runelite.api.events.GameObjectDespawned;
import net.runelite.api.events.GameObjectSpawned;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.GameTick;
import net.runelite.api.events.GrandExchangeOfferChanged;
import net.runelite.api.events.GroundObjectDespawned;
import net.runelite.api.events.GroundObjectSpawned;
import net.runelite.api.events.ItemContainerChanged;
import net.runelite.api.events.NpcChanged;
import net.runelite.api.events.NpcDespawned;
import net.runelite.api.events.NpcSpawned;
import net.runelite.api.events.StatChanged;
import net.runelite.api.events.VarbitChanged;
import net.runelite.api.events.WallObjectDespawned;
import net.runelite.api.events.WallObjectSpawned;
import net.runelite.api.gameval.InventoryID;
import net.runelite.api.gameval.ItemID;
import net.runelite.client.RuneLite;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.EventBus;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.events.PluginChanged;
import net.runelite.client.events.PluginMessage;
import net.runelite.client.game.ItemManager;
import net.runelite.client.util.HotkeyListener;
import net.runelite.client.input.KeyManager;
import net.runelite.client.input.MouseManager;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.plugins.PluginManager;
import net.runelite.client.ui.ClientToolbar;
import net.runelite.client.ui.DrawManager;
import net.runelite.client.ui.NavigationButton;
import net.runelite.client.ui.overlay.OverlayManager;
import net.runelite.client.ui.overlay.worldmap.WorldMapPoint;
import net.runelite.client.ui.overlay.worldmap.WorldMapPointManager;

@Slf4j
@PluginDescriptor(
	name = "OSRS Path Bridge",
	description = "Мост локального гида с 3D-подсказками, подсветкой и авто-завершением",
	tags = {"bridge", "navigation", "helper"}
)
public class OsrsPathBridgePlugin extends Plugin implements BridgeServer.Listener
{
	/** Плагин Shortest Path (Plugin Hub): его открытый API — PluginMessage с пространством имён «shortestpath». */
	static final String SHORTEST_PATH_CLASS = "shortestpath.ShortestPathPlugin";
	static final String SHORTEST_PATH_NS = "shortestpath";
	/** Ближе стольких клеток к месту временной цели — дошёл. */
	static final int NAV_ARRIVED = 3;

	/** Квесты RuneLite по названию из игры: «Cook's Assistant» → Quest.COOKS_ASSISTANT. */
	private static final Map<String, Quest> QUESTS = Arrays.stream(Quest.values())
		.collect(Collectors.toMap(q -> ActiveTarget.nameKey(q.getName()), q -> q, (a, b) -> a));

	@Inject
	private Client client;

	@Inject
	private ClientThread clientThread;

	@Inject
	private OverlayManager overlayManager;

	@Inject
	private OsrsPathBridgeConfig config;

	@Inject
	private Gson gson;

	@Inject
	private OsrsPathWorldOverlay worldOverlay;

	@Inject
	private OsrsPathWidgetOverlay widgetOverlay;

	@Inject
	private OsrsPathItemOverlay itemOverlay;

	@Inject
	private OsrsPathHudOverlay hudOverlay;

	@Inject
	private InventoryCheckOverlay checklistOverlay;

	@Inject
	private GrandExchangeHelperOverlay geOverlay;

	@Inject
	private OsrsPathDangerOverlay dangerOverlay;

	@Inject
	private OsrsPathArrowOverlay arrowOverlay;

	@Inject
	private OsrsPathGuideOverlay guideOverlay;

	@Inject
	private MouseManager mouseManager;

	@Inject
	private ConfigManager configManager;

	@Inject
	private WorldMapPointManager worldMapPointManager;

	@Inject
	private ClientToolbar clientToolbar;

	@Inject
	private OsrsPathDebugOverlay debugOverlay;

	@Inject
	private KeyManager keyManager;

	@Inject
	private DrawManager drawManager;

	@Inject
	private ScheduledExecutorService executor;

	/** Боковая панель «OSRS Путь»: что нужно на шаг, где взять, «Путь сюда». */
	private OsrsPathPanel panel;
	private NavigationButton panelButton;
	/** Клики по списку «Что нужно» на экране игры. */
	private GuideMouse guideMouse;
	/**
	 * Что нужно на шаг и куда идти — для списка в игре и боковой панели. Считается в потоке клиента при смене
	 * шага, цели, сумки и банка; Swing-панель перестраивается, только когда вид изменился.
	 */
	@Getter
	private volatile StepGuide.View guideView;
	private StepGuide.View panelView;
	/** Сообщение в списке и панели после нажатия, например «навигация выключена»; снимается сменой шага. */
	private String guideMessage;
	/** Метка на карте мира: куда ведёт стрелка. */
	private WorldMapPoint mapPoint;

	@Inject
	private ItemManager itemManager;

	@Inject
	private PluginManager pluginManager;

	@Inject
	private EventBus eventBus;

	/** Текущая цель. Меняется только в потоке клиента, читается оверлеями там же. */
	@Getter
	private ActiveTarget target;

	/** Подходящие NPC и объекты рядом — собираются по событиям появления, а не перебором каждый кадр. */
	@Getter
	private final List<NPC> npcs = new ArrayList<>();

	@Getter
	private final Map<TileObject, String> objects = new HashMap<>();

	/** Микро-HUD: пересчитывается раз за тик и при смене цели или сумки. */
	@Getter
	private OsrsPathHudOverlay.State hud;

	/**
	 * Остановки маршрута текущего шага (калитка → мост → лестница → NPC); null — у шага их нет. На земле
	 * они не рисуются: к текущей остановке ведут стрелка, HUD («Точка 2/5») и Shortest Path.
	 */
	private Navigation.Breadcrumbs breadcrumbs;

	@Getter
	private Checklist.Result checklist = Checklist.NONE;

	/** Оптовый список на бирже: что есть, что в ордере, что купить. */
	@Getter
	private List<ShoppingPlan.Row> shopping = Collections.emptyList();

	private BridgeServer server;
	private AutoCompletionManager completion;
	private boolean arrowSet;
	private boolean near;
	private WorldPoint lastPosition;

	/** Сумка и надетое (без банкнот), банкноты отдельно, банк — null, пока его не открывали. */
	private ItemCounts carried = ItemCounts.EMPTY;
	private ItemCounts noted = ItemCounts.EMPTY;
	private ItemCounts bank;
	private final Map<Integer, String> itemNames = new HashMap<>();
	private Set<Integer> wantedIds = Collections.emptySet();
	private Set<String> wantedNames = Collections.emptySet();

	private ShoppingPlan plan;
	/** Слоты биржи: ID предмета и ордер на покупку в каждом. */
	private final int[] offerItems = new int[8];
	private final ShoppingPlan.Offer[] offerSlots = new ShoppingPlan.Offer[8];

	private final Map<String, Integer> stats = new LinkedHashMap<>();
	private boolean statsDirty;
	/** Опыт по навыкам (уходит в программу не чаще раза в три секунды — он меняется с каждым действием). */
	private final Map<String, Integer> xp = new LinkedHashMap<>();
	private boolean xpDirty;
	private int xpTicks;
	/** Завершённые квесты, как они были отправлены; проверка — раз в двадцать тиков. */
	private List<String> questsSent;
	private int questTicks;
	private String playerSent;
	private static final int XP_EVERY_TICKS = 5;
	private static final int QUESTS_EVERY_TICKS = 20;
	private boolean ownedDirty;
	private boolean gearDirty;
	private boolean pacingDirty;

	/** Временная цель поверх шага: место с карты приложения или магазин для апгрейда. */
	@Getter
	private NavTarget navTarget;

	/** Совет приложения по снаряжению (POST /gear-hint): строка HUD, что спросить у банка, что подсветить. */
	private volatile GearHint gearHint;

	/** Продавец или NPC временной цели рядом — собирается по событиям, как NPC шага. */
	@Getter
	private final List<NPC> navNpcs = new ArrayList<>();

	/** Предметы этапа для мягкой подсветки в банке (POST /bank-tags). Пишется из потока сервера. */
	private volatile Set<Integer> bankTagIds = Collections.emptySet();

	private DangerRadar radar;

	/** Ближайшая опасная зона и насколько игрок к ней подошёл. Меняется при смене клетки. */
	@Getter
	private DangerRadar.Reading danger = DangerRadar.QUIET;

	/** Опасные NPC рядом — ищутся, только пока игрок в зоне предупреждения. */
	@Getter
	private final List<NPC> dangerNpcs = new ArrayList<>();

	/** Темп прокачки текущего шага; null — у шага его нет или он выключен. */
	private PacingSet pacing;

	private Plugin shortestPath;
	private boolean shortestPathLooked;
	/** Цель, отданная Shortest Path, — чтобы не слать одно и то же и знать, что потом очистить. */
	private WorldPoint pathSent;

	@Provides
	OsrsPathBridgeConfig provideConfig(ConfigManager configManager)
	{
		return configManager.getConfig(OsrsPathBridgeConfig.class);
	}

	@Override
	protected void startUp()
	{
		completion = new AutoCompletionManager(this::isQuestFinished, stats::get, this::ownedCount, this::onStepCompleted);
		radar = DangerRadar.load(gson);
		startTelemetry();
		startServer();
		overlayManager.add(debugOverlay);
		debugHotkey = new HotkeyListener(() -> config.debugKey())
		{
			@Override
			public void hotkeyPressed()
			{
				clientThread.invokeLater(OsrsPathBridgePlugin.this::toggleDebug);
			}
		};
		shotHotkey = new HotkeyListener(() -> config.shotKey())
		{
			@Override
			public void hotkeyPressed()
			{
				clientThread.invokeLater(() -> takeShot("hotkey"));
			}
		};
		keyManager.registerKeyListener(debugHotkey);
		keyManager.registerKeyListener(shotHotkey);
		overlayManager.add(worldOverlay);
		overlayManager.add(widgetOverlay);
		overlayManager.add(itemOverlay);
		overlayManager.add(hudOverlay);
		overlayManager.add(checklistOverlay);
		overlayManager.add(geOverlay);
		overlayManager.add(dangerOverlay);
		overlayManager.add(arrowOverlay);
		overlayManager.add(guideOverlay);
		guideMouse = new GuideMouse(client, guideOverlay, a -> clientThread.invokeLater(() -> guideAction(a)));
		mouseManager.registerMouseListener(guideMouse);
		panel = new OsrsPathPanel(new OsrsPathPanel.Actions()
		{
			@Override
			public void go(int place)
			{
				clientThread.invokeLater(() -> goToPlace(place));
			}

			@Override
			public void back()
			{
				clientThread.invokeLater(() -> applyNav(null));
			}
		});
		panelButton = NavigationButton.builder().tooltip("OSRS Путь: что нужно и куда идти").icon(OsrsPathPanel.icon()).priority(6).panel(panel).build();
		clientToolbar.addNavigation(panelButton);
		panelView = null;
		guideView = null;
		clientThread.invokeLater(() ->
		{
			boolean loggedIn = client.getGameState() == GameState.LOGGED_IN;
			if (server != null)
			{
				server.setInGame(loggedIn);
			}
			if (loggedIn)
			{
				// Плагин включили посреди игры: уровни и сумку берём сразу, не дожидаясь событий.
				for (Skill skill : Skill.values())
				{
					if (!isOverall(skill))
					{
						stats.put(skillKey(skill), client.getRealSkillLevel(skill));
						xp.put(skillKey(skill), client.getSkillExperience(skill));
					}
				}
				statsDirty = true;
				xpDirty = true;
				rebuildCarried();
			}
		});
	}

	@Override
	protected void shutDown()
	{
		keyManager.unregisterKeyListener(debugHotkey);
		keyManager.unregisterKeyListener(shotHotkey);
		overlayManager.remove(debugOverlay);
		debugVisible = false;
		stopTelemetry();
		stopServer();
		overlayManager.remove(worldOverlay);
		overlayManager.remove(widgetOverlay);
		overlayManager.remove(itemOverlay);
		overlayManager.remove(hudOverlay);
		overlayManager.remove(checklistOverlay);
		overlayManager.remove(geOverlay);
		overlayManager.remove(dangerOverlay);
		overlayManager.remove(arrowOverlay);
		overlayManager.remove(guideOverlay);
		mouseManager.unregisterMouseListener(guideMouse);
		clientToolbar.removeNavigation(panelButton);
		clientThread.invoke(() ->
		{
			navTarget = null;
			navNpcs.clear();
			danger = DangerRadar.QUIET;
			dangerNpcs.clear();
			applyTarget(null);
			setMapPoint(null, null);
		});
		completion = null;
		plan = null;
		shopping = Collections.emptyList();
		bankTagIds = Collections.emptySet();
		gearHint = null;
		prep = null;
		snapshotStepKey = null;
		synchronized (snapshotLock)
		{
			lastSnapshot = -1;
		}
	}

	private void startServer()
	{
		BridgeServer s = new BridgeServer(config.port(), gson, this);
		try
		{
			s.start();
			server = s;
		}
		catch (IOException e)
		{
			log.warn("OSRS Path Bridge: порт {} занят или недоступен — мост не запущен", config.port(), e);
			server = null;
		}
	}

	private void stopServer()
	{
		if (server != null)
		{
			server.stop();
			server = null;
		}
	}

	@Subscribe
	public void onConfigChanged(ConfigChanged e)
	{
		if ("runelite".equals(e.getGroup()) && e.getKey().endsWith("plugin"))
		{
			// Включили или выключили какой-то плагин — может быть, Shortest Path.
			clientThread.invokeLater(this::updateNavigation);
			return;
		}
		if (!OsrsPathBridgeConfig.GROUP.equals(e.getGroup()))
		{
			return;
		}
		if ("shareStats".equals(e.getKey()))
		{
			statsDirty = true;
			xpDirty = true;
		}
		if ("useShortestPath".equals(e.getKey()))
		{
			clientThread.invokeLater(this::updateNavigation);
		}
		if ("port".equals(e.getKey()))
		{
			stopServer();
			startServer();
			// Новый мост ничего не знает — сообщаем ему текущую временную цель, иначе программа её сбросит.
			clientThread.invokeLater(() ->
			{
				if (server != null && navTarget != null)
				{
					server.navSet(navTarget);
				}
			});
		}
		if ("hintArrow".equals(e.getKey()) || "worldMapMarker".equals(e.getKey()))
		{
			clientThread.invokeLater(this::updateNavigation);
		}
		switch (e.getKey())
		{
			case "autoNavigation":
			case "upgradeRouter":
				clientThread.invokeLater(() ->
				{
					// Выключили — временная цель снимается сразу, а не «когда-нибудь».
					if (navTarget != null && (!config.autoNavigation() || (navTarget.isPurchase() && !config.upgradeRouter())))
					{
						finishNav("cleared");
					}
					if (!config.upgradeRouter())
					{
						gearHint = null;
					}
					gearDirty = true;
					updateHud();
				});
				break;
			case "bankTagsHelper":
				if (!config.bankTagsHelper())
				{
					bankTagIds = Collections.emptySet();
				}
				break;
			case "dangerRadar":
				clientThread.invokeLater(() ->
				{
					radar.reset();
					danger = DangerRadar.QUIET;
					dangerNpcs.clear();
					lastPosition = null;
					updateHud();
				});
				break;
			case "smartPacing":
				clientThread.invokeLater(() ->
				{
					setupPacing();
					updateHud();
				});
				break;
			case "hudPacing":
			case "smartView":
				clientThread.invokeLater(this::updateHud);
				break;
			case "telemetry":
				if (config.telemetry())
				{
					startTelemetry();
				}
				else
				{
					stopTelemetry();
				}
				break;
			default:
				break;
		}
	}

	@Subscribe
	public void onPluginChanged(PluginChanged e)
	{
		shortestPathLooked = false;
		clientThread.invokeLater(this::updateNavigation);
	}

	// ---------- Запросы приложения (поток сервера → поток клиента) ----------

	@Override
	public void onActiveTarget(ActiveTarget t)
	{
		clientThread.invokeLater(() -> applyTarget(t));
	}

	@Override
	public void onClear()
	{
		clientThread.invokeLater(() ->
		{
			if (navTarget != null)
			{
				finishNav("cleared");
			}
			applyTarget(null);
		});
	}

	@Override
	public String onNavTarget(NavTarget t)
	{
		if (!t.isClear())
		{
			if (!config.autoNavigation())
			{
				return "навигация к местам выключена в настройках плагина OSRS Path Bridge";
			}
			if (t.isPurchase() && !config.upgradeRouter())
			{
				return "подсказки апгрейда выключены в настройках плагина OSRS Path Bridge";
			}
		}
		clientThread.invokeLater(() -> applyNav(t.isClear() ? null : t));
		return null;
	}

	@Override
	public String onGearHint(GearHint h)
	{
		if (!h.isClear() && !config.upgradeRouter())
		{
			return "подсказки апгрейда выключены в настройках плагина OSRS Path Bridge";
		}
		clientThread.invokeLater(() ->
		{
			gearHint = h.isClear() ? null : h;
			// Новые предметы для счёта в банке — событие OWNED уйдёт с ними.
			ownedDirty = true;
			updateHud();
		});
		return null;
	}

	// ---------- Журнал отладки, плашка разработчика, скриншоты ----------

	/** Журнал событий движка; null — выключен в настройках. */
	private volatile Telemetry telemetry;
	private final EngineWatchdog watchdog = new EngineWatchdog();
	/** Что показывает плашка разработчика; пересобирается раз в тик, пока плашка открыта. */
	@Getter
	private volatile DebugView.State debugState;
	@Getter
	private volatile boolean debugVisible;
	private HotkeyListener debugHotkey;
	private HotkeyListener shotHotkey;
	private volatile boolean hudOnScreen;
	private volatile boolean guideOnScreen;
	private final Map<String, String> lastUi = new HashMap<>();
	private int shots;
	private long lastShotAt;
	private volatile String lastShotName;
	private volatile long lastSnapshotAt;
	private volatile long lastSnapshotSeq;
	private volatile Integer planPercent;
	private int tickCount;
	private long lastBeat;
	private ItemCounts lastBag = ItemCounts.EMPTY;
	private String lastStageKey;
	private int lastStageCursor = -1;
	private Integer lastStageVar;
	private String lastWarning;

	static final int SHOTS_PER_SESSION = 12;
	static final long SHOT_GAP_MS = 20_000;
	static final int SHOTS_KEPT = 40;
	static final long HEARTBEAT_MS = 30_000;
	static final int WATCH_TICKS = 5;

	/** Событие в журнал — если он включён. */
	private void tel(String kind, Object... pairs)
	{
		Telemetry t = telemetry;
		if (t != null)
		{
			try
			{
				t.event(kind, pairs);
			}
			catch (RuntimeException ex)
			{
				// Журнал нужен для разбора, а не для работы: его сбой не должен задеть подсказки в игре.
				log.debug("Событие журнала не записано: {}", ex.toString());
			}
		}
	}

	private void startTelemetry()
	{
		if (telemetry != null || !config.telemetry())
		{
			return;
		}
		telemetry = new Telemetry(new File(RuneLite.RUNELITE_DIR, "osrs-path-telemetry"), gson, System::currentTimeMillis);
		Map<String, Object> cfg = new LinkedHashMap<>();
		cfg.put("smartView", config.smartOverlays());
		cfg.put("hudLean", config.hudLean());
		cfg.put("showHud", config.showHud());
		cfg.put("showGuide", config.showGuide());
		cfg.put("hudLarge", config.hudLarge());
		cfg.put("stageFollow", config.stageFollow());
		cfg.put("autoNavigation", config.autoNavigation());
		tel("session", "plugin", BridgeServer.PLUGIN_VERSION, "protocol", BridgeServer.PROTOCOL, "java", System.getProperty("java.version"),
			"os", System.getProperty("os.name"), "config", cfg);
	}

	private void stopTelemetry()
	{
		Telemetry t = telemetry;
		telemetry = null;
		if (t != null)
		{
			t.event("end");
			t.close();
		}
	}

	/** Плашки сообщают, что нарисовали: сторож движка ловит «шаг есть, а на экране пусто». */
	void hudShown(boolean shown)
	{
		hudOnScreen = shown;
	}

	void guideShown(boolean shown)
	{
		guideOnScreen = shown;
	}

	/** Что игрок видит (текст плашки или списка): в журнал — только когда изменилось. */
	void uiShown(String view, String text)
	{
		Telemetry t = telemetry;
		if (t == null || text == null || text.equals(lastUi.put(view, text)))
		{
			return;
		}
		t.event("ui", "view", view, "text", text);
	}

	private void toggleDebug()
	{
		debugVisible = !debugVisible;
		tel("debug", "visible", debugVisible);
		if (debugVisible)
		{
			debugState = buildDebugState();
		}
	}

	/** Скриншот игры в папку журнала; пара «картинка — состояние движка» записывается в журнал. */
	private void takeShot(String why)
	{
		Telemetry t = telemetry;
		if (t == null)
		{
			return;
		}
		long now = System.currentTimeMillis();
		boolean auto = why.startsWith("anomaly");
		if (auto && (shots >= SHOTS_PER_SESSION || now - lastShotAt < SHOT_GAP_MS))
		{
			return;
		}
		// Снимок по горячей клавише не тратит лимит автоматических: игрок жмёт его сам и знает, зачем.
		if (auto)
		{
			lastShotAt = now;
			shots++;
		}
		String state = DebugView.plain(DebugView.rows(buildDebugState()));
		String stamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
		String name = "shot-" + stamp + "-" + why.replaceAll("[^A-Za-z0-9_]+", "_") + ".png";
		lastShotName = name;
		File dir = new File(t.dir(), "shots");
		drawManager.requestNextFrameListener(image -> executor.execute(() -> writeShot(image, dir, name, why, state)));
	}

	private void writeShot(Image image, File dir, String name, String why, String state)
	{
		try
		{
			BufferedImage out = new BufferedImage(image.getWidth(null), image.getHeight(null), BufferedImage.TYPE_INT_RGB);
			out.getGraphics().drawImage(image, 0, 0, null);
			java.nio.file.Files.createDirectories(dir.toPath());
			ImageIO.write(out, "png", new File(dir, name));
			pruneShots(dir);
			tel("shot", "file", name, "why", why, "state", state);
		}
		catch (IOException | RuntimeException ex)
		{
			log.warn("Скриншот для отладки не сохранён: {}", ex.toString());
		}
	}

	/** В папке остаются только свежие скриншоты. */
	private static void pruneShots(File dir)
	{
		File[] files = dir.listFiles((d, n) -> n.startsWith("shot-") && n.endsWith(".png"));
		if (files == null || files.length <= SHOTS_KEPT)
		{
			return;
		}
		Arrays.sort(files, java.util.Comparator.comparing(File::getName));
		for (int i = 0; i < files.length - SHOTS_KEPT; i++)
		{
			if (!files[i].delete())
			{
				log.debug("Старый скриншот не удалён: {}", files[i]);
			}
		}
	}

	/** Сводка журнала для приложения (GET /telemetry): путь, счётчики, последние странности и события. */
	@Override
	public Map<String, Object> onTelemetry()
	{
		Telemetry t = telemetry;
		if (t == null)
		{
			Map<String, Object> off = new LinkedHashMap<>();
			off.put("enabled", false);
			return off;
		}
		Map<String, Object> m = t.summary(30);
		m.put("enabled", true);
		m.put("lastShot", lastShotName);
		return m;
	}

	/** Раз в тик: пульс, сторож движка, состояние плашки разработчика. Поток клиента. */
	private void debugTick(Player me)
	{
		try
		{
			debugTickUnsafe(me);
		}
		catch (RuntimeException ex)
		{
			// Отладочная часть не должна ломать игровой тик: сбой — в лог RuneLite, подсказки работают дальше.
			log.warn("Сбой плашки разработчика или сторожа: {}", ex.toString());
		}
	}

	private void debugTickUnsafe(Player me)
	{
		tickCount++;
		long now = System.currentTimeMillis();
		Telemetry t = telemetry;
		if (t != null && now - lastBeat >= HEARTBEAT_MS)
		{
			lastBeat = now;
			WorldPoint p = me.getWorldLocation();
			t.event("beat", "step", target == null ? null : target.getStepId(), "stage", lastStageKey, "cursor", lastStageCursor,
				"pos", new int[] {p.getX(), p.getY(), p.getPlane()}, "tick", tickCount, "hud", hudOnScreen, "guide", guideOnScreen);
		}
		if (t != null && tickCount % WATCH_TICKS == 0)
		{
			ActiveTarget.Stage st = stageOf(target);
			StepGuide.View v = guideView;
			WorldPoint p = me.getWorldLocation();
			List<ActiveTarget.StageLine> lines = currentLines(st);
			int cur = stageTracker.cursor();
			boolean manual = lines != null && StageTracker.needsManualStep(lines, cur);
			StepGuide.StageView sv = v == null ? null : v.getStage();
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(now, target == null ? null : target.getStepId(),
				st == null ? null : stageTracker.key(), cur, lines == null ? 0 : lines.size(), manual, stageTracker.peeking(), stageTracker.warning() != null,
				p.getX(), p.getY(), p.getPlane(), carried.fingerprint(), hudOnScreen, guideOnScreen, st != null && questDone(target),
				sv != null && sv.isFinished(), client.getGameState() == GameState.LOGGED_IN);
			for (EngineWatchdog.Finding f : watchdog.observe(o))
			{
				if (t.anomaly(f.getCode(), f.getKey(), f.getMessage(), "step", target == null ? null : target.getStepId()) && config.telemetryShots())
				{
					takeShot("anomaly_" + f.getCode());
				}
			}
		}
		if (debugVisible)
		{
			debugState = buildDebugState();
		}
	}

	private List<ActiveTarget.StageLine> currentLines(ActiveTarget.Stage st)
	{
		Integer value = st == null ? null : stageValue(st);
		return value == null ? null : st.getStages().get(st.indexFor(value)).getSteps();
	}

	/** Состояние движка для плашки разработчика и для скриншота. Поток клиента. */
	private DebugView.State buildDebugState()
	{
		ActiveTarget.Stage st = stageOf(target);
		Integer value = st == null ? null : stageValue(st);
		List<ActiveTarget.StageLine> lines = currentLines(st);
		int cur = stageTracker.cursor();
		ActiveTarget.StageLine line = lines == null || lines.isEmpty() ? null : lines.get(Math.max(0, Math.min(cur, lines.size() - 1)));
		ItemCounts bag = ItemCounts.sum(carried, noted);
		List<String> conditions = new ArrayList<>();
		if (line != null && line.hasHas())
		{
			conditions.add("has " + line.getHas() + " = " + (bag.count(null, line.getHas()) > 0 ? "TRUE" : "FALSE"));
		}
		if (line != null && line.hasNeed())
		{
			conditions.add("need " + line.getNeed() + " (сдан) = " + (stageTracker.delivered() ? "TRUE" : "FALSE"));
		}
		int queue = -1;
		PrepPlan pp = prep;
		if (pp != null && pp.getLines() != null && target != null && pp.getStepId().equals(target.getStepId()))
		{
			queue = (int) pp.getLines().stream().filter(l -> "NOW".equals(l.getTiming()) && ("MISSING".equals(l.getWhere()) || "BANK".equals(l.getWhere()))).count();
		}
		long now = System.currentTimeMillis();
		Player me = client.getLocalPlayer();
		WorldPoint p = me == null ? null : me.getWorldLocation();
		int used = 0;
		ItemContainer inv = client.getItemContainer(InventoryID.INV);
		if (inv != null)
		{
			for (Item it : inv.getItems())
			{
				if (it.getId() > 0 && it.getQuantity() > 0)
				{
					used++;
				}
			}
		}
		List<String> an = new ArrayList<>();
		Telemetry t = telemetry;
		if (t != null)
		{
			Map<String, Object> sum = t.summary(0);
			@SuppressWarnings("unchecked")
			List<Map<String, Object>> recent = (List<Map<String, Object>>) sum.get("recentAnomalies");
			for (int i = Math.max(0, recent.size() - 3); i < recent.size(); i++)
			{
				an.add(recent.get(i).get("code") + ": " + recent.get(i).get("message"));
			}
		}
		return new DebugView.State(target == null ? null : target.getStepId(),
			st == null || value == null ? null : (st.indexFor(value) + 1) + "/" + st.getStages().size(), value, cur, lines == null ? 0 : lines.size(),
			line == null ? null : line.shown(), lines != null && StageTracker.needsManualStep(lines, cur), stageTracker.peeking(), stageTracker.warning(),
			conditions, completion == null ? new ArrayList<>() : completion.describe(), queue,
			lastSnapshotAt == 0 ? null : "seq " + lastSnapshotSeq + ", " + Math.max(0, (now - lastSnapshotAt) / 1000) + " с назад", planPercent,
			stageTracker.reason(), used + "/28", p == null ? "—" : p.getX() + "," + p.getY() + "," + p.getPlane(), tickCount, hudOnScreen, guideOnScreen,
			t != null, t == null || t.file() == null ? null : t.file().getName(), t == null ? 0 : t.events(), t == null ? 0 : t.anomalyCount(), an,
			lastShotName);
	}

	// ---------- Снимок состояния от программы (протокол 6) ----------

	/** Номер последнего применённого снимка: запоздавший, более старый, отбрасывается. */
	private final Object snapshotLock = new Object();
	private long lastSnapshot = -1;
	/** Шаг последнего снимка (JSON): тот же шаг не перезапускает цель и стрелку. null — шаг не из снимка или снят. */
	private String snapshotStepKey;
	/** План подготовки от программы; null — не присылала. Рисует его список «Что нужно». */
	private volatile PrepPlan prep;

	@Override
	public BridgeServer.PrepResult onPrepPlan(PrepEnvelope e, Map<String, String> bad)
	{
		synchronized (snapshotLock)
		{
			if (e.getSeq() <= lastSnapshot)
			{
				tel("snapshot", "seq", e.getSeq(), "stale", true);
				return new BridgeServer.PrepResult(true, Collections.emptyMap());
			}
			lastSnapshot = e.getSeq();
		}
		// Часть, которую игрок выключил в настройках плагина, не применяется — остальные применяются.
		Map<String, String> refused = new LinkedHashMap<>();
		GearHint hint = e.getGearHint();
		if (!bad.containsKey(PrepEnvelope.GEAR_HINT) && hint != null && !hint.isClear() && !config.upgradeRouter())
		{
			refused.put(PrepEnvelope.GEAR_HINT, "подсказки апгрейда выключены в настройках плагина OSRS Path Bridge");
		}
		if (!bad.containsKey(PrepEnvelope.BANK_TAGS) && e.getBankTags() != null && !config.bankTagsHelper())
		{
			refused.put(PrepEnvelope.BANK_TAGS, "предметы этапа из приложения выключены в настройках плагина OSRS Path Bridge");
		}
		lastSnapshotAt = System.currentTimeMillis();
		lastSnapshotSeq = e.getSeq();
		planPercent = e.getPlan() == null || e.getPlan().getScore() == null ? null : e.getPlan().getScore().getPercent();
		Map<String, String> allRejected = new LinkedHashMap<>(bad);
		allRejected.putAll(refused);
		tel("snapshot", "seq", e.getSeq(), "step", e.getStep() == null ? null : e.getStep().getStepId(), "plan", e.getPlan() != null, "percent", planPercent,
			"shopping", e.getShopping() != null, "bankTags", e.getBankTags() != null, "gearHint", e.getGearHint() != null, "rejected", allRejected.isEmpty() ? null : allRejected);
		Telemetry t = telemetry;
		if (t != null)
		{
			for (Map.Entry<String, String> r : bad.entrySet())
			{
				t.anomaly("SNAPSHOT_REJECT", r.getKey(), "Часть снимка «" + r.getKey() + "» отклонена: " + r.getValue());
			}
		}
		clientThread.invokeLater(() -> applySnapshot(e, bad, refused));
		return new BridgeServer.PrepResult(false, refused);
	}

	/**
	 * Применить снимок целиком за один проход клиентского потока. Негодные и выключенные части не трогаем — остаётся
	 * прежнее; остальные заменяются, а чего в снимке нет — снимается (снимок полный).
	 */
	private void applySnapshot(PrepEnvelope e, Map<String, String> bad, Map<String, String> refused)
	{
		if (!bad.containsKey(PrepEnvelope.STEP))
		{
			ActiveTarget t = e.getStep();
			if (t == null)
			{
				if (target != null || navTarget != null)
				{
					if (navTarget != null)
					{
						finishNav("cleared");
					}
					applyTarget(null);
				}
				snapshotStepKey = null;
			}
			else if (!Objects.equals(e.getStepKey(), snapshotStepKey) || target == null)
			{
				applyTarget(t);
				snapshotStepKey = e.getStepKey();
			}
		}
		if (!bad.containsKey(PrepEnvelope.SHOPPING))
		{
			ShoppingPlan p = e.getShopping();
			plan = p == null || p.getItems().isEmpty() ? null : p;
			recomputeShopping();
			ownedDirty = true;
		}
		if (!bad.containsKey(PrepEnvelope.BANK_TAGS) && !refused.containsKey(PrepEnvelope.BANK_TAGS))
		{
			bankTagIds = e.getBankTags() == null ? Collections.emptySet() : e.getBankTags().getIdSet();
		}
		if (!bad.containsKey(PrepEnvelope.GEAR_HINT) && !refused.containsKey(PrepEnvelope.GEAR_HINT))
		{
			GearHint h = e.getGearHint();
			gearHint = h == null || h.isClear() ? null : h;
			ownedDirty = true;
		}
		if (!bad.containsKey(PrepEnvelope.PLAN))
		{
			prep = e.getPlan();
		}
		updateHud();
	}

	/** Предмет из совета по снаряжению — подсветить в сумке и банке. name — ключ ActiveTarget.nameKey. */
	boolean isUpgradeItem(String name)
	{
		GearHint h = gearHint;
		return h != null && config.upgradeRouter() && h.getHighlightSet().contains(name);
	}

	boolean hasUpgradeItems()
	{
		GearHint h = gearHint;
		return h != null && config.upgradeRouter() && !h.getHighlightSet().isEmpty();
	}

	@Override
	public String onBankTags(BankTags t)
	{
		if (!config.bankTagsHelper())
		{
			return "предметы этапа из приложения выключены в настройках плагина OSRS Path Bridge";
		}
		bankTagIds = t.getIdSet();
		return null;
	}

	/** Нужен ли предмет этапу — для мягкой рамки в банке. */
	boolean isBankTagged(int itemId)
	{
		return bankTagIds.contains(itemId);
	}

	@Override
	public void onShoppingPlan(ShoppingPlan p)
	{
		clientThread.invokeLater(() ->
		{
			plan = p.getItems().isEmpty() ? null : p;
			recomputeShopping();
			ownedDirty = true;
		});
	}

	/** Предметы текущего шага, которые уже были в сумке: отданные Hetty или использованные не просятся в сумку снова. */
	private final Set<String> gotItems = new HashSet<>();
	private String gotStep;

	private void applyTarget(ActiveTarget t)
	{
		String stepId = t == null ? null : t.getStepId();
		tel("step", "stepId", stepId, "title", t == null ? null : t.getTitle(), "goal", t == null ? null : t.getGoal(),
			"stage", t != null && stageOf(t) != null);
		if (!Objects.equals(stepId, gotStep))
		{
			gotItems.clear();
			gotStep = stepId;
			stageKey = null;
		}
		target = t;
		snapshotStepKey = null;
		guideMessage = null;
		if (completion != null)
		{
			completion.setTarget(t);
		}
		List<ActiveTarget.WorldPointDto> waypoints = t == null ? null : t.getPathWaypoints();
		breadcrumbs = waypoints == null || waypoints.isEmpty() ? null : new Navigation.Breadcrumbs(waypoints);
		near = false;
		lastPosition = null;
		Player me = client.getLocalPlayer();
		if (breadcrumbs != null && me != null)
		{
			WorldPoint pos = me.getWorldLocation();
			breadcrumbs.update(pos.getX(), pos.getY(), pos.getPlane());
		}
		rescan();
		recomputeChecklist();
		ownedDirty = true;
		setupPacing();
		updateNavigation();
		updateHud();
	}

	// ---------- Что нужно и куда: список в игре и боковая панель ----------

	/** Пересчитать вид (поток клиента): его рисует список в игре, а панели он уходит, только если изменился. */
	private void refreshGuide()
	{
		ActiveTarget.Stage stage = stageOf(target);
		trackStageCursor(stage);
		String stageNow = stage == null ? null : stageTracker.key() + "|" + questDone(target);
		if (!Objects.equals(stageNow, checklistStage))
		{
			// Этап сменился (или квест сдан): проверка вылета и строка «Сумка» считаются по предметам нового этапа.
			checklistStage = stageNow;
			recomputeChecklist();
			updateHud();
		}
		followStage();
		NavTarget n = navTarget;
		StepGuide.View v = StepGuide.view(target, ItemCounts.sum(carried, noted), bank,
			n == null ? null : n.getLabel(), n == null ? 0 : n.getX(), n == null ? 0 : n.getY(), n == null ? 0 : n.getPlane(), gotItems,
			stage == null ? null : stageValue(stage), stage != null && questDone(target), stageTracker.cursor());
		if (v.getStage() != null)
		{
			v = v.withStage(v.getStage().with(stageTracker.warning(), stageTracker.peeking(), stageTracker.canStepForward(v.getStage().getSteps())));
		}
		v = StepGuide.withPlanFor(v, prep, target);
		if (guideMessage != null)
		{
			v = v.withNote(guideMessage);
		}
		guideView = v;
		OsrsPathPanel p = panel;
		if (p == null || v.equals(panelView))
		{
			return;
		}
		panelView = v;
		StepGuide.View shown = v;
		SwingUtilities.invokeLater(() -> p.show(shown));
	}

	// ---------- Этапы квеста ----------

	/**
	 * Текущий шаг этапа и всё, что его двигает: положение игрока, предметы шага (has, need), клики «сделано» и «назад».
	 * Считается заново каждый тик (StageTracker.update) — не один раз, как раньше.
	 */
	private final StageTracker stageTracker = new StageTracker();

	/** Пересчитать текущий шаг этапа по положению игрока и предметам. Поток клиента. */
	private void trackStageCursor(ActiveTarget.Stage st)
	{
		if (st == null)
		{
			stageTracker.reset();
			return;
		}
		Integer value = stageValue(st);
		if (value == null)
		{
			return;
		}
		int idx = st.indexFor(value);
		Player me = client.getLocalPlayer();
		if (me == null)
		{
			return;
		}
		WorldPoint pos = me.getWorldLocation();
		List<ActiveTarget.StageLine> lines = st.getStages().get(idx).getSteps();
		stageTracker.update(target.getStepId(), idx, lines, pos.getX(), pos.getY(), pos.getPlane(), ItemCounts.sum(carried, noted));
		logStage(st, idx, value, lines, pos);
	}

	/** Журнал: вход в этап, смена переменной квеста, куда и почему сдвинулся курсор, предупреждения. */
	private void logStage(ActiveTarget.Stage st, int idx, int value, List<ActiveTarget.StageLine> lines, WorldPoint pos)
	{
		if (telemetry == null)
		{
			return;
		}
		try
		{
			logStageUnsafe(st, idx, value, lines, pos);
		}
		catch (RuntimeException ex)
		{
			log.debug("Этап не записан в журнал: {}", ex.toString());
		}
	}

	private void logStageUnsafe(ActiveTarget.Stage st, int idx, int value, List<ActiveTarget.StageLine> lines, WorldPoint pos)
	{
		String key = stageTracker.key();
		int cur = stageTracker.cursor();
		ActiveTarget.StageLine line = lines.isEmpty() ? null : lines.get(Math.max(0, Math.min(cur, lines.size() - 1)));
		int[] at = {pos.getX(), pos.getY(), pos.getPlane()};
		if (!Objects.equals(lastStageVar, value))
		{
			tel("var", "id", st.getId(), "what", st.isVarp() ? "varp" : "varbit", "from", lastStageVar, "to", value, "step", target.getStepId());
			lastStageVar = value;
		}
		if (!Objects.equals(key, lastStageKey))
		{
			lastStageKey = key;
			lastStageCursor = cur;
			tel("stage", "event", "enter", "key", key, "stage", idx + 1, "of", st.getStages().size(), "cursor", cur + 1, "size", lines.size(),
				"line", line == null ? null : line.shown(), "reason", stageTracker.reason(), "pos", at);
		}
		else if (cur != lastStageCursor)
		{
			tel("stage", "event", "cursor", "key", key, "from", lastStageCursor + 1, "to", cur + 1, "size", lines.size(), "line", line == null ? null : line.shown(),
				"reason", stageTracker.reason(), "pos", at, "manual", StageTracker.needsManualStep(lines, cur));
			lastStageCursor = cur;
		}
		String warning = stageTracker.warning();
		if (!Objects.equals(warning, lastWarning))
		{
			lastWarning = warning;
			if (warning != null)
			{
				tel("warning", "text", warning, "cursor", cur + 1);
			}
		}
	}

	/** Какой этап показан и ведёт ли к нему стрелка: ключ «шаг#этап»; смена ключа — стрелка к новому этапу. */
	private String stageKey;
	/** Стрелку поставил этап, а не игрок: дошёл — она остаётся у NPC (не прыгает назад к шагу), пока этап не сменится. */
	private boolean navSticky;

	private static ActiveTarget.Stage stageOf(ActiveTarget t)
	{
		return t == null || t.getGuide() == null ? null : t.getGuide().getStage();
	}

	/** Значение переменной квеста; null — не в игре. Поток клиента. */
	private Integer stageValue(ActiveTarget.Stage st)
	{
		if (client.getGameState() != GameState.LOGGED_IN)
		{
			return null;
		}
		return st.isVarp() ? client.getVarpValue(st.getId()) : client.getVarbitValue(st.getId());
	}

	/** Квест шага пройден по данным игры (шаг с триггером «квест пройден»). */
	private boolean questDone(ActiveTarget t)
	{
		ActiveTarget.Trigger trig = t == null ? null : t.getCompletionTrigger();
		if (trig == null || trig.getQuestName() == null || client.getGameState() != GameState.LOGGED_IN)
		{
			return false;
		}
		return Boolean.TRUE.equals(isQuestFinished(trig.getQuestName()));
	}

	/**
	 * Этап квеста сменился (или шаг только что показали) — стрелка и маршрут к NPC нового этапа. Своя цель игрока
	 * (клик по месту) не трогается, пока этап прежний. Квест пройден — стрелка этапа снимается.
	 */
	private void followStage()
	{
		ActiveTarget t = target;
		ActiveTarget.Stage st = stageOf(t);
		if (st == null)
		{
			stageKey = null;
			return;
		}
		Integer value = stageValue(st);
		if (value == null)
		{
			return;
		}
		boolean done = questDone(t);
		int idx = st.indexFor(value);
		List<ActiveTarget.StageLine> lines = st.getStages().get(idx).getSteps();
		// Стрелка идёт за текущим шагом этапа, если у него есть клетка; нет — к точке этапа.
		int cursor = Math.max(0, Math.min(stageTracker.cursor(), lines.size() - 1));
		ActiveTarget.StageLine now = done || lines.isEmpty() ? null : lines.get(cursor);
		boolean byStep = now != null && now.hasPoint();
		String stageOnly = t.getStepId() + "#" + (done ? "done" : String.valueOf(idx));
		String key = byStep ? stageOnly + "@" + cursor : stageOnly;
		if (key.equals(stageKey))
		{
			return;
		}
		boolean sameStage = stageKey != null && stageKey.startsWith(stageOnly) && (stageKey.length() == stageOnly.length() || stageKey.charAt(stageOnly.length()) == '@');
		stageKey = key;
		if (done)
		{
			if (navSticky)
			{
				applyNav(null);
			}
			return;
		}
		if (!config.stageFollow() || !config.autoNavigation())
		{
			return;
		}
		if (sameStage && navTarget != null && !navSticky)
		{
			// Шаг сменился, а стрелку к своему месту поставил игрок — не трогаем.
			return;
		}
		Integer go = st.getStages().get(idx).getGo();
		NavTarget n = byStep ? StepGuide.navToLine(t, now) : go == null ? null : StepGuide.navTo(t, go);
		if (n == null && go != null)
		{
			n = StepGuide.navTo(t, go);
		}
		if (n != null)
		{
			applyNav(n);
			navSticky = true;
		}
	}

	/** Клик по списку в игре (поток клиента). */
	private void guideAction(GuideList.Action a)
	{
		tel("click", "what", a.getKind().name(), "place", a.getKind() == GuideList.Kind.PLACE ? a.getPlace() : null,
			"cursor", stageTracker.cursor() + 1, "step", target == null ? null : target.getStepId());
		switch (a.getKind())
		{
			case TOGGLE:
				configManager.setConfiguration(OsrsPathBridgeConfig.GROUP, "guideCollapsed", !config.guideCollapsed());
				break;
			case PLACE:
				goToPlace(a.getPlace());
				break;
			case BACK:
				applyNav(null);
				break;
			case PREV:
				// Вперёд по клику нельзя: курсор ведут факты в игре. Назад — посмотреть прежний шаг.
				stageTracker.back();
				refreshGuide();
				break;
			case RESUME:
				stageTracker.resume();
				refreshGuide();
				break;
			case NEXT:
			{
				// Только шаг, который игра сама не видит (подряд на одном месте); остальные пропустить нельзя.
				ActiveTarget.Stage st = stageOf(target);
				Integer value = st == null ? null : stageValue(st);
				if (value != null && stageTracker.forward(st.getStages().get(st.indexFor(value)).getSteps()))
				{
					refreshGuide();
				}
				break;
			}
			default:
				break;
		}
	}

	/** «Путь сюда»: временная цель к точке шага — стрелка, Shortest Path и подсветка NPC точки. */
	private void goToPlace(int index)
	{
		ActiveTarget t = target;
		NavTarget n = StepGuide.navTo(t, index);
		if (n == null)
		{
			return;
		}
		if (!config.autoNavigation())
		{
			guideMessage = "Навигация к местам выключена: RuneLite → OSRS Path Bridge → «Стрелка к местам».";
			refreshGuide();
			return;
		}
		guideMessage = null;
		applyNav(n);
	}

	// ---------- Временная цель: место с карты или магазин ----------

	private void applyNav(NavTarget t)
	{
		navSticky = false;
		if (t == null)
		{
			if (navTarget != null)
			{
				finishNav("cleared");
			}
			return;
		}
		navTarget = t;
		tel("nav", "event", "set", "label", t.getLabel(), "x", t.getX(), "y", t.getY(), "plane", t.getPlane(), "purchase", t.isPurchase());
		near = false;
		lastPosition = null;
		scanNavNpcs();
		if (server != null)
		{
			// Программа узнаёт цель, даже если её выбрали в игре (список «Что нужно», панель), — и показывает ту же.
			server.navSet(t);
		}
		if (t.isPurchase() && hasNavItem())
		{
			// Предмет уже есть — вести некуда.
			finishNav("obtained");
			return;
		}
		updateNavigation();
		updateHud();
	}

	/** Снять временную цель: стрелка и HUD возвращаются к шагу, приложение узнаёт почему. */
	private void finishNav(String reason)
	{
		NavTarget done = navTarget;
		tel("nav", "event", "done", "reason", reason, "label", done == null ? null : done.getLabel());
		navSticky = false;
		navTarget = null;
		navNpcs.clear();
		near = false;
		lastPosition = null;
		if (server != null && done != null)
		{
			server.navDone(reason, done);
		}
		updateNavigation();
		updateHud();
	}

	private boolean hasNavItem()
	{
		NavTarget t = navTarget;
		return t != null && t.isPurchase() && carried.count(t.getItemId(), t.getItemName()) > 0;
	}

	/** Дошёл до места (для цели без предмета): та же клетка этажа, не дальше трёх клеток. */
	private boolean arrived(WorldPoint pos)
	{
		NavTarget t = navTarget;
		return t != null && !navSticky && !t.isPurchase() && pos.getPlane() == t.getPlane()
			&& DangerRadar.distanceSq(pos.getX(), pos.getY(), t.getX(), t.getY()) <= NAV_ARRIVED * NAV_ARRIVED;
	}

	private boolean navMatches(NPC npc)
	{
		NavTarget t = navTarget;
		if (t == null || npc == null || t.getNpcNameSet().isEmpty())
		{
			return false;
		}
		NPCComposition c = npc.getTransformedComposition();
		String name = c != null ? c.getName() : npc.getName();
		return name != null && t.getNpcNameSet().contains(ActiveTarget.nameKey(name));
	}

	private void scanNavNpcs()
	{
		navNpcs.clear();
		if (navTarget == null || navTarget.getNpcNameSet().isEmpty() || client.getGameState() != GameState.LOGGED_IN)
		{
			return;
		}
		for (NPC npc : client.getTopLevelWorldView().npcs())
		{
			if (navMatches(npc))
			{
				navNpcs.add(npc);
			}
		}
	}

	// ---------- Радар опасности ----------

	private static boolean warned(DangerRadar.Reading r)
	{
		return r.getLevel() == DangerRadar.Level.WARNING || r.getLevel() == DangerRadar.Level.INSIDE;
	}

	/** Новая клетка игрока: какая зона рядом, звук при входе, опасные NPC — только в зоне предупреждения. */
	private void updateDanger(WorldPoint pos)
	{
		if (!config.dangerRadar() || radar == null)
		{
			danger = DangerRadar.QUIET;
			dangerNpcs.clear();
			return;
		}
		DangerRadar.Reading before = danger;
		danger = radar.update(pos.getX(), pos.getY(), pos.getPlane());
		if (!warned(danger))
		{
			dangerNpcs.clear();
		}
		else if (!warned(before) || before.getZone() != danger.getZone())
		{
			scanDangerNpcs();
		}
		if (danger.isEntered() && config.dangerSound())
		{
			client.playSoundEffect(SoundEffectID.PRAYER_DEPLETE_TWINKLE);
		}
	}

	private boolean dangerMatches(NPC npc)
	{
		DangerRadar.Zone zone = danger.getZone();
		if (zone == null || npc == null || !warned(danger) || zone.getNpcNameSet().isEmpty())
		{
			return false;
		}
		NPCComposition c = npc.getTransformedComposition();
		String name = c != null ? c.getName() : npc.getName();
		return name != null && zone.getNpcNameSet().contains(ActiveTarget.nameKey(name));
	}

	private void scanDangerNpcs()
	{
		dangerNpcs.clear();
		if (client.getGameState() != GameState.LOGGED_IN)
		{
			return;
		}
		for (NPC npc : client.getTopLevelWorldView().npcs())
		{
			if (dangerMatches(npc))
			{
				dangerNpcs.add(npc);
			}
		}
	}

	// ---------- Темп прокачки ----------

	/** Темп шага заново: новый шаг, включили настройку или сменился персонаж. */
	private void setupPacing()
	{
		ActiveTarget.Pacing p = target == null ? null : target.getPacing();
		pacing = p == null || !config.smartPacing() ? null : new PacingSet(p);
		if (pacing != null && client.getGameState() == GameState.LOGGED_IN)
		{
			readPacingXp();
		}
		pacingDirty = true;
	}

	/** Опыт всех навыков темпа из клиента: при входе в игру и при новом шаге. */
	private void readPacingXp()
	{
		long now = System.currentTimeMillis();
		for (String skill : pacing.skills())
		{
			pacing.update(skill, client.getSkillExperience(ActiveTarget.skillOf(skill)), now);
		}
	}

	private Map<String, Object> pacingReport()
	{
		if (pacing == null || !pacing.hasXp())
		{
			return null;
		}
		PacingTracker.Snapshot s = pacing.snapshot();
		ActiveTarget.Pacing p = pacing.getPacing();
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("skill", pacing.getActive());
		m.put("targetLevel", p.getTargetLevel());
		m.put("targetExp", p.getTargetExp());
		m.put("xp", s.getXp());
		m.put("remainingXp", s.getRemainingXp());
		m.put("actionsLeft", s.getActionsLeft());
		m.put("actionsPerMinute", s.getActionsPerMinute() == null ? null : Math.round(s.getActionsPerMinute() * 10) / 10.0);
		m.put("etaSeconds", s.getEtaSeconds());
		m.put("estimated", s.isEstimated());
		m.put("almost", s.isAlmost());
		m.put("done", s.isDone());
		// Бой: какие навыки шага ещё не дошли до цели, кроме показанного.
		if (pacing.skills().size() > 1)
		{
			m.put("left", pacing.left());
		}
		return m;
	}

	// ---------- Снаряжение и монеты для подсказки апгрейда ----------

	/** Надетое, сумка и монеты. null — не в игре или подсказки апгрейда выключены; контейнер не пришёл — его поле null. */
	private Map<String, Object> gearReport()
	{
		if (!config.upgradeRouter() || client.getGameState() != GameState.LOGGED_IN)
		{
			return null;
		}
		ItemContainer worn = client.getItemContainer(InventoryID.WORN);
		ItemContainer bag = client.getItemContainer(InventoryID.INV);
		List<Map<String, Object>> equipment = null;
		if (worn != null)
		{
			equipment = new ArrayList<>();
			Item[] items = worn.getItems();
			for (int i = 0; i < items.length; i++)
			{
				Item it = items[i];
				if (it.getId() > 0 && it.getQuantity() > 0)
				{
					Map<String, Object> row = itemRow(it.getId(), null);
					String slot = slotName(i);
					if (slot != null)
					{
						row.put("slot", slot);
					}
					equipment.add(row);
				}
			}
		}
		List<Map<String, Object>> inventory = null;
		int coins = 0;
		// Занятых ячеек сумки: предметы в списке сложены по ID, а подготовке нужно знать, влезет ли ещё что-то.
		int slotsUsed = 0;
		if (bag != null)
		{
			Map<Integer, Integer> stacks = new LinkedHashMap<>();
			for (Item it : bag.getItems())
			{
				if (it.getId() > 0 && it.getQuantity() > 0)
				{
					stacks.merge(it.getId(), it.getQuantity(), Integer::sum);
					slotsUsed++;
				}
			}
			inventory = new ArrayList<>();
			for (Map.Entry<Integer, Integer> e : stacks.entrySet())
			{
				inventory.add(itemRow(e.getKey(), e.getValue()));
			}
			coins = stacks.getOrDefault(ItemID.COINS, 0);
		}
		Map<String, Object> g = new LinkedHashMap<>();
		g.put("equipment", equipment);
		g.put("inventory", inventory);
		g.put("coins", bag == null ? null : coins);
		g.put("inventorySlots", bag == null ? null : slotsUsed);
		// Вес сумки и надетого — как в игре (client.getWeight): от него зависит, как быстро тает бег.
		g.put("weight", bag == null ? null : client.getWeight());
		g.put("bankCoins", bank == null ? null : bank.count(ItemID.COINS, "Coins"));
		// Оценка предметов по ценам биржи (без монет): в сумке и на себе — и в банке, если его открывали.
		// Это не деньги, а сколько выручишь, продав: приложение показывает её отдельно от монет, с «~».
		IntUnaryOperator price = this::itemPrice;
		g.put("carriedValue", carried.value(price, ItemID.COINS) + noted.value(price, ItemID.COINS));
		g.put("bankValue", bank == null ? null : bank.value(price, ItemID.COINS));
		return g;
	}

	private java.lang.reflect.Method priceMethod;
	private boolean priceBroken;

	/**
	 * Цена предмета на бирже. В RuneLite 1.13 getItemPrice(int) вернул long вместо int — вызов, собранный под 1.12,
	 * падал с NoSuchMethodError и ронял плагин при входе в игру. Метод ищется по имени, результат — любое число;
	 * любая ошибка — цена 0 (оценка предметов необязательна), клиент не страдает.
	 */
	private int itemPrice(int id)
	{
		if (priceBroken)
		{
			return 0;
		}
		try
		{
			if (priceMethod == null)
			{
				priceMethod = ItemManager.class.getMethod("getItemPrice", int.class);
			}
			Object r = priceMethod.invoke(itemManager, id);
			long v = r instanceof Number ? ((Number) r).longValue() : 0;
			return (int) Math.max(0, Math.min(Integer.MAX_VALUE, v));
		}
		catch (Throwable t)
		{
			priceBroken = true;
			log.warn("OSRS Path Bridge: цены предметов недоступны в этой версии RuneLite — оценка предметов отключена", t);
			return 0;
		}
	}

	/** Слот по номеру ячейки надетого: weapon, head, amulet… (EquipmentInventorySlot). null — неизвестная ячейка. */
	static String slotName(int index)
	{
		for (EquipmentInventorySlot s : EquipmentInventorySlot.values())
		{
			if (s.getSlotIdx() == index)
			{
				return s.name().toLowerCase(Locale.ROOT);
			}
		}
		return null;
	}

	private Map<String, Object> itemRow(int id, Integer count)
	{
		Map<String, Object> row = new LinkedHashMap<>();
		row.put("id", id);
		ItemComposition c = itemManager.getItemComposition(id);
		row.put("name", c == null ? "" : c.getName());
		if (count != null)
		{
			row.put("count", count);
		}
		return row;
	}

	// ---------- Куда идти: стрелка, Shortest Path, HUD ----------

	/** Для большой стрелки: текущая точка пути, пока игрок в игре; null — стрелку не рисовать. */
	WorldPoint arrowTarget()
	{
		return client.getGameState() == GameState.LOGGED_IN ? navTarget() : null;
	}

	/** «✓ Рядом» из HUD — с той же защитой от мигания на границе. */
	boolean isNavNear()
	{
		return near;
	}

	/**
	 * Текущая точка пути: временная цель, иначе следующая путевая точка или точка шага.
	 * null — идти некуда или маршрут пройден.
	 */
	private WorldPoint navTarget()
	{
		if (navTarget != null)
		{
			return new WorldPoint(navTarget.getX(), navTarget.getY(), navTarget.getPlane());
		}
		ActiveTarget.WorldPointDto p = stepPoint();
		return p == null ? null : new WorldPoint(p.getX(), p.getY(), p.getPlane());
	}

	/** Точка шага без временной цели: текущая путевая точка или точка шага. null — шага нет или маршрут пройден. */
	private ActiveTarget.WorldPointDto stepPoint()
	{
		if (target == null)
		{
			return null;
		}
		return breadcrumbs != null ? breadcrumbs.current() : target.getWorldPoint();
	}

	/**
	 * Стрелка игры и Shortest Path — к текущей точке пути. Вызывается при смене цели, точки или настроек,
	 * но не каждый кадр: путь Shortest Path считает сам, один раз на цель.
	 */
	private void updateNavigation()
	{
		WorldPoint nav = navTarget();
		boolean loggedIn = client.getGameState() == GameState.LOGGED_IN;
		// Стрелка: чужую (например, квестовую) не трогаем — только свою.
		if (nav == null || !config.hintArrow() || !loggedIn)
		{
			if (arrowSet)
			{
				client.clearHintArrow();
				arrowSet = false;
			}
		}
		else
		{
			client.setHintArrow(nav);
			arrowSet = true;
		}

		setMapPoint(loggedIn && config.worldMapMarker() ? nav : null, navLabel());

		boolean spActive = shortestPathActive();
		if (server != null)
		{
			server.setShortestPath(spActive);
		}
		if (nav != null && loggedIn && spActive && config.useShortestPath())
		{
			if (!nav.equals(pathSent))
			{
				Map<String, Object> data = new HashMap<>();
				data.put("target", nav);
				eventBus.post(new PluginMessage(SHORTEST_PATH_NS, "path", data));
				pathSent = nav;
			}
		}
		else if (pathSent != null)
		{
			// Очищаем только свой путь: если игрок сам задал цель в Shortest Path, мы её не прислали и не трогаем.
			eventBus.post(new PluginMessage(SHORTEST_PATH_NS, "clear"));
			pathSent = null;
		}
	}

	/** Подпись текущей цели для метки на карте: временная цель, точка маршрута, точка шага или название шага. */
	private String navLabel()
	{
		if (navTarget != null)
		{
			return navTarget.getLabel();
		}
		if (target == null)
		{
			return null;
		}
		// Та же точка, что у стрелки (stepPoint), — подпись метки не разойдётся с её местом.
		ActiveTarget.WorldPointDto p = stepPoint();
		if (p != null && p.getLabel() != null && !p.getLabel().isEmpty())
		{
			return p.getLabel();
		}
		return target.getGoal() != null && !target.getGoal().isEmpty() ? target.getGoal() : target.getTitle();
	}

	/** Метка на карте мира игры: одна, наша; другие метки (Shortest Path, квесты) не трогаем. */
	private void setMapPoint(WorldPoint at, String label)
	{
		String tooltip = at == null ? null : "OSRS Путь: " + (label == null ? "сюда ведёт стрелка" : label);
		if (mapPoint != null && at != null && at.equals(mapPoint.getWorldPoint()) && tooltip.equals(mapPoint.getTooltip()))
		{
			return;
		}
		if (mapPoint != null)
		{
			worldMapPointManager.remove(mapPoint);
			mapPoint = null;
		}
		if (at != null)
		{
			// Название — для меню игры, а в шрифте игры нет кириллицы.
			mapPoint = WorldMapPoint.builder().worldPoint(at).image(OsrsPathPanel.mapIcon()).tooltip(tooltip)
				.snapToEdge(true).jumpOnClick(true).name("OSRS Path").build();
			worldMapPointManager.add(mapPoint);
		}
	}

	private boolean shortestPathActive()
	{
		if (!shortestPathLooked)
		{
			shortestPath = pluginManager.getPlugins().stream()
				.filter(p -> SHORTEST_PATH_CLASS.equals(p.getClass().getName()))
				.findFirst().orElse(null);
			shortestPathLooked = true;
		}
		return shortestPath != null && pluginManager.isPluginActive(shortestPath);
	}

	/**
	 * Что показывать в игре сейчас: путь, шаг, банк или биржа ({@link SmartView}). Окна банка и биржи читаются здесь,
	 * в кадре, — так оверлеи не расходятся между собой.
	 */
	SmartView.Context overlayContext()
	{
		OsrsPathHudOverlay.State h = hud;
		return SmartView.of(
			InventoryCheckOverlay.visible(client.getWidget(InterfaceID.Bankmain.ITEMS_CONTAINER)),
			InventoryCheckOverlay.visible(client.getWidget(InterfaceID.GeOffers.UNIVERSE)),
			h == null ? -1 : h.getTiles());
	}

	private void updateHud()
	{
		refreshGuide();
		boolean dangerShown = SmartView.dangerVisible(config.smartOverlays(), danger.getLevel());
		GearHint h = gearHint;
		// Совет по снаряжению — пока не идём за покупкой (тогда заголовок и так «Купи …»).
		String upgrade = navTarget == null && h != null && h.getText() != null && config.upgradeRouter() ? h.getText() : null;
		if (target == null && navTarget == null && !dangerShown && upgrade == null)
		{
			hud = null;
			return;
		}
		String stepTitle = target == null ? null : "[" + target.getStepId() + "] " + (target.getTitle() == null ? "" : target.getTitle());
		String title;
		String goal;
		if (navTarget != null)
		{
			// Временная цель поверх шага: сначала она, шаг — строкой ниже, чтобы не потерялся.
			List<String> sellers = navTarget.getNpcNames();
			title = navTarget.isPurchase()
				? "Купи " + (navTarget.getItemName() != null ? navTarget.getItemName() : navTarget.getLabel())
					+ (sellers != null && !sellers.isEmpty() ? " у " + sellers.get(0) : "")
				: "К месту: " + navTarget.getLabel();
			goal = stepTitle == null ? null : "Потом — шаг " + stepTitle;
		}
		else if (target != null)
		{
			title = stepTitle;
			goal = target.getGoal();
			if (breadcrumbs != null)
			{
				ActiveTarget.WorldPointDto c = breadcrumbs.current();
				goal = c == null
					? "Маршрут пройден" + (goal != null ? " · " + goal : "")
					: "Точка " + (breadcrumbs.index() + 1) + "/" + breadcrumbs.size() + (c.getLabel() != null ? ": " + c.getLabel() : "");
			}
		}
		else
		{
			title = "OSRS Путь";
			goal = null;
		}
		String distance = null;
		int tiles = -1;
		WorldPoint nav = navTarget();
		Player me = client.getLocalPlayer();
		if (nav != null && me != null && client.getGameState() == GameState.LOGGED_IN)
		{
			WorldPoint pos = me.getWorldLocation();
			Navigation.Readout r = Navigation.readout(pos.getX(), pos.getY(), pos.getPlane(), nav.getX(), nav.getY(), nav.getPlane(), near);
			near = r.isNear();
			distance = r.getText();
			tiles = r.getTiles();
		}
		String bag = null;
		if (!checklist.getRows().isEmpty())
		{
			bag = checklist.isReady()
				? "Сумка готова к выходу"
				: Checklist.hudLine(checklist);
		}
		String pace = null;
		boolean paceGood = false;
		if (pacing != null && pacing.hasXp() && config.hudPacing())
		{
			PacingTracker.Snapshot s = pacing.snapshot();
			pace = pacing.hudLine(s);
			paceGood = s.isAlmost() || s.isDone();
		}
		String dangerText = dangerShown ? danger.getZone().hudText() : null;
		boolean inside = danger.getLevel() == DangerRadar.Level.INSIDE;
		int hp = client.getGameState() == GameState.LOGGED_IN ? client.getBoostedSkillLevel(Skill.HITPOINTS) : 0;
		int hpMax = client.getGameState() == GameState.LOGGED_IN ? client.getRealSkillLevel(Skill.HITPOINTS) : 0;
		String health = config.hudHealth() && target != null ? healthLine(hp, hpMax, target.getMaxHit()) : null;
		boolean critical = health != null && target.getMaxHit() != null && hp <= target.getMaxHit();
		hud = new OsrsPathHudOverlay.State(title, goal, distance, near, bag, checklist.isReady(), dangerText, inside, pace, paceGood, upgrade,
			health, critical, navTarget == null ? useLine(target, ItemCounts.sum(carried, noted)) : null, tiles);
	}

	/**
	 * Напоминание «Use X на Y» по первому действию шага, предмет которого уже в сумке. null — действий нет или
	 * предмета ещё нет (тогда сначала его надо получить, это показывает список «Что нужно»).
	 */
	static String useLine(ActiveTarget t, ItemCounts bag)
	{
		if (t == null || t.getUseOn() == null || bag == null)
		{
			return null;
		}
		for (ActiveTarget.UseOn u : t.getUseOn())
		{
			if (bag.count(null, u.getItem()) > 0)
			{
				return "Use " + u.getItem() + " на " + u.getTarget();
			}
		}
		return null;
	}

	/**
	 * Строка о здоровье: показывается, когда HP ниже двух максимальных ударов противника шага (по вики), а у игрока
	 * здоровье известно. null — всё в порядке, удар неизвестен или игрок не в игре.
	 */
	static String healthLine(int hp, int hpMax, Integer maxHit)
	{
		if (maxHit == null || hp <= 0 || hpMax <= 0 || hp >= 2 * maxHit)
		{
			return null;
		}
		return hp <= maxHit
			? "HP " + hp + "/" + hpMax + " — ЕШЬ СЕЙЧАС! Бьёт до " + maxHit
			: "HP " + hp + "/" + hpMax + " — пора есть. Бьёт до " + maxHit;
	}

	// ---------- Кого подсвечивать ----------

	private void rescan()
	{
		npcs.clear();
		objects.clear();
		if (target == null || client.getGameState() != GameState.LOGGED_IN)
		{
			return;
		}
		WorldView wv = client.getTopLevelWorldView();
		for (NPC npc : wv.npcs())
		{
			if (matches(npc))
			{
				npcs.add(npc);
			}
		}
		Scene scene = wv.getScene();
		Tile[][][] tiles = scene.getTiles();
		for (Tile[][] plane : tiles)
		{
			for (Tile[] column : plane)
			{
				for (Tile tile : column)
				{
					if (tile == null)
					{
						continue;
					}
					GameObject[] gameObjects = tile.getGameObjects();
					if (gameObjects != null)
					{
						for (GameObject o : gameObjects)
						{
							track(o);
						}
					}
					track(tile.getWallObject());
					track(tile.getDecorativeObject());
					track(tile.getGroundObject());
				}
			}
		}
	}

	private boolean matches(NPC npc)
	{
		if (target == null || npc == null)
		{
			return false;
		}
		if (target.getNpcIdSet().contains(npc.getId()))
		{
			return true;
		}
		NPCComposition c = npc.getTransformedComposition();
		String name = c != null ? c.getName() : npc.getName();
		return name != null && target.getNpcNameSet().contains(ActiveTarget.nameKey(name));
	}

	/** Имя объекта с учётом «двойников» (impostor): вид некоторых объектов зависит от прогресса квеста. */
	private String objectName(TileObject o)
	{
		ObjectComposition c = client.getObjectDefinition(o.getId());
		if (c == null)
		{
			return null;
		}
		if (c.getImpostorIds() != null)
		{
			ObjectComposition imp = c.getImpostor();
			if (imp != null)
			{
				c = imp;
			}
		}
		return c.getName();
	}

	private void track(TileObject o)
	{
		if (o == null || target == null)
		{
			return;
		}
		if (target.getObjectIdSet().isEmpty() && target.getObjectNameSet().isEmpty())
		{
			return;
		}
		String name = objectName(o);
		boolean byId = target.getObjectIdSet().contains(o.getId());
		boolean byName = name != null && target.getObjectNameSet().contains(ActiveTarget.nameKey(name));
		if (byId || byName)
		{
			objects.put(o, name == null ? "" : name);
		}
	}

	private void untrack(TileObject o)
	{
		objects.remove(o);
	}

	/** NPC появился или сменил облик: шага, временной цели или опасный — в свой список. */
	private void trackNpc(NPC npc)
	{
		if (matches(npc))
		{
			npcs.add(npc);
		}
		if (navMatches(npc))
		{
			navNpcs.add(npc);
		}
		if (dangerMatches(npc))
		{
			dangerNpcs.add(npc);
		}
	}

	private void untrackNpc(NPC npc)
	{
		npcs.remove(npc);
		navNpcs.remove(npc);
		dangerNpcs.remove(npc);
	}

	/**
	 * Мышь над списком «Что нужно»: верхним пунктом меню игры становится строка списка. Иначе игра пишет в левом
	 * верхнем углу действие того, что под плашкой («Chop down Yew tree»), и обводит его, будто клик уйдёт туда.
	 * Остальные пункты остаются: правый клик по-прежнему открывает меню игры. Текст — латиницей: шрифт игры
	 * не рисует кириллицу.
	 */
	@Subscribe
	public void onPostMenuSort(PostMenuSort e)
	{
		if (guideOverlay == null || client.isMenuOpen() || client.isWidgetSelected())
		{
			return;
		}
		net.runelite.api.Point m = client.getMouseCanvasPosition();
		GuideList.Action a = m == null ? null : guideOverlay.actionAt(new java.awt.Point(m.getX(), m.getY()));
		if (a == null || GuideMouse.windowUnderMouse(client.getMenu().getMenuEntries())
			|| GuideMouse.mapCovers(client.getWidget(net.runelite.api.gameval.InterfaceID.Worldmap.WINDOW), new java.awt.Point(m.getX(), m.getY())))
		{
			return;
		}
		client.getMenu().createMenuEntry(-1)
			.setOption(GuideMouse.menuOption(a))
			.setTarget("<col=ff9040>OSRS Path</col>")
			.setType(MenuAction.RUNELITE)
			.onClick(x -> guideAction(a));
	}

	@Subscribe
	public void onNpcSpawned(NpcSpawned e)
	{
		trackNpc(e.getNpc());
	}

	@Subscribe
	public void onNpcChanged(NpcChanged e)
	{
		untrackNpc(e.getNpc());
		trackNpc(e.getNpc());
	}

	@Subscribe
	public void onNpcDespawned(NpcDespawned e)
	{
		untrackNpc(e.getNpc());
	}

	@Subscribe
	public void onGameObjectSpawned(GameObjectSpawned e)
	{
		track(e.getGameObject());
	}

	@Subscribe
	public void onGameObjectDespawned(GameObjectDespawned e)
	{
		untrack(e.getGameObject());
	}

	@Subscribe
	public void onWallObjectSpawned(WallObjectSpawned e)
	{
		track(e.getWallObject());
	}

	@Subscribe
	public void onWallObjectDespawned(WallObjectDespawned e)
	{
		untrack(e.getWallObject());
	}

	@Subscribe
	public void onDecorativeObjectSpawned(DecorativeObjectSpawned e)
	{
		track(e.getDecorativeObject());
	}

	@Subscribe
	public void onDecorativeObjectDespawned(DecorativeObjectDespawned e)
	{
		untrack(e.getDecorativeObject());
	}

	@Subscribe
	public void onGroundObjectSpawned(GroundObjectSpawned e)
	{
		track(e.getGroundObject());
	}

	@Subscribe
	public void onGroundObjectDespawned(GroundObjectDespawned e)
	{
		untrack(e.getGroundObject());
	}

	@Subscribe
	public void onGameStateChanged(GameStateChanged e)
	{
		GameState state = e.getGameState();
		if (state == GameState.LOADING)
		{
			// Новая область: объекты придут заново событиями появления.
			objects.clear();
		}
		if (server != null && state != GameState.LOADING)
		{
			server.setInGame(state == GameState.LOGGED_IN);
		}
		if (state == GameState.LOGGED_IN)
		{
			updateHud();
		}
		else if (state == GameState.LOGIN_SCREEN || state == GameState.HOPPING)
		{
			npcs.clear();
			navNpcs.clear();
			dangerNpcs.clear();
			objects.clear();
			arrowSet = false;
			pathSent = null;
		}
		if (state == GameState.LOGIN_SCREEN)
		{
			// Другой персонаж — другие уровни, сумка, банк, опыт и место.
			stats.clear();
			statsDirty = true;
			xp.clear();
			xpDirty = true;
			questsSent = null;
			playerSent = null;
			if (server != null)
			{
				server.setQuests(null);
				server.setPlayer(null);
				server.setPos(null, null, null);
			}
			carried = ItemCounts.EMPTY;
			noted = ItemCounts.EMPTY;
			bank = null;
			radar.reset();
			danger = DangerRadar.QUIET;
			lastPosition = null;
			setupPacing();
			containersChanged();
		}
		if (state == GameState.LOGGED_IN)
		{
			if (pacing != null && !pacing.hasXp())
			{
				readPacingXp();
				pacingDirty = true;
			}
			gearDirty = true;
			updateNavigation();
		}
	}

	// ---------- Автоотметка ----------

	@Subscribe
	public void onActorDeath(ActorDeath e)
	{
		Player me = client.getLocalPlayer();
		if (me == null || e.getActor() != me || server == null || !config.shareStats())
		{
			return;
		}
		WorldPoint at = me.getWorldLocation();
		tel("moved", "what", "DEATH", "at", at == null ? null : new int[] {at.getX(), at.getY(), at.getPlane()});
		server.moved("DEATH", at == null ? null : new int[] {at.getX(), at.getY(), at.getPlane()}, null);
	}

	@Subscribe
	public void onGameTick(GameTick e)
	{
		if (completion != null && client.getGameState() == GameState.LOGGED_IN)
		{
			completion.onGameTick();
		}
		Player me = client.getLocalPlayer();
		if (me != null && client.getGameState() == GameState.LOGGED_IN)
		{
			shareAccount(me);
			WorldPoint pos = me.getWorldLocation();
			// Всё про место игрока — только когда он сменил клетку, а не каждый тик.
			if (!pos.equals(lastPosition))
			{
				WorldPoint before = lastPosition;
				lastPosition = pos;
				// Скачок на 20+ клеток за тик — телепорт или возрождение: программа включает режим восстановления.
				if (before != null && server != null && config.shareStats()
					&& MoveDetector.isJump(before.getX(), before.getY(), pos.getX(), pos.getY()))
				{
					tel("moved", "what", "TELEPORT", "from", new int[] {before.getX(), before.getY(), before.getPlane()}, "to", new int[] {pos.getX(), pos.getY(), pos.getPlane()});
					server.moved("TELEPORT", new int[] {before.getX(), before.getY(), before.getPlane()}, new int[] {pos.getX(), pos.getY(), pos.getPlane()});
				}
				if (server != null && config.shareStats())
				{
					server.setPos(pos.getX(), pos.getY(), pos.getPlane());
				}
				updateDanger(pos);
				if (arrived(pos))
				{
					finishNav("arrived");
				}
				else if (target != null && navTarget == null && breadcrumbs != null
					&& breadcrumbs.update(pos.getX(), pos.getY(), pos.getPlane()))
				{
					updateNavigation();
				}
				updateHud();
			}
			debugTick(me);
		}
		flush();
	}

	/** Уровни и предметы уходят в приложение не чаще раза за тик и только если что-то изменилось. */
	private void flush()
	{
		if (server == null)
		{
			return;
		}
		if (statsDirty)
		{
			statsDirty = false;
			server.setStats(config.shareStats() && !stats.isEmpty() ? stats : null);
		}
		if (xpDirty && (xp.isEmpty() || ++xpTicks >= XP_EVERY_TICKS))
		{
			xpDirty = false;
			xpTicks = 0;
			server.setXp(config.shareStats() && !xp.isEmpty() ? xp : null);
		}
		if (ownedDirty)
		{
			ownedDirty = false;
			server.owned(bank != null, ownedReport());
		}
		if (gearDirty)
		{
			gearDirty = false;
			server.setGear(gearReport());
		}
		if (pacingDirty)
		{
			pacingDirty = false;
			server.pacing(target == null ? null : target.getStepId(), pacingReport());
		}
	}

	/** Имя персонажа и завершённые квесты — программе, если передача данных включена. Поток клиента (onGameTick). */
	private void shareAccount(Player me)
	{
		if (server == null)
		{
			return;
		}
		boolean share = config.shareStats();
		String name = share ? me.getName() : null;
		if (!Objects.equals(name, playerSent))
		{
			playerSent = name;
			server.setPlayer(name);
		}
		if (!share)
		{
			if (questsSent != null)
			{
				questsSent = null;
				server.setQuests(null);
			}
			return;
		}
		if (questsSent == null || ++questTicks >= QUESTS_EVERY_TICKS)
		{
			questTicks = 0;
			List<String> done = completedQuests();
			if (!done.equals(questsSent))
			{
				questsSent = done;
				server.setQuests(done);
			}
		}
	}

	/** Названия квестов в состоянии FINISHED (так их называет и сама игра). */
	List<String> completedQuests()
	{
		List<String> done = new ArrayList<>();
		for (Quest quest : Quest.values())
		{
			if (quest.getState(client) == QuestState.FINISHED)
			{
				done.add(quest.getName());
			}
		}
		return done;
	}

	// ---------- Уровни ----------

	/** Общий уровень — не навык; в RuneLite он помечен устаревшим, поэтому сравниваем по имени. */
	static boolean isOverall(Skill skill)
	{
		return "OVERALL".equals(skill.name());
	}

	static String skillKey(Skill skill)
	{
		return skill.getName().toLowerCase(Locale.ROOT);
	}

	@Subscribe
	public void onStatChanged(StatChanged e)
	{
		if (isOverall(e.getSkill()))
		{
			return;
		}
		String key = skillKey(e.getSkill());
		Integer oldXp = xp.put(key, e.getXp());
		if (oldXp == null || oldXp != e.getXp())
		{
			xpDirty = true;
		}
		Integer old = stats.put(key, e.getLevel());
		if (old == null || old != e.getLevel())
		{
			statsDirty = true;
			if (completion != null)
			{
				completion.onStateChanged();
			}
		}
		if (e.getSkill() == Skill.HITPOINTS && target != null && target.getMaxHit() != null)
		{
			// Здоровье меняется каждый удар: строка о нём пересчитывается сразу, а не раз в игровой тик.
			updateHud();
		}
		if (pacing != null && pacing.tracks(key) && pacing.update(key, e.getXp(), System.currentTimeMillis()))
		{
			pacingDirty = true;
			updateHud();
		}
	}

	// ---------- Сумка, банк и биржа ----------

	@Subscribe
	public void onItemContainerChanged(ItemContainerChanged e)
	{
		int id = e.getContainerId();
		if (id == InventoryID.INV || id == InventoryID.WORN)
		{
			rebuildCarried();
		}
		else if (id == InventoryID.BANK)
		{
			ItemCounts b = new ItemCounts();
			count(e.getItemContainer(), b, null);
			bank = b;
			containersChanged();
		}
	}

	private void rebuildCarried()
	{
		ItemCounts c = new ItemCounts();
		ItemCounts n = new ItemCounts();
		count(client.getItemContainer(InventoryID.INV), c, n);
		count(client.getItemContainer(InventoryID.WORN), c, n);
		if (telemetry != null)
		{
			Map<String, Integer> delta = c.deltaFrom(lastBag);
			if (!delta.isEmpty() && delta.size() <= 24)
			{
				tel("bag", "delta", delta, "step", target == null ? null : target.getStepId());
			}
			lastBag = c;
		}
		carried = c;
		noted = n;
		containersChanged();
	}

	/** Раскладывает контейнер по счётчикам. Банкноты — в notes (как предмет, который они обозначают). */
	private void count(ItemContainer container, ItemCounts items, ItemCounts notes)
	{
		if (container == null)
		{
			return;
		}
		for (Item it : container.getItems())
		{
			if (it.getId() <= 0 || it.getQuantity() <= 0)
			{
				continue;
			}
			ItemComposition c = itemManager.getItemComposition(it.getId());
			if (c.getNote() != -1)
			{
				if (notes != null)
				{
					int real = c.getLinkedNoteId();
					notes.add(real, itemName(real), it.getQuantity());
				}
				continue;
			}
			items.add(it.getId(), itemName(it.getId()), it.getQuantity());
		}
	}

	private String itemName(int id)
	{
		return itemNames.computeIfAbsent(id, k -> ActiveTarget.nameKey(itemManager.getItemComposition(k).getName()));
	}

	private void containersChanged()
	{
		if (completion != null)
		{
			completion.onStateChanged();
		}
		recomputeChecklist();
		recomputeShopping();
		ownedDirty = true;
		gearDirty = true;
		if (hasNavItem())
		{
			// Купил или получил предмет апгрейда — временная цель снимается, шаг возвращается сам.
			finishNav("obtained");
			return;
		}
		updateHud();
	}

	/** Для какого этапа посчитана проверка вылета. */
	private String checklistStage;

	/** Предметы текущего этапа квеста; null — этапов нет или у этапа свой список не задан (тогда — предметы шага). */
	private List<ActiveTarget.GuideItem> stageItems()
	{
		ActiveTarget.Stage st = stageOf(target);
		Integer value = st == null ? null : stageValue(st);
		return value == null ? null : st.getStages().get(st.indexFor(value)).getItems();
	}

	private void recomputeChecklist()
	{
		// Квест сдан — предметы потрачены или отданы, «не хватает» уже ни о чём: проверка вылета пустеет.
		List<ActiveTarget.ChecklistItem> items = target == null || questDone(target) ? null : target.getChecklist();
		List<ActiveTarget.GuideItem> forStage = items == null ? null : stageItems();
		if (forStage != null)
		{
			// Нужно сейчас только то, что названо у этапа: вчерашние предметы (пирог, кирка) уже не ждут.
			List<ActiveTarget.ChecklistItem> kept = new ArrayList<>();
			for (ActiveTarget.ChecklistItem c : items)
			{
				for (ActiveTarget.GuideItem g : forStage)
				{
					if (ActiveTarget.nameKey(g.getName()).equals(ActiveTarget.nameKey(c.getName())) || (g.getId() != null && g.getId().equals(c.getId())))
					{
						kept.add(c);
						break;
					}
				}
			}
			items = kept;
		}
		checklist = Checklist.evaluate(items, carried, bank);
		Set<Integer> ids = new HashSet<>();
		Set<String> names = new HashSet<>();
		for (int i = 0; i < checklist.getRows().size(); i++)
		{
			Checklist.Row row = checklist.getRows().get(i);
			if (row.getState() != Checklist.State.IN_BAG_READY && row.getInBank() != 0)
			{
				ActiveTarget.ChecklistItem item = items.get(i);
				if (item.getId() != null)
				{
					ids.add(item.getId());
				}
				names.add(ActiveTarget.nameKey(item.getName()));
			}
		}
		wantedIds = ids;
		wantedNames = names;
	}

	/** Надо ли взять этот предмет из банка по проверке вылета. */
	boolean isWantedFromBank(int itemId)
	{
		return wantedIds.contains(itemId);
	}

	boolean isWantedFromBank(String nameKey)
	{
		return wantedNames.contains(nameKey);
	}

	private void recomputeShopping()
	{
		if (plan == null)
		{
			shopping = Collections.emptyList();
			return;
		}
		Map<Integer, ShoppingPlan.Offer> offers = new HashMap<>();
		for (int i = 0; i < offerSlots.length; i++)
		{
			if (offerSlots[i] != null)
			{
				offers.merge(offerItems[i], offerSlots[i], (a, b) ->
					new ShoppingPlan.Offer(a.isDone() && b.isDone(), a.getBought() + b.getBought(), a.getTotal() + b.getTotal()));
			}
		}
		shopping = ShoppingPlan.progress(plan.getItems(), ItemCounts.sum(carried, noted, bank), offers);
	}

	@Subscribe
	public void onGrandExchangeOfferChanged(GrandExchangeOfferChanged e)
	{
		int slot = e.getSlot();
		if (slot < 0 || slot >= offerSlots.length)
		{
			return;
		}
		GrandExchangeOffer o = e.getOffer();
		GrandExchangeOfferState s = o == null ? GrandExchangeOfferState.EMPTY : o.getState();
		if (s == GrandExchangeOfferState.BUYING || s == GrandExchangeOfferState.BOUGHT)
		{
			offerItems[slot] = o.getItemId();
			offerSlots[slot] = new ShoppingPlan.Offer(s == GrandExchangeOfferState.BOUGHT, o.getQuantitySold(), o.getTotalQuantity());
		}
		else
		{
			offerSlots[slot] = null;
		}
		recomputeShopping();
	}

	/** Для автоотметки: сколько предмета у игрока — сумка, надетое, банкноты и банк, если его открывали. */
	private int ownedCount(ActiveTarget.ItemNeed need)
	{
		return ItemCounts.sum(carried, noted, bank).count(need);
	}

	/** Сколько есть предметов, о которых спрашивает приложение: проверка вылета, условия вариантов и список закупок. */
	private List<Map<String, Object>> ownedReport()
	{
		Map<String, Map<String, Object>> out = new LinkedHashMap<>();
		if (target != null && target.getChecklist() != null)
		{
			for (ActiveTarget.ChecklistItem i : target.getChecklist())
			{
				report(out, i.getName(), i.getId());
			}
		}
		if (target != null && target.getWatchItems() != null)
		{
			for (String name : target.getWatchItems())
			{
				report(out, name, null);
			}
		}
		if (plan != null)
		{
			for (ShoppingPlan.Item i : plan.getItems())
			{
				report(out, i.getName(), i.getId());
			}
		}
		GearHint h = gearHint;
		if (h != null)
		{
			for (String name : h.watched())
			{
				report(out, name, null);
			}
		}
		return new ArrayList<>(out.values());
	}

	private void report(Map<String, Map<String, Object>> out, String name, Integer id)
	{
		String key = ActiveTarget.nameKey(name);
		if (out.containsKey(key))
		{
			return;
		}
		Map<String, Object> row = new LinkedHashMap<>();
		row.put("name", name);
		if (id != null)
		{
			row.put("id", id);
		}
		row.put("carried", carried.count(id, name));
		row.put("noted", noted.count(id, name));
		if (bank != null)
		{
			row.put("bank", bank.count(id, name));
		}
		out.put(key, row);
	}

	@Subscribe
	public void onChatMessage(ChatMessage e)
	{
		if (completion != null && (e.getType() == ChatMessageType.GAMEMESSAGE || e.getType() == ChatMessageType.SPAM))
		{
			completion.onChatMessage(e.getMessage());
		}
	}

	@Subscribe
	public void onVarbitChanged(VarbitChanged e)
	{
		if (completion != null)
		{
			completion.onVarbitChanged(e.getVarbitId(), e.getValue());
		}
		ActiveTarget.Stage st = stageOf(target);
		if (st != null && (st.isVarp() ? e.getVarpId() == st.getId() : e.getVarbitId() == st.getId()))
		{
			updateHud();
		}
	}

	/** Вызывается в потоке клиента (из onGameTick). */
	private Boolean isQuestFinished(String questName)
	{
		Quest quest = QUESTS.get(ActiveTarget.nameKey(questName));
		if (quest == null)
		{
			return null;
		}
		return quest.getState(client) == QuestState.FINISHED;
	}

	private void onStepCompleted(String stepId)
	{
		if (config.completionSound())
		{
			client.playSoundEffect(SoundEffectID.UI_BOOP);
		}
		// По-английски: в шрифте игры нет кириллицы.
		client.addChatMessage(ChatMessageType.GAMEMESSAGE, "", "OSRS Path: step " + stepId + " complete", null);
		recomputeChecklist();
		updateHud();
		if (server != null)
		{
			server.stepCompleted(stepId);
		}
	}

	/** Для теста: какие названия квестов знает эта версия RuneLite. */
	static Map<String, Quest> knownQuests()
	{
		return Collections.unmodifiableMap(QUESTS);
	}
}
