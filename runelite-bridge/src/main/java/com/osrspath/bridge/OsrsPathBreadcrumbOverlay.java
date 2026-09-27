package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.Polygon;
import java.util.List;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.Perspective;
import net.runelite.api.Point;
import net.runelite.api.WorldView;
import net.runelite.api.coords.LocalPoint;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.OverlayUtil;

/**
 * Путевые точки шага на земле, когда Shortest Path не ведёт к цели сам (не установлен или выключен).
 * Текущая точка — яркая, с подписью «2/5 Мост»; следующие — всё бледнее. Рисуются только точки
 * в загруженной области; засчитывает их плагин раз за тик, путь каждый кадр не считается.
 */
class OsrsPathBreadcrumbOverlay extends Overlay
{
	/** Сколько точек впереди показывать. */
	static final int AHEAD = 6;
	private static final BasicStroke CURRENT = new BasicStroke(3f);
	private static final BasicStroke NEXT = new BasicStroke(1.5f);

	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;

	@Inject
	OsrsPathBreadcrumbOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.DYNAMIC);
		setLayer(OverlayLayer.ABOVE_SCENE);
		setPriority(PRIORITY_MED);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		Navigation.Breadcrumbs route = plugin.getBreadcrumbs();
		if (!config.showBreadcrumbs() || route == null || route.finished() || plugin.isShortestPathLeading())
		{
			return null;
		}
		WorldView wv = client.getTopLevelWorldView();
		if (wv == null)
		{
			return null;
		}
		// Подпись точки — одним шрифтом с кириллицей, как и плашки ({@link OverlayText}).
		g.setFont(OverlayText.font(g.getFont(), 1f));
		Color base = config.highlightColor();
		List<ActiveTarget.WorldPointDto> points = route.points();
		int last = Math.min(points.size(), route.index() + AHEAD);
		// С дальних к текущей: текущая рисуется последней, поверх остальных.
		for (int i = last - 1; i >= route.index(); i--)
		{
			ActiveTarget.WorldPointDto p = points.get(i);
			if (p.getPlane() != wv.getPlane())
			{
				continue;
			}
			LocalPoint lp = LocalPoint.fromWorld(wv, p.getX(), p.getY());
			if (lp == null)
			{
				continue;
			}
			Polygon poly = Perspective.getCanvasTilePoly(client, lp);
			if (poly == null)
			{
				continue;
			}
			boolean current = i == route.index();
			int step = i - route.index();
			int alpha = current ? 230 : Math.max(60, 180 - step * 30);
			Color edge = new Color(base.getRed(), base.getGreen(), base.getBlue(), alpha);
			Color fill = new Color(base.getRed(), base.getGreen(), base.getBlue(), current ? 70 : 25);
			OverlayUtil.renderPolygon(g, poly, edge, fill, current ? CURRENT : NEXT);
			if (current)
			{
				String label = (i + 1) + "/" + points.size() + (p.getLabel() != null ? " " + p.getLabel() : "");
				Point at = Perspective.getCanvasTextLocation(client, g, lp, label, 0);
				if (at != null)
				{
					OverlayUtil.renderTextLocation(g, at, label, edge);
				}
			}
		}
		return null;
	}
}
