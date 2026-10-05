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
import net.runelite.api.events.MenuOptionClicked;
import net.runelite.api.events.NpcChanged;
import net.runelite.api.events.NpcDespawned;
import net.runelite.api.events.NpcSpawned;
import net.runelite.api.events.StatChanged;
import net.runelite.api.events.VarbitChanged;
import net.runelite.api.events.WidgetLoaded;
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
import net.runelite.client.util.Text;
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
	description = "Bridge from the local guide with 3D hints, highlights and auto-completion",
	tags = {"bridge", "navigation", "helper"}
)
public class OsrsPathBridgePlugin extends Plugin implements BridgeServer.Listener
{
	/** The Shortest Path plugin (Plugin Hub): its public API is a PluginMessage in the "shortestpath" namespace. */
	static final String SHORTEST_PATH_CLASS = "shortestpath.ShortestPathPlugin";
	static final String SHORTEST_PATH_NS = "shortestpath";
	/** Closer than this many tiles to the temporary target's place means arrived. */
	static final int NAV_ARRIVED = 3;

	/** RuneLite quests by the in-game name: "Cook's Assistant" -> Quest.COOKS_ASSISTANT. */
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
	private OsrsPathDockOverlay dockOverlay;

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
	private OsrsPathShopOverlay shopOverlay;

	@Inject
	private KeyManager keyManager;

	@Inject
	private DrawManager drawManager;

	@Inject
	private ScheduledExecutorService executor;

	/** The "OSRS Path" side panel: what the step needs, where to get it, "Go here". */
	private OsrsPathPanel panel;
	private NavigationButton panelButton;
	/** Clicks on the "What you need" list on the game screen. */
	private GuideMouse guideMouse;
	/**
	 * What the step needs and where to go, for the in-game list and the side panel. Computed on the client thread when the step,
	 * target, bag or bank changes; the Swing panel is rebuilt only when the view changed.
	 */
	@Getter
	private volatile StepGuide.View guideView;
	/** The "Tip" tab is open in the list. Reset when there are no tips. */
	private boolean adviceTab;
	private StepGuide.View panelView;
	/** A message in the list and panel after a click, for example "navigation is off"; cleared by changing the step. */
	private String guideMessage;
	/** The world map marker: where the arrow points. */
	private WorldMapPoint mapPoint;

	@Inject
	private ItemManager itemManager;

	@Inject
	private PluginManager pluginManager;

	@Inject
	private EventBus eventBus;

	/** The current target. Changed only on the client thread, read by the overlays there too. */
	@Getter
	private ActiveTarget target;

	/** Matching NPCs and objects nearby, collected from spawn events rather than by scanning every frame. */
	@Getter
	private final List<NPC> npcs = new ArrayList<>();

	@Getter
	private final Map<TileObject, String> objects = new HashMap<>();

	/** The micro HUD: recomputed once per tick and when the target or bag changes. */
	@Getter
	private OsrsPathHudOverlay.State hud;

	/**
	 * The route stops of the current step (gate -> bridge -> ladder -> NPC); null means the step has none. They
	 * are not drawn on the ground: the arrow, the HUD ("Point 2/5") and Shortest Path lead to the current stop.
	 */
	private Navigation.Breadcrumbs breadcrumbs;

	@Getter
	private Checklist.Result checklist = Checklist.NONE;

	/** The bulk list at the exchange: what you have, what is in the order, what to buy. */
	@Getter
	private List<ShoppingPlan.Row> shopping = Collections.emptyList();

	private BridgeServer server;
	private AutoCompletionManager completion;
	private boolean arrowSet;
	private boolean near;
	private WorldPoint lastPosition;

	/** Bag and worn items (without notes), notes separately, bank null until it has been opened. */
	private ItemCounts carried = ItemCounts.EMPTY;
	private ItemCounts noted = ItemCounts.EMPTY;
	private ItemCounts bank;
	/** The bank was loaded from a previous session (from the profile settings), not read from the game; until the bank is opened it is "last known". */
	private boolean bankFromSave;
	private long bankSavedAt;
	/** The bank changed and has not been written to the settings yet. */
	private boolean bankDirty;
	private long bankWrittenAt;
	/** Ticks since login while looking for a bank snapshot: the RuneLite profile does not appear at the same moment as login. */
	private int bankLoadTicks;
	static final long BANK_SAVE_GAP_MS = 3_000;
	static final int BANK_LOAD_TICKS = 30;
	private final Map<Integer, String> itemNames = new HashMap<>();
	private Set<Integer> wantedIds = Collections.emptySet();
	private Set<String> wantedNames = Collections.emptySet();

	private ShoppingPlan plan;
	/** Exchange slots: the item ID and the buy order in each. */
	private final int[] offerItems = new int[8];
	private final ShoppingPlan.Offer[] offerSlots = new ShoppingPlan.Offer[8];

	private final Map<String, Integer> stats = new LinkedHashMap<>();
	private boolean statsDirty;
	/** XP per skill (sent to the app at most once per three seconds, since it changes with every action). */
	private final Map<String, Integer> xp = new LinkedHashMap<>();
	private boolean xpDirty;
	private int xpTicks;
	/** Completed quests as they were sent; checked once every twenty ticks. */
	private List<String> questsSent;
	private int questTicks;
	private String playerSent;
	private static final int XP_EVERY_TICKS = 5;
	private static final int QUESTS_EVERY_TICKS = 20;
	private boolean ownedDirty;
	private boolean gearDirty;
	private boolean pacingDirty;

	/** A temporary target over the step: a place from the app's map or a shop for an upgrade. */
	@Getter
	private NavTarget navTarget;

	/** The app's gear advice (POST /gear-hint): the HUD line, what to ask the bank for, what to highlight. */
	private volatile GearHint gearHint;

	/** The seller or NPC of the temporary target nearby, collected from events like the step's NPCs. */
	@Getter
	private final List<NPC> navNpcs = new ArrayList<>();

