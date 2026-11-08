package com.osrspath.bridge;

import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** The game state the plugin reports, and the events pushed to the app: a part of {@link BridgeServer}, which holds the state the parts share. */
final class BridgeReports
{
	private final BridgeServer bridge;
	private final QuestObservations questStates = new QuestObservations();

	BridgeReports(BridgeServer bridge)
	{
		this.bridge = bridge;
	}

	/** Where the character stands: {"x":...,"y":...,"plane":...}; only in /status (not broadcast, it changes with every step). Since protocol 5. */
	private volatile Map<String, Integer> pos;

	private volatile boolean shortestPath;

	/** The moment of the last home and minigame teleport as the game keeps it (minutes since the epoch, 0 = never); only for /status. */
	private volatile int lastHomeTeleport;

	private volatile int lastMinigameTeleport;

	/** The teleport marks were read from the game at least once this session: before that "ready" would be a guess. */
	private volatile boolean teleportMarksRead;

	/** The active spellbook (0 standard, 1 Ancient, 2 Lunar, 3 Arceuus); -1 until it is read. */
	private volatile int spellbook = -1;

	/** The Chronicle's charges as the game last told them; null is unknown (never zero). */
	private volatile Integer chronicleCharges;

	/** The quest points and the total level as the game holds them (additive in /status since 2.54.0); null is unknown (never zero). */
	private volatile Integer questPoints;

	private volatile Integer totalLevel;

	/** "normal" or "ironman" (any Ironman kind) as the game holds it (additive in /status since 2.59.0); null is unknown. The cleanup advice reads it: Ironmen cannot sell. */
	private volatile String accountType;

	/** The fights of the combat training step (additive in /status since 2.57.0): {"stepId":..., "foes":[...]}; null — none recorded. */
	private volatile Map<String, Object> combatLog;

	/** The current temporary target (like NAV_SET) or null, for /status. */
	private volatile JsonObject navTarget;

	private volatile Map<String, Object> questInstruction;

	public void setInGame(boolean value)
	{
		if (!value)
		{
			synchronized (bridge.streamLock) { if (bridge.pendingCompletionPlayer == null) clearPendingCompletion(); }
		}
		if (!value) questInstruction = null;
		if (bridge.inGame == value)
		{
			return;
		}
		bridge.inGame = value;
		broadcast(statusEvent());
	}

	/**
	 * The existing guide cursor is independent of a temporary navigation target. Client thread only.
	 * A change is announced with a STATUS event: the app asks /status again on it, so its "What to do now" follows the quest while the
	 * player stays logged in (the cursor is only in /status; without the event the app kept the line it saw at login).
	 */
	public void setQuestInstruction(String stepId, Integer stageAt, int lineIndex, boolean peeking)
	{
		Map<String, Object> next = null;
		if (stepId != null && stageAt != null && lineIndex >= 0)
		{
			next = new LinkedHashMap<>();
			next.put("stepId", stepId);
			next.put("stageAt", stageAt);
			next.put("lineIndex", lineIndex);
			next.put("peeking", peeking);
		}
		if (Objects.equals(next, questInstruction))
		{
			return;
		}
		questInstruction = next;
		broadcast(statusEvent());
	}

	/** New skill levels. Identical ones are not broadcast. */
	public void setStats(Map<String, Integer> value)
	{
		Map<String, Integer> copy = value == null ? null : new LinkedHashMap<>(value);
		if (Objects.equals(bridge.stats, copy))
		{
			return;
		}
		bridge.stats = copy;
		broadcast(statsEvent());
	}

	/** XP per skill (since protocol 5). An identical one is not broadcast. */
	public void setXp(Map<String, Integer> value)
	{
		Map<String, Integer> copy = value == null ? null : new LinkedHashMap<>(value);
		if (Objects.equals(bridge.xp, copy))
		{
			return;
		}
		bridge.xp = copy;
		broadcast(xpEvent());
	}

	/** Completed quests (since protocol 5). The same list is not broadcast. */
	public void setQuests(List<String> value)
	{
		if (value == null) questStates.invalidate();
		List<String> copy = value == null ? null : new ArrayList<>(value);
		if (Objects.equals(bridge.questsDone, copy))
		{
			return;
		}
		bridge.questsDone = copy;
		broadcast(questsEvent());
	}

