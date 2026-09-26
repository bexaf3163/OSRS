package com.osrspath.bridge;

import com.google.gson.Gson;
import com.google.inject.Provides;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import javax.inject.Inject;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.ChatMessageType;
import net.runelite.api.Client;
import net.runelite.api.GameObject;
import net.runelite.api.GameState;
import net.runelite.api.NPC;
import net.runelite.api.NPCComposition;
import net.runelite.api.ObjectComposition;
import net.runelite.api.Quest;
import net.runelite.api.QuestState;
import net.runelite.api.Scene;
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
import net.runelite.api.events.GroundObjectDespawned;
import net.runelite.api.events.GroundObjectSpawned;
import net.runelite.api.events.NpcChanged;
import net.runelite.api.events.NpcDespawned;
import net.runelite.api.events.NpcSpawned;
import net.runelite.api.events.VarbitChanged;
import net.runelite.api.events.WallObjectDespawned;
import net.runelite.api.events.WallObjectSpawned;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.overlay.OverlayManager;

@Slf4j
@PluginDescriptor(
	name = "OSRS Path Bridge",
	description = "Мост локального гида с 3D-подсказками, подсветкой и авто-завершением",
	tags = {"bridge", "navigation", "helper"}
)
public class OsrsPathBridgePlugin extends Plugin implements BridgeServer.Listener
{
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

	/** Текущая цель. Меняется только в потоке клиента, читается оверлеями там же. */
	@Getter
	private ActiveTarget target;

	/** Подходящие NPC и объекты рядом — собираются по событиям появления, а не перебором каждый кадр. */
	@Getter
	private final List<NPC> npcs = new ArrayList<>();

	@Getter
	private final Map<TileObject, String> objects = new HashMap<>();

	private BridgeServer server;
	private AutoCompletionManager completion;
	private boolean arrowSet;

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
		clientThread.invokeLater(() ->
		{
			if (server != null)
			{
				server.setInGame(client.getGameState() == GameState.LOGGED_IN);
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
		clientThread.invoke(() -> applyTarget(null));
		completion = null;
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
		if (!OsrsPathBridgeConfig.GROUP.equals(e.getGroup()))
		{
			return;
		}
		if ("port".equals(e.getKey()) || "allowedOrigins".equals(e.getKey()))
		{
			stopServer();
			startServer();
		}
		if ("hintArrow".equals(e.getKey()))
		{
			clientThread.invokeLater(this::updateHintArrow);
		}
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

	private void applyTarget(ActiveTarget t)
	{
		target = t;
		if (completion != null)
		{
			completion.setTarget(t);
		}
		rescan();
		updateHintArrow();
	}

	/** Стрелка игры к точке шага. Чужую стрелку (например, квестовую) не трогаем — только свою. */
	private void updateHintArrow()
	{
		ActiveTarget.WorldPointDto p = target == null ? null : target.getWorldPoint();
		if (p == null || !config.hintArrow() || client.getGameState() != GameState.LOGGED_IN)
		{
			if (arrowSet)
			{
				client.clearHintArrow();
				arrowSet = false;
			}
			return;
		}
		client.setHintArrow(new WorldPoint(p.getX(), p.getY(), p.getPlane()));
		arrowSet = true;
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
			updateHintArrow();
		}
		else if (state == GameState.LOGIN_SCREEN || state == GameState.HOPPING)
		{
			npcs.clear();
			objects.clear();
			arrowSet = false;
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
