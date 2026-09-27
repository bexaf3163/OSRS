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
 * В банке ещё зелёная заливка у того, что по проверке вылета надо взять в сумку.
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
		if (target == null)
		{
			return;
		}
		boolean inBank = isBank(item.getWidget());
		boolean wanted = inBank && config.showChecklist() && plugin.isWantedFromBank(itemId);
		if (!wanted && target.getItemNameSet().isEmpty())
		{
			return;
		}
		String name = names.computeIfAbsent(itemId, id ->
		{
			ItemComposition c = itemManager.getItemComposition(id);
			return c == null ? "" : ActiveTarget.nameKey(c.getName());
		});
		wanted |= inBank && config.showChecklist() && plugin.isWantedFromBank(name);
		if (!wanted && !target.getItemNameSet().contains(name))
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
		g.setColor(OsrsPathWidgetOverlay.pulse(config.highlightColor()));
		g.setStroke(new BasicStroke(2f));
		g.drawRoundRect(b.x - 1, b.y - 1, b.width + 1, b.height + 1, 6, 6);
	}

	/** Ячейка из окна банка (а не из сумки): группа виджета — BANKMAIN. */
	private static boolean isBank(Widget w)
	{
		return w != null && (w.getId() >>> 16) == InterfaceID.BANKMAIN;
	}
}
