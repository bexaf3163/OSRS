package com.osrspath.bridge;

import java.util.Collections;
import java.util.Objects;
import java.util.Set;
import net.runelite.api.Client;
import net.runelite.api.GameObject;
import net.runelite.api.GameState;
import net.runelite.api.MenuAction;
import net.runelite.api.NPC;
import net.runelite.api.NPCComposition;
import net.runelite.api.ObjectComposition;
import net.runelite.api.Player;
import net.runelite.api.Quest;
import net.runelite.api.Scene;
import net.runelite.api.Skill;
import net.runelite.api.Tile;
import net.runelite.api.TileObject;
import net.runelite.api.WorldView;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.events.DecorativeObjectDespawned;
import net.runelite.api.events.DecorativeObjectSpawned;
import net.runelite.api.events.GameObjectDespawned;
import net.runelite.api.events.GameObjectSpawned;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.GroundObjectDespawned;
import net.runelite.api.events.GroundObjectSpawned;
import net.runelite.api.events.NpcChanged;
import net.runelite.api.events.NpcDespawned;
import net.runelite.api.events.NpcSpawned;
import net.runelite.api.events.PostMenuSort;
import net.runelite.api.events.WallObjectDespawned;
import net.runelite.api.events.WallObjectSpawned;
import net.runelite.api.gameval.InterfaceID;

/** Whom to highlight: a section of {@link OsrsPathBridgePlugin}, which owns the injected services and the state the sections share. */
final class PluginHighlights
{
	private final OsrsPathBridgePlugin plugin;

	PluginHighlights(OsrsPathBridgePlugin plugin)
	{
		this.plugin = plugin;
	}

