package com.osrspath.bridge;

import com.google.gson.Gson;
import com.google.inject.Provides;
import java.io.IOException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import javax.inject.Inject;
import javax.swing.SwingUtilities;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.Item;
import net.runelite.api.NPC;
import net.runelite.api.Quest;
import net.runelite.api.Skill;
import net.runelite.api.TileObject;
import net.runelite.api.coords.WorldPoint;
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
import net.runelite.api.events.HitsplatApplied;
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
import net.runelite.client.RuneLite;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.EventBus;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.events.PluginChanged;
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
import net.runelite.client.ui.overlay.worldmap.WorldMapPointManager;

@Slf4j
@PluginDescriptor(
	name = "OSRS Path Bridge",
	description = "Bridge from the local guide with 3D hints, highlights and auto-completion",
	tags = {"bridge", "navigation", "helper"}
)
public class OsrsPathBridgePlugin extends Plugin implements BridgeServer.Listener
{
	// The plugin's sections, each in its own file: they reach the injected services and the shared state through the plugin.
	final PluginDebug debug = new PluginDebug(this);
	final PluginSnapshot snapshot = new PluginSnapshot(this);
	final PluginQuests quests = new PluginQuests(this);
	final PluginNavigation navigation = new PluginNavigation(this);
	final PluginHints hints = new PluginHints(this);
	final PluginHighlights highlights = new PluginHighlights(this);
	final PluginTick ticks = new PluginTick(this);
	final PluginPlayer player = new PluginPlayer(this);

	@Inject
	Client client;

	@Inject
	ClientThread clientThread;

	@Inject
	private OverlayManager overlayManager;

	@Inject
	OsrsPathBridgeConfig config;

	@Inject
	Gson gson;

	@Inject
	private OsrsPathWorldOverlay worldOverlay;

	@Inject
	private OsrsPathWidgetOverlay widgetOverlay;

	@Inject
	private OsrsPathItemOverlay itemOverlay;

	@Inject
	private InventoryCheckOverlay checklistOverlay;

	@Inject
	private GrandExchangeHelperOverlay geOverlay;

	@Inject
	private OsrsPathDangerOverlay dangerOverlay;

	@Inject
	private OsrsPathArrowOverlay arrowOverlay;

	@Inject
	OsrsPathGuideOverlay guideOverlay;

	@Inject
	private MouseManager mouseManager;

	@Inject
	ConfigManager configManager;

	@Inject
	WorldMapPointManager worldMapPointManager;

	@Inject
	private ClientToolbar clientToolbar;

	@Inject
	private OsrsPathDebugOverlay debugOverlay;

	@Inject
	private OsrsPathShopOverlay shopOverlay;

	@Inject
	private KeyManager keyManager;

	@Inject
	DrawManager drawManager;

	@Inject
	ScheduledExecutorService executor;

	/** The "OSRS Path" side panel: what the step needs, where to get it, "Go here". */
	OsrsPathPanel panel;
	private NavigationButton panelButton;
	/** Clicks on the "What you need" list on the game screen. */
	private GuideMouse guideMouse;
	/**
	 * What the step needs and where to go, for the in-game list and the side panel. Computed on the client thread when the step,
	 * target, bag or bank changes; the Swing panel is rebuilt only when the view changed.
	 */
	@Getter
	volatile StepGuide.View guideView;
	/** The Ledger card's open tab ({@link LedgerGuide#NOW} and on); back to Now when the step changes: a new step's sections are new. */
	@Getter
	int hudTab;
	/** The in-game guide's card, built from one snapshot of the state each time it changes ({@link PluginNavigation#rebuildCard}); null means nothing to show. */
	@Getter
	volatile HudModel.Card hudCard;
	StepGuide.View panelView;
	/** A message in the list and panel after a click, for example "navigation is off"; cleared by changing the step. */
	String guideMessage;

	@Inject
	ItemManager itemManager;

	@Inject
	PluginManager pluginManager;

	@Inject
	EventBus eventBus;

	/** The current target. Changed only on the client thread, read by the overlays there too. */
	@Getter
	ActiveTarget target;

	/** Matching NPCs and objects nearby, collected from spawn events rather than by scanning every frame. */
	@Getter
	final List<NPC> npcs = new ArrayList<>();

	@Getter
	final Map<TileObject, String> objects = new HashMap<>();

	/** The per-tick state the in-game guide is built from: recomputed once per tick and when the target or bag changes. */
	@Getter
	Hud.State hud;

	/**
	 * The route stops of the current step (gate -> bridge -> ladder -> NPC); null means the step has none. They
	 * are not drawn on the ground: the arrow, the HUD ("Point 2/5") and Shortest Path lead to the current stop.
	 */
	Navigation.Breadcrumbs breadcrumbs;

