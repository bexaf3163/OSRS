package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.util.HashMap;
import java.util.Map;
import javax.inject.Inject;
import net.runelite.api.ItemComposition;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.Widget;
import net.runelite.api.widgets.WidgetItem;
import net.runelite.client.game.ItemManager;
import net.runelite.client.ui.overlay.WidgetItemOverlay;

/**
 * Предметы шага в инвентаре и банке: рамка по краю ячейки с мягкой пульсацией, сам предмет не закрывается.
 * В банке ещё зелёная заливка у того, что по проверке вылета надо взять в сумку, и тихая золотистая
 * рамка у предметов всего этапа (POST /bank-tags) — как вкладка Bank Tags, но без её создания.
 * Предмет из совета по снаряжению (POST /gear-hint: «надень — он в банке») — янтарная пульсирующая рамка.
 * WidgetItemOverlay — штатный способ RuneLite рисовать поверх ячеек предметов.
 */
class OsrsPathItemOverlay extends WidgetItemOverlay
{
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private final ItemManager itemManager;
	/** Имя по ID предмета: getItemComposition не бесплатен, а рисуется каждый кадр. */
	private final Map<Integer, String> names = new HashMap<>();
	private static final Color WANTED_FILL = new Color(90, 220, 120, 55);
	/** Предмет этапа в банке: тихая золотистая рамка без пульсации — фон, а не призыв. */
	private static final Color BANK_TAG = new Color(255, 210, 90, 150);
	private static final BasicStroke BANK_TAG_STROKE = new BasicStroke(1.5f);

	@Inject
	OsrsPathItemOverlay(OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config, ItemManager itemManager)
	{
		this.plugin = plugin;
		this.config = config;
		this.itemManager = itemManager;
		showOnInventory();
		showOnBank();
	}

	@Override
	public void renderItemOverlay(Graphics2D g, int itemId, WidgetItem item)
	{
		ActiveTarget target = plugin.getTarget();
		boolean inBank = isBank(item.getWidget());
		// Предметы этапа (Bank Tags) — только в банке, мягкой рамкой, и даже без шага.
		boolean tagged = inBank && config.bankHighlight() && plugin.isBankTagged(itemId);
		boolean upgrades = plugin.hasUpgradeItems();
		if (target == null && !tagged && !upgrades)
		{
			return;
		}
		boolean checklist = target != null && inBank && config.showChecklist();
		boolean wanted = checklist && plugin.isWantedFromBank(itemId);
		boolean named = target != null && (!target.getItemNameSet().isEmpty() || plugin.hasLineItems());
		boolean stepItem = false;
		boolean upgrade = false;
		if (!wanted && (named || checklist || upgrades))
		{
			String name = names.computeIfAbsent(itemId, id ->
			{
				ItemComposition c = itemManager.getItemComposition(id);
				return c == null ? "" : ActiveTarget.nameKey(c.getName());
			});
			wanted = checklist && plugin.isWantedFromBank(name);
			stepItem = named && (target.getItemNameSet().contains(name) || plugin.isLineItem(name));
			upgrade = upgrades && plugin.isUpgradeItem(name);
		}
		if (!wanted && !stepItem && !tagged && !upgrade)
		{
			return;
		}
		Rectangle b = item.getCanvasBounds();
		if (b == null)
		{
			return;
		}
		if (wanted)
		{
			g.setColor(WANTED_FILL);
			g.fillRoundRect(b.x, b.y, b.width, b.height, 6, 6);
			g.setColor(OsrsPathWidgetOverlay.pulse(OsrsPathHudOverlay.GOOD));
			g.setStroke(new BasicStroke(2f));
			g.drawRoundRect(b.x - 1, b.y - 1, b.width + 1, b.height + 1, 6, 6);
			return;
		}
		if (stepItem || upgrade)
		{
			g.setColor(OsrsPathWidgetOverlay.pulse(stepItem ? config.highlightColor() : OsrsPathHudOverlay.UPGRADE));
			g.setStroke(new BasicStroke(2f));
			g.drawRoundRect(b.x - 1, b.y - 1, b.width + 1, b.height + 1, 6, 6);
			return;
		}
		g.setColor(BANK_TAG);
		g.setStroke(BANK_TAG_STROKE);
		g.drawRoundRect(b.x, b.y, b.width - 1, b.height - 1, 6, 6);
	}

	/** Ячейка из окна банка (а не из сумки): группа виджета — BANKMAIN. */
	private static boolean isBank(Widget w)
	{
		return w != null && (w.getId() >>> 16) == InterfaceID.BANKMAIN;
	}
}
