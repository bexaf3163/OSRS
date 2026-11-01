package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import net.runelite.api.Client;
import net.runelite.api.EquipmentInventorySlot;
import net.runelite.api.GameState;
import net.runelite.api.Item;
import net.runelite.api.ItemContainer;
import net.runelite.api.NPC;
import net.runelite.api.Player;
import net.runelite.api.Quest;
import net.runelite.api.QuestState;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.events.ActorDeath;
import net.runelite.api.events.GameTick;
import net.runelite.api.events.HitsplatApplied;
import net.runelite.api.gameval.InventoryID;
import net.runelite.api.gameval.VarPlayerID;
import net.runelite.api.vars.AccountType;

/** Auto-tick: a section of {@link OsrsPathBridgePlugin}, which owns the injected services and the state the sections share. */
final class PluginTick
{
	private final OsrsPathBridgePlugin plugin;

	PluginTick(OsrsPathBridgePlugin plugin)
	{
		this.plugin = plugin;
	}

	/** The layer (surface, separate area, dungeon) and floor of the last tile: a change re-aims the arrow at a way in or out, or a staircase (Portals). */
	private int lastLayer = -1;

	private int xpTicks;

	private int questTicks;

	private static final int XP_EVERY_TICKS = 5;

	private static final int QUESTS_EVERY_TICKS = 20;

	/** The fights of a combat training step, for the app's food and time estimate (2.57.0). */
	private final CombatLog combatLog = new CombatLog();

	public void onActorDeath(ActorDeath e)
	{
		Player me = plugin.client.getLocalPlayer();
		// An opponent the player fought on a combat training step: one kill for the estimate (the level 12 and level 27 Minotaur apart).
		if (me != null && e.getActor() instanceof NPC && combatLog.getStepId() != null)
		{
			NPC npc = (NPC) e.getActor();
			if (me.getInteracting() == npc || npc.getInteracting() == me)
			{
				combatLog.kill(npc.getName(), npc.getCombatLevel(), System.currentTimeMillis());
			}
			return;
		}
		if (me == null || e.getActor() != me || plugin.server == null || !plugin.config.shareStats())
		{
			return;
		}
		WorldPoint at = me.getWorldLocation();
		plugin.debug.tel("moved", "what", "DEATH", "at", at == null ? null : new int[] {at.getX(), at.getY(), at.getPlane()});
		plugin.server.moved("DEATH", at == null ? null : new int[] {at.getX(), at.getY(), at.getPlane()}, null);
	}

	/** Damage the player took on a combat training step: it goes with the next kill (CombatLog). */
	public void onHitsplatApplied(HitsplatApplied e)
	{
		if (combatLog.getStepId() != null && e.getActor() != null && e.getActor() == plugin.client.getLocalPlayer())
		{
			combatLog.damage(e.getHitsplat().getAmount());
		}
	}

	/** The combat log follows the active step and the weapon in hand; the app reads it from /status. */
	private void updateCombatLog()
	{
		PacingSet p = plugin.pacing;
		ActiveTarget t = plugin.target;
		String step = p != null && t != null && TargetNeeds.Pacing.COMBAT.contains(p.getPacing().getSkill()) ? t.getStepId() : null;
		ItemContainer worn = plugin.client.getItemContainer(InventoryID.WORN);
		Item weapon = worn == null ? null : worn.getItem(EquipmentInventorySlot.WEAPON.getSlotIdx());
		combatLog.context(step, weapon == null ? -1 : weapon.getId());
		plugin.server.setCombatLog(step, step == null ? null : combatLog.snapshot());
	}

	public void onGameTick(GameTick e)
	{
		// The tick is posted between scripts: the one place where a script may be started (Quest.getState). Event handlers fired from inside a
		// script (a chat message, a varbit, a widget) read the values kept from the last tick instead.
		plugin.scripts.safe(true);
		try
		{
			tick(e);
		}
		finally
		{
			plugin.scripts.safe(false);
		}
	}

