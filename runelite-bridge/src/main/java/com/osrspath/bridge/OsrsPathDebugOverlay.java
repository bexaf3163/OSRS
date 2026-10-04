package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.util.ArrayList;
import java.util.List;
import javax.inject.Inject;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;

/**
 * The developer badge: the engine status in green and red over the game screen. Hidden until you turn it on
 * (by default Ctrl+Shift+D, the "Developer" setting). {@link DebugView} lays out the lines; here is only the drawing:
 * a dark backing, coloured text, wrapping to the width.
 */
class OsrsPathDebugOverlay extends Overlay
{
	static final int WIDTH = 560;
	private static final Color BACKGROUND = new Color(0, 0, 0, 190);
	private static final int PAD = 6;

	private final OsrsPathBridgePlugin plugin;

	@Inject
	OsrsPathDebugOverlay(OsrsPathBridgePlugin plugin)
	{
		this.plugin = plugin;
		setPosition(OverlayPosition.TOP_CENTER);
		setLayer(OverlayLayer.ABOVE_WIDGETS);
		setPriority(PRIORITY_HIGH);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		DebugView.State s = plugin.getDebugState();
		if (!plugin.isDebugVisible() || s == null)
		{
			return null;
		}
		return paint(g, s);
	}

	/** Drawing apart from the plugin: so the badge can be tested and rendered into a picture without RuneLite. */
	static Dimension paint(Graphics2D g, DebugView.State s)
	{
		Font font = OverlayText.font(g.getFont(), 0.9f);
		g.setFont(font);
		FontMetrics fm = g.getFontMetrics(font);
		List<String> lines = new ArrayList<>();
		List<Color> colors = new ArrayList<>();
		for (DebugView.Row r : DebugView.rows(s))
		{
			for (String l : OverlayText.wrap(r.getText(), fm, WIDTH - 2 * PAD))
			{
				lines.add(l);
				colors.add(r.getLevel().color);
			}
		}
		int h = lines.size() * fm.getHeight() + 2 * PAD;
		g.setColor(BACKGROUND);
		g.fillRoundRect(0, 0, WIDTH, h, 8, 8);
		int y = PAD + fm.getAscent();
		for (int i = 0; i < lines.size(); i++)
		{
			g.setColor(Color.BLACK);
			g.drawString(lines.get(i), PAD + 1, y + 1);
			g.setColor(colors.get(i));
			g.drawString(lines.get(i), PAD, y);
			y += fm.getHeight();
		}
		return new Dimension(WIDTH, h);
	}
}
