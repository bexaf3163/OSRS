package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import javax.swing.SwingUtilities;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.NPC;
import net.runelite.api.Player;
import net.runelite.api.Quest;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.gameval.InventoryID;
import net.runelite.client.RuneLite;
import net.runelite.client.util.Text;

/** What you need and where: the in-game list and the side panel; Steps as in Quest Helper; Quest stages: a section of {@link OsrsPathBridgePlugin}, which owns the injected services and the state the sections share. */
@Slf4j
final class PluginQuests
{
	private final OsrsPathBridgePlugin plugin;

	PluginQuests(OsrsPathBridgePlugin plugin)
	{
		this.plugin = plugin;
	}

	/** Recompute the view (client thread): the in-game list draws it, and it goes to the panel only if it changed. */
	void refreshGuide()
	{
		TargetStages.Stage stage = stageOf(plugin.target);
		trackStageCursor(stage);
		String stageNow = stage == null ? null : stageTracker.key() + "|" + questDone(plugin.target);
		if (!Objects.equals(stageNow, plugin.player.checklistStage))
		{
			// The stage changed (or the quest was handed in): the departure check and the "Bag" line are counted by the items of the new stage.
			plugin.player.checklistStage = stageNow;
			plugin.player.recomputeChecklist();
			plugin.navigation.updateHud();
		}
		followStage();
		NavTarget n = plugin.navTarget;
		StepGuide.View v = StepGuide.view(plugin.target, ItemCounts.sum(plugin.carried, plugin.noted), plugin.bank,
			n == null ? null : n.getLabel(), n == null ? 0 : n.getX(), n == null ? 0 : n.getY(), n == null ? 0 : n.getPlane(), plugin.snapshot.gotItems,
			stage == null ? null : stageValue(stage), stage != null && questDone(plugin.target), stageTracker.cursor(), worn);
		if (v.getStage() != null)
		{
			// A pre-flight block is the first thing the plate says (it is also why the arrow points elsewhere); the cursor warning follows it.
			Preflight.Block pb = preBlock;
			String warning = pb == null ? stageTracker.warning()
				: stageTracker.warning() == null ? pb.reason() : pb.reason() + " " + stageTracker.warning();
			v = v.withStage(v.getStage().with(warning, stageTracker.peeking(), stageTracker.canStepForward(v.getStage().getSteps())));
		}
		v = StepGuide.withPlanFor(v, plugin.snapshot.prep, plugin.target);
		List<CleanupHint.Line> clean = plugin.snapshot.cleanupLines();
		plugin.snapshot.cleanupShown = clean;
		v = v.withCleanup(clean);
		if (plugin.guideMessage != null)
		{
			v = v.withNote(plugin.guideMessage);
		}
		else if (qhHint != null)
		{
			v = v.withNote(qhHint);
		}
		else
		{
			String say = incantationHint(v);
			if (say != null)
			{
				v = v.withNote(say);
			}
		}
		plugin.guideView = v;
		plugin.navigation.rebuildCard();
		if (plugin.server != null)
		{
			StepGuide.StageView current = v.getStage();
			// A hand-advanced walkthrough is not a quest stage the app knows: it has no identity to announce.
			boolean known = stage != null && !stage.isManual() && stageValue(stage) != null && current != null && !current.isFinished()
				&& !current.getSteps().isEmpty() && plugin.client.getGameState() == GameState.LOGGED_IN;
			plugin.server.setQuestInstruction(known ? plugin.target.getStepId() : null,
				known ? stage.getStages().get(current.getIndex() - 1).getAt() : null,
				known ? current.getCursor() : 0, known && current.isPeeking());
		}
		OsrsPathPanel p = plugin.panel;
		if (p == null || v.equals(plugin.panelView))
		{
			return;
		}
		plugin.panelView = v;
		StepGuide.View shown = v;
		SwingUtilities.invokeLater(() -> p.show(shown));
	}

