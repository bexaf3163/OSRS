package com.osrspath.bridge;

import com.google.gson.Gson;
import com.google.inject.Provides;
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
import java.util.function.IntUnaryOperator;
import java.util.stream.Collectors;
import javax.inject.Inject;
import javax.swing.SwingUtilities;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
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
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.EventBus;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.events.PluginChanged;
import net.runelite.client.events.PluginMessage;
import net.runelite.client.game.ItemManager;
import net.runelite.client.input.MouseManager;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.plugins.PluginManager;
import net.runelite.client.ui.ClientToolbar;
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
		startServer();
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
				clientThread.invokeLater(this::updateHud);
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
		if (!Objects.equals(stepId, gotStep))
		{
			gotItems.clear();
			gotStep = stepId;
		}
		target = t;
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
		NavTarget n = navTarget;
		StepGuide.View v = StepGuide.view(target, ItemCounts.sum(carried, noted), bank,
			n == null ? null : n.getLabel(), n == null ? 0 : n.getX(), n == null ? 0 : n.getY(), n == null ? 0 : n.getPlane(), gotItems);
		if (guideMessage != null)
		{
			v = new StepGuide.View(v.getTitle(), v.getGoal(), v.getItems(), v.getPlaces(), v.getDetour(), guideMessage, v.getNext(), v.getFinale());
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

	/** Клик по списку в игре (поток клиента). */
	private void guideAction(GuideList.Action a)
	{
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
		if (t == null)
		{
			if (navTarget != null)
			{
				finishNav("cleared");
			}
			return;
		}
		navTarget = t;
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
		return t != null && !t.isPurchase() && pos.getPlane() == t.getPlane()
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
		if (bag != null)
		{
			Map<Integer, Integer> stacks = new LinkedHashMap<>();
			for (Item it : bag.getItems())
			{
				if (it.getId() > 0 && it.getQuantity() > 0)
				{
					stacks.merge(it.getId(), it.getQuantity(), Integer::sum);
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

	private void updateHud()
	{
		refreshGuide();
		boolean dangerShown = warned(danger);
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
		WorldPoint nav = navTarget();
		Player me = client.getLocalPlayer();
		if (nav != null && me != null && client.getGameState() == GameState.LOGGED_IN)
		{
			WorldPoint pos = me.getWorldLocation();
			Navigation.Readout r = Navigation.readout(pos.getX(), pos.getY(), pos.getPlane(), nav.getX(), nav.getY(), nav.getPlane(), near);
			near = r.isNear();
			distance = r.getText();
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
		hud = new OsrsPathHudOverlay.State(title, goal, distance, near, bag, checklist.isReady(), dangerText, inside, pace, paceGood, upgrade);
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
				lastPosition = pos;
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

	private void recomputeChecklist()
	{
		List<ActiveTarget.ChecklistItem> items = target == null ? null : target.getChecklist();
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
