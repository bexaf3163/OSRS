package com.osrspath.bridge;

import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
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
import javax.imageio.ImageIO;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.Item;
import net.runelite.api.ItemContainer;
import net.runelite.api.Player;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.gameval.InventoryID;
import net.runelite.client.RuneLite;
import net.runelite.client.util.HotkeyListener;

/** Debug log, developer badge, screenshots: a section of {@link OsrsPathBridgePlugin}, which owns the injected services and the state the sections share. */
@Slf4j
final class PluginDebug
{
	private final OsrsPathBridgePlugin plugin;

	PluginDebug(OsrsPathBridgePlugin plugin)
	{
		this.plugin = plugin;
	}

	/** The engine event log; null means it is turned off in the settings. */
	volatile Telemetry telemetry;

	private final EngineWatchdog watchdog = new EngineWatchdog();

	HotkeyListener debugHotkey;

	HotkeyListener shotHotkey;

	/** The in-game guide was drawn in the last frame (the watchdog's "step but empty screen" check). */
	private volatile boolean guideOnScreen;

	private final Map<String, String> lastUi = new HashMap<>();

	private int shots;

	private long lastShotAt;

	private int stageShots;

	private long lastStageShotAt;

	private volatile String lastShotName;

	volatile long lastSnapshotAt;

	volatile long lastSnapshotSeq;

	volatile Integer planPercent;

	int tickCount;

	private long lastBeat;

	ItemCounts lastBag = ItemCounts.EMPTY;

	String lastStageKey;

	int lastStageCursor = -1;

	Integer lastStageVar;

	String lastWarning;

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

	boolean telBudget(String kind, int perMinute)
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
	void tel(String kind, Object... pairs)
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

	void startTelemetry()
	{
		if (telemetry != null || !plugin.config.telemetry())
		{
			return;
		}
		telemetry = new Telemetry(new File(RuneLite.RUNELITE_DIR, "osrs-path-telemetry"), plugin.gson, System::currentTimeMillis);
		Map<String, Object> cfg = new LinkedHashMap<>();
		cfg.put("smartView", plugin.config.smartOverlays());
		cfg.put("showGuide", plugin.config.showGuide());
		cfg.put("hudExpanded", plugin.config.hudExpanded());
		cfg.put("hudLarge", plugin.config.hudLarge());
		cfg.put("stageFollow", plugin.config.stageFollow());
		cfg.put("autoNavigation", plugin.config.autoNavigation());
		tel("session", "plugin", BridgeServer.PLUGIN_VERSION, "protocol", BridgeServer.PROTOCOL, "java", System.getProperty("java.version"),
			"os", System.getProperty("os.name"), "config", cfg);
	}

	void stopTelemetry()
	{
		Telemetry t = telemetry;
		telemetry = null;
		if (t != null)
		{
			t.event("end");
			t.close();
		}
	}

	void shopWindowShown(boolean shown)
	{
		plugin.shopShown = shown;
	}

	void guideShown(boolean shown)
	{
		guideOnScreen = shown;
	}

