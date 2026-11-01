package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.IntUnaryOperator;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.EquipmentInventorySlot;
import net.runelite.api.GameState;
import net.runelite.api.Item;
import net.runelite.api.ItemComposition;
import net.runelite.api.ItemContainer;
import net.runelite.api.NPC;
import net.runelite.api.NPCComposition;
import net.runelite.api.Player;
import net.runelite.api.SoundEffectID;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.gameval.InventoryID;
import net.runelite.api.gameval.ItemID;
import net.runelite.client.RuneLite;
import net.runelite.client.game.ItemManager;

/** Danger radar; Pacing; Equipment and coins for the upgrade hint: a section of {@link OsrsPathBridgePlugin}, which owns the injected services and the state the sections share. */
@Slf4j
final class PluginHints
{
	private final OsrsPathBridgePlugin plugin;

	PluginHints(OsrsPathBridgePlugin plugin)
	{
		this.plugin = plugin;
	}

	private static boolean warned(DangerRadar.Reading r)
	{
		return r.getLevel() == DangerRadar.Level.WARNING || r.getLevel() == DangerRadar.Level.INSIDE;
	}

	/** A new player tile: which zone is nearby, a sound on entering, dangerous NPCs only in the warning zone. */
	void updateDanger(WorldPoint pos)
	{
		if (!plugin.config.dangerRadar() || plugin.radar == null)
		{
			plugin.danger = DangerRadar.QUIET;
			plugin.dangerNpcs.clear();
			return;
		}
		DangerRadar.Reading before = plugin.danger;
		plugin.danger = plugin.radar.update(pos.getX(), pos.getY(), pos.getPlane(), this::dangerCovered);
		if (!warned(plugin.danger))
		{
			plugin.dangerNpcs.clear();
		}
		else if (!warned(before) || before.getZone() != plugin.danger.getZone())
		{
			scanDangerNpcs();
		}
		if (plugin.danger.isEntered() && plugin.config.dangerSound())
		{
			plugin.client.playSoundEffect(SoundEffectID.PRAYER_DEPLETE_TWINKLE);
		}
	}

	/** Whether the item that makes the zone harmless is on: the Anti-dragon shield worn (or, for the boat, anywhere in the bag). */
	private boolean dangerCovered(DangerRadar.Zone zone)
	{
		if (zone.getOnlySteps() != null && !zone.getOnlySteps().isEmpty())
		{
			ActiveTarget t = plugin.target;
			if (t == null || t.getStepId() == null || !zone.getOnlySteps().contains(t.getStepId()))
			{
				return true;
			}
		}
		if (zone.getUnlessWorn() != null)
		{
			for (String name : zone.getUnlessWorn())
			{
				if (plugin.quests.worn.count(null, name) > 0)
				{
					return true;
				}
			}
		}
		if (zone.getUnlessHeld() != null)
		{
			for (String name : zone.getUnlessHeld())
			{
				if (plugin.carried.count(null, name) > 0)
				{
					return true;
				}
			}
		}
		return false;
	}

	/** After the worn items or the bag changed: the warning for a missing shield appears or goes away without a step. */
	void refreshDanger()
	{
		Player p = plugin.client.getLocalPlayer();
		if (p != null && plugin.client.getGameState() == GameState.LOGGED_IN && p.getWorldLocation() != null)
		{
			updateDanger(p.getWorldLocation());
		}
	}

	boolean dangerMatches(NPC npc)
	{
		DangerRadar.Zone zone = plugin.danger.getZone();
		if (zone == null || npc == null || !warned(plugin.danger) || zone.getNpcNameSet().isEmpty())
		{
			return false;
		}
		NPCComposition c = npc.getTransformedComposition();
		String name = c != null ? c.getName() : npc.getName();
		return name != null && zone.getNpcNameSet().contains(ActiveTarget.nameKey(name));
	}

	private void scanDangerNpcs()
	{
		plugin.dangerNpcs.clear();
		if (plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return;
		}
		for (NPC npc : plugin.client.getTopLevelWorldView().npcs())
		{
			if (dangerMatches(npc))
			{
				plugin.dangerNpcs.add(npc);
			}
		}
	}

	/** The step's pacing again: a new step, the setting was turned on or the character changed. */
	void setupPacing()
	{
		ActiveTarget.Pacing p = plugin.target == null ? null : plugin.target.getPacing();
		plugin.pacing = p == null || !plugin.config.smartPacing() ? null : new PacingSet(p);
		if (plugin.pacing != null && plugin.client.getGameState() == GameState.LOGGED_IN)
		{
			readPacingXp();
		}
		plugin.pacingDirty = true;
	}

	/** XP of all pacing skills from the client: on login and on a new step. */
	void readPacingXp()
	{
		long now = System.currentTimeMillis();
		for (String skill : plugin.pacing.skills())
		{
			plugin.pacing.update(skill, plugin.client.getSkillExperience(ActiveTarget.skillOf(skill)), now);
		}
	}

