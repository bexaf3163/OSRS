package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.Polygon;
import java.util.Map;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.NPC;
import net.runelite.api.Perspective;
import net.runelite.api.Point;
import net.runelite.api.TileObject;
import net.runelite.api.WorldView;
import net.runelite.api.coords.LocalPoint;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.OverlayUtil;
import net.runelite.client.ui.overlay.outline.ModelOutlineRenderer;

/**
 * Highlighting in the 3D world: the outline of the step's NPCs and objects with a label, tiles from groundTiles and the step's point.
 * The plugin collects whom to highlight from spawn events; here is only the drawing of what has been found.
 */
class OsrsPathWorldOverlay extends Overlay
{
	private static final int OUTLINE_WIDTH = 2;
	private static final int OUTLINE_FEATHER = 4;
	private static final BasicStroke TILE_STROKE = new BasicStroke(2f);

	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private final ModelOutlineRenderer outline;

	@Inject
	OsrsPathWorldOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config, ModelOutlineRenderer outline)
	{
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		this.outline = outline;
		setPosition(OverlayPosition.DYNAMIC);
		setLayer(OverlayLayer.ABOVE_SCENE);
		setPriority(PRIORITY_MED);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		WorldView wv = client.getTopLevelWorldView();
		NavTarget nav = plugin.getNavTarget();
		g.setFont(OverlayText.font(g.getFont(), 1f));
		if (nav != null && wv != null)
		{
			renderNav(g, wv, nav);
		}
		ActiveTarget target = plugin.getTarget();
		if (target == null || wv == null)
		{
			return null;
		}
		Color color = config.highlightColor();

		for (NPC npc : plugin.getNpcs())
		{
			outline.drawOutline(npc, OUTLINE_WIDTH, color, OUTLINE_FEATHER);
			String name = npc.getName();
			if (name != null)
			{
				Point p = npc.getCanvasTextLocation(g, name, npc.getLogicalHeight() + 40);
				if (p != null)
				{
					OverlayUtil.renderTextLocation(g, p, name, color);
				}
			}
		}

		for (Map.Entry<TileObject, String> e : plugin.getObjects().entrySet())
		{
			TileObject o = e.getKey();
			if (o.getPlane() != wv.getPlane())
			{
				continue;
			}
			outline.drawOutline(o, OUTLINE_WIDTH, color, OUTLINE_FEATHER);
			Point p = o.getCanvasTextLocation(g, e.getValue(), 60);
			if (p != null && !e.getValue().isEmpty())
			{
				OverlayUtil.renderTextLocation(g, p, e.getValue(), color);
			}
		}

		if (target.getGroundTiles() != null)
		{
			for (ActiveTarget.GroundTile t : target.getGroundTiles())
			{
				drawTile(g, wv, t.getX(), t.getY(), t.getPlane(), t.getLabel(), parseColor(t.getColor(), color));
			}
		}
		ActiveTarget.WorldPointDto wp = target.getWorldPoint();
		if (wp != null)
		{
			drawTile(g, wv, wp.getX(), wp.getY(), wp.getPlane(), wp.getLabel(), color);
		}
		return null;
	}

	/**
	 * A temporary target: a golden outline of the seller with the label "[Buy: Steel axe]" (or its name) and the place's tile.
	 * If the seller is not nearby, the tile, the arrow and the HUD remain.
	 */
	private void renderNav(Graphics2D g, WorldView wv, NavTarget nav)
	{
		Color gold = OsrsPathHudOverlay.TITLE;
		String buy = nav.isPurchase() && config.upgradeRouter()
			? "[Buy: " + (nav.getItemName() != null ? nav.getItemName() : nav.getLabel()) + "]"
			: null;
		for (NPC npc : plugin.getNavNpcs())
		{
			outline.drawOutline(npc, OUTLINE_WIDTH + 1, gold, OUTLINE_FEATHER);
			String text = buy != null ? buy : npc.getName();
			if (text != null)
			{
				Point p = npc.getCanvasTextLocation(g, text, npc.getLogicalHeight() + 40);
				if (p != null)
				{
					OverlayUtil.renderTextLocation(g, p, text, gold);
				}
			}
		}
		drawTile(g, wv, nav.getX(), nav.getY(), nav.getPlane(), plugin.getNavNpcs().isEmpty() ? nav.getLabel() : null, gold);
	}

	/** A world tile: an outline and a label. Outside the loaded area or on another plane, nothing. */
	private void drawTile(Graphics2D g, WorldView wv, int x, int y, int plane, String label, Color color)
	{
		if (plane != wv.getPlane())
		{
			return;
		}
		LocalPoint lp = LocalPoint.fromWorld(wv, x, y);
		if (lp == null)
		{
			return;
		}
		Polygon poly = Perspective.getCanvasTilePoly(client, lp);
		if (poly == null)
		{
			return;
		}
		Color fill = new Color(color.getRed(), color.getGreen(), color.getBlue(), 40);
		OverlayUtil.renderPolygon(g, poly, color, fill, TILE_STROKE);
		if (label != null && !label.isEmpty())
		{
			Point p = Perspective.getCanvasTextLocation(client, g, lp, label, 0);
			if (p != null)
			{
				OverlayUtil.renderTextLocation(g, p, label, color);
			}
		}
	}

	/** The tile colour from the step (#rrggbb); without it or on error, the common highlight colour. */
	static Color parseColor(String hex, Color fallback)
	{
		if (hex == null || !hex.matches("#[0-9a-fA-F]{6}"))
		{
			return fallback;
		}
		return new Color(Integer.parseInt(hex.substring(1), 16));
	}
}
