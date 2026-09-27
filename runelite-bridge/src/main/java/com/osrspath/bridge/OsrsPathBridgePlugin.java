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
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import javax.inject.Inject;
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
import net.runelite.api.events.ChatMessage;
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
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.EventBus;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.events.PluginChanged;
import net.runelite.client.events.PluginMessage;
import net.runelite.client.game.ItemManager;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.plugins.PluginManager;
import net.runelite.client.ui.overlay.OverlayManager;

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
	private OsrsPathBreadcrumbOverlay breadcrumbOverlay;

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

	/** Путевые точки текущего шага; null — у шага их нет. */
	@Getter
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
	private boolean ownedDirty;

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
		completion = new AutoCompletionManager(this::isQuestFinished, this::onStepCompleted);
		startServer();
		overlayManager.add(worldOverlay);
		overlayManager.add(widgetOverlay);
		overlayManager.add(itemOverlay);
		overlayManager.add(hudOverlay);
		overlayManager.add(checklistOverlay);
		overlayManager.add(geOverlay);
		overlayManager.add(breadcrumbOverlay);
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
					}
				}
				statsDirty = true;
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
		overlayManager.remove(breadcrumbOverlay);
		clientThread.invoke(() -> applyTarget(null));
		completion = null;
		plan = null;
		shopping = Collections.emptyList();
	}

	private void startServer()
	{
		List<String> origins = Arrays.stream(config.allowedOrigins().split(","))
			.map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toList());
		BridgeServer s = new BridgeServer(config.port(), gson, this, origins);
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
		}
		if ("useShortestPath".equals(e.getKey()) || "showBreadcrumbs".equals(e.getKey()))
		{
			clientThread.invokeLater(this::updateNavigation);
		}
		if ("port".equals(e.getKey()) || "allowedOrigins".equals(e.getKey()))
		{
			stopServer();
			startServer();
		}
		if ("hintArrow".equals(e.getKey()))
		{
			clientThread.invokeLater(this::updateNavigation);
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
		clientThread.invokeLater(() -> applyTarget(null));
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

	private void applyTarget(ActiveTarget t)
	{
		target = t;
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
		updateNavigation();
		updateHud();
	}

	// ---------- Куда идти: стрелка, Shortest Path, HUD ----------

	/** Текущая точка пути: следующая путевая точка или точка шага. null — идти некуда или маршрут пройден. */
	private WorldPoint navTarget()
	{
		if (target == null)
		{
			return null;
		}
		ActiveTarget.WorldPointDto p = breadcrumbs != null ? breadcrumbs.current() : target.getWorldPoint();
		return p == null ? null : new WorldPoint(p.getX(), p.getY(), p.getPlane());
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

	/** Shortest Path сейчас ведёт к нашей цели — свои метки на земле тогда не нужны. */
	boolean isShortestPathLeading()
	{
		return pathSent != null;
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
		if (target == null)
		{
			hud = null;
			return;
		}
		String title = "[" + target.getStepId() + "] " + (target.getTitle() == null ? "" : target.getTitle());
		String goal = target.getGoal();
		if (breadcrumbs != null)
		{
			ActiveTarget.WorldPointDto c = breadcrumbs.current();
			goal = c == null
				? "Маршрут пройден" + (goal != null ? " · " + goal : "")
				: "Точка " + (breadcrumbs.index() + 1) + "/" + breadcrumbs.size() + (c.getLabel() != null ? ": " + c.getLabel() : "");
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
				: "Сумка: не хватает " + checklist.missing() + " из " + checklist.getRows().size();
		}
		hud = new OsrsPathHudOverlay.State(title, goal, distance, near, bag, checklist.isReady());
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

	@Subscribe
	public void onNpcSpawned(NpcSpawned e)
	{
		if (matches(e.getNpc()))
		{
			npcs.add(e.getNpc());
		}
	}

	@Subscribe
	public void onNpcChanged(NpcChanged e)
	{
		npcs.remove(e.getNpc());
		if (matches(e.getNpc()))
		{
			npcs.add(e.getNpc());
		}
	}

	@Subscribe
	public void onNpcDespawned(NpcDespawned e)
	{
		npcs.remove(e.getNpc());
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
			objects.clear();
			arrowSet = false;
			pathSent = null;
		}
		if (state == GameState.LOGIN_SCREEN)
		{
			// Другой персонаж — другие уровни, сумка и банк.
			stats.clear();
			statsDirty = true;
			carried = ItemCounts.EMPTY;
			noted = ItemCounts.EMPTY;
			bank = null;
			containersChanged();
		}
		if (state == GameState.LOGGED_IN)
		{
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
		if (target != null && me != null)
		{
			WorldPoint pos = me.getWorldLocation();
			if (!pos.equals(lastPosition))
			{
				lastPosition = pos;
				if (breadcrumbs != null && breadcrumbs.update(pos.getX(), pos.getY(), pos.getPlane()))
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
		if (ownedDirty)
		{
			ownedDirty = false;
			server.owned(bank != null, ownedReport());
		}
	}

	// ---------- Уровни ----------

	/** Общий уровень — не навык; в RuneLite он помечен устаревшим, поэтому сравниваем по имени. */
	static boolean isOverall(Skill skill)
	{
		return "OVERALL".equals(skill.name());
	}

	static String skillKey(Skill skill)
	{
		return skill.getName().toLowerCase(java.util.Locale.ROOT);
	}

	@Subscribe
	public void onStatChanged(StatChanged e)
	{
		if (isOverall(e.getSkill()))
		{
			return;
		}
		Integer old = stats.put(skillKey(e.getSkill()), e.getLevel());
		if (old == null || old != e.getLevel())
		{
			statsDirty = true;
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
		recomputeChecklist();
		recomputeShopping();
		ownedDirty = true;
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