	/** Demon Slayer, the fight with Delrith: the words to say in order, read from the account's own varbits (they are random per account). Keyed by the quest stage
	 * (killDelrithStep), not by a route step code, so a renumbered or moved step keeps it. */
	private String incantationHint(StepGuide.View v)
	{
		StepGuide.StageView sv = v.getStage();
		if (plugin.target == null || sv == null || sv.getSteps() == null || sv.getCursor() < 0 || sv.getCursor() >= sv.getSteps().size()
			|| !"killDelrithStep".equals(sv.getSteps().get(sv.getCursor()).getK()) || plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return null;
		}
		int[] values = new int[Incantation.VARBITS.length];
		for (int i = 0; i < values.length; i++)
		{
			values[i] = plugin.client.getVarbitValue(Incantation.VARBITS[i]);
		}
		String order = Incantation.order(values);
		return order == null ? null : "Say in the dialogue, in this order: " + order;
	}

	/** Latches of Quest Helper conditions: they live while the player is on this quest and has not left the game. */
	private final QhMachine.Session qhSession = new QhMachine.Session();

	private QhLiveFacts qhFacts;

	/** Worn only: in "carried" it is together with the bag, and some Quest Helper conditions require exactly the worn item. */
	ItemCounts worn = ItemCounts.EMPTY;

	/** The machine's last pick in one line (for the log and the developer badge) and its fingerprint (to notice a change). */
	private String qhLastKey = "";

	String qhDescribe = "—";

	/** Quest Helper cannot determine the step without the quest journal (S2-09): a hint in the list while the pick is "sync". */
	private String qhHint;

	/** The machine failed: until the plugin restarts we count the old way (place and items) and do not clutter the log with repeats. */
	private boolean qhBroken;

	/** The tick on which to read the quest journal: the text appears a bit after the window opens. -1 means not waiting. */
	int journalReadTick = -1;

	int loginTick = -1;

	int varBurst;

	int menuBurst;

	long menuBurstAt;

	QhLiveFacts qhFacts()
	{
		if (qhFacts == null)
		{
			qhFacts = new QhLiveFacts(plugin.client, () -> plugin.carried, () -> worn, () -> plugin.bank == null ? ItemCounts.EMPTY : plugin.bank);
		}
		return qhFacts;
	}

	void qhReset()
	{
		qhSession.reset();
		if (qhFacts != null)
		{
			qhFacts.clear();
		}
		qhLastKey = "";
		qhDescribe = "—";
		qhHint = null;
		plugin.qhLeaf = null;
		plugin.stageVia = null;
	}