	@Getter
	Checklist.Result checklist = Checklist.NONE;

	/** The bulk list at the exchange: what you have, what is in the order, what to buy. */
	@Getter
	List<ShoppingPlan.Row> shopping = Collections.emptyList();

	/** The bulk list as the exchange card sees it: empty when its setting is off (then the step's card is the exchange card). */
	List<ShoppingPlan.Row> exchangeBulk()
	{
		return config.showGeHelper() ? shopping : Collections.emptyList();
	}

	BridgeServer server;
	AutoCompletionManager completion;
	boolean arrowSet;
	boolean near;
	WorldPoint lastPosition;
	/** Quest Helper's current step when its condition is met (not "by default", not undecided); null otherwise. */
	String qhLeaf;
	/** Where Quest Helper's step points when it is not our line's own step (the hole to Chief Tess's cave); null when the line leads there itself. */
	volatile QhVia.Via stageVia;
	/** The way in or out the arrow points at instead of a target in another layer; null when the target is in the player's layer. */
	volatile Portals.Portal portalShown;

	/** Bag and worn items (without notes), notes separately, bank null until it has been opened. */
	ItemCounts carried = ItemCounts.EMPTY;
	ItemCounts noted = ItemCounts.EMPTY;
	ItemCounts bank;
	/** The bank was loaded from a previous session (from the profile settings), not read from the game; until the bank is opened it is "last known". */
	boolean bankFromSave;
	long bankSavedAt;
	/** The bank changed and has not been written to the settings yet. */
	boolean bankDirty;
	/** Ticks since login while looking for a bank snapshot: the RuneLite profile does not appear at the same moment as login. */
	int bankLoadTicks;
	/** The Chronicle's charges were looked up for this login (our copy, else what the Item Charges plugin saved). */
	boolean chronicleLoaded;
	int chronicleLoadTicks;
	static final int BANK_LOAD_TICKS = 30;

	ShoppingPlan plan;

	final Map<String, Integer> stats = new LinkedHashMap<>();
	boolean statsDirty;
	/** XP per skill (sent to the app at most once per three seconds, since it changes with every action). */
	final Map<String, Integer> xp = new LinkedHashMap<>();
	boolean xpDirty;
	/** Completed quests as they were sent; checked once every twenty ticks. */
	List<String> questsSent;
	String playerSent;
	boolean ownedDirty;
	boolean gearDirty;
	boolean pacingDirty;

	/** A temporary target over the step: a place from the app's map or a shop for an upgrade. */
	@Getter
	NavTarget navTarget;

	/** The app's gear advice (POST /gear-hint): the HUD line, what to ask the bank for, what to highlight. */
	volatile GearHint gearHint;

	/** The seller or NPC of the temporary target nearby, collected from events like the step's NPCs. */
	@Getter
	final List<NPC> navNpcs = new ArrayList<>();

	/** The stage's items for soft highlighting in the bank (POST /bank-tags). Written from the server thread. */
	volatile Set<Integer> bankTagIds = Collections.emptySet();

	DangerRadar radar;

	/** The nearest danger zone and how close the player got to it. Changes when the tile changes. */
	@Getter
	DangerRadar.Reading danger = DangerRadar.QUIET;

	/** Dangerous NPCs nearby: searched only while the player is in the warning zone. */
	@Getter
	final List<NPC> dangerNpcs = new ArrayList<>();

	/** The pacing of the current step; null means the step has none or it is off. */
	PacingSet pacing;
	/** Reads that run a client script (quest states) run only inside the game tick, never inside a script (2.57.1: "scripts are not reentrant" froze the game). */
	final ScriptGuard scripts = new ScriptGuard();

	boolean shortestPathLooked;
	/** The target handed to Shortest Path, so as not to send the same thing twice and to know what to clear later. */
	WorldPoint pathSent;

	@Provides
	OsrsPathBridgeConfig provideConfig(ConfigManager configManager)
	{
		return configManager.getConfig(OsrsPathBridgeConfig.class);
	}

	/** Whether the game window is the active window; null when it cannot be told. */
	Boolean windowFocused()
	{
		java.awt.Window w = client.getCanvas() == null ? null : javax.swing.SwingUtilities.getWindowAncestor(client.getCanvas());
		return w == null ? null : w.isFocused();
	}

