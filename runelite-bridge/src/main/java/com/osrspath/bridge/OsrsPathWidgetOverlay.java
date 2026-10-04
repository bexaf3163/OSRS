package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.Polygon;
import java.awt.Rectangle;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;

/**
 * The right option in the dialogue menu: a frame around the line and an arrow ▶ on the left. And the upgrade item in a shop.
 * The options menu is the component InterfaceID.Chatmenu.OPTIONS (219:1) from RuneLite 1.12.39's gameval;
 * the options are its dynamic child widgets with text.
 */
class OsrsPathWidgetOverlay extends Overlay
{
	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	/** The upgrade item's cell in an open shop: remembered while the shop is the same. */
	private Widget shopSlot;

	@Inject
	OsrsPathWidgetOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.DYNAMIC);
		setLayer(OverlayLayer.ABOVE_WIDGETS);
		setPriority(PRIORITY_HIGH);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		renderShopItem(g);
		ActiveTarget target = plugin.getTarget();
		if (target == null || target.getDialogSet().isEmpty())
		{
			return null;
		}
		Widget options = client.getWidget(InterfaceID.Chatmenu.OPTIONS);
		if (options == null || options.isHidden())
		{
			return null;
		}
		Widget[] children = options.getDynamicChildren();
		if (children == null)
		{
			return null;
		}
		Color color = pulse(config.highlightColor());
		for (Widget option : children)
		{
			if (option == null || option.isHidden() || option.getText() == null)
			{
				continue;
			}
			if (!target.getDialogSet().contains(ActiveTarget.dialogKey(option.getText())))
			{
				continue;
			}
			Rectangle b = option.getBounds();
			if (b == null || b.width <= 0)
			{
				continue;
			}
			g.setColor(color);
			g.setStroke(new BasicStroke(2f));
			g.drawRoundRect(b.x - 3, b.y - 1, b.width + 6, b.height + 2, 6, 6);
			// The arrow is drawn as a shape: the game fonts have no ▶ symbol.
			int cy = b.y + b.height / 2;
			Polygon arrow = new Polygon(new int[]{b.x - 16, b.x - 16, b.x - 7}, new int[]{cy - 6, cy + 6, cy}, 3);
			g.fillPolygon(arrow);
		}
		return null;
	}

	/**
	 * The upgrade item in an open shop: a frame around its cell. The shop cells are dynamic
	 * child widgets of InterfaceID.Shopmain.ITEMS (300:16) with the item ID, so it is looked up by ID
	 * (or by name if the app does not know the ID), not by place on the screen. The found cell
	 * is remembered: iterating only when the shop was opened or its contents changed.
	 */
	private void renderShopItem(Graphics2D g)
	{
		NavTarget nav = plugin.getNavTarget();
		if (nav == null || !nav.isPurchase() || !config.upgradeRouter())
		{
			shopSlot = null;
			return;
		}
		Widget items = client.getWidget(InterfaceID.Shopmain.ITEMS);
		if (items == null || items.isHidden())
		{
			shopSlot = null;
			return;
		}
		if (shopSlot == null || shopSlot.getParent() != items || !isWanted(shopSlot, nav))
		{
			shopSlot = null;
			Widget[] children = items.getDynamicChildren();
			if (children != null)
			{
				for (Widget w : children)
				{
					if (w != null && isWanted(w, nav))
					{
						shopSlot = w;
						break;
					}
				}
			}
		}
		if (shopSlot == null || shopSlot.isHidden())
		{
			return;
		}
		Rectangle b = shopSlot.getBounds();
		Rectangle area = items.getBounds();
		// The shop cell is scrolled beyond the shop window's edge: we do not draw the frame over someone else's.
		if (b == null || area == null || b.width <= 0 || !area.contains(b.x + b.width / 2, b.y + b.height / 2))
		{
			return;
		}
		g.setColor(pulse(OsrsPathHudOverlay.TITLE));
		g.setStroke(new BasicStroke(2f));
		g.drawRoundRect(b.x - 2, b.y - 2, b.width + 3, b.height + 3, 6, 6);
	}

	private static boolean isWanted(Widget w, NavTarget nav)
	{
		if (w.getItemId() <= 0)
		{
			return false;
		}
		if (nav.getItemId() != null)
		{
			return w.getItemId() == nav.getItemId();
		}
		return nav.getItemName() != null && ActiveTarget.nameKey(w.getName()).equals(ActiveTarget.nameKey(nav.getItemName()));
	}

	/** A soft pulsation of transparency: noticeable but not flickering. */
	static Color pulse(Color base)
	{
		double phase = (System.currentTimeMillis() % 1200) / 1200.0;
		double k = 0.65 + 0.35 * Math.sin(phase * 2 * Math.PI);
		int alpha = (int) Math.max(60, Math.min(255, base.getAlpha() * k));
		return new Color(base.getRed(), base.getGreen(), base.getBlue(), alpha);
	}
}
