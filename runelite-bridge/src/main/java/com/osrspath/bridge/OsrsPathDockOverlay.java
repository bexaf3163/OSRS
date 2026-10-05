package com.osrspath.bridge;

import java.awt.Dimension;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.Point;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;

/**
 * The docked bar ("Docked bar" setting): the HUD and the list summary in one row, top left (draggable with Alt, like the other plates). While it is on,
 * the HUD plate is not drawn and the "What you need" list opens under the bar only when the mouse is over the bar or the list, at the open bank, or for
 * a moment after the mouse left ({@link DockBar#expanded}). If the bar itself cannot be shown (no step, HUD off) the list is shown as usual, so it is never lost.
 */
class OsrsPathDockOverlay extends Overlay
{
	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private final OsrsPathGuideOverlay guide;
	/** When the mouse was last over the bar or the list; the nanoTime of that moment, or Long.MIN_VALUE if never. */
	private long lastHover = Long.MIN_VALUE;

	@Inject
	OsrsPathDockOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config, OsrsPathGuideOverlay guide)
	{
		super(plugin);
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		this.guide = guide;
		setPosition(OverlayPosition.TOP_LEFT);
		setLayer(OverlayLayer.UNDER_WIDGETS);
		// Above the list in the top-left stack.
		setPriority(PRIORITY_HIGH);
		setMovable(true);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		OsrsPathHudOverlay.State s = plugin.getHud();
		DockBar.Model m = config.dockBar() && config.showHud() ? DockBar.model(s, plugin.getGuideView()) : null;
		if (m == null)
		{
			plugin.dockShown(false, false);
			return null;
		}
		boolean large = config.hudLarge();
		Font font = OverlayText.font(g.getFont(), large ? OsrsPathHudOverlay.LARGE : 1f);
		g.setFont(font);
		int width = OsrsPathHudOverlay.panelWidth(this, Math.round(DockBar.WIDTH * (large ? OsrsPathHudOverlay.LARGE : 1f)));
		Dimension d = DockBar.paint(g, m, g.getFontMetrics(font), width, config.hudOpacity(), config.overlayTheme());

		// The mouse is read against the rectangles of the previous frame: the bar and the list.
		Point mouse = client.getMouseCanvasPosition();
		boolean overBar = mouse != null && contains(getBounds(), mouse);
		boolean overList = mouse != null && plugin.guideOnScreen() && contains(guide.getBounds(), mouse);
		long now = System.nanoTime();
		if (overBar || overList)
		{
			lastHover = now;
		}
		long since = lastHover == Long.MIN_VALUE ? -1 : now - lastHover;
		plugin.dockShown(true, DockBar.expanded(overBar, overList, plugin.overlayContext(), since));
		return d;
	}

	private static boolean contains(Rectangle r, Point p)
	{
		return r != null && r.width > 0 && r.contains(p.getX(), p.getY());
	}
}