	boolean guideOnScreen()
	{
		return guideOnScreen;
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

	void toggleDebug()
	{
		plugin.debugVisible = !plugin.debugVisible;
		tel("debug", "visible", plugin.debugVisible);
		if (plugin.debugVisible)
		{
			plugin.debugState = buildDebugState();
		}
	}

	/** A game screenshot into the log folder; the pair "picture - engine state" is written to the log. */
	void takeShot(String why)
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
		plugin.drawManager.requestNextFrameListener(image -> plugin.executor.execute(() -> writeShot(image, dir, name, why, state)));
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
	void debugTick(Player me)
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
			long[] cost = RenderCost.take();
			t.event("beat", "step", plugin.target == null ? null : plugin.target.getStepId(), "stage", lastStageKey, "cursor", lastStageCursor,
				"pos", new int[] {p.getX(), p.getY(), p.getPlane()}, "tick", tickCount, "hud", guideOnScreen, "guide", guideOnScreen,
				// T09: the client's frame rate beside what our overlays cost a frame (average and worst since the last beat, microseconds).
				// focus: RuneLite can limit the frame rate of a window in the background (a live session read "5 FPS"); the report leaves those out.
				"fps", plugin.client.getFPS(), "drawUs", cost[0], "drawMaxUs", cost[1], "focus", plugin.windowFocused());
		}
		if (t != null && tickCount % WATCH_TICKS == 0)
		{
			ActiveTarget.Stage st = PluginQuests.stageOf(plugin.target);
			StepGuide.View v = plugin.guideView;
			WorldPoint p = me.getWorldLocation();
			List<ActiveTarget.StageLine> lines = currentLines(st);
			int cur = plugin.quests.stageTracker.cursor();
			boolean manual = lines != null && StageTracker.needsManualStep(lines, cur);
			StepGuide.StageView sv = v == null ? null : v.getStage();
			EngineWatchdog.Observation o = new EngineWatchdog.Observation(now, plugin.target == null ? null : plugin.target.getStepId(),
				st == null ? null : plugin.quests.stageTracker.key(), cur, lines == null ? 0 : lines.size(), manual, plugin.quests.stageTracker.peeking(), plugin.quests.stageTracker.warning() != null,
				p.getX(), p.getY(), p.getPlane(), plugin.carried.fingerprint(), guideOnScreen, guideOnScreen, st != null && plugin.quests.questDone(plugin.target),
				sv != null && sv.isFinished(), plugin.client.getGameState() == GameState.LOGGED_IN);
			for (EngineWatchdog.Finding f : watchdog.observe(o))
			{
				if (t.anomaly(f.getCode(), f.getKey(), f.getMessage(), "step", plugin.target == null ? null : plugin.target.getStepId()) && plugin.config.telemetryShots())
				{
					takeShot("anomaly_" + f.getCode());
				}
			}
		}
		if (plugin.debugVisible)
		{
			plugin.debugState = buildDebugState();
		}
	}

	/** The lines of the stage the dialogue keys below were built for (compared by identity), and the keys. */
	private List<ActiveTarget.StageLine> dialogLines;

	private Set<String> dialogKeys = Collections.emptySet();

	/**
	 * The dialogue options to frame now: the step's own list and the answers named by every line of the stage the player is in (a stage with several
	 * conversations, such as Shield of Arrav's Baraek, Charlie and Katrine, offers each of them). Client thread, as the overlay that asks.
	 */
	Set<String> dialogKeysNow()
	{
		ActiveTarget t = plugin.target;
		if (t == null)
		{
			return Collections.emptySet();
		}
		ActiveTarget.Stage st = PluginQuests.stageOf(t);
		List<ActiveTarget.StageLine> lines = st == null ? null : currentLines(st);
		if (lines == null || lines.isEmpty())
		{
			return t.getDialogSet();
		}
		if (lines != dialogLines)
		{
			Set<String> keys = new HashSet<>(t.getDialogSet());
			for (ActiveTarget.StageLine l : lines)
			{
				keys.addAll(ActiveTarget.dialogKeysOf(l.getT()));
			}
			dialogLines = lines;
			dialogKeys = keys;
		}
		return dialogKeys;
	}

	List<ActiveTarget.StageLine> currentLines(ActiveTarget.Stage st)
	{
		Integer value = st == null ? null : plugin.quests.stageValue(st);
		return value == null ? null : st.getStages().get(st.indexFor(value)).getSteps();
	}

	/** The engine state for the developer badge and for the screenshot. Client thread. */
	private DebugView.State buildDebugState()
	{
		ActiveTarget.Stage st = PluginQuests.stageOf(plugin.target);
		Integer value = st == null ? null : plugin.quests.stageValue(st);
		List<ActiveTarget.StageLine> lines = currentLines(st);
		int cur = plugin.quests.stageTracker.cursor();
		ActiveTarget.StageLine line = lines == null || lines.isEmpty() ? null : lines.get(Math.max(0, Math.min(cur, lines.size() - 1)));
		ItemCounts bag = ItemCounts.sum(plugin.carried, plugin.noted);
		List<String> conditions = new ArrayList<>();
		if (line != null && line.hasHas())
		{
			conditions.add("has " + line.getHas() + " = " + (line.holds(bag) ? "TRUE" : "FALSE"));
		}
		if (line != null && line.hasNeed())
		{
			conditions.add("need " + line.getNeed() + " (handed in) = " + (plugin.quests.stageTracker.delivered() ? "TRUE" : "FALSE"));
		}
		if (st != null && value != null)
		{
			// Without the word FALSE: the badge paints such lines red, and "the machine does not decide" is not a breakage.
			conditions.add("QH: " + plugin.quests.qhDescribe);
		}
		int queue = -1;
		PrepPlan pp = plugin.snapshot.prep;
		if (pp != null && pp.getLines() != null && plugin.target != null && pp.getStepId().equals(plugin.target.getStepId()))
		{
			queue = (int) pp.getLines().stream().filter(l -> "NOW".equals(l.getTiming()) && ("MISSING".equals(l.getWhere()) || "BANK".equals(l.getWhere()))).count();
		}
		long now = System.currentTimeMillis();
		Player me = plugin.client.getLocalPlayer();
		WorldPoint p = me == null ? null : me.getWorldLocation();
		int used = 0;
		ItemContainer inv = plugin.client.getItemContainer(InventoryID.INV);
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
		return new DebugView.State(plugin.target == null ? null : plugin.target.getStepId(),
			st == null || value == null ? null : (st.indexFor(value) + 1) + "/" + st.getStages().size(), value, cur, lines == null ? 0 : lines.size(),
			line == null ? null : line.shown(), lines != null && StageTracker.needsManualStep(lines, cur), plugin.quests.stageTracker.peeking(), plugin.quests.stageTracker.warning(),
			conditions, plugin.completion == null ? new ArrayList<>() : plugin.completion.describe(), queue,
			lastSnapshotAt == 0 ? null : "seq " + lastSnapshotSeq + ", " + Math.max(0, (now - lastSnapshotAt) / 1000) + " s ago", planPercent,
			plugin.quests.stageTracker.reason(), used + "/28", p == null ? "—" : p.getX() + "," + p.getY() + "," + p.getPlane(), tickCount, guideOnScreen, guideOnScreen,
			t != null, t == null || t.file() == null ? null : t.file().getName(), t == null ? 0 : t.events(), t == null ? 0 : t.anomalyCount(), an,
			lastShotName);
	}
}