	@Override
	protected void startUp()
	{
		completion = new AutoCompletionManager(player::isQuestFinished, stats::get, player::ownedCount, player::onStepCompleted);
		completion.setVarbitReader(id -> client.getGameState() == GameState.LOGGED_IN ? client.getVarbitValue(id) : null);
		completion.setVarpReader(id -> client.getGameState() == GameState.LOGGED_IN ? client.getVarpValue(id) : null);
		radar = DangerRadar.load(gson);
		debug.startTelemetry();
		startServer();
		overlayManager.add(debugOverlay);
		overlayManager.add(shopOverlay);
		debug.debugHotkey = new HotkeyListener(() -> config.debugKey())
		{
			@Override
			public void hotkeyPressed()
			{
				clientThread.invokeLater(debug::toggleDebug);
			}
		};
		debug.shotHotkey = new HotkeyListener(() -> config.shotKey())
		{
			@Override
			public void hotkeyPressed()
			{
				clientThread.invokeLater(() -> debug.takeShot("hotkey"));
			}
		};
		keyManager.registerKeyListener(debug.debugHotkey);
		keyManager.registerKeyListener(debug.shotHotkey);
		overlayManager.add(worldOverlay);
		overlayManager.add(widgetOverlay);
		overlayManager.add(itemOverlay);
		overlayManager.add(checklistOverlay);
		overlayManager.add(geOverlay);
		overlayManager.add(dangerOverlay);
		overlayManager.add(arrowOverlay);
		// The one in-game guide (2.74.0). The top-left plate and the docked bar it replaced are gone: do not add a second HUD overlay here.
		overlayManager.add(guideOverlay);
		guideMouse = new GuideMouse(client, guideOverlay, a -> clientThread.invokeLater(() -> quests.guideAction(a)));
		mouseManager.registerMouseListener(guideMouse);
		panel = new OsrsPathPanel(new OsrsPathPanel.Actions()
		{
			@Override
			public void go(int place)
			{
				clientThread.invokeLater(() -> quests.goToPlace(place));
			}

			@Override
			public void back()
			{
				clientThread.invokeLater(() -> navigation.applyNav(null));
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
				ItemCounts.setLevels(client.getRealSkillLevel(Skill.MINING), client.getRealSkillLevel(Skill.WOODCUTTING), client.getRealSkillLevel(Skill.HITPOINTS));
				for (Skill skill : Skill.values())
				{
					if (!PluginPlayer.isOverall(skill))
					{
						stats.put(PluginPlayer.skillKey(skill), client.getRealSkillLevel(skill));
						xp.put(PluginPlayer.skillKey(skill), client.getSkillExperience(skill));
					}
				}
				statsDirty = true;
				xpDirty = true;
				player.rebuildCarried();
			}
		});
	}

