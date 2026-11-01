package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.Player;
import net.runelite.api.Skill;
import net.runelite.api.SoundEffectID;
import net.runelite.api.coords.WorldPoint;

/** State snapshot from the app (protocol 6): a section of {@link OsrsPathBridgePlugin}, which owns the injected services and the state the sections share. */
final class PluginSnapshot
{
	private final OsrsPathBridgePlugin plugin;

	PluginSnapshot(OsrsPathBridgePlugin plugin)
	{
		this.plugin = plugin;
	}

	final SnapshotOrder snapshotOrder = new SnapshotOrder();

	/** The step of the last snapshot (JSON): the same step does not restart the target and arrow. null means the step is not from a snapshot or was cleared. */
	String snapshotStepKey;

	/** The tracked skill's path from the app and the step of it that is applied now ("2:mining-04"); null while no skill is led. Client thread. */
	SkillPath skillPath;

	private String skillStepKey;

	/** The preparation plan from the app; null means it did not send one. The "What you need" list draws it. */
	volatile PrepPlan prep;

	/** The inventory cleanup advice from the app (snapshot part "cleanup"); null means none. Shown, never acted on. */
	volatile CleanupHint cleanup;

	/** The running funding plan from the app (snapshot part "funding"); null means none. One HUD line and the app's own arrow; nothing is acted on. */
	volatile FundingHint funding;

	/** The funding line the HUD shows now, so that a change (the app gone too long, another character) redraws it. */
	volatile String fundingShown;

	/** When the app was last connected (an open event stream or a snapshot): the cleanup advice expires CleanupHint.STALE_MS after it. */
	volatile long appSeenAt;

	/** The bag by item id (a banknote under its own id), for the cleanup lines. */
	volatile Map<Integer, Integer> bagIds = Collections.emptyMap();

	/** The cleanup lines the guide shows now; the slot frames read them. A change refreshes the guide. */
	volatile List<CleanupHint.Line> cleanupShown = Collections.emptyList();

	/** The temporary target was set by a click on the transport row: its first stop is not the goal, so a teleport or ride ends it. */
	volatile boolean navViaTransport;

	/** Until when the transport item is framed in the bag after a click on its row. */
	volatile long transportFrameUntil;

	static final long TRANSPORT_FRAME_NANOS = 20_000_000_000L;

	public BridgeServer.PrepResult onPrepPlan(PrepEnvelope e, Map<String, String> bad)
	{
		SnapshotOrder.Ticket ticket = snapshotOrder.accept(e.getSeq());
		if (ticket == null)
		{
			return new BridgeServer.PrepResult(true, Collections.emptyMap());
		}
		// A part the player turned off in the plugin settings is not applied; the others are.
		Map<String, String> refused = new LinkedHashMap<>();
		GearHint hint = e.getGearHint();
		if (!bad.containsKey(PrepEnvelope.GEAR_HINT) && hint != null && !hint.isClear() && !plugin.config.upgradeRouter())
		{
			refused.put(PrepEnvelope.GEAR_HINT, "upgrade hints are turned off in the OSRS Path Bridge plugin settings");
		}
		if (!bad.containsKey(PrepEnvelope.BANK_TAGS) && e.getBankTags() != null && !plugin.config.bankTagsHelper())
		{
			refused.put(PrepEnvelope.BANK_TAGS, "stage items from the app are turned off in the OSRS Path Bridge plugin settings");
		}
		plugin.clientThread.invokeLater(() -> applySnapshot(e, bad, refused, ticket));
		return new BridgeServer.PrepResult(false, refused);
	}

