package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.ChatMessageType;
import net.runelite.api.GameState;
import net.runelite.api.GrandExchangeOffer;
import net.runelite.api.GrandExchangeOfferState;
import net.runelite.api.Item;
import net.runelite.api.ItemComposition;
import net.runelite.api.ItemContainer;
import net.runelite.api.NPC;
import net.runelite.api.Quest;
import net.runelite.api.QuestState;
import net.runelite.api.Skill;
import net.runelite.api.SoundEffectID;
import net.runelite.api.events.ChatMessage;
import net.runelite.api.events.GrandExchangeOfferChanged;
import net.runelite.api.events.ItemContainerChanged;
import net.runelite.api.events.MenuOptionClicked;
import net.runelite.api.events.StatChanged;
import net.runelite.api.events.VarbitChanged;
import net.runelite.api.events.WidgetLoaded;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.gameval.InventoryID;
import net.runelite.client.RuneLite;
import net.runelite.client.util.Text;

/** Levels; Bag, bank and exchange: a section of {@link OsrsPathBridgePlugin}, which owns the injected services and the state the sections share. */
@Slf4j
final class PluginPlayer
{
	private final OsrsPathBridgePlugin plugin;

	PluginPlayer(OsrsPathBridgePlugin plugin)
	{
		this.plugin = plugin;
	}

	/** RuneLite quests by the in-game name: "Cook's Assistant" -> Quest.COOKS_ASSISTANT. */
	private static final Map<String, Quest> QUESTS = Arrays.stream(Quest.values())
		.collect(Collectors.toMap(q -> ActiveTarget.nameKey(q.getName()), q -> q, (a, b) -> a));

	private long bankWrittenAt;

	static final long BANK_SAVE_GAP_MS = 3_000;

	private final Map<Integer, String> itemNames = new HashMap<>();

	private Set<Integer> wantedIds = Collections.emptySet();

	private Set<String> wantedNames = Collections.emptySet();

	/** Exchange slots: the item ID and the buy order in each. */
	private final int[] offerItems = new int[8];

	private final ShoppingPlan.Offer[] offerSlots = new ShoppingPlan.Offer[8];

	/** The total level is not a skill; RuneLite marks it deprecated, so we compare by name. */
	static boolean isOverall(Skill skill)
	{
		return "OVERALL".equals(skill.name());
	}

	static String skillKey(Skill skill)
	{
		return skill.getName().toLowerCase(Locale.ROOT);
	}