	void rescan()
	{
		plugin.npcs.clear();
		plugin.objects.clear();
		boolean navObjects = plugin.navTarget != null && !plugin.navTarget.getObjectNameSet().isEmpty();
		if ((plugin.target == null && !navObjects) || plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return;
		}
		WorldView wv = plugin.client.getTopLevelWorldView();
		for (NPC npc : wv.npcs())
		{
			if (matches(npc))
			{
				plugin.npcs.add(npc);
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
	volatile TargetStages.LineHighlight lineHl = TargetStages.LineHighlight.NONE;

	String lineHlKey;

	boolean hasLineItems()
	{
		return !lineHl.itemNames.isEmpty();
	}

	boolean isLineItem(String nameKey)
	{
		return lineHl.itemNames.contains(nameKey);
	}

	/** The cursor moved to another step: that step's highlight; the previous one goes out. at is the line whose tile picks its object, or null. Client thread. */
	void applyLineHighlight(String key, TargetStages.Highlight hl, TargetStages.StageLine at)
	{
		if (Objects.equals(key, lineHlKey))
		{
			return;
		}
		lineHlKey = key;
		lineHl = hl == null ? TargetStages.LineHighlight.NONE : new TargetStages.LineHighlight(hl, at);
		plugin.debug.tel("highlight", "key", key, "npc", hl == null ? null : hl.getNpc(), "obj", hl == null ? null : hl.getObj(), "on", hl == null ? null : hl.getOn(),
			"item", hl == null ? null : hl.getItem());
		rescan();
	}

	private boolean matches(NPC npc)
	{
		if (plugin.target == null || npc == null)
		{
			return false;
		}
		if (plugin.target.getNpcIdSet().contains(npc.getId()) || lineHl.npcIds.contains(npc.getId()))
		{
			return true;
		}
		NPCComposition c = npc.getTransformedComposition();
		String name = c != null ? c.getName() : npc.getName();
		return name != null && plugin.target.getNpcNameSet().contains(ActiveTarget.nameKey(name));
	}

	/** An object's name accounting for impostors: the look of some objects depends on quest progress. */
	private String objectName(TileObject o)
	{
		ObjectComposition c = plugin.client.getObjectDefinition(o.getId());
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
		ActiveTarget step = plugin.target;
		NavTarget nav = plugin.navTarget;
		Set<String> navObjects = nav == null ? Collections.emptySet() : nav.getObjectNameSet();
		if (o == null || (step == null && navObjects.isEmpty()))
		{
			return;
		}
		TargetStages.LineHighlight line = lineHl;
		Set<Integer> stepIds = step == null ? Collections.emptySet() : step.getObjectIdSet();
		Set<String> stepNames = step == null ? Collections.emptySet() : step.getObjectNameSet();
		if (stepIds.isEmpty() && stepNames.isEmpty() && line.objectIds.isEmpty() && line.objectNames.isEmpty() && navObjects.isEmpty())
		{
			return;
		}
		String name = objectName(o);
		Portals.Portal portal = plugin.portalShown;
		boolean byId = stepIds.contains(o.getId()) || line.objectIds.contains(o.getId()) || (portal != null && portal.getId() > 0 && portal.getId() == o.getId());
		boolean byName = name != null && (stepNames.contains(ActiveTarget.nameKey(name)) || line.objectNames.contains(ActiveTarget.nameKey(name))
			|| navObjects.contains(ActiveTarget.nameKey(name)));
		if (byId || byName)
		{
			plugin.objects.put(o, name == null ? "" : name);
		}
	}

	private void untrack(TileObject o)
	{
		plugin.objects.remove(o);
	}

	/**
	 * Whether to draw a tracked object. Of several objects that share an ID of the current line (the three red doors in Melzar's Maze's rat room)
	 * only the one(s) nearest the line's tile are the line's, as Quest Helper marks the object on its step's tile: the rest are wrong doors.
	 * Objects the step itself names stay. A line with no tile of its own (a Quest Helper step that spans several places, such as "climb the ladder,
	 * then search the cupboard") keeps the one nearest the player instead: a common ladder ID would otherwise outline every ladder in view.
	 * Client thread; a few objects, so it is counted per frame.
	 */
	boolean objectShown(TileObject o)
	{
		TargetStages.LineHighlight line = lineHl;
		ActiveTarget step = plugin.target;
		if (!line.objectIds.contains(o.getId()) || (step != null && step.getObjectIdSet().contains(o.getId())))
		{
			return true;
		}
		int[] ref = line.hasPoint ? new int[] {line.x, line.y, line.plane} : playerPoint();
		if (ref == null)
		{
			return true;
		}
		return nearestOfItsId(o, plugin.objects.keySet(), ref);
	}

	/** Whether no other tracked object with the same ID is nearer the reference tile (another floor counts as far). */
	static boolean nearestOfItsId(TileObject o, Iterable<TileObject> tracked, int[] ref)
	{
		int d = tileDistance(o, ref);
		for (TileObject p : tracked)
		{
			if (p != o && p.getId() == o.getId() && tileDistance(p, ref) < d)
			{
				return false;
			}
		}
		return true;
	}

	private static int tileDistance(TileObject o, int[] ref)
	{
		WorldPoint w = o.getWorldLocation();
		return o.getPlane() != ref[2] ? Integer.MAX_VALUE / 2 : Math.max(Math.abs(w.getX() - ref[0]), Math.abs(w.getY() - ref[1]));
	}

	private int[] playerPoint()
	{
		Player me = plugin.client.getLocalPlayer();
		if (me == null)
		{
			return null;
		}
		WorldPoint w = me.getWorldLocation();
		return new int[] {w.getX(), w.getY(), w.getPlane()};
	}

	/** An NPC appeared or changed its look: into its own list, whether the step's, the temporary target's or a dangerous one. */
	private void trackNpc(NPC npc)
	{
		if (matches(npc))
		{
			plugin.npcs.add(npc);
		}
		if (plugin.navigation.navMatches(npc))
		{
			plugin.navNpcs.add(npc);
		}
		if (plugin.hints.dangerMatches(npc))
		{
			plugin.dangerNpcs.add(npc);
		}
	}

	private void untrackNpc(NPC npc)
	{
		plugin.npcs.remove(npc);
		plugin.navNpcs.remove(npc);
		plugin.dangerNpcs.remove(npc);
	}

	/**
	 * Mouse over the "What you need" list: the list line becomes the top game menu entry. Otherwise the game writes the action of whatever is
	 * under the plate in the top-left corner ("Chop down Yew tree") and outlines it, as if the click would go there.
	 * The other entries stay: a right click still opens the game menu.
	 */
	public void onPostMenuSort(PostMenuSort e)
	{
		if (plugin.guideOverlay == null || plugin.client.isMenuOpen() || plugin.client.isWidgetSelected())
		{
			return;
		}
		net.runelite.api.Point m = plugin.client.getMouseCanvasPosition();
		GuideList.Action a = m == null ? null : plugin.guideOverlay.actionAt(new java.awt.Point(m.getX(), m.getY()));
		if (a == null || GuideMouse.windowUnderMouse(plugin.client.getMenu().getMenuEntries())
			|| GuideMouse.mapCovers(plugin.client.getWidget(net.runelite.api.gameval.InterfaceID.Worldmap.WINDOW), new java.awt.Point(m.getX(), m.getY())))
		{
			return;
		}
		plugin.client.getMenu().createMenuEntry(-1)
			.setOption(GuideMouse.menuOption(a))
			.setTarget("<col=ff9040>OSRS Path</col>")
			.setType(MenuAction.RUNELITE)
			.onClick(x -> plugin.quests.guideAction(a));
	}

	public void onNpcSpawned(NpcSpawned e)
	{
		trackNpc(e.getNpc());
	}

	public void onNpcChanged(NpcChanged e)
	{
		untrackNpc(e.getNpc());
		trackNpc(e.getNpc());
	}

	public void onNpcDespawned(NpcDespawned e)
	{
		untrackNpc(e.getNpc());
	}

	public void onGameObjectSpawned(GameObjectSpawned e)
	{
		track(e.getGameObject());
	}

	public void onGameObjectDespawned(GameObjectDespawned e)
	{
		untrack(e.getGameObject());
	}

	public void onWallObjectSpawned(WallObjectSpawned e)
	{
		track(e.getWallObject());
	}

	public void onWallObjectDespawned(WallObjectDespawned e)
	{
		untrack(e.getWallObject());
	}

	public void onDecorativeObjectSpawned(DecorativeObjectSpawned e)
	{
		track(e.getDecorativeObject());
	}

	public void onDecorativeObjectDespawned(DecorativeObjectDespawned e)
	{
		untrack(e.getDecorativeObject());
	}

	public void onGroundObjectSpawned(GroundObjectSpawned e)
	{
		track(e.getGroundObject());
	}

	public void onGroundObjectDespawned(GroundObjectDespawned e)
	{
		untrack(e.getGroundObject());
	}

	public void onGameStateChanged(GameStateChanged e)
	{
		GameState state = e.getGameState();
		if (state == GameState.LOADING)
		{
			// A new area: objects will arrive again via spawn events.
			plugin.objects.clear();
		}
		if (plugin.server != null && state != GameState.LOADING)
		{
			plugin.server.setInGame(state == GameState.LOGGED_IN);
		}
		if (state == GameState.LOGGED_IN)
		{
			plugin.quests.loginTick = plugin.debug.tickCount;
			// A Dragon pickaxe or axe is a members item: on a free world it does not stand in for the tool the step names.
			ItemCounts.setMembersWorld(plugin.client.getWorldType().contains(net.runelite.api.WorldType.MEMBERS));
			ItemCounts.setLevels(plugin.client.getRealSkillLevel(Skill.MINING), plugin.client.getRealSkillLevel(Skill.WOODCUTTING), plugin.client.getRealSkillLevel(Skill.HITPOINTS));
			plugin.ownedDirty = true;
			plugin.navigation.updateHud();
		}
		else if (state == GameState.LOGIN_SCREEN || state == GameState.HOPPING)
		{
			ItemCounts.setMembersWorld(null);
			ItemCounts.setLevels(0, 0, 0);
			plugin.npcs.clear();
			plugin.navNpcs.clear();
			plugin.dangerNpcs.clear();
			plugin.objects.clear();
			plugin.arrowSet = false;
			plugin.pathSent = null;
		}
		if (state == GameState.LOGIN_SCREEN)
		{
			// Another character means other levels, bag, bank, XP and place.
			plugin.quests.qhReset();
			plugin.quests.loginTick = -1;
			plugin.stats.clear();
			plugin.statsDirty = true;
			plugin.xp.clear();
			plugin.xpDirty = true;
			plugin.questsSent = null;
			plugin.scripts.clear();
			plugin.playerSent = null;
			if (plugin.server != null)
			{
				plugin.server.setQuests(null);
				plugin.server.reports.endQuestSession();
				plugin.server.setPlayer(null);
				plugin.server.setPos(null, null, null);
			}
			// This character's bank goes into the settings while the profile is still theirs: the next login will not start from "bank unknown".
			plugin.player.saveBank(true);
			plugin.carried = ItemCounts.EMPTY;
			plugin.noted = ItemCounts.EMPTY;
			plugin.bank = null;
			plugin.bankFromSave = false;
			plugin.bankDirty = false;
			plugin.bankLoadTicks = 0;
			plugin.chronicleLoaded = false;
			plugin.chronicleLoadTicks = 0;
			if (plugin.server != null)
			{
				plugin.server.setChronicleCharges(null);
			}
			plugin.radar.reset();
			plugin.danger = DangerRadar.QUIET;
			plugin.lastPosition = null;
			plugin.hints.setupPacing();
			plugin.player.containersChanged();
		}
		if (state == GameState.LOGGED_IN)
		{
			if (plugin.pacing != null && !plugin.pacing.hasXp())
			{
				plugin.hints.readPacingXp();
				plugin.pacingDirty = true;
			}
			plugin.gearDirty = true;
			plugin.navigation.updateNavigation();
		}
	}
}
