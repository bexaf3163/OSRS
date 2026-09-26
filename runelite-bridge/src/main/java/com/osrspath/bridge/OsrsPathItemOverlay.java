package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.util.HashMap;
import java.util.Map;
import javax.inject.Inject;
import net.runelite.api.ItemComposition;
import net.runelite.api.widgets.WidgetItem;
import net.runelite.client.game.ItemManager;
import net.runelite.client.ui.overlay.WidgetItemOverlay;

/**
 * Предметы шага в инвентаре и банке: рамка по краю ячейки с мягкой пульсацией, сам предмет не закрывается.
 * WidgetItemOverlay — штатный способ RuneLite рисовать поверх ячеек предметов.
 */
class OsrsPathItemOverlay extends WidgetItemOverlay
{
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private final ItemManager itemManager;
	/** Имя по ID предмета: getItemComposition не бесплатен, а рисуется каждый кадр. */
	private final Map<Integer, String> names = new HashMap<>();

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
		if (target == null || target.getItemNameSet().isEmpty())
		{
			return;
		}
		String name = names.computeIfAbsent(itemId, id ->
		{
			ItemComposition c = itemManager.getItemComposition(id);
			return c == null ? "" : ActiveTarget.nameKey(c.getName());
		});
		if (!target.getItemNameSet().contains(name))
		{
			return;
		}
		Rectangle b = item.getCanvasBounds();
		if (b == null)
		{
			return;
		}
		g.setColor(OsrsPathWidgetOverlay.pulse(config.highlightColor()));
		g.setStroke(new BasicStroke(2f));
		g.drawRoundRect(b.x - 1, b.y - 1, b.width + 1, b.height + 1, 6, 6);
	}
}
