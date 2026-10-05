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
 * The step's items in the inventory and bank: a frame along the cell's edge with a soft pulsation, the item itself is not covered.
 * In the bank, also a green fill on what the departure check says to take into the bag, and a quiet golden
 * frame on the items of the whole stage (POST /bank-tags), like the Bank Tags tab but without creating one.
 * An item from the gear advice (POST /gear-hint: "wear it, it is in the bank") gets an amber pulsing frame.
 * WidgetItemOverlay is RuneLite's standard way to draw over item cells.
 */
class OsrsPathItemOverlay extends WidgetItemOverlay
{
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private final ItemManager itemManager;
	/** The name by item ID: getItemComposition is not free, and it is drawn every frame. */
	private final Map<Integer, String> names = new HashMap<>();
	private static final Color WANTED_FILL = new Color(90, 220, 120, 55);
	/** A stage item in the bank: a quiet golden frame with no pulsation, a background and not a call to action. */
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
		// The stage's items (Bank Tags) only in the bank, with a soft frame, even with no step.
		boolean tagged = inBank && config.bankHighlight() && plugin.isBankTagged(itemId);
		boolean upgrades = plugin.hasUpgradeItems();
		if (target == null && !tagged && !upgrades)
		{
			return;
		}
		boolean checklist = target != null && inBank && config.showChecklist();
		boolean wanted = checklist && plugin.isWantedFromBank(itemId);
		boolean transport = target != null && !inBank && plugin.hasTransportFrame();
		boolean named = target != null && (!target.getItemNameSet().isEmpty() || plugin.hasLineItems());
		boolean stepItem = false;
		boolean upgrade = false;
		if (!wanted && (named || checklist || upgrades || transport))
		{
			String name = names.computeIfAbsent(itemId, id ->
			{
				ItemComposition c = itemManager.getItemComposition(id);
				return c == null ? "" : ActiveTarget.nameKey(c.getName());
			});
			wanted = checklist && plugin.isWantedFromBank(name);
			stepItem = (named && (target.getItemNameSet().contains(name) || plugin.isLineItem(name))) || (transport && plugin.isTransportItem(name));
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

	/** A cell from the bank window (not from the bag): the widget group is BANKMAIN. */
	private static boolean isBank(Widget w)
	{
		return w != null && (w.getId() >>> 16) == InterfaceID.BANKMAIN;
	}
}