	private void applySnapshot(PrepEnvelope e, Map<String, String> bad, Map<String, String> refused, SnapshotOrder.Ticket ticket)
	{
		if (!snapshotOrder.apply(ticket)) return;
		plugin.debug.lastSnapshotAt = System.currentTimeMillis();
		appSeenAt = plugin.debug.lastSnapshotAt;
		plugin.debug.lastSnapshotSeq = e.getSeq();
		// Invalid and disabled parts retain their last applied values; valid absent parts are cleared.
		boolean skillLed = skillPath != null;
		if (!bad.containsKey(PrepEnvelope.SKILL_PATH))
		{
			SkillPath sp = e.getSkillPath();
			if (sp != null)
			{
				skillLed = true;
				applySkillPath(sp);
			}
			else if (skillPath != null)
			{
				// Tracking stopped: the quest step comes back from this very snapshot.
				skillPath = null;
				skillStepKey = null;
				snapshotStepKey = null;
				skillLed = false;
				plugin.debug.tel("skill", "event", "released");
			}
		}
		if (!skillLed && !bad.containsKey(PrepEnvelope.STEP))
		{
			ActiveTarget t = e.getStep();
			if (t == null)
			{
				if (plugin.target != null || plugin.navTarget != null)
				{
					if (plugin.navTarget != null)
					{
						plugin.navigation.finishNav("cleared");
					}
					applyTarget(null);
				}
				snapshotStepKey = null;
			}
			else if (!Objects.equals(e.getStepKey(), snapshotStepKey) || plugin.target == null)
			{
				applyTarget(t);
				snapshotStepKey = e.getStepKey();
			}
		}
		if (!bad.containsKey(PrepEnvelope.SHOPPING))
		{
			ShoppingPlan p = e.getShopping();
			plugin.plan = p == null || p.getItems().isEmpty() ? null : p;
			plugin.player.recomputeShopping();
			plugin.ownedDirty = true;
		}
		if (!bad.containsKey(PrepEnvelope.BANK_TAGS) && !refused.containsKey(PrepEnvelope.BANK_TAGS))
		{
			plugin.bankTagIds = e.getBankTags() == null ? Collections.emptySet() : e.getBankTags().getIdSet();
		}
		if (!bad.containsKey(PrepEnvelope.GEAR_HINT) && !refused.containsKey(PrepEnvelope.GEAR_HINT))
		{
			GearHint h = e.getGearHint();
			plugin.gearHint = h == null || h.isClear() ? null : h;
			plugin.ownedDirty = true;
		}
		if (!bad.containsKey(PrepEnvelope.PLAN))
		{
			prep = e.getPlan();
		}
		if (!bad.containsKey(PrepEnvelope.CLEANUP))
		{
			cleanup = e.getCleanup();
		}
		if (!bad.containsKey(PrepEnvelope.FUNDING))
		{
			funding = e.getFunding();
		}
		plugin.debug.planPercent = skillPath != null || prep == null || prep.getScore() == null ? null : prep.getScore().getPercent();
		Map<String, String> allRejected = new LinkedHashMap<>(bad);
		allRejected.putAll(refused);
		plugin.debug.tel("snapshot", "seq", e.getSeq(), "step", e.getStep() == null ? null : e.getStep().getStepId(), "plan", e.getPlan() != null, "percent", plugin.debug.planPercent,
			"shopping", e.getShopping() != null, "bankTags", e.getBankTags() != null, "gearHint", e.getGearHint() != null,
			"cleanup", e.getCleanup() == null || e.getCleanup().getLines() == null ? 0 : e.getCleanup().getLines().size(), "funding", e.getFunding() != null, "rejected", allRejected.isEmpty() ? null : allRejected);
		Telemetry log = plugin.debug.telemetry;
		if (log != null)
		{
			for (Map.Entry<String, String> r : bad.entrySet())
			{
				log.anomaly("SNAPSHOT_REJECT", r.getKey(), "Part of the snapshot '" + r.getKey() + "' was rejected: " + r.getValue());
			}
		}
		plugin.navigation.updateHud();
	}

	/**
	 * The inventory cleanup lines to show now: for the character logged in, the stack still in the bag, the app not gone too long; empty when the
	 * setting is off. The bank and shop card, the Advice tab and the slot frames show them; nothing else happens with them.
	 */
	List<CleanupHint.Line> cleanupLines()
	{
		CleanupHint h = cleanup;
		Player me = plugin.client.getLocalPlayer();
		if (h == null || !plugin.config.cleanupInGame() || me == null || plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return Collections.emptyList();
		}
		return h.visible(me.getName(), bagIds, System.currentTimeMillis(), appSeenAt);
	}

	/**
	 * The HUD line of the funding plan the app is running, or null: none, another character is logged in, or the app has been gone too long.
	 * The sentence and the figure are the app's; nothing is computed here.
	 */
	String fundingLine()
	{
		FundingHint h = funding;
		Player me = plugin.client.getLocalPlayer();
		if (h == null || me == null || plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return null;
		}
		return h.hudLine(me.getName(), System.currentTimeMillis(), appSeenAt);
	}

	/** The cleanup frame colour for a bag slot, or null: frames off, or no cleanup line names this item. Lower than the step's own frames. */
	java.awt.Color cleanupFrame(int itemId)
	{
		if (!plugin.config.cleanupHighlights())
		{
			return null;
		}
		for (CleanupHint.Line l : cleanupShown)
		{
			if (l.getId() == itemId)
			{
				return l.color();
			}
		}
		return null;
	}

	/**
	 * The path of the tracked skill arrived (or arrived again, with the same content on most snapshots): the step for the real level becomes the target. The cursor
	 * is a fact (the first step above the real level), never a stored number, so a restart or a late snapshot cannot put it wrong. Client thread.
	 */
	private void applySkillPath(SkillPath sp)
	{
		skillPath = sp;
		syncSkillTarget(false);
	}