	@Override
	protected void shutDown()
	{
		player.saveBank(true);
		keyManager.unregisterKeyListener(debug.debugHotkey);
		keyManager.unregisterKeyListener(debug.shotHotkey);
		overlayManager.remove(debugOverlay);
		overlayManager.remove(shopOverlay);
		debugVisible = false;
		debug.stopTelemetry();
		stopServer();
		overlayManager.remove(worldOverlay);
		overlayManager.remove(widgetOverlay);
		overlayManager.remove(itemOverlay);
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
			snapshot.applyTarget(null);
			navigation.setMapPoint(null, null);
		});
		completion = null;
		plan = null;
		shopping = Collections.emptyList();
		bankTagIds = Collections.emptySet();
		gearHint = null;
		snapshot.prep = null;
		snapshot.snapshotStepKey = null;
		snapshot.snapshotOrder.reset();
	}

	private void startServer()
	{
		snapshot.snapshotOrder.reset();
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
		// No callback already queued by the stopped server may apply to its replacement.
		snapshot.snapshotOrder.reset();
	}

	@Subscribe
	public void onConfigChanged(ConfigChanged e)
	{
		if ("runelite".equals(e.getGroup()) && e.getKey().endsWith("plugin"))
		{
			// Some plugin was enabled or disabled, maybe Shortest Path.
			clientThread.invokeLater(navigation::updateNavigation);
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
			clientThread.invokeLater(navigation::updateNavigation);
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
			clientThread.invokeLater(navigation::updateNavigation);
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
						navigation.finishNav("cleared");
					}
					if (!config.upgradeRouter())
					{
						gearHint = null;
					}
					gearDirty = true;
					navigation.updateHud();
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
					navigation.updateHud();
				});
				break;
			case "smartPacing":
				clientThread.invokeLater(() ->
				{
					hints.setupPacing();
					navigation.updateHud();
				});
				break;
			case "hudPacing":
			case "smartView":
				clientThread.invokeLater(navigation::updateHud);
				break;
			case "telemetry":
				if (config.telemetry())
				{
					debug.startTelemetry();
				}
				else
				{
					debug.stopTelemetry();
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
		clientThread.invokeLater(navigation::updateNavigation);
	}

	// ---------- App requests (server thread -> client thread) ----------
	@Override
	public void onActiveTarget(ActiveTarget t)
	{
		clientThread.invokeLater(() -> snapshot.applyTarget(t));
	}

	@Override
	public void onClear()
	{
		clientThread.invokeLater(() ->
		{
			if (navTarget != null)
			{
				navigation.finishNav("cleared");
			}
			snapshot.applyTarget(null);
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
		clientThread.invokeLater(() -> navigation.applyNav(t.isClear() ? null : t));
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
			navigation.updateHud();
		});
		return null;
	}

	// ---------- Debug log, developer badge, screenshots ----------
	/** What the developer badge shows; rebuilt once per tick while the badge is open. */
	@Getter
	volatile DebugView.State debugState;
	@Getter
	volatile boolean debugVisible;

	/** The badges report what they drew: the engine watchdog catches "there is a step, but the screen is empty". */
	/** A bank, exchange or merchant window is on screen now: the old departure check at the bank is not needed then, the window replaces it. */
	@Getter
	volatile boolean shopShown;

	@Override
	public Map<String, Object> onTelemetry()
	{
		return debug.onTelemetry();
	}

	// ---------- State snapshot from the app (protocol 6) ----------
	@Override
	public BridgeServer.PrepResult onPrepPlan(PrepEnvelope e, Map<String, String> bad)
	{
		return snapshot.onPrepPlan(e, bad);
	}

	@Override
	public String onBankTags(BankTags t)
	{
		return snapshot.onBankTags(t);
	}

	@Override
	public void onShoppingPlan(ShoppingPlan p)
	{
		snapshot.onShoppingPlan(p);
	}

	// ---------- Whom to highlight ----------
	@Subscribe
	public void onPostMenuSort(PostMenuSort e)
	{
		highlights.onPostMenuSort(e);
	}

	@Subscribe
	public void onNpcSpawned(NpcSpawned e)
	{
		highlights.onNpcSpawned(e);
	}

	@Subscribe
	public void onNpcChanged(NpcChanged e)
	{
		highlights.onNpcChanged(e);
	}

	@Subscribe
	public void onNpcDespawned(NpcDespawned e)
	{
		highlights.onNpcDespawned(e);
	}

	@Subscribe
	public void onGameObjectSpawned(GameObjectSpawned e)
	{
		highlights.onGameObjectSpawned(e);
	}

	@Subscribe
	public void onGameObjectDespawned(GameObjectDespawned e)
	{
		highlights.onGameObjectDespawned(e);
	}

	@Subscribe
	public void onWallObjectSpawned(WallObjectSpawned e)
	{
		highlights.onWallObjectSpawned(e);
	}

	@Subscribe
	public void onWallObjectDespawned(WallObjectDespawned e)
	{
		highlights.onWallObjectDespawned(e);
	}

	@Subscribe
	public void onDecorativeObjectSpawned(DecorativeObjectSpawned e)
	{
		highlights.onDecorativeObjectSpawned(e);
	}

	@Subscribe
	public void onDecorativeObjectDespawned(DecorativeObjectDespawned e)
	{
		highlights.onDecorativeObjectDespawned(e);
	}

	@Subscribe
	public void onGroundObjectSpawned(GroundObjectSpawned e)
	{
		highlights.onGroundObjectSpawned(e);
	}

	@Subscribe
	public void onGroundObjectDespawned(GroundObjectDespawned e)
	{
		highlights.onGroundObjectDespawned(e);
	}

	@Subscribe
	public void onGameStateChanged(GameStateChanged e)
	{
		highlights.onGameStateChanged(e);
	}

	// ---------- Auto-tick ----------
	@Subscribe
	public void onActorDeath(ActorDeath e)
	{
		ticks.onActorDeath(e);
	}

	@Subscribe
	public void onHitsplatApplied(HitsplatApplied e)
	{
		ticks.onHitsplatApplied(e);
	}

	@Subscribe
	public void onGameTick(GameTick e)
	{
		ticks.onGameTick(e);
	}

	// ---------- Levels ----------
	@Subscribe
	public void onStatChanged(StatChanged e)
	{
		player.onStatChanged(e);
	}

	// ---------- Bag, bank and exchange ----------
	@Subscribe
	public void onItemContainerChanged(ItemContainerChanged e)
	{
		player.onItemContainerChanged(e);
	}

	@Subscribe
	public void onGrandExchangeOfferChanged(GrandExchangeOfferChanged e)
	{
		player.onGrandExchangeOfferChanged(e);
	}

	@Subscribe
	public void onChatMessage(ChatMessage e)
	{
		player.onChatMessage(e);
	}

	@Subscribe
	public void onWidgetLoaded(WidgetLoaded e)
	{
		player.onWidgetLoaded(e);
	}

	@Subscribe
	public void onMenuOptionClicked(MenuOptionClicked e)
	{
		player.onMenuOptionClicked(e);
	}

	@Subscribe
	public void onVarbitChanged(VarbitChanged e)
	{
		player.onVarbitChanged(e);
	}
}