	/** The stage's items for soft highlighting in the bank (POST /bank-tags). Written from the server thread. */
	private volatile Set<Integer> bankTagIds = Collections.emptySet();

	private DangerRadar radar;

	/** The nearest danger zone and how close the player got to it. Changes when the tile changes. */
	@Getter
	private DangerRadar.Reading danger = DangerRadar.QUIET;

	/** Dangerous NPCs nearby: searched only while the player is in the warning zone. */
	@Getter
	private final List<NPC> dangerNpcs = new ArrayList<>();

	/** The pacing of the current step; null means the step has none or it is off. */
	private PacingSet pacing;

	private Plugin shortestPath;
	private boolean shortestPathLooked;
	/** The target handed to Shortest Path, so as not to send the same thing twice and to know what to clear later. */
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
		overlayManager.add(shopOverlay);
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
		overlayManager.add(dockOverlay);
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
		panelButton = NavigationButton.builder().tooltip("OSRS Path: what you need and where to go").icon(OsrsPathPanel.icon()).priority(6).panel(panel).build();
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
				// The plugin was enabled in the middle of a game: take levels and the bag at once, without waiting for events.
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
		saveBank(true);
		keyManager.unregisterKeyListener(debugHotkey);
		keyManager.unregisterKeyListener(shotHotkey);
		overlayManager.remove(debugOverlay);
		overlayManager.remove(shopOverlay);
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
		overlayManager.remove(dockOverlay);
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
			log.warn("OSRS Path Bridge: port {} is busy or unavailable - the bridge did not start", config.port(), e);
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
			// Some plugin was enabled or disabled, maybe Shortest Path.
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
			// The new bridge knows nothing, so tell it the current temporary target, otherwise the app will reset it.
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
					// Turned off: the temporary target is cleared at once, not "sometime".
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