	private void tick(GameTick e)
	{
		if (plugin.completion != null && plugin.client.getGameState() == GameState.LOGGED_IN)
		{
			plugin.completion.onGameTick();
		}
		if (plugin.server != null && plugin.server.streamCount() > 0)
		{
			plugin.snapshot.appSeenAt = System.currentTimeMillis();
		}
		// The funding line follows the character and the app's absence (expiry): a change redraws the HUD.
		if ((plugin.snapshot.funding != null || plugin.snapshot.fundingShown != null) && !Objects.equals(plugin.snapshot.fundingLine(), plugin.snapshot.fundingShown))
		{
			plugin.navigation.updateHud();
		}
		// The cleanup lines follow the bag, the setting and the app's absence (expiry): a change redraws the guide.
		if ((plugin.snapshot.cleanup != null || !plugin.snapshot.cleanupShown.isEmpty()) && !plugin.snapshot.cleanupLines().equals(plugin.snapshot.cleanupShown))
		{
			plugin.navigation.updateHud();
		}
		Player me = plugin.client.getLocalPlayer();
		if (me != null && plugin.client.getGameState() == GameState.LOGGED_IN)
		{
			if (plugin.server != null && plugin.config.shareStats())
			{
				// Two integer reads: the app shows "Home Teleport ready in N min".
				plugin.server.setTeleportMarks(plugin.client.getVarpValue(TeleportCooldown.VARP_HOME), plugin.client.getVarpValue(TeleportCooldown.VARP_MINIGAME));
				plugin.server.setSpellbook(plugin.client.getVarbitValue(TeleportCooldown.VARBIT_SPELLBOOK));
				// Two integer reads: the app tells whether a new account's trade restrictions can still apply (10 quest points, total level 100).
				plugin.server.setProgressTotals(plugin.client.getVarpValue(VarPlayerID.QP), plugin.client.getTotalLevel());
				// A varbit read: Ironmen cannot sell on the Grand Exchange, so the cleanup advice must know.
				AccountType kind = plugin.client.getAccountType();
				plugin.server.setAccountType(kind == null ? null : kind.isIronman() || kind.isGroupIronman() ? "ironman" : "normal");
				updateCombatLog();
			}
			shareAccount(me);
			WorldPoint pos = me.getWorldLocation();
			// Everything about the player's place only when they changed tile, not every tick.
			if (!pos.equals(plugin.lastPosition))
			{
				WorldPoint before = plugin.lastPosition;
				plugin.lastPosition = pos;
				// A jump of 20+ tiles in a tick is a teleport or respawn: the app turns on recovery mode.
				if (before != null && plugin.server != null && plugin.config.shareStats()
					&& MoveDetector.isJump(before.getX(), before.getY(), pos.getX(), pos.getY()))
				{
					plugin.debug.tel("moved", "what", "TELEPORT", "from", new int[] {before.getX(), before.getY(), before.getPlane()}, "to", new int[] {pos.getX(), pos.getY(), pos.getPlane()});
					plugin.server.moved("TELEPORT", new int[] {before.getX(), before.getY(), before.getPlane()}, new int[] {pos.getX(), pos.getY(), pos.getPlane()});
				}
				if (plugin.server != null && plugin.config.shareStats())
				{
					plugin.server.setPos(pos.getX(), pos.getY(), pos.getPlane());
				}
				plugin.hints.updateDanger(pos);
				int layerNow = Navigation.layer(pos.getY()) * 4 + pos.getPlane();
				if (layerNow != lastLayer)
				{
					// Down the hole, up the ladder, up the stairs: the arrow goes from the way to the target itself (or to the next way).
					lastLayer = layerNow;
					plugin.navigation.updateNavigation();
				}
				boolean jumped = before != null && MoveDetector.isJump(before.getX(), before.getY(), pos.getX(), pos.getY());
				if (PluginNavigation.transportStopOutdated(plugin.snapshot.navViaTransport, jumped))
				{
					plugin.navigation.finishNav("teleported");
				}
				else if (plugin.navigation.arrived(pos))
				{
					plugin.navigation.finishNav("arrived");
				}
				else if (plugin.target != null && plugin.navTarget == null && plugin.breadcrumbs != null
					&& plugin.breadcrumbs.update(pos.getX(), pos.getY(), pos.getPlane()))
				{
					plugin.navigation.updateNavigation();
				}
				plugin.navigation.updateHud();
			}
			plugin.quests.varBurst = 0;
			plugin.debug.debugTick(me);
			plugin.player.persistBank();
			plugin.player.loadChronicle();
			if (plugin.quests.journalReadTick >= 0 && plugin.debug.tickCount >= plugin.quests.journalReadTick)
			{
				plugin.quests.journalReadTick = -1;
				plugin.quests.readJournal();
			}
			plugin.quests.qhTick();
			// The training view ends by itself two minutes after the last XP, or when the bank opens: nothing else would refresh a player standing still.
			Hud.State h = plugin.hud;
			if (h != null && h.isTraining() != (h.getPacing() != null && plugin.navigation.trainingNow()))
			{
				plugin.navigation.updateHud();
			}
		}
		flush();
	}