	/** One poll reads each quest once, preserving UNKNOWN on unavailable client scripts. */
	void setQuestStates(Map<String, String> states)
	{
		if (!bridge.inGame || !questStates.update(bridge.player, states, questPoints)) return;
		List<String> done = new ArrayList<>();
		states.forEach((name, state) -> { if ("COMPLETED".equals(state)) done.add(name); });
		bridge.questsDone = done;
		broadcast(questsEvent());
	}

	/** A real login-screen boundary, not a world hop, SSE reconnect or temporary loss of game state. */
	void endQuestSession()
	{
		questStates.reset();
		bridge.questsDone = null;
	}

	/** Where the character stands (since protocol 5): /status answers, no events. */
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

	/** The game's marks of the last home and minigame teleport; /status turns them into the seconds left (omitted when ready or unknown). */
	public void setTeleportMarks(int home, int minigame)
	{
		lastHomeTeleport = home;
		lastMinigameTeleport = minigame;
		teleportMarksRead = true;
	}

	/** The spellbook varbit as the game holds it; anything outside 0..3 is reported as unknown. */
	public void setSpellbook(int value)
	{
		spellbook = value >= 0 && value <= 3 ? value : -1;
	}

	/** The Chronicle's charges from the game's messages (or the last saved count); null when unknown. */
	public void setChronicleCharges(Integer value)
	{
		Integer next = value != null && value >= 0 && value <= ChronicleCharges.MAX ? value : null;
		if (Objects.equals(next, chronicleCharges))
		{
			return;
		}
		chronicleCharges = next;
		// The app re-reads /status on STATUS: the count reaches the shopping list and the transport line at once.
		broadcast(statusEvent());
	}

	/**
	 * The quest points (varp QP) and the total level from the game. A value outside the game's range is unknown, not clamped: the app uses them to
	 * tell whether a new account's trade restrictions (10 quest points, total level 100) still apply, and a wrong number would turn them off by mistake.
	 */
	public void setProgressTotals(Integer quests, Integer total)
	{
		questPoints = quests != null && quests >= 0 && quests <= 500 ? quests : null;
		totalLevel = total != null && total >= 0 && total <= 2277 ? total : null;
	}

	/** "normal", "ironman" or null (unknown). Anything else is unknown: the app never guesses an account kind from a stray word. */
	public void setAccountType(String kind)
	{
		accountType = "normal".equals(kind) || "ironman".equals(kind) ? kind : null;
	}

	/**
	 * The fights recorded on a combat training step (CombatLog): kills, seconds and damage taken per opponent version. The app calibrates its food and
	 * time estimate with them; nothing recorded (or no combat step) leaves the field out, never zeros.
	 */
	public void setCombatLog(String stepId, List<CombatLog.Entry> foes)
	{
		if (stepId == null || foes == null || foes.isEmpty())
		{
			combatLog = null;
			return;
		}
		List<Map<String, Object>> list = new ArrayList<>();
		for (CombatLog.Entry f : foes)
		{
			Map<String, Object> m = new LinkedHashMap<>();
			m.put("name", f.getName());
			m.put("combat", f.getCombat());
			m.put("kills", f.getKills());
			m.put("seconds", Math.round(f.getSeconds() * 10) / 10.0);
			m.put("damage", f.getDamage());
			list.add(m);
		}
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("stepId", stepId);
		out.put("foes", list);
		combatLog = out;
	}

	/** The character name (since protocol 5); comes in the STATUS event. */
	public void setPlayer(String value)
	{
		if (Objects.equals(bridge.player, value))
		{
			return;
		}
		synchronized (bridge.streamLock)
		{
			if (value != null && !Objects.equals(bridge.pendingCompletionPlayer, value)) clearPendingCompletion();
		}
		questStates.identity(value);
		bridge.questsDone = null;
		questPoints = null;
		totalLevel = null;
		bridge.player = value;
		broadcast(statusEvent());
	}

	public void setShortestPath(boolean value)
	{
		shortestPath = value;
	}