	Map<String, Object> pacingReport()
	{
		if (plugin.pacing == null || !plugin.pacing.hasXp())
		{
			return null;
		}
		PacingTracker.Snapshot s = plugin.pacing.snapshot();
		ActiveTarget.Pacing p = plugin.pacing.getPacing();
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("skill", plugin.pacing.getActive());
		// The goal of the skill shown now: a combat step can have one per skill (S3-08: Strength 20, Attack 30).
		m.put("targetLevel", p.targetLevelOf(plugin.pacing.getActive()));
		m.put("targetExp", p.targetExpOf(plugin.pacing.getActive()));
		m.put("xp", s.getXp());
		m.put("remainingXp", s.getRemainingXp());
		m.put("actionsLeft", s.getActionsLeft());
		m.put("actionsPerMinute", s.getActionsPerMinute() == null ? null : Math.round(s.getActionsPerMinute() * 10) / 10.0);
		m.put("etaSeconds", s.getEtaSeconds());
		m.put("estimated", s.isEstimated());
		m.put("almost", s.isAlmost());
		m.put("done", s.isDone());
		// Combat: which of the step's skills have not reached the goal yet, besides the shown one.
		if (plugin.pacing.skills().size() > 1)
		{
			m.put("left", plugin.pacing.left());
		}
		return m;
	}

	/** Worn items, bag and coins. null means not in the game or upgrade hints are turned off; a container that did not arrive has a null field. */
	Map<String, Object> gearReport()
	{
		if (!plugin.config.upgradeRouter() || plugin.client.getGameState() != GameState.LOGGED_IN)
		{
			return null;
		}
		ItemContainer worn = plugin.client.getItemContainer(InventoryID.WORN);
		ItemContainer bag = plugin.client.getItemContainer(InventoryID.INV);
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
		// Occupied bag slots: the items in the list are stacked by ID, and preparation needs to know whether anything else will fit.
		int slotsUsed = 0;
		if (bag != null)
		{
			Map<Integer, Integer> stacks = new LinkedHashMap<>();
			for (Item it : bag.getItems())
			{
				if (it.getId() > 0 && it.getQuantity() > 0)
				{
					stacks.merge(it.getId(), it.getQuantity(), Integer::sum);
					slotsUsed++;
				}
			}
			inventory = new ArrayList<>();
			for (Map.Entry<Integer, Integer> e : stacks.entrySet())
			{
				Map<String, Object> row = itemRow(e.getKey(), e.getValue());
				// A banknote is the same name as the item but not the item: the cleanup advice keeps them apart (additive, since 2.59.0).
				ItemComposition comp = plugin.itemManager.getItemComposition(e.getKey());
				if (comp != null && comp.getNote() != -1)
				{
					row.put("noted", true);
				}
				inventory.add(row);
			}
			coins = stacks.getOrDefault(ItemID.COINS, 0);
		}
		Map<String, Object> g = new LinkedHashMap<>();
		g.put("equipment", equipment);
		g.put("inventory", inventory);
		g.put("coins", bag == null ? null : coins);
		g.put("inventorySlots", bag == null ? null : slotsUsed);
		// Weight of the bag and worn items as in the game (client.getWeight): how fast running drains depends on it.
		g.put("weight", bag == null ? null : plugin.client.getWeight());
		g.put("bankCoins", plugin.bank == null ? null : plugin.bank.count(ItemID.COINS, "Coins"));
		// A value of items by Grand Exchange prices (without coins): in the bag and worn, and in the bank if it was opened.
		// This is not money but what you would get by selling: the app shows it separately from coins, with "~".
		IntUnaryOperator price = this::itemPrice;
		g.put("carriedValue", plugin.carried.value(price, ItemID.COINS) + plugin.noted.value(price, ItemID.COINS));
		g.put("bankValue", plugin.bank == null ? null : plugin.bank.value(price, ItemID.COINS));
		return g;
	}

	private java.lang.reflect.Method priceMethod;

	private boolean priceBroken;

	/**
	 * The item's Grand Exchange price. In RuneLite 1.13 getItemPrice(int) returned long instead of int: a call compiled for 1.12
	 * failed with NoSuchMethodError and crashed the plugin on login. The method is looked up by name, the result is any number;
	 * any error means price 0 (item valuation is optional), the client does not suffer.
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
			Object r = priceMethod.invoke(plugin.itemManager, id);
			long v = r instanceof Number ? ((Number) r).longValue() : 0;
			return (int) Math.max(0, Math.min(Integer.MAX_VALUE, v));
		}
		catch (Throwable t)
		{
			priceBroken = true;
			log.warn("OSRS Path Bridge: item prices are unavailable in this RuneLite version - item valuation is turned off", t);
			return 0;
		}
	}

	/** A slot by the worn-slot number: weapon, head, amulet... (EquipmentInventorySlot). null means an unknown slot. */
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
		ItemComposition c = plugin.itemManager.getItemComposition(id);
		row.put("name", c == null ? "" : c.getName());
		if (count != null)
		{
			row.put("count", count);
		}
		return row;
	}
}