	/** Levels and items go to the app at most once per tick and only if something changed. */
	private void flush()
	{
		if (plugin.server == null)
		{
			return;
		}
		if (plugin.statsDirty)
		{
			plugin.statsDirty = false;
			plugin.server.setStats(plugin.config.shareStats() && !plugin.stats.isEmpty() ? plugin.stats : null);
		}
		if (plugin.xpDirty && (plugin.xp.isEmpty() || ++xpTicks >= XP_EVERY_TICKS))
		{
			plugin.xpDirty = false;
			xpTicks = 0;
			plugin.server.setXp(plugin.config.shareStats() && !plugin.xp.isEmpty() ? plugin.xp : null);
		}
		if (plugin.ownedDirty)
		{
			plugin.ownedDirty = false;
			plugin.server.owned(plugin.bank != null, plugin.bank != null && plugin.bankFromSave ? plugin.bankSavedAt : null, plugin.player.ownedReport());
		}
		if (plugin.gearDirty)
		{
			plugin.gearDirty = false;
			plugin.server.setGear(plugin.hints.gearReport());
		}
		if (plugin.pacingDirty)
		{
			plugin.pacingDirty = false;
			plugin.server.pacing(plugin.target == null ? null : plugin.target.getStepId(), plugin.hints.pacingReport());
		}
	}

	/** The character name and completed quests go to the app, if data transfer is on. Client thread (onGameTick). */
	private void shareAccount(Player me)
	{
		if (plugin.server == null)
		{
			return;
		}
		boolean share = plugin.config.shareStats();
		String name = share ? me.getName() : null;
		if (!Objects.equals(name, plugin.playerSent))
		{
			plugin.playerSent = name;
			plugin.server.setPlayer(name);
		}
		if (!share)
		{
			if (plugin.questsSent != null)
			{
				plugin.questsSent = null;
				plugin.server.setQuests(null);
			}
			return;
		}
		if (plugin.questsSent == null || ++questTicks >= QUESTS_EVERY_TICKS)
		{
			questTicks = 0;
			List<String> done = completedQuests();
			if (!done.equals(plugin.questsSent))
			{
				plugin.questsSent = done;
				plugin.server.setQuests(done);
			}
		}
	}

	/** Names of quests in the FINISHED state (the game calls them the same way). */
	List<String> completedQuests()
	{
		List<String> done = new ArrayList<>();
		for (Quest quest : Quest.values())
		{
			if (Boolean.TRUE.equals(plugin.scripts.read(quest.name(), () -> quest.getState(plugin.client) == QuestState.FINISHED)))
			{
				done.add(quest.getName());
			}
		}
		return done;
	}
}