	public void onStatChanged(StatChanged e)
	{
		if (isOverall(e.getSkill()))
		{
			return;
		}
		if (e.getSkill() == Skill.MINING || e.getSkill() == Skill.WOODCUTTING || e.getSkill() == Skill.HITPOINTS)
		{
			// A pickaxe or axe tier above the player's level does not count as "the tool" (a Rune pickaxe at Mining 10).
			ItemCounts.setLevels(plugin.client.getRealSkillLevel(Skill.MINING), plugin.client.getRealSkillLevel(Skill.WOODCUTTING), plugin.client.getRealSkillLevel(Skill.HITPOINTS));
			plugin.ownedDirty = true;
		}
		// The tracked skill reached the target level of its step: the next step leads (chime, arrow to its place, its object or NPC highlighted).
		if (plugin.snapshot.skillPath != null && e.getSkill() == plugin.snapshot.skillPath.skillEnum())
		{
			plugin.snapshot.syncSkillTarget(true);
		}
		String key = skillKey(e.getSkill());
		Integer oldXp = plugin.xp.put(key, e.getXp());
		if (oldXp == null || oldXp != e.getXp())
		{
			plugin.xpDirty = true;
		}
		Integer old = plugin.stats.put(key, e.getLevel());
		if (old == null || old != e.getLevel())
		{
			plugin.statsDirty = true;
			if (plugin.completion != null)
			{
				plugin.completion.onStateChanged();
			}
		}
		if (e.getSkill() == Skill.HITPOINTS && plugin.target != null && plugin.target.getMaxHit() != null)
		{
			// Health changes with every hit: its line is recomputed at once, not once per game tick.
			plugin.navigation.updateHud();
		}
		if (plugin.pacing != null && plugin.pacing.tracks(key) && plugin.pacing.update(key, e.getXp(), System.currentTimeMillis()))
		{
			plugin.pacingDirty = true;
			plugin.navigation.updateHud();
		}
	}

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
			plugin.bank = b;
			plugin.bankFromSave = false;
			plugin.bankDirty = true;
			containersChanged();
		}
	}

	/** Once per tick: load the bank of the previous session after login; write a changed bank at most once per few seconds. */
	void persistBank()
	{
		try
		{
			if (plugin.bank == null && plugin.bankLoadTicks < OsrsPathBridgePlugin.BANK_LOAD_TICKS)
			{
				plugin.bankLoadTicks++;
				loadBank();
			}
			if (plugin.bankDirty && System.currentTimeMillis() - bankWrittenAt >= BANK_SAVE_GAP_MS)
			{
				saveBank(false);
			}
		}
		catch (RuntimeException ex)
		{
			log.warn("Bank save: {}", ex.toString());
		}
	}

	/**
	 * The Chronicle's charges after login: our own last count for this RuneScape profile, otherwise the one RuneLite's Item Charges plugin saved.
	 * Read once the profile is there (it appears a little after login); with neither, the count stays unknown.
	 */
	void loadChronicle()
	{
		if (plugin.chronicleLoaded || plugin.chronicleLoadTicks >= OsrsPathBridgePlugin.BANK_LOAD_TICKS)
		{
			return;
		}
		plugin.chronicleLoadTicks++;
		Integer n = ChronicleCharges.read(plugin.configManager.getRSProfileConfiguration(OsrsPathBridgeConfig.GROUP, ChronicleCharges.KEY));
		if (n == null)
		{
			n = ChronicleCharges.read(plugin.configManager.getRSProfileConfiguration(ChronicleCharges.ITEM_CHARGE_GROUP, ChronicleCharges.ITEM_CHARGE_KEY));
		}
		if (n == null && plugin.chronicleLoadTicks < OsrsPathBridgePlugin.BANK_LOAD_TICKS)
		{
			return;
		}
		plugin.chronicleLoaded = true;
		if (plugin.server != null)
		{
			plugin.server.setChronicleCharges(n);
		}
	}

	/** A game message told the Chronicle's charges: kept for this profile and reported to the app. */
	private void chronicleCharges(int n)
	{
		plugin.chronicleLoaded = true;
		plugin.configManager.setRSProfileConfiguration(OsrsPathBridgeConfig.GROUP, ChronicleCharges.KEY, n);
		if (plugin.server != null)
		{
			plugin.server.setChronicleCharges(n);
		}
		plugin.debug.tel("chronicle", "charges", n);
	}

	private void loadBank()
	{
		BankSnapshot.Loaded l = BankSnapshot.read(plugin.configManager.getRSProfileConfiguration(OsrsPathBridgeConfig.GROUP, BankSnapshot.KEY));
		if (l == null)
		{
			return;
		}
		ItemCounts b = new ItemCounts();
		for (Map.Entry<Integer, Integer> e : l.items.entrySet())
		{
			try
			{
				b.add(e.getKey(), itemName(e.getKey()), e.getValue());
			}
			catch (RuntimeException ex)
			{
				// No item with this ID exists in the game (junk in the settings): skip it, the rest of the bank is fine.
				log.debug("Item {} from the saved bank was not recognised", e.getKey());
			}
		}
		plugin.bank = b;
		plugin.bankFromSave = true;
		plugin.bankSavedAt = l.at;
		plugin.bankLoadTicks = OsrsPathBridgePlugin.BANK_LOAD_TICKS;
		plugin.debug.tel("bank", "event", "loaded", "items", l.items.size(), "savedAt", l.at);
		containersChanged();
	}

	/** The bank into the profile settings. force means write now, do not wait for the pause (logout, plugin shutdown). */
	void saveBank(boolean force)
	{
		ItemCounts b = plugin.bank;
		if (b == null || plugin.bankFromSave || !plugin.bankDirty)
		{
			return;
		}
		long now = System.currentTimeMillis();
		if (!force && now - bankWrittenAt < BANK_SAVE_GAP_MS)
		{
			return;
		}
		try
		{
			plugin.configManager.setRSProfileConfiguration(OsrsPathBridgeConfig.GROUP, BankSnapshot.KEY, BankSnapshot.write(b, now));
			bankWrittenAt = now;
			plugin.bankDirty = false;
			plugin.debug.tel("bank", "event", "saved", "items", b.idCounts().size());
		}
		catch (RuntimeException ex)
		{
			log.warn("Bank not saved: {}", ex.toString());
		}
	}

	void rebuildCarried()
	{
		ItemCounts c = new ItemCounts();
		ItemCounts n = new ItemCounts();
		count(plugin.client.getItemContainer(InventoryID.INV), c, n);
		count(plugin.client.getItemContainer(InventoryID.WORN), c, n);
		ItemCounts w = new ItemCounts();
		count(plugin.client.getItemContainer(InventoryID.WORN), w, null);
		plugin.quests.worn = w;
		if (plugin.debug.telemetry != null)
		{
			Map<String, Integer> delta = c.deltaFrom(plugin.debug.lastBag);
			if (!delta.isEmpty() && delta.size() <= 24)
			{
				plugin.debug.tel("bag", "delta", delta, "step", plugin.target == null ? null : plugin.target.getStepId());
			}
			plugin.debug.lastBag = c;
		}
		plugin.carried = c;
		plugin.noted = n;
		plugin.snapshot.bagIds = idCounts(plugin.client.getItemContainer(InventoryID.INV));
		containersChanged();
		plugin.hints.refreshDanger();
	}

	/** The count by item id as the game holds it (a banknote under its own id). */
	static Map<Integer, Integer> idCounts(ItemContainer container)
	{
		if (container == null)
		{
			return Collections.emptyMap();
		}
		Map<Integer, Integer> out = new HashMap<>();
		for (Item it : container.getItems())
		{
			if (it.getId() > 0 && it.getQuantity() > 0)
			{
				out.merge(it.getId(), it.getQuantity(), Integer::sum);
			}
		}
		return out;
	}

	/** Lays a container out by counters. Notes go into notes (as the item they stand for). */
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
			ItemComposition c = plugin.itemManager.getItemComposition(it.getId());
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
		return itemNames.computeIfAbsent(id, k -> ActiveTarget.nameKey(plugin.itemManager.getItemComposition(k).getName()));
	}

	void containersChanged()
	{
		if (plugin.completion != null)
		{
			plugin.completion.onStateChanged();
		}
		recomputeChecklist();
		recomputeShopping();
		plugin.ownedDirty = true;
		plugin.gearDirty = true;
		if (plugin.navigation.hasNavItem())
		{
			// Bought or received the upgrade item: the temporary target is cleared and the step returns by itself.
			plugin.navigation.finishNav("obtained");
			return;
		}
		plugin.navigation.updateHud();
	}

	/** For which stage the departure check was computed. */
	String checklistStage;

	/** The current quest stage's items; null means there are no stages or the stage has no list of its own (then the step's items). */
	private List<TargetGuide.GuideItem> stageItems()
	{
		TargetStages.Stage st = PluginQuests.stageOf(plugin.target);
		Integer value = st == null ? null : plugin.quests.stageValue(st);
		return value == null ? null : st.getStages().get(st.indexFor(value)).getItems();
	}

	void recomputeChecklist()
	{
		// The quest was handed in: items were spent or given away, "missing" no longer says anything: the departure check empties.
		List<TargetGuide.ChecklistItem> items = plugin.target == null || plugin.quests.questDone(plugin.target) ? null : plugin.target.getChecklist();
		List<TargetGuide.GuideItem> forStage = items == null ? null : stageItems();
		if (forStage != null)
		{
			// Needed now is only what the stage names: yesterday's items (the pie, the pickaxe) no longer wait.
			List<TargetGuide.ChecklistItem> kept = new ArrayList<>();
			for (TargetGuide.ChecklistItem c : items)
			{
				for (TargetGuide.GuideItem g : forStage)
				{
					if (ActiveTarget.nameKey(g.getName()).equals(ActiveTarget.nameKey(c.getName())) || (g.getId() != null && g.getId().equals(c.getId())))
					{
						kept.add(c);
						break;
					}
				}
			}
			items = kept;
		}
		plugin.checklist = Checklist.evaluate(items, plugin.carried, plugin.bank, plugin.quests.worn);
		Set<Integer> ids = new HashSet<>();
		Set<String> names = new HashSet<>();
		for (int i = 0; i < plugin.checklist.getRows().size(); i++)
		{
			Checklist.Row row = plugin.checklist.getRows().get(i);
			if (row.getState() != Checklist.State.IN_BAG_READY && row.getState() != Checklist.State.NOT_EQUIPPED && row.getInBank() != 0)
			{
				TargetGuide.ChecklistItem item = items.get(i);
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

	/** Whether to take this item from the bank per the departure check. */
	boolean isWantedFromBank(int itemId)
	{
		PrepPlan p = plugin.snapshot.prep;
		return wantedIds.contains(itemId) || (p != null && p.withdrawsItem(itemId, null));
	}

	boolean isWantedFromBank(String nameKey)
	{
		PrepPlan p = plugin.snapshot.prep;
		return wantedNames.contains(nameKey) || (p != null && p.withdrawsItem(0, nameKey));
	}

	/** The item the recommended transport uses, framed in the bag for a few seconds after a click on its row. */
	boolean isTransportItem(String nameKey)
	{
		PrepPlan p = plugin.snapshot.prep;
		return p != null && System.nanoTime() < plugin.snapshot.transportFrameUntil && p.usesTransportItem(nameKey);
	}

	boolean hasTransportFrame()
	{
		return System.nanoTime() < plugin.snapshot.transportFrameUntil;
	}

	void recomputeShopping()
	{
		if (plugin.plan == null)
		{
			plugin.shopping = Collections.emptyList();
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
		plugin.shopping = ShoppingPlan.progress(plugin.plan.getItems(), ItemCounts.sum(plugin.carried, plugin.noted, plugin.bank), offers);
	}

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

	/** For auto-tick: how much of the item the player has: bag, worn, notes and the bank if it was opened. */
	int ownedCount(TargetNeeds.ItemNeed need)
	{
		return ItemCounts.sum(plugin.carried, plugin.noted, plugin.bank).count(need);
	}

	/** How many of the items the app asks about: the departure check, the variant conditions and the shopping list. */
	List<Map<String, Object>> ownedReport()
	{
		Map<String, Map<String, Object>> out = new LinkedHashMap<>();
		if (plugin.target != null && plugin.target.getChecklist() != null)
		{
			for (TargetGuide.ChecklistItem i : plugin.target.getChecklist())
			{
				report(out, i.getName(), i.getId());
			}
		}
		if (plugin.target != null && plugin.target.getWatchItems() != null)
		{
			for (String name : plugin.target.getWatchItems())
			{
				report(out, name, null);
			}
		}
		if (plugin.plan != null)
		{
			for (ShoppingPlan.Item i : plugin.plan.getItems())
			{
				report(out, i.getName(), i.getId());
			}
			// Every Shopping row, owned or not: what is counted must not depend on the count (a row found in the bank flickered in 2.72.2).
			for (String name : plugin.plan.counted())
			{
				report(out, name, null);
			}
		}
		GearHint h = plugin.gearHint;
		if (h != null)
		{
			for (String name : h.watched())
			{
				report(out, name, null);
			}
		}
		return new ArrayList<>(out.values());
	}

	/**
	 * One item's counts for the app. A potion brings its other sizes along: the app counts doses of every size (doses.ts), and a size it was not told
	 * about would read as "not counted" rather than "none".
	 */
	private void report(Map<String, Map<String, Object>> out, String name, Integer id)
	{
		reportOne(out, name, id);
		for (String size : ItemCounts.doseNames(name))
		{
			reportOne(out, size, null);
		}
	}

	private void reportOne(Map<String, Map<String, Object>> out, String name, Integer id)
	{
		String key = ActiveTarget.nameKey(name);
		if (out.containsKey(key))
		{
			return;
		}
		out.put(key, ItemCounts.report(name, id, plugin.carried, plugin.noted, plugin.bank));
	}

	public void onChatMessage(ChatMessage e)
	{
		if (plugin.completion != null && (e.getType() == ChatMessageType.GAMEMESSAGE || e.getType() == ChatMessageType.SPAM))
		{
			plugin.completion.onChatMessage(e.getMessage());
		}
		if ((e.getType() == ChatMessageType.GAMEMESSAGE || e.getType() == ChatMessageType.SPAM) && e.getMessage() != null)
		{
			// "Your book has 14 charges left.": the Chronicle's count, when it was checked, used or charged.
			Integer charges = ChronicleCharges.parse(Text.removeTags(e.getMessage()));
			if (charges != null)
			{
				chronicleCharges(charges);
			}
		}
		ChatMessageType t = e.getType();
		String msg = e.getMessage();
		if (msg != null && !msg.startsWith("OSRS Path:") && (t == ChatMessageType.GAMEMESSAGE || t == ChatMessageType.ENGINE
			|| t == ChatMessageType.SPAM || t == ChatMessageType.MESBOX || t == ChatMessageType.DIALOG))
		{
			// The same messages by which Quest Helper understands that a step is done ("Luthas hands you 30 coins.").
			plugin.quests.qhFacts().add(t.name(), msg);
			if (plugin.config.telemetryDetail() && plugin.debug.telBudget("chat", 150))
			{
				plugin.debug.tel("chat", "type", t.name(), "name", e.getName(), "msg", Text.removeTags(msg));
			}
			if (PluginQuests.stageOf(plugin.target) != null)
			{
				plugin.navigation.updateHud();
			}
		}
	}

	public void onWidgetLoaded(WidgetLoaded e)
	{
		if (e.getGroupId() == InterfaceID.QUESTJOURNAL)
		{
			plugin.quests.journalReadTick = plugin.debug.tickCount + 2;
		}
		else if (e.getGroupId() == InterfaceID.CHATMENU && plugin.config.telemetryDetail())
		{
			plugin.clientThread.invokeLater(plugin.quests::logDialogOptions);
		}
	}

	public void onMenuOptionClicked(MenuOptionClicked e)
	{
		if (plugin.debug.telemetry == null || !plugin.config.telemetryDetail())
		{
			return;
		}
		long now = System.currentTimeMillis();
		if (now - plugin.quests.menuBurstAt > 1000)
		{
			plugin.quests.menuBurstAt = now;
			plugin.quests.menuBurst = 0;
		}
		if (++plugin.quests.menuBurst > 6 || !plugin.debug.telBudget("menu", 120))
		{
			return;
		}
		net.runelite.api.MenuEntry me = e.getMenuEntry();
		String target = me.getTarget();
		plugin.debug.tel("menu", "opt", me.getOption(), "tgt", target == null ? "" : Text.removeTags(target), "act", me.getType() == null ? null : me.getType().name(),
			"id", me.getIdentifier(), "p0", me.getParam0(), "p1", me.getParam1());
	}

	public void onVarbitChanged(VarbitChanged e)
	{
		if (plugin.completion != null)
		{
			plugin.completion.onVarbitChanged(e.getVarbitId(), e.getValue());
		}
		TargetStages.Stage st = PluginQuests.stageOf(plugin.target);
		boolean questVar = st != null && !st.isManual() && (st.isVarp() ? e.getVarpId() == st.getId() : e.getVarbitId() == st.getId());
		if (questVar)
		{
			plugin.navigation.updateHud();
		}
		else if (plugin.debug.telemetry != null && plugin.config.telemetryDetail() && plugin.client.getGameState() == GameState.LOGGED_IN && plugin.quests.loginTick >= 0
			&& plugin.debug.tickCount - plugin.quests.loginTick > 8 && plugin.quests.varBurst++ < 10 && plugin.debug.telBudget("varx", 90))
		{
			// Other game variables: Quest Helper builds step conditions from them, and they show what changed from the player's action.
			plugin.debug.tel("varx", "varp", e.getVarpId(), "varbit", e.getVarbitId() < 0 ? null : e.getVarbitId(), "to", e.getValue());
		}
	}

	/**
	 * Whether the quest is finished; null — unknown. Runs the game's script only inside the tick ({@link ScriptGuard}); an event handler that is posted from
	 * inside a script (the chat message of a level-up) gets the value of the last tick.
	 */
	Boolean isQuestFinished(String questName)
	{
		Quest quest = QUESTS.get(ActiveTarget.nameKey(questName));
		if (quest == null)
		{
			return null;
		}
		return plugin.scripts.read(quest.name(), () -> quest.getState(plugin.client) == QuestState.FINISHED);
	}

	void onStepCompleted(String stepId)
	{
		if (plugin.config.completionSound())
		{
			plugin.client.playSoundEffect(SoundEffectID.UI_BOOP);
		}
		plugin.client.addChatMessage(ChatMessageType.GAMEMESSAGE, "", "OSRS Path: step " + stepId + " complete", null);
		recomputeChecklist();
		plugin.navigation.updateHud();
		if (plugin.server != null)
		{
			plugin.server.stepCompleted(stepId);
		}
	}

	/** For a test: which quest names this RuneLite version knows. */
	static Map<String, Quest> knownQuests()
	{
		return Collections.unmodifiableMap(QUESTS);
	}
}