	/**
	 * How many of the needed items there are: carried is in the bag and worn, noted is as notes in the bag,
	 * bank is in the bank (null until the bank was opened in this session). The same is not broadcast.
	 */
	public void owned(boolean bankSeen, List<Map<String, Object>> items)
	{
		bridge.owned(bankSeen, null, items);
	}

	/** bankSavedAt: the bank was taken from the saved previous session (the write time), not read from the game now; null means read now. */
	public void owned(boolean bankSeen, Long bankSavedAt, List<Map<String, Object>> items)
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "OWNED");
		e.put("bankSeen", bankSeen);
		if (bankSavedAt != null)
		{
			e.put("bankSavedAt", bankSavedAt);
		}
		e.put("items", items);
		if (e.equals(bridge.lastOwned))
		{
			return;
		}
		bridge.lastOwned = e;
		broadcast(e);
	}

	/** Gear and coins for the upgrade hint. null means unknown (not in the game or the feature is off). */
	public void setGear(Map<String, Object> value)
	{
		Map<String, Object> copy = value == null ? null : new LinkedHashMap<>(value);
		if (Objects.equals(bridge.gear, copy))
		{
			return;
		}
		bridge.gear = copy;
		broadcast(gearEvent());
	}

	/** The step's pacing; value null means the step has none or it is off. */
	public void pacing(String stepId, Map<String, Object> value)
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "PACING");
		e.put("stepId", stepId);
		e.put("pacing", value);
		if (e.equals(bridge.lastPacing))
		{
			return;
		}
		bridge.lastPacing = e;
		broadcast(e);
	}

	/**
	 * A temporary target was set, by the app (/nav-target) or by the player in the game (the "What you need" list, the side panel).
	 * The app shows the same target ("● the arrow points here", the map marker), even if it was chosen in the game.
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
	 * The target in the same form in which the app sends it to /nav-target (the same NavTarget fields): the app compares it with
	 * its own buttons. The service clear is not needed.
	 */
	private JsonObject navJson(NavTarget t)
	{
		JsonObject o = bridge.gson.toJsonTree(t).getAsJsonObject();
		o.remove("clear");
		return o;
	}

	/** The temporary target was cleared: arrived means reached, obtained means the item was received, cleared means cleared by a setting or /clear. */
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

	/**
	 * The character moved abruptly (since plugin 2.20): kind is TELEPORT (a jump of 20+ tiles per tick: a teleport, a respawn)
	 * or DEATH (the character died; fromX/fromY is where). The app turns on recovery mode from these events.
	 */
	public void moved(String kind, int[] from, int[] to)
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "MOVED");
		e.put("kind", kind);
		e.put("from", from == null ? null : point(from));
		e.put("to", to == null ? null : point(to));
		e.put("ts", System.currentTimeMillis());
		broadcast(e);
	}

	private static Map<String, Integer> point(int[] p)
	{
		Map<String, Integer> m = new LinkedHashMap<>();
		m.put("x", p[0]);
		m.put("y", p[1]);
		m.put("plane", p[2]);
		return m;
	}

	public void stepCompleted(String stepId)
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "STEP_AUTO_COMPLETED");
		e.put("stepId", stepId);
		String frame = "data: " + bridge.gson.toJson(e) + "\n\n";
		synchronized (bridge.streamLock)
		{
			bridge.pendingCompletionStep = stepId;
			bridge.pendingCompletionPlayer = bridge.player;
			bridge.pendingCompletionFrame = frame;
			sendAll(frame);
		}
	}

	private void clearPendingCompletion()
	{
		synchronized (bridge.streamLock) { bridge.pendingCompletionStep = null; bridge.pendingCompletionPlayer = null; bridge.pendingCompletionFrame = null; }
	}

	void reportedStep(String id)
	{
		synchronized (bridge.streamLock)
		{
			if (!Objects.equals(bridge.activeStepId, id)) clearPendingCompletion();
			bridge.activeStepId = id;
		}
	}

	int streamCount()
	{
		return bridge.streams.size();
	}

	Map<String, Object> statusEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "STATUS");
		e.put("inGame", bridge.inGame);
		e.put("player", bridge.player);
		return e;
	}

	Map<String, Object> xpEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "XP");
		e.put("xp", bridge.xp);
		return e;
	}

	Map<String, Object> questsEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "QUESTS");
		e.put("done", bridge.questsDone);
		e.put("questStates", bridge.inGame ? questStates.snapshot() : null);
		return e;
	}

	Map<String, Object> statsEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "STATS");
		e.put("stats", bridge.stats);
		return e;
	}

	Map<String, Object> gearEvent()
	{
		Map<String, Object> e = new LinkedHashMap<>();
		e.put("type", "GEAR");
		e.put("gear", bridge.gear);
		return e;
	}

	private void broadcast(Object event)
	{
		sendAll("data: " + bridge.gson.toJson(event) + "\n\n");
	}

	void sendAll(String frame)
	{
		byte[] bytes = frame.getBytes(StandardCharsets.UTF_8);
		synchronized (bridge.streamLock)
		{
			for (AsyncEventStream s : bridge.streams)
			{
				if (!s.offer(bytes)) bridge.streams.remove(s);
			}
		}
	}

	/** GET /status: the game state the plugin last reported and the protocol handshake. */
	Map<String, Object> statusReport()
	{
		Map<String, Object> status = new LinkedHashMap<>();
		status.put("status", "ok");
		status.put("inGame", bridge.inGame);
		status.put("activeStepId", bridge.activeStepId);
		status.put("stats", bridge.stats);
		status.put("xp", bridge.xp);
		status.put("questsDone", bridge.questsDone);
		status.put("questStates", bridge.inGame ? questStates.snapshot() : null);
		status.put("player", bridge.player);
		status.put("pos", pos);
		status.put("shortestPath", shortestPath);
		// Where the temporary target leads now: after a restart the app shows the same one as in the game.
		status.put("navTarget", navTarget);
		Map<String, Object> instruction = questInstruction;
		status.put("questInstruction", bridge.inGame && instruction != null && Objects.equals(instruction.get("stepId"), bridge.activeStepId) ? instruction : null);
		Map<String, Object> g = bridge.gear;
		status.put("equipment", g == null ? null : g.get("equipment"));
		status.put("inventory", g == null ? null : g.get("inventory"));
		status.put("coins", g == null ? null : g.get("coins"));
		status.put("bankCoins", g == null ? null : g.get("bankCoins"));
		status.put("carriedValue", g == null ? null : g.get("carriedValue"));
		status.put("bankValue", g == null ? null : g.get("bankValue"));
		// Teleport cooldowns in seconds left; absent when the teleport is ready or the game's value does not look like a time (never invented).
		long nowSeconds = System.currentTimeMillis() / 1000;
		int homeLeft = bridge.inGame ? TeleportCooldown.remainingSeconds(lastHomeTeleport, nowSeconds, TeleportCooldown.HOME_MINUTES) : 0;
		int minigameLeft = bridge.inGame ? TeleportCooldown.remainingSeconds(lastMinigameTeleport, nowSeconds, TeleportCooldown.MINIGAME_MINUTES) : 0;
		if (homeLeft > 0)
		{
			status.put("homeTeleportSeconds", homeLeft);
		}
		if (minigameLeft > 0)
		{
			status.put("minigameTeleportSeconds", minigameLeft);
		}
		if (bridge.inGame)
		{
			// Whether the Home Teleport state is known at all: without the seconds above, true means "ready", false means "the game did not say".
			status.put("homeTeleportKnown", teleportMarksRead && homeLeft >= 0);
			int book = spellbook;
			if (book >= 0)
			{
				status.put("spellbook", book);
			}
			Integer charges = chronicleCharges;
			if (charges != null)
			{
				status.put("chronicleCharges", charges);
			}
			Integer qp = questPoints;
			if (qp != null)
			{
				status.put("questPoints", qp);
			}
			Integer total = totalLevel;
			if (total != null)
			{
				status.put("totalLevel", total);
			}
			String account = accountType;
			if (account != null)
			{
				status.put("accountType", account);
			}
			Map<String, Object> fights = combatLog;
			if (fights != null)
			{
				status.put("combatLog", fights);
			}
		}
		// Version handshake: the app checks the protocol and asks to update the plugin if it is older.
		status.put("protocol", BridgeServer.PROTOCOL);
		status.put("pluginVersion", BridgeServer.PLUGIN_VERSION);
		return status;
	}
}