	/**
	 * The Quest Helper machine's pick for the stage lines, or null: there is no machine, it does not decide ("unknown" in a condition) or it picked the step "by default",
	 * that is, there is no evidence and the line will be decided by place and items. The pick is written to the log when it changes.
	 */
	private StageTracker.QhPick qhPick(String stepId, int value, List<TargetStages.StageLine> lines)
	{
		qhHint = null;
		plugin.qhLeaf = null;
		stageTracker.qhUndecided(false);
		if (!plugin.config.qhMachine())
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
			v = m.decide(value, qhFacts(), qhSession);
		}
		catch (RuntimeException ex)
		{
			log.warn("The Quest Helper machine is disabled until the plugin restarts: {}", ex.toString(), ex);
			plugin.debug.tel("qh", "error", ex.toString(), "step", stepId, "var", value);
			qhBroken = true;
			qhDescribe = "failure: " + ex;
			return null;
		}
		stageTracker.qhUndecided(v.isUndecided());
		plugin.qhLeaf = !v.isUndecided() && v.isStrong() ? v.getLeaf() : null;
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
			plugin.debug.tel("qh", "var", value, "leaf", v.getLeaf(), "strong", v.isStrong(), "undecided", v.isUndecided(), "line", line < 0 ? null : line + 1,
				"path", v.getPath());
		}
		return line < 0 ? null : new StageTracker.QhPick(line, v.getLeaf() + " (" + String.join(" > ", v.getPath()) + ")");
	}

	/** Once per tick: a message, dialogue or item arrived and the machine picked another step; the view is recomputed at once, not at the player's next step. */
	void qhTick()
	{
		TargetStages.Stage st = stageOf(plugin.target);
		if (st == null || plugin.client.getGameState() != GameState.LOGGED_IN || questDone(plugin.target))
		{
			return;
		}
		Integer value = stageValue(st);
		if (value == null)
		{
			return;
		}
		String before = qhLastKey;
		qhPick(plugin.target.getStepId(), value, st.getStages().get(st.indexFor(value)).getSteps());
		if (!Objects.equals(before, qhLastKey))
		{
			plugin.navigation.updateHud();
		}
	}

	/** The quest journal: Quest Helper checks the step against its text. Into the log as clean lines without colour tags. */
	void readJournal()
	{
		List<String> lines = qhFacts().widget(InterfaceID.QUESTJOURNAL, 6, true);
		if (lines == null)
		{
			return;
		}
		if (plugin.config.telemetryDetail())
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
			plugin.debug.tel("journal", "title", title == null || title.isEmpty() ? null : Text.removeTags(title.get(0)), "lines", clean);
		}
		plugin.navigation.updateHud();
	}

	/** Dialogue options: what the game offered when the player chose. */
	void logDialogOptions()
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
		plugin.debug.tel("opts", "list", clean);
	}

	/**
	 * The current stage step and everything that moves it: the player's position, the step's items (has, need), the "done" and "back" clicks.
	 * Recomputed every tick (StageTracker.update), not once as before.
	 */
	final StageTracker stageTracker = new StageTracker();

	/** The item the current stage step needs and the player lacks (the pre-flight guard); null means the step may go on. Client thread. */
	Preflight.Block preBlock;

	/** The pre-flight check of a stage step: unknown (the bag not read yet) blocks nothing. */
	private Preflight.Block guard(TargetStages.Stage st, TargetStages.StageLine line, WorldPoint pos)
	{
		if (line == null || line.getPre() == null || plugin.client.getItemContainer(InventoryID.INV) == null)
		{
			return null;
		}
		return Preflight.check(plugin.target.getStepId(), line, true, plugin.carried, plugin.noted, plugin.bankFromSave ? null : plugin.bank, pos.getX(), pos.getY(), pos.getPlane(), st.getBanks());
	}

	/** Recompute the current stage step from the player's position and items. Client thread. */
	private void trackStageCursor(TargetStages.Stage st)
	{
		preBlock = null;
		plugin.stageVia = null;
		if (st == null)
		{
			stageTracker.reset();
			return;
		}
		// The quest is complete: stage steps are no longer moved or checked against the bag, "Beer is still in your bag" at the moment of handing in the quest is a false alarm.
		if (questDone(plugin.target))
		{
			plugin.highlights.applyLineHighlight(null, null, null);
			return;
		}
		Integer value = stageValue(st);
		if (value == null)
		{
			return;
		}
		int idx = st.indexFor(value);
		Player me = plugin.client.getLocalPlayer();
		if (me == null)
		{
			return;
		}
		WorldPoint pos = me.getWorldLocation();
		List<TargetStages.StageLine> lines = st.getStages().get(idx).getSteps();
		stageTracker.update(plugin.target.getStepId(), idx, lines, pos.getX(), pos.getY(), pos.getPlane(), ItemCounts.sum(plugin.carried, plugin.noted),
			qhPick(plugin.target.getStepId(), value, lines));
		restoreWalk(st, lines);
		logStage(st, idx, value, lines, pos);
		int at = Math.max(0, Math.min(stageTracker.cursor(), lines.size() - 1));
		preBlock = guard(st, lines.get(at), pos);
		Preflight.Block blocked = preBlock;
		if (blocked != null && !blocked.equals(lastPreBlock))
		{
			plugin.debug.tel("preflight", "item", blocked.getItem(), "need", blocked.getNeed(), "have", blocked.getHave(), "via", blocked.getVia().name(), "cursor", at + 1);
		}
		lastPreBlock = blocked;
		// While an item is missing the step's own objects are not highlighted: the arrow and the highlight lead to where to get the item.
		// Quest Helper's own step when our line does not lead there itself (a ladder, a hole, a step with no line): the arrow and the highlight follow it.
		QhVia.Via via = blocked == null ? plugin.navigation.currentVia(plugin.target, lines.get(at)) : null;
		plugin.stageVia = via;
		plugin.highlights.applyLineHighlight(plugin.target.getStepId() + "#" + idx + "@" + at + (blocked == null ? "" : "!" + blocked.key()) + (via == null ? "" : "~" + via.getLeaf()),
			blocked != null ? null : via != null ? via.highlight() : lines.get(at).getHl(), blocked != null || via != null ? null : lines.get(at));
	}

	private Preflight.Block lastPreBlock;

	/** The step whose hand-advanced walkthrough was already put back on its saved line in this session. */
	private String walkRestored;

	private static String walkKey(String stepId)
	{
		return "walk." + stepId;
	}

	/** Only "done" moves a hand-advanced walkthrough, so a client restart would put the player back on line 1: the reached line is kept in the config. */
	private void restoreWalk(TargetStages.Stage st, List<TargetStages.StageLine> lines)
	{
		String stepId = plugin.target.getStepId();
		if (!st.isManual() || stepId.equals(walkRestored))
		{
			return;
		}
		walkRestored = stepId;
		Integer saved = plugin.configManager.getConfiguration(OsrsPathBridgeConfig.GROUP, walkKey(stepId), Integer.class);
		if (saved != null && saved > stageTracker.cursor() && saved < lines.size())
		{
			stageTracker.restore(saved);
		}
	}

	/** The log: entering a stage, a quest variable change, where and why the cursor moved, warnings. */
	private void logStage(TargetStages.Stage st, int idx, int value, List<TargetStages.StageLine> lines, WorldPoint pos)
	{
		if (plugin.debug.telemetry == null)
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

	private void logStageUnsafe(TargetStages.Stage st, int idx, int value, List<TargetStages.StageLine> lines, WorldPoint pos)
	{
		String key = stageTracker.key();
		int cur = stageTracker.cursor();
		TargetStages.StageLine line = lines.isEmpty() ? null : lines.get(Math.max(0, Math.min(cur, lines.size() - 1)));
		int[] at = {pos.getX(), pos.getY(), pos.getPlane()};
		if (!Objects.equals(plugin.debug.lastStageVar, value))
		{
			plugin.debug.tel("var", "id", st.getId(), "what", st.isVarp() ? "varp" : "varbit", "from", plugin.debug.lastStageVar, "to", value, "step", plugin.target.getStepId());
			plugin.debug.lastStageVar = value;
		}
		if (!Objects.equals(key, plugin.debug.lastStageKey))
		{
			plugin.debug.lastStageKey = key;
			plugin.debug.lastStageCursor = cur;
			plugin.debug.tel("stage", "event", "enter", "key", key, "stage", idx + 1, "of", st.getStages().size(), "cursor", cur + 1, "size", lines.size(),
				"line", line == null ? null : line.shown(), "reason", stageTracker.reason(), "pos", at);
			if (plugin.config.telemetryEventShots())
			{
				plugin.debug.takeShot("stage_enter_" + (idx + 1));
			}
		}
		else if (cur != plugin.debug.lastStageCursor)
		{
			plugin.debug.tel("stage", "event", "cursor", "key", key, "from", plugin.debug.lastStageCursor + 1, "to", cur + 1, "size", lines.size(), "line", line == null ? null : line.shown(),
				"reason", stageTracker.reason(), "pos", at, "manual", StageTracker.needsManualStep(lines, cur));
			plugin.debug.lastStageCursor = cur;
			if (plugin.config.telemetryEventShots())
			{
				plugin.debug.takeShot("stage_cursor_" + (cur + 1));
			}
		}
		String warning = stageTracker.warning();
		if (!Objects.equals(warning, plugin.debug.lastWarning))
		{
			plugin.debug.lastWarning = warning;
			if (warning != null)
			{
				plugin.debug.tel("warning", "text", warning, "cursor", cur + 1);
			}
		}
	}

	/** Which stage is shown and whether the arrow leads to it: the key "step#stage"; a key change means the arrow goes to the new stage. */
	String stageKey;

	/** The arrow was set by the stage, not the player: on arrival it stays at the NPC (does not jump back to the step) until the stage changes. */
	boolean navSticky;

	static TargetStages.Stage stageOf(ActiveTarget t)
	{
		return t == null || t.getGuide() == null ? null : t.getGuide().getStage();
	}

	/** The quest variable's value; null means not in the game. Client thread. */
	Integer stageValue(TargetStages.Stage st)
	{
		if (plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return null;
		}
		if (st.isManual())
		{
			// No game variable behind a hand-advanced walkthrough: it is always its one stage.
			return 0;
		}
		return st.isVarp() ? plugin.client.getVarpValue(st.getId()) : plugin.client.getVarbitValue(st.getId());
	}

	/** The step's quest is complete by game data (a step with the "quest complete" trigger). */
	boolean questDone(ActiveTarget t)
	{
		TargetNeeds.Trigger trig = t == null ? null : t.getCompletionTrigger();
		if (trig == null || trig.getQuestName() == null || plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return false;
		}
		return Boolean.TRUE.equals(plugin.player.isQuestFinished(trig.getQuestName()));
	}

	/**
	 * The quest stage changed (or the step has just been shown): the arrow and route to the NPC of the new stage. The player's own target
	 * (a click on a place) is not touched while the stage is the same. If the quest is complete, the stage arrow is cleared.
	 */
	private void followStage()
	{
		ActiveTarget t = plugin.target;
		TargetStages.Stage st = stageOf(t);
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
		List<TargetStages.StageLine> lines = st.getStages().get(idx).getSteps();
		// The arrow follows the current stage step if it has a tile; if not, the stage's point.
		int cursor = Math.max(0, Math.min(stageTracker.cursor(), lines.size() - 1));
		TargetStages.StageLine now = done || lines.isEmpty() ? null : lines.get(cursor);
		boolean byStep = now != null && now.hasPoint();
		String stageOnly = t.getStepId() + "#" + (done ? "done" : String.valueOf(idx));
		Preflight.Block block = done ? null : preBlock;
		QhVia.Via via = done ? null : plugin.stageVia;
		String key = (byStep ? stageOnly + "@" + cursor : stageOnly) + (block == null ? "" : "!" + block.key()) + (via == null ? "" : "~" + via.getLeaf());
		if (key.equals(stageKey))
		{
			return;
		}
		boolean sameStage = stageKey != null && stageKey.startsWith(stageOnly) && (stageKey.length() == stageOnly.length() || stageKey.charAt(stageOnly.length()) == '@'
			|| stageKey.charAt(stageOnly.length()) == '!');
		stageKey = key;
		if (done)
		{
			if (navSticky)
			{
				plugin.navigation.applyNav(null);
			}
			return;
		}
		if (!plugin.config.stageFollow() || !plugin.config.autoNavigation())
		{
			return;
		}
		if (sameStage && plugin.navTarget != null && !navSticky)
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
		if (via != null)
		{
			NavTarget vn = PluginNavigation.navToVia(t, via);
			if (vn != null)
			{
				n = vn;
			}
		}
		if (block != null)
		{
			// The pre-flight guard: the step's tile is not the destination until the item is in the bag.
			n = block.getTarget();
			if (n == null)
			{
				plugin.navigation.applyNav(null);
				return;
			}
		}
		if (n != null)
		{
			plugin.navigation.applyNav(n);
			navSticky = true;
		}
	}

	/** A click on the list in the game (client thread). */
	void guideAction(GuideList.Action a)
	{
		plugin.debug.tel("click", "what", a.getKind().name(), "place", a.getKind() == GuideList.Kind.PLACE ? a.getPlace() : null,
			"cursor", stageTracker.cursor() + 1, "step", plugin.target == null ? null : plugin.target.getStepId());
		switch (a.getKind())
		{
			case TOGGLE:
				// The details open or close by this click only, and the choice is kept across steps and log-ins.
				plugin.configManager.setConfiguration(OsrsPathBridgeConfig.GROUP, "hudExpanded", !plugin.config.hudExpanded());
				break;
			case MORE:
				plugin.adviceOpen = !plugin.adviceOpen;
				break;
			case TAB:
				plugin.hudTab = a.getPlace();
				break;
			case PLACE:
				goToPlace(a.getPlace());
				break;
			case TRANSPORT:
			{
				PrepPlan p = plugin.snapshot.prep;
				if (p == null || !p.hasTransport())
				{
					break;
				}
				// The item in the bag is framed for a few seconds; the arrow goes to the first stop when the app knew one. Nothing is activated.
				plugin.snapshot.transportFrameUntil = System.nanoTime() + PluginSnapshot.TRANSPORT_FRAME_NANOS;
				NavTarget n = p.getRecommendedTransport().navTarget(plugin.target == null ? null : plugin.target.getStepId());
				if (n != null && plugin.config.autoNavigation())
				{
					plugin.guideMessage = null;
					plugin.navigation.applyNav(n);
					plugin.snapshot.navViaTransport = true;
					plugin.navigation.updateHud();
				}
				else
				{
					refreshGuide();
				}
				break;
			}
			case DETOUR:
			{
				PrepPlan p = plugin.snapshot.prep;
				NavTarget n = p != null && p.hasDetour() ? p.getActiveDetour().navTarget(plugin.target == null ? null : plugin.target.getStepId()) : null;
				if (n == null)
				{
					break;
				}
				if (!plugin.config.autoNavigation())
				{
					plugin.guideMessage = "Navigation to places is turned off: RuneLite -> OSRS Path Bridge -> 'Arrow to places'.";
					refreshGuide();
					break;
				}
				plugin.guideMessage = null;
				plugin.navigation.applyNav(n);
				break;
			}
			case BACK:
				plugin.navigation.applyNav(null);
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
				TargetStages.Stage st = stageOf(plugin.target);
				Integer value = st == null ? null : stageValue(st);
				if (value != null && stageTracker.forward(st.getStages().get(st.indexFor(value)).getSteps()))
				{
					if (st.isManual())
					{
						plugin.configManager.setConfiguration(OsrsPathBridgeConfig.GROUP, walkKey(plugin.target.getStepId()), stageTracker.cursor());
					}
					refreshGuide();
				}
				break;
			}
			default:
				break;
		}
	}

	/** "Go here": a temporary target at a step point: the arrow, Shortest Path and the NPC highlight at the point. */
	void goToPlace(int index)
	{
		ActiveTarget t = plugin.target;
		NavTarget n = StepGuide.navTo(t, index);
		if (n == null)
		{
			return;
		}
		if (!plugin.config.autoNavigation())
		{
			plugin.guideMessage = "Navigation to places is turned off: RuneLite -> OSRS Path Bridge -> 'Arrow to places'.";
			refreshGuide();
			return;
		}
		plugin.guideMessage = null;
		plugin.navigation.applyNav(n);
	}
}
