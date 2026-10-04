package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Polygon;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.Player;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;

/**
 * The big arrow to the current target: top centre of the screen, over the scene but under the game windows, so it does not cover
 * the minimap, chat and bag and does not get in the way of clicks. It turns with the camera, like the minimap; near the target
 * it turns into "✓ Nearby", with no target it is not drawn. The label is the same distance as in the micro HUD.
 * Draggable with the mouse while holding Alt, the size is in the settings.
 */
class OsrsPathArrowOverlay extends Overlay
{
	static final Color FAR = new Color(120, 210, 255);
	static final Color CLOSE = new Color(255, 210, 90);
	static final Color NEAR = new Color(90, 220, 120);
	static final Color OTHER = new Color(255, 170, 60);
	private static final Color OUTLINE = new Color(20, 20, 20, 220);
	private static final int PAD = 6;
	private static final int TEXT_GAP = 3;

	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	/** The angle drawn in the previous frame; NaN means there was no arrow. */
	private double angle = Double.NaN;

	@Inject
	OsrsPathArrowOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		super(plugin);
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.TOP_CENTER);
		setLayer(OverlayLayer.UNDER_WIDGETS);
		setPriority(PRIORITY_HIGH);
		setMovable(true);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		WorldPoint target = config.bigArrow() ? plugin.arrowTarget() : null;
		Player me = client.getLocalPlayer();
		// The world map is open: the arrow is drawn over the windows and would lie on the map, where the target is shown by the marker.
		if (target == null || me == null || InventoryCheckOverlay.visible(client.getWidget(net.runelite.api.gameval.InterfaceID.Worldmap.WINDOW)))
		{
			angle = Double.NaN;
			return null;
		}
		WorldPoint pos = me.getWorldLocation();
		boolean underTarget = Navigation.underground(target.getY());
		boolean underMe = Navigation.underground(pos.getY());
		int layer = underTarget == underMe ? Integer.compare(target.getPlane(), pos.getPlane()) : (underTarget ? -2 : 2);
		int dx = target.getX() - pos.getX();
		int dy = target.getY() - pos.getY();
		ArrowGeometry.State state = ArrowGeometry.state(Navigation.distance(pos.getX(), pos.getY(), target.getX(), target.getY()),
			layer == 0, plugin.isNavNear());
		angle = ArrowGeometry.smooth(angle, ArrowGeometry.screenAngle(dx, dy, client.getCameraYawTarget()));
		OsrsPathHudOverlay.State hud = plugin.getHud();
		String text = hud != null ? label(hud.getDistance()) : null;
		Font font = OverlayText.font(g.getFont(), config.hudLarge() ? OsrsPathHudOverlay.LARGE : 1f);
		return draw(g, font, state, angle, layer, text, config.arrowSize().diameter);
	}

	/**
	 * Draws the arrow and the label from (0, 0) and returns the size used. Static: a test draws it into an image
	 * with the real fonts and checks that everything is inside the frame. layer: 0 is the same level; +-1 is a floor up/down;
	 * +-2 is surface / underground (then instead of an arrow a chevron up or down: the direction on the map
	 * between the surface and a dungeon means nothing).
	 */
	static Dimension draw(Graphics2D g, Font font, ArrowGeometry.State state, double angle, int layer, String text, int diameter)
	{
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setFont(font);
		FontMetrics fm = g.getFontMetrics(font);
		String label = state == ArrowGeometry.State.VERY_CLOSE ? "Nearby" : text;
		int textW = label == null ? 0 : fm.stringWidth(label);
		int width = Math.max(diameter, textW) + 2 * PAD;
		int height = diameter + 2 * PAD + (label == null ? 0 : TEXT_GAP + fm.getHeight());

		// No plate: an arrow with a dark outline and a label with a stroke are visible on grass, snow and in the dark alike.

		double cx = width / 2.0;
		double cy = PAD + diameter / 2.0;
		double r = diameter / 2.0;
		Color color = colorOf(state);
		if (state == ArrowGeometry.State.VERY_CLOSE)
		{
			g.setColor(color);
			g.fillOval((int) Math.round(cx - r * 0.8), (int) Math.round(cy - r * 0.8), (int) Math.round(r * 1.6), (int) Math.round(r * 1.6));
			g.setColor(OUTLINE);
			g.setStroke(new BasicStroke((float) Math.max(3, r * 0.16), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
			Path2D tick = new Path2D.Double();
			tick.moveTo(cx - r * 0.38, cy + r * 0.02);
			tick.lineTo(cx - r * 0.08, cy + r * 0.32);
			tick.lineTo(cx + r * 0.42, cy - r * 0.3);
			g.draw(tick);
		}
		else
		{
			// A chevron up/down between the surface and a dungeon; otherwise an arrow by direction.
			double a = Math.abs(layer) == 2 ? (layer > 0 ? -Math.PI / 2 : Math.PI / 2) : angle;
			double scale = state == ArrowGeometry.State.APPROACHING ? 1.0 : 0.92;
			Polygon p = ArrowGeometry.arrow(cx, cy, r * scale, a);
			g.setColor(color);
			g.fillPolygon(p);
			g.setColor(OUTLINE);
			g.setStroke(new BasicStroke(state == ArrowGeometry.State.APPROACHING ? 3f : 2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
			g.drawPolygon(p);
		}

		if (label != null)
		{
			int baseline = PAD + diameter + TEXT_GAP + fm.getAscent();
			int x = (int) Math.round(cx - textW / 2.0);
			// A stroke on four sides and a shadow: without a plate the label must be readable on any background.
			g.setColor(new Color(0, 0, 0, 230));
			for (int[] d : new int[][]{{-1, 0}, {1, 0}, {0, -1}, {0, 1}, {1, 1}})
			{
				g.drawString(label, x + d[0], baseline + d[1]);
			}
			g.setColor(state == ArrowGeometry.State.VERY_CLOSE ? NEAR : Color.WHITE);
			g.drawString(label, x, baseline);
		}
		return new Dimension(width, height);
	}

	/**
	 * The label under the arrow is the distance from the HUD without the compass-direction icon: "↑" in the HUD means "north", and
	 * the arrow next to it is turned by the camera, and two different "ups" would confuse. "~62 tiles ↑, a floor up" ->
	 * "~62 tiles, a floor up".
	 */
	static String label(String distance)
	{
		if (distance == null)
		{
			return null;
		}
		return distance.replaceAll(" ?[→↗↑↖←↙↓↘]", "").trim();
	}

	static Color colorOf(ArrowGeometry.State state)
	{
		switch (state)
		{
			case APPROACHING:
				return CLOSE;
			case VERY_CLOSE:
				return NEAR;
			case OTHER_LEVEL:
				return OTHER;
			default:
				return FAR;
		}
	}
}
