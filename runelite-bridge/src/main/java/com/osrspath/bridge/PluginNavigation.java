package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.NPC;
import net.runelite.api.NPCComposition;
import net.runelite.api.ObjectComposition;
import net.runelite.api.Player;
import net.runelite.api.Quest;
import net.runelite.api.Skill;
import net.runelite.api.Tile;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.client.events.PluginMessage;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.ui.overlay.worldmap.WorldMapPoint;

/** Temporary target: a place from the map or a shop; Where to go: arrow, Shortest Path, HUD: a section of {@link OsrsPathBridgePlugin}, which owns the injected services and the state the sections share. */
final class PluginNavigation
{
	private final OsrsPathBridgePlugin plugin;

	PluginNavigation(OsrsPathBridgePlugin plugin)
	{
		this.plugin = plugin;
	}

	/** The Shortest Path plugin (Plugin Hub): its public API is a PluginMessage in the "shortestpath" namespace. */
	static final String SHORTEST_PATH_CLASS = "shortestpath.ShortestPathPlugin";

	static final String SHORTEST_PATH_NS = "shortestpath";

	/** Closer than this many tiles to the temporary target's place means arrived. */
	static final int NAV_ARRIVED = 3;

	/** The world map marker: where the arrow points. */
	private WorldMapPoint mapPoint;

	/** NPC and object names by id for via labels: definitions are not free and do not change. */
	private final Map<Integer, String> npcDefNames = new HashMap<>();

	private final Map<Integer, String> objDefNames = new HashMap<>();

	private Plugin shortestPath;