	// ---------- App requests (server thread -> client thread) ----------

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
				return "navigation to places is turned off in the OSRS Path Bridge plugin settings";
			}
			if (t.isPurchase() && !config.upgradeRouter())
			{
				return "upgrade hints are turned off in the OSRS Path Bridge plugin settings";
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
			return "upgrade hints are turned off in the OSRS Path Bridge plugin settings";
		}
		clientThread.invokeLater(() ->
		{
			gearHint = h.isClear() ? null : h;
			// New items to count in the bank: the OWNED event goes out with them.
			ownedDirty = true;
			updateHud();
		});
		return null;
	}

	// ---------- Debug log, developer badge, screenshots ----------

	/** The engine event log; null means it is turned off in the settings. */
	private volatile Telemetry telemetry;
	private final EngineWatchdog watchdog = new EngineWatchdog();
	/** What the developer badge shows; rebuilt once per tick while the badge is open. */
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
	private int stageShots;
	private long lastStageShotAt;
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
	/** "Every step" snapshots (stage and line changes) are counted separately from anomalies: there are many of them and they are needed in order. */
	static final int STAGE_SHOTS_PER_SESSION = 40;
	static final long STAGE_SHOT_GAP_MS = 6_000;
	static final int SHOTS_KEPT = 80;
	static final long HEARTBEAT_MS = 30_000;
	static final int WATCH_TICKS = 5;

	/** How many detailed events of each kind we write per minute: the log is limited in size, and the important things must not drown in the flow. */
	private final Map<String, long[]> telBudgets = new HashMap<>();

	private boolean telBudget(String kind, int perMinute)
	{
		long now = System.currentTimeMillis();
		long[] b = telBudgets.computeIfAbsent(kind, k -> new long[2]);
		if (now - b[0] > 60_000)
		{
			b[0] = now;
			b[1] = 0;
		}
		return ++b[1] <= perMinute;
	}

	/** An event into the log, if it is enabled. */
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
				// The log is for analysis, not for operation: its failure must not affect the in-game hints.
				log.debug("Log event not written: {}", ex.toString());
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

	/** The badges report what they drew: the engine watchdog catches "there is a step, but the screen is empty". */
	/** A bank, exchange or merchant window is on screen now: the old departure check at the bank is not needed then, the window replaces it. */
	@Getter
	private volatile boolean shopShown;

	void shopWindowShown(boolean shown)
	{
		shopShown = shown;
	}

	void hudShown(boolean shown)
	{
		hudOnScreen = shown;
	}

	void guideShown(boolean shown)
	{
		guideOnScreen = shown;
	}

	boolean guideOnScreen()
	{
		return guideOnScreen;
	}

	private volatile boolean dockOnScreen;
	private volatile boolean dockExpanded;

	/** The docked bar tells whether it is on screen and whether the list under it should be open. */
	void dockShown(boolean onScreen, boolean expanded)
	{
		dockOnScreen = onScreen;
		dockExpanded = expanded;
	}

	/** The list is hidden by the docked bar: the bar is on screen and nothing opened the list. */
	boolean dockHidesList()
	{
		return dockOnScreen && !dockExpanded;
	}

	/** What the player sees (badge or list text): into the log only when it changed. */
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

	/** A game screenshot into the log folder; the pair "picture - engine state" is written to the log. */
	private void takeShot(String why)
	{
		Telemetry t = telemetry;
		if (t == null)
		{
			return;
		}
		long now = System.currentTimeMillis();
		boolean auto = why.startsWith("anomaly");
		boolean stage = why.startsWith("stage");
		if (auto && (shots >= SHOTS_PER_SESSION || now - lastShotAt < SHOT_GAP_MS))
		{
			return;
		}
		if (stage && (stageShots >= STAGE_SHOTS_PER_SESSION || now - lastStageShotAt < STAGE_SHOT_GAP_MS))
		{
			return;
		}
		// A hotkey snapshot does not spend the automatic limit: the player presses it themselves and knows why.
		if (auto)
		{
			lastShotAt = now;
			shots++;
		}
		if (stage)
		{
			lastStageShotAt = now;
			stageShots++;
		}
		String state = DebugView.plain(DebugView.rows(buildDebugState()));
		String stamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
		// "Every step" snapshots are JPEG (there are dozens, a game PNG weighs ~2.5 MB); anomalies and the hotkey snapshot are lossless PNG.
		String name = "shot-" + stamp + "-" + why.replaceAll("[^A-Za-z0-9_]+", "_") + (stage ? ".jpg" : ".png");
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
			ImageIO.write(out, name.endsWith(".jpg") ? "jpg" : "png", new File(dir, name));
			pruneShots(dir);
			tel("shot", "file", name, "why", why, "state", state);
		}
		catch (IOException | RuntimeException ex)
		{
			log.warn("Debug screenshot not saved: {}", ex.toString());
		}
	}

	/** Only fresh screenshots stay in the folder. */
	private static void pruneShots(File dir)
	{
		File[] files = dir.listFiles((d, n) -> n.startsWith("shot-") && (n.endsWith(".png") || n.endsWith(".jpg")));
		if (files == null || files.length <= SHOTS_KEPT)
		{
			return;
		}
		Arrays.sort(files, java.util.Comparator.comparing(File::getName));
		for (int i = 0; i < files.length - SHOTS_KEPT; i++)
		{
			if (!files[i].delete())
			{
				log.debug("Old screenshot not deleted: {}", files[i]);
			}
		}
	}

	/** The log summary for the app (GET /telemetry): path, counters, the latest anomalies and events. */
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

	/** Once per tick: pulse, engine watchdog, developer badge state. Client thread. */
	private void debugTick(Player me)
	{
		try
		{
			debugTickUnsafe(me);
		}
		catch (RuntimeException ex)
		{
			// The debug part must not break the game tick: a failure goes to the RuneLite log, the hints keep working.
			log.warn("Developer badge or watchdog failure: {}", ex.toString());
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

	/** The engine state for the developer badge and for the screenshot. Client thread. */
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
			conditions.add("need " + line.getNeed() + " (handed in) = " + (stageTracker.delivered() ? "TRUE" : "FALSE"));
		}
		if (st != null && value != null)
		{
			// Without the word FALSE: the badge paints such lines red, and "the machine does not decide" is not a breakage.
			conditions.add("QH: " + qhDescribe);
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
			lastSnapshotAt == 0 ? null : "seq " + lastSnapshotSeq + ", " + Math.max(0, (now - lastSnapshotAt) / 1000) + " s ago", planPercent,
			stageTracker.reason(), used + "/28", p == null ? "—" : p.getX() + "," + p.getY() + "," + p.getPlane(), tickCount, hudOnScreen, guideOnScreen,
			t != null, t == null || t.file() == null ? null : t.file().getName(), t == null ? 0 : t.events(), t == null ? 0 : t.anomalyCount(), an,
			lastShotName);
	}

	// ---------- State snapshot from the app (protocol 6) ----------

	/** The number of the last applied snapshot: a late, older one is discarded. */
	private final Object snapshotLock = new Object();
	private long lastSnapshot = -1;
	/** The step of the last snapshot (JSON): the same step does not restart the target and arrow. null means the step is not from a snapshot or was cleared. */
	private String snapshotStepKey;
	/** The preparation plan from the app; null means it did not send one. The "What you need" list draws it. */
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
		// A part the player turned off in the plugin settings is not applied; the others are.
		Map<String, String> refused = new LinkedHashMap<>();
		GearHint hint = e.getGearHint();
		if (!bad.containsKey(PrepEnvelope.GEAR_HINT) && hint != null && !hint.isClear() && !config.upgradeRouter())
		{
			refused.put(PrepEnvelope.GEAR_HINT, "upgrade hints are turned off in the OSRS Path Bridge plugin settings");
		}
		if (!bad.containsKey(PrepEnvelope.BANK_TAGS) && e.getBankTags() != null && !config.bankTagsHelper())
		{
			refused.put(PrepEnvelope.BANK_TAGS, "stage items from the app are turned off in the OSRS Path Bridge plugin settings");
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
				t.anomaly("SNAPSHOT_REJECT", r.getKey(), "Part of the snapshot '" + r.getKey() + "' was rejected: " + r.getValue());
			}
		}
		clientThread.invokeLater(() -> applySnapshot(e, bad, refused));
		return new BridgeServer.PrepResult(false, refused);
	}

	/**
	 * Apply the snapshot whole in one pass of the client thread. Invalid and disabled parts are not touched, the previous one
	 * stays; the others are replaced, and whatever is absent from the snapshot is cleared (the snapshot is complete).
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

	/** An item from the gear advice: highlight it in the bag and bank. name is the ActiveTarget.nameKey key. */
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
			return "stage items from the app are turned off in the OSRS Path Bridge plugin settings";
		}
		bankTagIds = t.getIdSet();
		return null;
	}

	/** Whether the stage needs the item: for the soft frame in the bank. */
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

	/** Items of the current step that have already been in the bag: those handed to Hetty or used are not asked into the bag again. */
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
			qhReset();
		}
		target = t;
		lineHlKey = null;
		lineHl = ActiveTarget.LineHighlight.NONE;
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

	// ---------- What you need and where: the in-game list and the side panel ----------

	/** Recompute the view (client thread): the in-game list draws it, and it goes to the panel only if it changed. */
	private void refreshGuide()
	{
		ActiveTarget.Stage stage = stageOf(target);
		trackStageCursor(stage);
		String stageNow = stage == null ? null : stageTracker.key() + "|" + questDone(target);
		if (!Objects.equals(stageNow, checklistStage))
		{
			// The stage changed (or the quest was handed in): the departure check and the "Bag" line are counted by the items of the new stage.
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
		v = v.withAdviceTab(adviceTab);
		if (guideMessage != null)
		{
			v = v.withNote(guideMessage);
		}
		else if (qhHint != null)
		{
			v = v.withNote(qhHint);
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

	// ---------- Steps as in Quest Helper ----------

	/** Latches of Quest Helper conditions: they live while the player is on this quest and has not left the game. */
	private final QhMachine.Session qhSession = new QhMachine.Session();
	private QhLiveFacts qhFacts;
	/** Worn only: in "carried" it is together with the bag, and some Quest Helper conditions require exactly the worn item. */
	private ItemCounts worn = ItemCounts.EMPTY;
	/** The machine's last pick in one line (for the log and the developer badge) and its fingerprint (to notice a change). */
	private String qhLastKey = "";
	private String qhDescribe = "—";
	/** Quest Helper cannot determine the step without the quest journal (S2-09): a hint in the list while the pick is "sync". */
	private String qhHint;
	/** The machine failed: until the plugin restarts we count the old way (place and items) and do not clutter the log with repeats. */
	private boolean qhBroken;
	/** The tick on which to read the quest journal: the text appears a bit after the window opens. -1 means not waiting. */
	private int journalReadTick = -1;
	private int loginTick = -1;
	private int varBurst;
	private int menuBurst;
	private long menuBurstAt;

	private QhLiveFacts qhFacts()
	{
		if (qhFacts == null)
		{
			qhFacts = new QhLiveFacts(client, () -> carried, () -> worn, () -> bank == null ? ItemCounts.EMPTY : bank);
		}
		return qhFacts;
	}

	private void qhReset()
	{
		qhSession.reset();
		if (qhFacts != null)
		{
			qhFacts.clear();
		}
		qhLastKey = "";
		qhDescribe = "—";
		qhHint = null;
	}

	/**
	 * The Quest Helper machine's pick for the stage lines, or null: there is no machine, it does not decide ("unknown" in a condition) or it picked the step "by default",
	 * that is, there is no evidence and the line will be decided by place and items. The pick is written to the log when it changes.
	 */
	private StageTracker.QhPick qhPick(String stepId, int value, List<ActiveTarget.StageLine> lines)
	{
		qhHint = null;
		if (!config.qhMachine())
		{
			qhDescribe = "turned off in the settings";
			return null;
		}
		if (qhBroken)
		{
			qhDescribe = "disabled after a failure (see the RuneLite log)";
			return null;
		}
		QhMachine m = QhMachine.all().get(stepId);
		if (m == null || !m.hasStage(value))
		{
			qhDescribe = m == null ? "no quest data" : "Quest Helper has no step for value " + value;
			return null;
		}
		QhMachine.Verdict v;
		try
		{
			v = m.resolve(value, qhFacts(), qhSession);
		}
		catch (RuntimeException ex)
		{
			log.warn("The Quest Helper machine is disabled until the plugin restarts: {}", ex.toString(), ex);
			tel("qh", "error", ex.toString(), "step", stepId, "var", value);
			qhBroken = true;
			qhDescribe = "failure: " + ex;
			return null;
		}
		int line = v.isUndecided() || !v.isStrong() ? -1 : m.lineFor(v, lines);
		// The Quest Helper "sync" step: it has nothing to tell which step the player is on until they open the quest journal.
		qhHint = !v.isUndecided() && !v.isStrong() && v.getLeaf() != null && v.getLeaf().endsWith("syncStep")
			? "Open the quest journal: Quest Helper and this list use it to learn which step you are on." : null;
		qhDescribe = v.isUndecided() ? "does not decide (the condition has an 'unknown')"
			: v.getLeaf() + (v.isStrong() ? " [condition met]" : " [by default]")
			+ (line >= 0 ? " -> line " + (line + 1) : v.isStrong() ? " -> no such line in the list" : "");
		String key = value + "|" + v.getLeaf() + "|" + v.isStrong() + "|" + v.isUndecided() + "|" + line;
		if (!key.equals(qhLastKey))
		{
			qhLastKey = key;
			tel("qh", "var", value, "leaf", v.getLeaf(), "strong", v.isStrong(), "undecided", v.isUndecided(), "line", line < 0 ? null : line + 1,
				"path", v.getPath());
		}
		return line < 0 ? null : new StageTracker.QhPick(line, v.getLeaf() + " (" + String.join(" > ", v.getPath()) + ")");
	}

	/** Once per tick: a message, dialogue or item arrived and the machine picked another step; the view is recomputed at once, not at the player's next step. */
	private void qhTick()
	{
		ActiveTarget.Stage st = stageOf(target);
		if (st == null || client.getGameState() != GameState.LOGGED_IN || questDone(target))
		{
			return;
		}
		Integer value = stageValue(st);
		if (value == null)
		{
			return;
		}
		String before = qhLastKey;
		qhPick(target.getStepId(), value, st.getStages().get(st.indexFor(value)).getSteps());
		if (!Objects.equals(before, qhLastKey))
		{
			updateHud();
		}
	}

	/** The quest journal: Quest Helper checks the step against its text. Into the log as clean lines without colour tags. */
	private void readJournal()
	{
		List<String> lines = qhFacts().widget(InterfaceID.QUESTJOURNAL, 6, true);
		if (lines == null)
		{
			return;
		}
		if (config.telemetryDetail())
		{
			List<String> title = qhFacts().widget(InterfaceID.QUESTJOURNAL, 5, false);
			List<String> clean = new ArrayList<>();
			for (String l : lines)
			{
				String t = l == null ? "" : Text.removeTags(l).trim();
				if (!t.isEmpty())
				{
					clean.add(t);
				}
			}
			tel("journal", "title", title == null || title.isEmpty() ? null : Text.removeTags(title.get(0)), "lines", clean);
		}
		updateHud();
	}

	/** Dialogue options: what the game offered when the player chose. */
	private void logDialogOptions()
	{
		List<String> opts = qhFacts().widget(InterfaceID.CHATMENU, 1, true);
		if (opts == null)
		{
			return;
		}
		List<String> clean = new ArrayList<>();
		for (String o : opts)
		{
			String t = o == null ? "" : Text.removeTags(o).trim();
			if (!t.isEmpty())
			{
				clean.add(t);
			}
		}
		tel("opts", "list", clean);
	}

	// ---------- Quest stages ----------

	/**
	 * The current stage step and everything that moves it: the player's position, the step's items (has, need), the "done" and "back" clicks.
	 * Recomputed every tick (StageTracker.update), not once as before.
	 */
	private final StageTracker stageTracker = new StageTracker();

	/** Recompute the current stage step from the player's position and items. Client thread. */
	private void trackStageCursor(ActiveTarget.Stage st)
	{
		if (st == null)
		{
			stageTracker.reset();
			return;
		}
		// The quest is complete: stage steps are no longer moved or checked against the bag, "Beer is still in your bag" at the moment of handing in the quest is a false alarm.
		if (questDone(target))
		{
			applyLineHighlight(null, null);
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
		stageTracker.update(target.getStepId(), idx, lines, pos.getX(), pos.getY(), pos.getPlane(), ItemCounts.sum(carried, noted),
			qhPick(target.getStepId(), value, lines));
		logStage(st, idx, value, lines, pos);
		int at = Math.max(0, Math.min(stageTracker.cursor(), lines.size() - 1));
		applyLineHighlight(target.getStepId() + "#" + idx + "@" + at, lines.get(at).getHl());
	}

	/** The log: entering a stage, a quest variable change, where and why the cursor moved, warnings. */
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
			log.debug("Stage not written to the log: {}", ex.toString());
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
			if (config.telemetryEventShots())
			{
				takeShot("stage_enter_" + (idx + 1));
			}
		}
		else if (cur != lastStageCursor)
		{
			tel("stage", "event", "cursor", "key", key, "from", lastStageCursor + 1, "to", cur + 1, "size", lines.size(), "line", line == null ? null : line.shown(),
				"reason", stageTracker.reason(), "pos", at, "manual", StageTracker.needsManualStep(lines, cur));
			lastStageCursor = cur;
			if (config.telemetryEventShots())
			{
				takeShot("stage_cursor_" + (cur + 1));
			}
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

	/** Which stage is shown and whether the arrow leads to it: the key "step#stage"; a key change means the arrow goes to the new stage. */
	private String stageKey;
	/** The arrow was set by the stage, not the player: on arrival it stays at the NPC (does not jump back to the step) until the stage changes. */
	private boolean navSticky;

	private static ActiveTarget.Stage stageOf(ActiveTarget t)
	{
		return t == null || t.getGuide() == null ? null : t.getGuide().getStage();
	}

	/** The quest variable's value; null means not in the game. Client thread. */
	private Integer stageValue(ActiveTarget.Stage st)
	{
		if (client.getGameState() != GameState.LOGGED_IN)
		{
			return null;
		}
		return st.isVarp() ? client.getVarpValue(st.getId()) : client.getVarbitValue(st.getId());
	}

	/** The step's quest is complete by game data (a step with the "quest complete" trigger). */
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
	 * The quest stage changed (or the step has just been shown): the arrow and route to the NPC of the new stage. The player's own target
	 * (a click on a place) is not touched while the stage is the same. If the quest is complete, the stage arrow is cleared.
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
		// The arrow follows the current stage step if it has a tile; if not, the stage's point.
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
			// The step changed and the player set the arrow to their own place: do not touch.
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

	/** A click on the list in the game (client thread). */
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
			case TAB:
				adviceTab = !adviceTab;
				refreshGuide();
				break;
			case BACK:
				applyNav(null);
				break;
			case PREV:
				// No moving forward by click: the cursor is led by the facts in the game. Back views the previous step.
				stageTracker.back();
				refreshGuide();
				break;
			case RESUME:
				stageTracker.resume();
				refreshGuide();
				break;
			case NEXT:
			{
				// Only a step the game does not see by itself (several in a row at one place); the others cannot be skipped.
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

	/** "Go here": a temporary target at a step point: the arrow, Shortest Path and the NPC highlight at the point. */
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
			guideMessage = "Navigation to places is turned off: RuneLite -> OSRS Path Bridge -> 'Arrow to places'.";
			refreshGuide();
			return;
		}
		guideMessage = null;
		applyNav(n);
	}

	// ---------- Temporary target: a place from the map or a shop ----------

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
			// The app learns the target even if it was chosen in the game (the "What you need" list, the panel), and shows the same one.
			server.navSet(t);
		}
		if (t.isPurchase() && hasNavItem())
		{
			// The item is already there: nowhere to lead.
			finishNav("obtained");
			return;
		}
		updateNavigation();
		updateHud();
	}

	/** Clear the temporary target: the arrow and HUD return to the step, and the app learns why. */
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

	/** Arrived at the place (for a target without an item): the same tile of the plane, no farther than three tiles. */
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

	// ---------- Danger radar ----------

	private static boolean warned(DangerRadar.Reading r)
	{
		return r.getLevel() == DangerRadar.Level.WARNING || r.getLevel() == DangerRadar.Level.INSIDE;
	}

	/** A new player tile: which zone is nearby, a sound on entering, dangerous NPCs only in the warning zone. */
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

	// ---------- Pacing ----------

	/** The step's pacing again: a new step, the setting was turned on or the character changed. */
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

	/** XP of all pacing skills from the client: on login and on a new step. */
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
		// Combat: which of the step's skills have not reached the goal yet, besides the shown one.
		if (pacing.skills().size() > 1)
		{
			m.put("left", pacing.left());
		}
		return m;
	}

	// ---------- Equipment and coins for the upgrade hint ----------

	/** Worn items, bag and coins. null means not in the game or upgrade hints are turned off; a container that did not arrive has a null field. */
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
		// Occupied bag slots: the items in the list are stacked by ID, and preparation needs to know whether anything else will fit.
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
		// Weight of the bag and worn items as in the game (client.getWeight): how fast running drains depends on it.
		g.put("weight", bag == null ? null : client.getWeight());
		g.put("bankCoins", bank == null ? null : bank.count(ItemID.COINS, "Coins"));
		// A value of items by Grand Exchange prices (without coins): in the bag and worn, and in the bank if it was opened.
		// This is not money but what you would get by selling: the app shows it separately from coins, with "~".
		IntUnaryOperator price = this::itemPrice;
		g.put("carriedValue", carried.value(price, ItemID.COINS) + noted.value(price, ItemID.COINS));
		g.put("bankValue", bank == null ? null : bank.value(price, ItemID.COINS));
		return g;
	}

	private java.lang.reflect.Method priceMethod;
	private boolean priceBroken;

	/**
	 * The item's Grand Exchange price. In RuneLite 1.13 getItemPrice(int) returned long instead of int: a call compiled for 1.12
	 * failed with NoSuchMethodError and crashed the plugin on login. The method is looked up by name, the result is any number;
	 * any error means price 0 (item valuation is optional), the client does not suffer.
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
			log.warn("OSRS Path Bridge: item prices are unavailable in this RuneLite version - item valuation is turned off", t);
			return 0;
		}
	}

	/** A slot by the worn-slot number: weapon, head, amulet... (EquipmentInventorySlot). null means an unknown slot. */
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

	// ---------- Where to go: arrow, Shortest Path, HUD ----------

	/** For the big arrow: the current path point while the player is in the game; null means do not draw the arrow. */
	WorldPoint arrowTarget()
	{
		return client.getGameState() == GameState.LOGGED_IN ? navTarget() : null;
	}

	/** "✓ Close" from the HUD, with the same protection against flicker at the boundary. */
	boolean isNavNear()
	{
		return near;
	}

	/**
	 * The current path point: the temporary target, otherwise the next waypoint or the step's point.
	 * null means nowhere to go or the route is done.
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

	/** The step's point without a temporary target: the current waypoint or the step's point. null means no step or the route is done. */
	private ActiveTarget.WorldPointDto stepPoint()
	{
		if (target == null)
		{
			return null;
		}
		return breadcrumbs != null ? breadcrumbs.current() : target.getWorldPoint();
	}

	/**
	 * The game arrow and Shortest Path point to the current path point. Called when the target, point or settings change,
	 * but not every frame: Shortest Path computes the path itself, once per target.
	 */
	private void updateNavigation()
	{
		WorldPoint nav = navTarget();
		boolean loggedIn = client.getGameState() == GameState.LOGGED_IN;
		// The arrow: do not touch someone else's (for example a quest one), only our own.
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
			// Clear only our own path: if the player set the target in Shortest Path themselves, we did not send it and do not touch it.
			eventBus.post(new PluginMessage(SHORTEST_PATH_NS, "clear"));
			pathSent = null;
		}
	}

	/** The label of the current target for the map marker: the temporary target, a route point, the step's point or the step's name. */
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
		// The same point as the arrow (stepPoint), so the marker's label does not diverge from its place.
		ActiveTarget.WorldPointDto p = stepPoint();
		if (p != null && p.getLabel() != null && !p.getLabel().isEmpty())
		{
			return p.getLabel();
		}
		return target.getGoal() != null && !target.getGoal().isEmpty() ? target.getGoal() : target.getTitle();
	}

	/** The marker on the game's world map: just ours; other markers (Shortest Path, quests) are not touched. */
	private void setMapPoint(WorldPoint at, String label)
	{
		String tooltip = at == null ? null : "OSRS Path: " + (label == null ? "the arrow points here" : label);
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
	 * What to show in the game now: the path, the step, the bank or the exchange ({@link SmartView}). The bank and exchange windows are read here,
	 * in the frame, so the overlays do not disagree with each other.
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
		// The gear advice only while we are not going to buy (then the heading is "Buy ..." anyway).
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
			// A temporary target over the step: it goes first, the step is a line below so it does not get lost.
			List<String> sellers = navTarget.getNpcNames();
			title = navTarget.isPurchase()
				? "Buy " + (navTarget.getItemName() != null ? navTarget.getItemName() : navTarget.getLabel())
					+ (sellers != null && !sellers.isEmpty() ? " from " + sellers.get(0) : "")
				: "Go to: " + navTarget.getLabel();
			goal = stepTitle == null ? null : "Then: step " + stepTitle;
		}
		else if (target != null)
		{
			title = stepTitle;
			goal = target.getGoal();
			if (breadcrumbs != null)
			{
				ActiveTarget.WorldPointDto c = breadcrumbs.current();
				goal = c == null
					? "Route complete" + (goal != null ? " · " + goal : "")
					: "Point " + (breadcrumbs.index() + 1) + "/" + breadcrumbs.size() + (c.getLabel() != null ? ": " + c.getLabel() : "");
			}
		}
		else
		{
			title = "OSRS Path";
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
				? "Bag ready to leave"
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
	 * A "Use X on Y" reminder for the step's first action whose item is already in the bag. null means there are no actions or
	 * the item is not there yet (then it must be obtained first, which the "What you need" list shows).
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
				return "Use " + u.getItem() + " on " + u.getTarget();
			}
		}
		return null;
	}

	/**
	 * A health line: shown when HP is below two max hits of the step's enemy (per the wiki) and the player's
	 * health is known. null means all is well, the hit is unknown or the player is not in the game.
	 */
	static String healthLine(int hp, int hpMax, Integer maxHit)
	{
		if (maxHit == null || hp <= 0 || hpMax <= 0 || hp >= 2 * maxHit)
		{
			return null;
		}
		return hp <= maxHit
			? "HP " + hp + "/" + hpMax + " - EAT NOW! Hits up to " + maxHit
			: "HP " + hp + "/" + hpMax + " - time to eat. Hits up to " + maxHit;
	}

	// ---------- Whom to highlight ----------

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

	/** What to highlight on the current quest stage step (per Quest Helper): NPCs, objects, items in the bag. Changes with the cursor. */
	private volatile ActiveTarget.LineHighlight lineHl = ActiveTarget.LineHighlight.NONE;
	private String lineHlKey;

	boolean hasLineItems()
	{
		return !lineHl.itemNames.isEmpty();
	}

	boolean isLineItem(String nameKey)
	{
		return lineHl.itemNames.contains(nameKey);
	}

	/** The cursor moved to another step: that step's highlight; the previous one goes out. Client thread. */
	private void applyLineHighlight(String key, ActiveTarget.Highlight hl)
	{
		if (Objects.equals(key, lineHlKey))
		{
			return;
		}
		lineHlKey = key;
		lineHl = hl == null ? ActiveTarget.LineHighlight.NONE : new ActiveTarget.LineHighlight(hl);
		tel("highlight", "key", key, "npc", hl == null ? null : hl.getNpc(), "obj", hl == null ? null : hl.getObj(), "on", hl == null ? null : hl.getOn(),
			"item", hl == null ? null : hl.getItem());
		rescan();
	}

	private boolean matches(NPC npc)
	{
		if (target == null || npc == null)
		{
			return false;
		}
		if (target.getNpcIdSet().contains(npc.getId()) || lineHl.npcIds.contains(npc.getId()))
		{
			return true;
		}
		NPCComposition c = npc.getTransformedComposition();
		String name = c != null ? c.getName() : npc.getName();
		return name != null && target.getNpcNameSet().contains(ActiveTarget.nameKey(name));
	}

	/** An object's name accounting for impostors: the look of some objects depends on quest progress. */
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
		ActiveTarget.LineHighlight line = lineHl;
		if (target.getObjectIdSet().isEmpty() && target.getObjectNameSet().isEmpty() && line.objectIds.isEmpty() && line.objectNames.isEmpty())
		{
			return;
		}
		String name = objectName(o);
		boolean byId = target.getObjectIdSet().contains(o.getId()) || line.objectIds.contains(o.getId());
		boolean byName = name != null && (target.getObjectNameSet().contains(ActiveTarget.nameKey(name)) || line.objectNames.contains(ActiveTarget.nameKey(name)));
		if (byId || byName)
		{
			objects.put(o, name == null ? "" : name);
		}
	}

	private void untrack(TileObject o)
	{
		objects.remove(o);
	}

	/** An NPC appeared or changed its look: into its own list, whether the step's, the temporary target's or a dangerous one. */
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
	 * Mouse over the "What you need" list: the list line becomes the top game menu entry. Otherwise the game writes the action of whatever is
	 * under the plate in the top-left corner ("Chop down Yew tree") and outlines it, as if the click would go there.
	 * The other entries stay: a right click still opens the game menu.
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
			// A new area: objects will arrive again via spawn events.
			objects.clear();
		}
		if (server != null && state != GameState.LOADING)
		{
			server.setInGame(state == GameState.LOGGED_IN);
		}
		if (state == GameState.LOGGED_IN)
		{
			loginTick = tickCount;
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
			// Another character means other levels, bag, bank, XP and place.
			qhReset();
			loginTick = -1;
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
			// This character's bank goes into the settings while the profile is still theirs: the next login will not start from "bank unknown".
			saveBank(true);
			carried = ItemCounts.EMPTY;
			noted = ItemCounts.EMPTY;
			bank = null;
			bankFromSave = false;
			bankDirty = false;
			bankLoadTicks = 0;
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

	// ---------- Auto-tick ----------

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
			// Everything about the player's place only when they changed tile, not every tick.
			if (!pos.equals(lastPosition))
			{
				WorldPoint before = lastPosition;
				lastPosition = pos;
				// A jump of 20+ tiles in a tick is a teleport or respawn: the app turns on recovery mode.
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
			varBurst = 0;
			debugTick(me);
			persistBank();
			if (journalReadTick >= 0 && tickCount >= journalReadTick)
			{
				journalReadTick = -1;
				readJournal();
			}
			qhTick();
		}
		flush();
	}

	/** Levels and items go to the app at most once per tick and only if something changed. */
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
			server.owned(bank != null, bank != null && bankFromSave ? bankSavedAt : null, ownedReport());
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

	/** The character name and completed quests go to the app, if data transfer is on. Client thread (onGameTick). */
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

	/** Names of quests in the FINISHED state (the game calls them the same way). */
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

	// ---------- Levels ----------

	/** The total level is not a skill; RuneLite marks it deprecated, so we compare by name. */
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
			// Health changes with every hit: its line is recomputed at once, not once per game tick.
			updateHud();
		}
		if (pacing != null && pacing.tracks(key) && pacing.update(key, e.getXp(), System.currentTimeMillis()))
		{
			pacingDirty = true;
			updateHud();
		}
	}

	// ---------- Bag, bank and exchange ----------

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
			bankFromSave = false;
			bankDirty = true;
			containersChanged();
		}
	}

	/** Once per tick: load the bank of the previous session after login; write a changed bank at most once per few seconds. */
	private void persistBank()
	{
		try
		{
			if (bank == null && bankLoadTicks < BANK_LOAD_TICKS)
			{
				bankLoadTicks++;
				loadBank();
			}
			if (bankDirty && System.currentTimeMillis() - bankWrittenAt >= BANK_SAVE_GAP_MS)
			{
				saveBank(false);
			}
		}
		catch (RuntimeException ex)
		{
			log.warn("Bank save: {}", ex.toString());
		}
	}

	private void loadBank()
	{
		BankSnapshot.Loaded l = BankSnapshot.read(configManager.getRSProfileConfiguration(OsrsPathBridgeConfig.GROUP, BankSnapshot.KEY));
		if (l == null)
		{
			return;
		}
		ItemCounts b = new ItemCounts();
		for (Map.Entry<Integer, Integer> e : l.items.entrySet())
		{
			try
			{
				b.add(e.getKey(), itemName(e.getKey()), e.getValue());
			}
			catch (RuntimeException ex)
			{
				// No item with this ID exists in the game (junk in the settings): skip it, the rest of the bank is fine.
				log.debug("Item {} from the saved bank was not recognised", e.getKey());
			}
		}
		bank = b;
		bankFromSave = true;
		bankSavedAt = l.at;
		bankLoadTicks = BANK_LOAD_TICKS;
		tel("bank", "event", "loaded", "items", l.items.size(), "savedAt", l.at);
		containersChanged();
	}

	/** The bank into the profile settings. force means write now, do not wait for the pause (logout, plugin shutdown). */
	private void saveBank(boolean force)
	{
		ItemCounts b = bank;
		if (b == null || bankFromSave || !bankDirty)
		{
			return;
		}
		long now = System.currentTimeMillis();
		if (!force && now - bankWrittenAt < BANK_SAVE_GAP_MS)
		{
			return;
		}
		try
		{
			configManager.setRSProfileConfiguration(OsrsPathBridgeConfig.GROUP, BankSnapshot.KEY, BankSnapshot.write(b, now));
			bankWrittenAt = now;
			bankDirty = false;
			tel("bank", "event", "saved", "items", b.idCounts().size());
		}
		catch (RuntimeException ex)
		{
			log.warn("Bank not saved: {}", ex.toString());
		}
	}

	private void rebuildCarried()
	{
		ItemCounts c = new ItemCounts();
		ItemCounts n = new ItemCounts();
		count(client.getItemContainer(InventoryID.INV), c, n);
		count(client.getItemContainer(InventoryID.WORN), c, n);
		ItemCounts w = new ItemCounts();
		count(client.getItemContainer(InventoryID.WORN), w, null);
		worn = w;
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

	/** Lays a container out by counters. Notes go into notes (as the item they stand for). */
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
			// Bought or received the upgrade item: the temporary target is cleared and the step returns by itself.
			finishNav("obtained");
			return;
		}
		updateHud();
	}

	/** For which stage the departure check was computed. */
	private String checklistStage;

	/** The current quest stage's items; null means there are no stages or the stage has no list of its own (then the step's items). */
	private List<ActiveTarget.GuideItem> stageItems()
	{
		ActiveTarget.Stage st = stageOf(target);
		Integer value = st == null ? null : stageValue(st);
		return value == null ? null : st.getStages().get(st.indexFor(value)).getItems();
	}

	private void recomputeChecklist()
	{
		// The quest was handed in: items were spent or given away, "missing" no longer says anything: the departure check empties.
		List<ActiveTarget.ChecklistItem> items = target == null || questDone(target) ? null : target.getChecklist();
		List<ActiveTarget.GuideItem> forStage = items == null ? null : stageItems();
		if (forStage != null)
		{
			// Needed now is only what the stage names: yesterday's items (the pie, the pickaxe) no longer wait.
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

	/** Whether to take this item from the bank per the departure check. */
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

	/** For auto-tick: how much of the item the player has: bag, worn, notes and the bank if it was opened. */
	private int ownedCount(ActiveTarget.ItemNeed need)
	{
		return ItemCounts.sum(carried, noted, bank).count(need);
	}

	/** How many of the items the app asks about: the departure check, the variant conditions and the shopping list. */
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
		ChatMessageType t = e.getType();
		String msg = e.getMessage();
		if (msg != null && !msg.startsWith("OSRS Path:") && (t == ChatMessageType.GAMEMESSAGE || t == ChatMessageType.ENGINE
			|| t == ChatMessageType.SPAM || t == ChatMessageType.MESBOX || t == ChatMessageType.DIALOG))
		{
			// The same messages by which Quest Helper understands that a step is done ("Luthas hands you 30 coins.").
			qhFacts().add(t.name(), msg);
			if (config.telemetryDetail() && telBudget("chat", 150))
			{
				tel("chat", "type", t.name(), "name", e.getName(), "msg", Text.removeTags(msg));
			}
			if (stageOf(target) != null)
			{
				updateHud();
			}
		}
	}

	@Subscribe
	public void onWidgetLoaded(WidgetLoaded e)
	{
		if (e.getGroupId() == InterfaceID.QUESTJOURNAL)
		{
			journalReadTick = tickCount + 2;
		}
		else if (e.getGroupId() == InterfaceID.CHATMENU && config.telemetryDetail())
		{
			clientThread.invokeLater(this::logDialogOptions);
		}
	}

	@Subscribe
	public void onMenuOptionClicked(MenuOptionClicked e)
	{
		if (telemetry == null || !config.telemetryDetail())
		{
			return;
		}
		long now = System.currentTimeMillis();
		if (now - menuBurstAt > 1000)
		{
			menuBurstAt = now;
			menuBurst = 0;
		}
		if (++menuBurst > 6 || !telBudget("menu", 120))
		{
			return;
		}
		net.runelite.api.MenuEntry me = e.getMenuEntry();
		String target = me.getTarget();
		tel("menu", "opt", me.getOption(), "tgt", target == null ? "" : Text.removeTags(target), "act", me.getType() == null ? null : me.getType().name(),
			"id", me.getIdentifier(), "p0", me.getParam0(), "p1", me.getParam1());
	}

	@Subscribe
	public void onVarbitChanged(VarbitChanged e)
	{
		if (completion != null)
		{
			completion.onVarbitChanged(e.getVarbitId(), e.getValue());
		}
		ActiveTarget.Stage st = stageOf(target);
		boolean questVar = st != null && (st.isVarp() ? e.getVarpId() == st.getId() : e.getVarbitId() == st.getId());
		if (questVar)
		{
			updateHud();
		}
		else if (telemetry != null && config.telemetryDetail() && client.getGameState() == GameState.LOGGED_IN && loginTick >= 0
			&& tickCount - loginTick > 8 && varBurst++ < 10 && telBudget("varx", 90))
		{
			// Other game variables: Quest Helper builds step conditions from them, and they show what changed from the player's action.
			tel("varx", "varp", e.getVarpId(), "varbit", e.getVarbitId() < 0 ? null : e.getVarbitId(), "to", e.getValue());
		}
	}

	/** Called on the client thread (from onGameTick). */
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
		client.addChatMessage(ChatMessageType.GAMEMESSAGE, "", "OSRS Path: step " + stepId + " complete", null);
		recomputeChecklist();
		updateHud();
		if (server != null)
		{
			server.stepCompleted(stepId);
		}
	}

	/** For a test: which quest names this RuneLite version knows. */
	static Map<String, Quest> knownQuests()
	{
		return Collections.unmodifiableMap(QUESTS);
	}
}