	/** Make the target match the real level; a chime when a level moved the cursor on. */
	void syncSkillTarget(boolean chime)
	{
		SkillPath sp = skillPath;
		Skill skill = sp == null ? null : sp.skillEnum();
		if (sp == null || skill == null || plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return;
		}
		int idx = sp.indexFor(plugin.client.getRealSkillLevel(skill));
		String key = idx + ":" + (idx < sp.getSteps().size() ? sp.getSteps().get(idx).getId() : "done");
		if (key.equals(skillStepKey))
		{
			return;
		}
		boolean moved = skillStepKey != null;
		skillStepKey = key;
		ActiveTarget t = sp.targetFor(idx);
		if (t != null && t.prepare() != null)
		{
			t = null;
		}
		if (plugin.navTarget != null)
		{
			plugin.navigation.finishNav("cleared");
		}
		applyTarget(t);
		plugin.debug.tel("skill", "skill", sp.getSkill(), "index", idx, "of", sp.getSteps().size(), "step", t == null ? null : t.getTitle());
		if (chime && moved && plugin.config.completionSound())
		{
			plugin.client.playSoundEffect(SoundEffectID.UI_BOOP);
		}
	}

	/** An item from the gear advice: highlight it in the bag and bank. name is the ActiveTarget.nameKey key. */
	boolean isUpgradeItem(String name)
	{
		GearHint h = plugin.gearHint;
		return h != null && plugin.config.upgradeRouter() && h.getHighlightSet().contains(name);
	}

	boolean hasUpgradeItems()
	{
		GearHint h = plugin.gearHint;
		return h != null && plugin.config.upgradeRouter() && !h.getHighlightSet().isEmpty();
	}

	public String onBankTags(BankTags t)
	{
		if (!plugin.config.bankTagsHelper())
		{
			return "stage items from the app are turned off in the OSRS Path Bridge plugin settings";
		}
		plugin.bankTagIds = t.getIdSet();
		return null;
	}

	/** Whether the stage needs the item: for the soft frame in the bank. */
	boolean isBankTagged(int itemId)
	{
		return plugin.bankTagIds.contains(itemId);
	}

	public void onShoppingPlan(ShoppingPlan p)
	{
		plugin.clientThread.invokeLater(() ->
		{
			plugin.plan = p.getItems().isEmpty() ? null : p;
			plugin.player.recomputeShopping();
			plugin.ownedDirty = true;
		});
	}

	/** Items of the current step that have already been in the bag: those handed to Hetty or used are not asked into the bag again. */
	final Set<String> gotItems = new HashSet<>();

	private String gotStep;

	/**
	 * The arrow belongs to another step than the one now shown: it was set by that step's stage (sticky), or it carries that step's id. The player's own
	 * target with no step behind it is not touched.
	 */
	static boolean navOutdatedFor(NavTarget nav, boolean setByStage, String stepId)
	{
		if (nav == null)
		{
			return false;
		}
		return setByStage || (nav.getStepId() != null && !nav.getStepId().equals(stepId));
	}

	void applyTarget(ActiveTarget t)
	{
		String stepId = t == null ? null : t.getStepId();
		plugin.debug.tel("step", "stepId", stepId, "title", t == null ? null : t.getTitle(), "goal", t == null ? null : t.getGoal(),
			"stage", t != null && PluginQuests.stageOf(t) != null);
		boolean stepChanged = !Objects.equals(stepId, gotStep);
		if (stepChanged)
		{
			gotItems.clear();
			gotStep = stepId;
			plugin.quests.stageKey = null;
			plugin.quests.qhReset();
			plugin.hudTab = LedgerGuide.NOW;
		}
		plugin.target = t;
		plugin.highlights.lineHlKey = null;
		plugin.highlights.lineHl = TargetStages.LineHighlight.NONE;
		snapshotStepKey = null;
		plugin.guideMessage = null;
		if (plugin.completion != null)
		{
			plugin.completion.setTarget(t);
		}
		List<ActiveTarget.WorldPointDto> waypoints = t == null ? null : t.getPathWaypoints();
		plugin.breadcrumbs = waypoints == null || waypoints.isEmpty() ? null : new Navigation.Breadcrumbs(waypoints);
		plugin.near = false;
		plugin.lastPosition = null;
		Player me = plugin.client.getLocalPlayer();
		if (plugin.breadcrumbs != null && me != null)
		{
			WorldPoint pos = me.getWorldLocation();
			plugin.breadcrumbs.update(pos.getX(), pos.getY(), pos.getPlane());
		}
		if (stepChanged && navOutdatedFor(plugin.navTarget, plugin.quests.navSticky, stepId))
		{
			// The arrow of the step that was shown is not this step's: a line with no tile of its own would keep pointing at the old objective.
			// Cleared with the new step already in place, so the stage that follows sets its own arrow (or none).
			plugin.navigation.finishNav("cleared");
		}
		plugin.highlights.rescan();
		plugin.player.recomputeChecklist();
		plugin.ownedDirty = true;
		plugin.hints.setupPacing();
		plugin.navigation.updateNavigation();
		plugin.navigation.updateHud();
	}
}