	void applyNav(NavTarget t)
	{
		plugin.quests.navSticky = false;
		if (t == null)
		{
			if (plugin.navTarget != null)
			{
				finishNav("cleared");
			}
			return;
		}
		plugin.navTarget = t;
		plugin.snapshot.navViaTransport = false;
		plugin.debug.tel("nav", "event", "set", "label", t.getLabel(), "x", t.getX(), "y", t.getY(), "plane", t.getPlane(), "purchase", t.isPurchase());
		plugin.near = false;
		plugin.lastPosition = null;
		scanNavNpcs();
		if (!t.getObjectNameSet().isEmpty())
		{
			plugin.highlights.rescan();
		}
		if (plugin.server != null)
		{
			// The app learns the target even if it was chosen in the game (the "What you need" list, the panel), and shows the same one.
			plugin.server.navSet(t);
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
	void finishNav(String reason)
	{
		NavTarget done = plugin.navTarget;
		plugin.debug.tel("nav", "event", "done", "reason", reason, "label", done == null ? null : done.getLabel());
		plugin.quests.navSticky = false;
		plugin.navTarget = null;
		plugin.navNpcs.clear();
		plugin.snapshot.navViaTransport = false;
		if (done != null && !done.getObjectNameSet().isEmpty())
		{
			plugin.highlights.rescan();
		}
		plugin.near = false;
		plugin.lastPosition = null;
		if (plugin.server != null && done != null)
		{
			plugin.server.navDone(reason, done);
		}
		updateNavigation();
		updateHud();
	}

	boolean hasNavItem()
	{
		NavTarget t = plugin.navTarget;
		return t != null && t.isPurchase() && plugin.carried.count(t.getItemId(), t.getItemName()) > 0;
	}

	/** Arrived at the place (for a target without an item): the same tile of the plane, no farther than three tiles. */
	boolean arrived(WorldPoint pos)
	{
		NavTarget t = plugin.navTarget;
		return t != null && !plugin.quests.navSticky && !t.isPurchase() && pos.getPlane() == t.getPlane()
			&& DangerRadar.distanceSq(pos.getX(), pos.getY(), t.getX(), t.getY()) <= NAV_ARRIVED * NAV_ARRIVED;
	}

	boolean navMatches(NPC npc)
	{
		NavTarget t = plugin.navTarget;
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
		plugin.navNpcs.clear();
		if (plugin.navTarget == null || plugin.navTarget.getNpcNameSet().isEmpty() || plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return;
		}
		for (NPC npc : plugin.client.getTopLevelWorldView().npcs())
		{
			if (navMatches(npc))
			{
				plugin.navNpcs.add(npc);
			}
		}
	}

	/** For the big arrow: the current path point while the player is in the game; null means do not draw the arrow. */
	WorldPoint arrowTarget()
	{
		return plugin.client.getGameState() == GameState.LOGGED_IN ? navTarget() : null;
	}

	/** "✓ Close" from the HUD, with the same protection against flicker at the boundary. */
	boolean isNavNear()
	{
		return plugin.near;
	}

	/**
	 * The current path point: the temporary target, otherwise the next waypoint or the step's point.
	 * null means nowhere to go or the route is done.
	 */
	private WorldPoint navTarget()
	{
		WorldPoint base;
		if (plugin.navTarget != null)
		{
			base = new WorldPoint(plugin.navTarget.getX(), plugin.navTarget.getY(), plugin.navTarget.getPlane());
		}
		else
		{
			ActiveTarget.WorldPointDto p = stepPoint();
			base = p == null ? null : new WorldPoint(p.getX(), p.getY(), p.getPlane());
		}
		return throughPortal(base);
	}

	/**
	 * A target in another layer than the player (a dungeon from the surface, the surface from a dungeon) is reached through a way in or out: the arrow
	 * points at that way (the hole on the beach for Chief Tess, 2026-10-17), not at coordinates the player's map does not have. A target on another floor:
	 * the staircase or ladder. No way known: the target.
	 */
	private WorldPoint throughPortal(WorldPoint base)
	{
		Player me = plugin.client.getLocalPlayer();
		if (base == null || me == null || plugin.client.getGameState() != GameState.LOGGED_IN || Navigation.isInstanced(base.getX(), base.getY()))
		{
			portalFor = null;
			setPortal(null);
			return base;
		}
		WorldPoint pos = me.getWorldLocation();
		// The arrow asks every frame: the pick is only redone when the target or the player's tile changed.
		if (base.equals(portalFor) && pos.equals(portalFrom))
		{
			Portals.Portal same = plugin.portalShown;
			return same == null ? base : new WorldPoint(same.getX(), same.getY(), same.getPlane());
		}
		portalFor = base;
		portalFrom = pos;
		Portals.Portal p = Navigation.layer(pos.getY()) != Navigation.layer(base.getY()) ? Portals.pick(pos.getX(), pos.getY(), base.getX(), base.getY())
			// Another floor of the same place: the staircase or ladder, not "a floor up" with nothing to climb.
			: pos.getPlane() != base.getPlane() ? Portals.pickFloor(pos.getX(), pos.getY(), pos.getPlane(), base.getX(), base.getY(), base.getPlane()) : null;
		setPortal(p);
		return p == null ? base : new WorldPoint(p.getX(), p.getY(), p.getPlane());
	}

	/** The target and the player's tile the last way was picked for. */
	private WorldPoint portalFor;

	private WorldPoint portalFrom;

	private void setPortal(Portals.Portal p)
	{
		Portals.Portal before = plugin.portalShown;
		plugin.portalShown = p;
		if (!Objects.equals(before, p))
		{
			plugin.debug.tel("portal", "label", p == null ? null : p.label(), "at", p == null ? null : new int[] {p.getX(), p.getY(), p.getPlane()}, "id", p == null ? null : p.getId());
			if ((before == null ? 0 : before.getId()) != (p == null ? 0 : p.getId()))
			{
				plugin.clientThread.invokeLater(plugin.highlights::rescan);
			}
		}
	}

	/** Quest Helper's step as a via, or null (see QhVia). Client thread: the NPC and object names come from the game's definitions. */
	QhVia.Via currentVia(ActiveTarget t, ActiveTarget.StageLine line)
	{
		String leaf = plugin.qhLeaf;
		if (t == null || leaf == null || !plugin.config.qhMachine())
		{
			return null;
		}
		QhSteps.Tile tile = QhSteps.tile(t.getStepId(), leaf);
		if (tile == null)
		{
			return null;
		}
		String name = null;
		if (tile.getId() > 0 && tile.isNpc())
		{
			name = npcDefNames.computeIfAbsent(tile.getId(), id ->
			{
				NPCComposition c = plugin.client.getNpcDefinition(id);
				return c == null ? "" : c.getName();
			});
		}
		else if (tile.getId() > 0 && tile.isObject())
		{
			name = objDefNames.computeIfAbsent(tile.getId(), id ->
			{
				ObjectComposition c = plugin.client.getObjectDefinition(id);
				return c == null ? "" : c.getName();
			});
		}
		return QhVia.of(leaf, tile, line, name, properWordsOf(t));
	}

	private String properStep;

	private final Set<String> properWords = new HashSet<>();

	/** The names in the step's own lines (Tess, Colin, Gnocci): they keep their capital in a via label. */
	private Set<String> properWordsOf(ActiveTarget t)
	{
		if (!Objects.equals(properStep, t.getStepId()))
		{
			properStep = t.getStepId();
			properWords.clear();
			QhVia.properWords(t.getTitle(), properWords);
			ActiveTarget.Stage st = PluginQuests.stageOf(t);
			if (st != null && st.getStages() != null)
			{
				for (ActiveTarget.StageStep e : st.getStages())
				{
					for (ActiveTarget.StageLine l : e.getSteps())
					{
						QhVia.properWords(l.getT(), properWords);
					}
				}
			}
		}
		return properWords;
	}

	static NavTarget navToVia(ActiveTarget t, QhVia.Via via)
	{
		NavTarget n = new NavTarget();
		n.setLabel(via.getLabel());
		n.setX(via.getX());
		n.setY(via.getY());
		n.setPlane(via.getPlane());
		n.setStepId(t.getStepId());
		return n.prepare() == null ? n : null;
	}

	/** The step's point without a temporary target: the current waypoint or the step's point. null means no step or the route is done. */
	private ActiveTarget.WorldPointDto stepPoint()
	{
		if (plugin.target == null)
		{
			return null;
		}
		return plugin.breadcrumbs != null ? plugin.breadcrumbs.current() : plugin.target.getWorldPoint();
	}

	/**
	 * The game arrow and Shortest Path point to the current path point. Called when the target, point or settings change,
	 * but not every frame: Shortest Path computes the path itself, once per target.
	 */
	void updateNavigation()
	{
		WorldPoint nav = navTarget();
		boolean loggedIn = plugin.client.getGameState() == GameState.LOGGED_IN;
		// The arrow: do not touch someone else's (for example a quest one), only our own.
		if (nav == null || !plugin.config.hintArrow() || !loggedIn)
		{
			if (plugin.arrowSet)
			{
				plugin.client.clearHintArrow();
				plugin.arrowSet = false;
			}
		}
		else
		{
			plugin.client.setHintArrow(nav);
			plugin.arrowSet = true;
		}

		boolean instanced = nav != null && Navigation.isInstanced(nav.getX(), nav.getY());
		setMapPoint(loggedIn && plugin.config.worldMapMarker() && !instanced ? nav : null, navLabel());

		boolean spActive = shortestPathActive();
		if (plugin.server != null)
		{
			plugin.server.setShortestPath(spActive);
		}
		if (nav != null && loggedIn && spActive && plugin.config.useShortestPath() && !instanced)
		{
			if (!nav.equals(plugin.pathSent))
			{
				Map<String, Object> data = new HashMap<>();
				data.put("target", nav);
				plugin.eventBus.post(new PluginMessage(SHORTEST_PATH_NS, "path", data));
				plugin.pathSent = nav;
			}
		}
		else if (plugin.pathSent != null)
		{
			// Clear only our own path: if the player set the target in Shortest Path themselves, we did not send it and do not touch it.
			plugin.eventBus.post(new PluginMessage(SHORTEST_PATH_NS, "clear"));
			plugin.pathSent = null;
		}
	}

	/** The label of the current target for the map marker: the temporary target, a route point, the step's point or the step's name. */
	private String navLabel()
	{
		if (plugin.navTarget != null)
		{
			return plugin.navTarget.getLabel();
		}
		if (plugin.target == null)
		{
			return null;
		}
		// The same point as the arrow (stepPoint), so the marker's label does not diverge from its place.
		ActiveTarget.WorldPointDto p = stepPoint();
		if (p != null && p.getLabel() != null && !p.getLabel().isEmpty())
		{
			return p.getLabel();
		}
		return plugin.target.getGoal() != null && !plugin.target.getGoal().isEmpty() ? plugin.target.getGoal() : plugin.target.getTitle();
	}

	/** The marker on the game's world map: just ours; other markers (Shortest Path, quests) are not touched. */
	void setMapPoint(WorldPoint at, String label)
	{
		String tooltip = at == null ? null : "OSRS Path: " + (label == null ? "the arrow points here" : label);
		if (mapPoint != null && at != null && at.equals(mapPoint.getWorldPoint()) && tooltip.equals(mapPoint.getTooltip()))
		{
			return;
		}
		if (mapPoint != null)
		{
			plugin.worldMapPointManager.remove(mapPoint);
			mapPoint = null;
		}
		if (at != null)
		{
			mapPoint = WorldMapPoint.builder().worldPoint(at).image(OsrsPathPanel.mapIcon()).tooltip(tooltip)
				.snapToEdge(true).jumpOnClick(true).name("OSRS Path").build();
			plugin.worldMapPointManager.add(mapPoint);
		}
	}

	private boolean shortestPathActive()
	{
		if (!plugin.shortestPathLooked)
		{
			shortestPath = plugin.pluginManager.getPlugins().stream()
				.filter(p -> SHORTEST_PATH_CLASS.equals(p.getClass().getName()))
				.findFirst().orElse(null);
			plugin.shortestPathLooked = true;
		}
		return shortestPath != null && plugin.pluginManager.isPluginActive(shortestPath);
	}

	/**
	 * What to show in the game now: the path, the step, the bank or the exchange ({@link SmartView}). The bank and exchange windows are read here,
	 * in the frame, so the overlays do not disagree with each other.
	 */
	SmartView.Context overlayContext()
	{
		Hud.State h = plugin.hud;
		return SmartView.of(
			InventoryCheckOverlay.visible(plugin.client.getWidget(InterfaceID.Bankmain.ITEMS_CONTAINER)),
			InventoryCheckOverlay.visible(plugin.client.getWidget(InterfaceID.GeOffers.UNIVERSE)),
			h == null ? -1 : h.getTiles());
	}

	void updateHud()
	{
		plugin.quests.refreshGuide();
		boolean dangerShown = SmartView.dangerVisible(plugin.config.smartOverlays(), plugin.danger.getLevel());
		GearHint h = plugin.gearHint;
		// The gear advice only while we are not going to buy (then the heading is "Buy ..." anyway).
		String upgrade = plugin.navTarget == null && h != null && h.getText() != null && plugin.config.upgradeRouter() ? h.getText() : null;
		if (plugin.target == null && plugin.navTarget == null && !dangerShown && upgrade == null && plugin.snapshot.fundingLine() == null)
		{
			plugin.snapshot.fundingShown = null;
			plugin.hud = null;
			rebuildCard();
			return;
		}
		String stepTitle = plugin.target == null ? null : "[" + plugin.target.getStepId() + "] " + (plugin.target.getTitle() == null ? "" : plugin.target.getTitle());
		String title;
		String goal;
		if (plugin.navTarget != null)
		{
			// A temporary target over the step: it goes first, the step is a line below so it does not get lost.
			List<String> sellers = plugin.navTarget.getNpcNames();
			title = plugin.navTarget.isPurchase()
				? "Buy " + (plugin.navTarget.getItemName() != null ? plugin.navTarget.getItemName() : plugin.navTarget.getLabel())
					+ (sellers != null && !sellers.isEmpty() ? " from " + sellers.get(0) : "")
				: FundingHint.isArrow(plugin.navTarget.getLabel()) ? FundingHint.arrowText(plugin.navTarget.getLabel()) : "Go to: " + plugin.navTarget.getLabel();
			goal = stepTitle == null ? null : "Then: step " + stepTitle;
		}
		else if (plugin.target != null)
		{
			title = stepTitle;
			goal = plugin.target.getGoal();
			if (plugin.breadcrumbs != null)
			{
				ActiveTarget.WorldPointDto c = plugin.breadcrumbs.current();
				goal = c == null
					? "Route complete" + (goal != null ? " · " + goal : "")
					: "Point " + (plugin.breadcrumbs.index() + 1) + "/" + plugin.breadcrumbs.size() + (c.getLabel() != null ? ": " + c.getLabel() : "");
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
		Player me = plugin.client.getLocalPlayer();
		if (nav != null && me != null && plugin.client.getGameState() == GameState.LOGGED_IN)
		{
			WorldPoint pos = me.getWorldLocation();
			Navigation.Readout r = Navigation.readout(pos.getX(), pos.getY(), pos.getPlane(), nav.getX(), nav.getY(), nav.getPlane(), plugin.near, plugin.client.getCameraYawTarget());
			plugin.near = r.isNear();
			distance = r.getText();
			tiles = r.getTiles();
			// Where the arrow goes when it is not the line's own place: a way in or out, or Quest Helper's step (a ladder, a hole).
			Portals.Portal portal = plugin.portalShown;
			QhVia.Via via = plugin.stageVia;
			if (portal != null)
			{
				distance = portal.label() + " · " + distance;
			}
			else if (via != null && plugin.quests.navSticky && plugin.navTarget != null && plugin.navTarget.getX() == via.getX() && plugin.navTarget.getY() == via.getY())
			{
				String shown = via.getLabel().length() > 34 ? via.getLabel().substring(0, 33) + "…" : via.getLabel();
				distance = shown + " · " + distance;
			}
		}
		String bag = null;
		if (!plugin.checklist.getRows().isEmpty())
		{
			bag = plugin.checklist.isReady()
				? "Bag ready to leave"
				: Checklist.hudLine(plugin.checklist);
		}
		String pace = null;
		boolean paceGood = false;
		if (plugin.pacing != null && plugin.pacing.hasXp() && plugin.config.hudPacing())
		{
			PacingTracker.Snapshot s = plugin.pacing.snapshot();
			pace = plugin.pacing.hudLine(s);
			paceGood = s.isAlmost() || s.isDone();
		}
		String dangerText = dangerShown ? plugin.danger.getZone().hudText() : null;
		boolean inside = plugin.danger.getLevel() == DangerRadar.Level.INSIDE;
		int hp = plugin.client.getGameState() == GameState.LOGGED_IN ? plugin.client.getBoostedSkillLevel(Skill.HITPOINTS) : 0;
		int hpMax = plugin.client.getGameState() == GameState.LOGGED_IN ? plugin.client.getRealSkillLevel(Skill.HITPOINTS) : 0;
		// A stage line may name its own attacker (the Ancient Guardian on the last line of Below Ice Mountain): its hit counts while that line is
		// current and the step's general figure is not warned about the whole quest.
		Integer lineHit = currentLineMaxHit();
		Integer hit = lineHit != null ? lineHit : plugin.target == null ? null : plugin.target.getMaxHit();
		String health = plugin.config.hudHealth() && plugin.target != null ? healthLine(hp, hpMax, hit) : null;
		boolean critical = health != null && hit != null && hp <= hit;
		String chip = transportChip(plugin.snapshot.prep, plugin.navTarget != null, plugin.snapshot.navViaTransport);
		// The funding plan's line takes the chip slot while its arrow is not on screen (then the heading already says the same).
		String raising = plugin.snapshot.fundingLine();
		plugin.snapshot.fundingShown = raising;
		if (raising != null && !(plugin.navTarget != null && FundingHint.isArrow(plugin.navTarget.getLabel())))
		{
			chip = raising;
		}
		Preflight.Block pb = plugin.quests.preBlock;
		String missing = pb != null && me != null && plugin.client.getGameState() == GameState.LOGGED_IN
			&& pb.near(me.getWorldLocation().getX(), me.getWorldLocation().getY(), me.getWorldLocation().getPlane()) ? pb.chip() : null;
		boolean training = pace != null && trainingNow();
		// Training on a step with food: the bag's food and about how many kills it lasts; nearly out, an alert.
		Checklist.Row food = training ? TrainingFood.foodRow(plugin.checklist.getRows()) : null;
		String foodLine = food == null ? null : TrainingFood.line(food.getName(), food.getHave(), food.getHeals(), plugin.pacing.getPacing().getFoodHpPerKill());
		plugin.hud = new Hud.State(title, goal, distance, plugin.near, bag, plugin.checklist.isReady(), dangerText, inside, pace, paceGood, upgrade,
			health, critical, chip != null ? chip : plugin.navTarget == null ? useLine(plugin.target, ItemCounts.sum(plugin.carried, plugin.noted)) : null, tiles, missing,
			training ? plugin.pacing.progress() : null, training, foodLine, food != null && TrainingFood.low(food.getHave()));
		rebuildCard();
	}

	/**
	 * The in-game guide's card from one snapshot: the guide view, the per-tick state, the pace and the plan as they are now (client thread). Called whenever
	 * either the view or the state changes, so the card never mixes a new instruction with old figures.
	 */
	void rebuildCard()
	{
		StepGuide.View v = plugin.guideView;
		Hud.State s = plugin.hud;
		NavTarget n = plugin.navTarget;
		boolean loggedIn = plugin.client.getGameState() == GameState.LOGGED_IN;
		ActiveTarget.Plan plan = plugin.target == null || plugin.target.getGuide() == null ? null : plugin.target.getGuide().getPlan();
		// A temporary target the step does not lead to by itself: a place the player chose, a purchase, a stop on the way. The funding plan's arrow is the
		// funding plan's own line, and a stage's arrow is the stage's.
		String detour = null;
		if (n != null && !FundingHint.isArrow(n.getLabel()) && (v == null || v.getTitle() == null || v.getDetour() != null))
		{
			List<String> sellers = n.getNpcNames();
			detour = n.isPurchase()
				? "Buy " + (n.getItemName() != null ? n.getItemName() : n.getLabel()) + (sellers != null && !sellers.isEmpty() ? " from " + sellers.get(0) : "")
				: "Go to " + n.getLabel();
		}
		FundingHint f = plugin.snapshot.funding;
		Player me = plugin.client.getLocalPlayer();
		HudModel.Funding fund = f == null || plugin.snapshot.fundingLine() == null ? null
			: new HudModel.Funding(f.getBrief() != null && !f.getBrief().trim().isEmpty() ? f.getBrief() : f.getAction(), f.getProgress(), f.isEstimated());
		boolean bankOpen = InventoryCheckOverlay.visible(plugin.client.getWidget(InterfaceID.Bankmain.ITEMS_CONTAINER));
		PacingSet p = plugin.pacing;
		HudModel.Input in = new HudModel.Input(v, s, hudPace(), plan == null ? null : plan.getNow(), plan == null ? null : plan.getNext(),
			detour, n != null && n.isPurchase(), fund, n == null ? useLine(plugin.target, ItemCounts.sum(plugin.carried, plugin.noted)) : null,
			loggedIn && me != null ? plugin.quests.preBlock : null, bankOpen, p != null && p.started(), plugin.bankFromSave,
			loggedIn && plugin.bank == null && plugin.bankLoadTicks < OsrsPathBridgePlugin.BANK_LOAD_TICKS);
		plugin.hudCard = HudModel.build(in);
	}

	/** The training pace for the guide: the skill to train now (the next one once the growing one is done), its level, goal, style and time. */
	private HudModel.Pace hudPace()
	{
		PacingSet p = plugin.pacing;
		if (p == null || plugin.target == null || !plugin.config.hudPacing())
		{
			return null;
		}
		ActiveTarget.Pacing pc = p.getPacing();
		String shown = p.getActive();
		PacingTracker.Snapshot snap = p.snapshot();
		boolean switchStyle = false;
		if (snap.isDone() && !p.left().isEmpty())
		{
			// The growing skill reached its goal: the next one in the step's order, and the style to switch to.
			shown = p.left().get(0);
			snap = p.snapshotOf(shown);
			switchStyle = true;
		}
		boolean done = snap.isDone() && p.left().isEmpty();
		List<String> goals = new ArrayList<>();
		for (String skill : pc.skills())
		{
			goals.add(PacingTracker.skillName(skill) + " " + pc.targetLevelOf(skill));
		}
		int level = 0;
		Integer known = plugin.stats.get(shown);
		if (known != null)
		{
			level = known;
		}
		boolean xp = p.hasXp();
		Long eta = xp ? snap.getEtaSeconds() : null;
		String time = eta == null ? null : Math.round(eta / 60.0) < 1 ? "<1 min" : "~" + Math.round(eta / 60.0) + " min";
		return new HudModel.Pace(PacingTracker.skillName(shown), level, pc.targetLevelOf(shown), PacingTracker.styleOf(shown), switchStyle,
			xp ? snap.getActionsLeft() : -1, PacingTracker.actionForm(pc.getActionName(), xp ? snap.getActionsLeft() : 2), time, xp && !snap.isEstimated(),
			xp ? p.progressOf(shown) : 0, done, String.join(", ", goals));
	}

	/** Training now on a paced step (2.55.1): its skills grew within {@link PacingSet#TRAINING_MS}, no temporary target, the bank closed. */
	boolean trainingNow()
	{
		PacingSet p = plugin.pacing;
		return p != null && plugin.target != null && plugin.config.hudPacing() && plugin.client.getGameState() == GameState.LOGGED_IN
			&& SmartView.training(p.trainingAt(System.currentTimeMillis()),
				InventoryCheckOverlay.visible(plugin.client.getWidget(InterfaceID.Bankmain.ITEMS_CONTAINER)), plugin.navTarget != null);
	}

	/**
	 * The action chip for the recommended transport ("⚡ Use Chronicle → Champions' Guild"): on the HUD while nothing else leads the arrow, and while the arrow
	 * leads to the transport's own first stop. A purchase stop or another place has its own heading, so the chip stays out of the way there.
	 */
	static String transportChip(PrepPlan plan, boolean navActive, boolean navViaTransport)
	{
		if (plan == null || !plan.hasTransport() || (navActive && !navViaTransport))
		{
			return null;
		}
		return plan.getRecommendedTransport().chipText();
	}

	/**
	 * A jump (a teleport, a ferry, a canoe, a fairy ring) ends a target that was only the way's first stop: from the landing tile the arrow returns to the step
	 * and the app judges the way again. A plain place or shop target stays, because its tile is still the goal.
	 */
	static boolean transportStopOutdated(boolean navViaTransport, boolean jumped)
	{
		return navViaTransport && jumped;
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

	/** The max hit named by the stage line the cursor is on; null when the line names none or there is no stage. */
	private Integer currentLineMaxHit()
	{
		ActiveTarget.Stage st = plugin.target == null ? null : PluginQuests.stageOf(plugin.target);
		List<ActiveTarget.StageLine> lines = st == null ? null : plugin.debug.currentLines(st);
		if (lines == null || lines.isEmpty())
		{
			return null;
		}
		return lines.get(Math.max(0, Math.min(plugin.quests.stageTracker.cursor(), lines.size() - 1))).getMh();
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
}
