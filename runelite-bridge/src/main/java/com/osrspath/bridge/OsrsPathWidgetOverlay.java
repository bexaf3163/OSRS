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
 * Нужный вариант в меню диалога: рамка вокруг строки и стрелка ▶ слева.
 * Меню вариантов — компонент InterfaceID.Chatmenu.OPTIONS (219:1) из gameval RuneLite 1.12.39;
 * варианты — его динамические дочерние виджеты с текстом.
 */
class OsrsPathWidgetOverlay extends Overlay
{
	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;

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
			// Стрелка рисуется фигурой: в шрифтах игры знака ▶ нет.
			int cy = b.y + b.height / 2;
			Polygon arrow = new Polygon(new int[]{b.x - 16, b.x - 16, b.x - 7}, new int[]{cy - 6, cy + 6, cy}, 3);
			g.fillPolygon(arrow);
		}
		return null;
	}

	/** Мягкая пульсация прозрачности — заметно, но не мигает. */
	static Color pulse(Color base)
	{
		double phase = (System.currentTimeMillis() % 1200) / 1200.0;
		double k = 0.65 + 0.35 * Math.sin(phase * 2 * Math.PI);
		int alpha = (int) Math.max(60, Math.min(255, base.getAlpha() * k));
		return new Color(base.getRed(), base.getGreen(), base.getBlue(), alpha);
	}
}
