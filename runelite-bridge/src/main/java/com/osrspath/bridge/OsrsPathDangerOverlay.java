package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.Polygon;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.NPC;
import net.runelite.api.Perspective;
import net.runelite.api.WorldView;
import net.runelite.api.coords.LocalPoint;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.OverlayUtil;
import net.runelite.client.ui.overlay.outline.ModelOutlineRenderer;

/**
 * The danger radar in the 3D world: a red zone border while the player is closer than 20 tiles to its centre,
 * and a red outline on dangerous NPCs while they are in the warning zone. Inside the zone the border is denser.
 *
 * Only drawing is here: the plugin chooses the zone once per tick when the tile changes, and collects the dangerous NPCs
 * only in the warning zone. The border tiles are computed once when the zones load.
 */
class OsrsPathDangerOverlay extends Overlay
{
	static final Color DANGER = new Color(235, 45, 45);
	private static final Color EDGE_FAR = new Color(235, 45, 45, 120);
	private static final Color FILL_FAR = new Color(235, 45, 45, 25);
	private static final Color FILL_NEAR = new Color(235, 45, 45, 60);
	private static final BasicStroke STROKE = new BasicStroke(1.5f);

	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private final ModelOutlineRenderer outline;

	@Inject
	OsrsPathDangerOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config, ModelOutlineRenderer outline)
	{
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		this.outline = outline;
		setPosition(OverlayPosition.DYNAMIC);
		setLayer(OverlayLayer.ABOVE_SCENE);
		setPriority(PRIORITY_LOW);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		DangerRadar.Reading r = plugin.getDanger();
		if (!config.dangerRadar() || r.getZone() == null)
		{
			return null;
		}
		DangerRadar.Zone zone = r.getZone();
		WorldView wv = client.getTopLevelWorldView();
		if (wv == null || wv.getPlane() != zone.getCenter().getPlane())
		{
			return null;
		}
		boolean close = r.getLevel() == DangerRadar.Level.WARNING || r.getLevel() == DangerRadar.Level.INSIDE;
		// Smart reveal: a pale border far away is noise; we draw the zone only when it is near or the player is already in it.
		if (config.smartOverlays() && !close)
		{
			return null;
		}
		Color edge = close ? OsrsPathWidgetOverlay.pulse(DANGER) : EDGE_FAR;
		Color fill = r.getLevel() == DangerRadar.Level.INSIDE ? FILL_NEAR : FILL_FAR;
		for (int[] t : zone.getBoundary())
		{
			LocalPoint lp = LocalPoint.fromWorld(wv, t[0], t[1]);
			if (lp == null)
			{
				continue;
			}
			Polygon poly = Perspective.getCanvasTilePoly(client, lp);
			if (poly != null)
			{
				OverlayUtil.renderPolygon(g, poly, edge, fill, STROKE);
			}
		}
		for (NPC npc : plugin.getDangerNpcs())
		{
			outline.drawOutline(npc, 3, DANGER, 4);
		}
		return null;
	}
}
