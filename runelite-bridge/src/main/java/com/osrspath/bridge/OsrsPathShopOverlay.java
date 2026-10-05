package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.util.ArrayList;
import java.util.List;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;

/**
 * A separate window next to the bank, exchange and merchant windows: what to take, what to buy and where it is sold. The list is built by
 * {@link ShopWindow}; here: which game window is open, where to put the card (beside the game window, not over it) and
 * the drawing.
 */
class OsrsPathShopOverlay extends Overlay
{
	static final int WIDTH = 300;
	private static final int PAD = 7;
	private static final int GAP = 8;
	private static final int MAX_LINES = 26;

	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;

	@Inject
	OsrsPathShopOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		// We compute the position ourselves from the game window: it differs for the bank and the merchant.
		setPosition(OverlayPosition.DYNAMIC);
		setLayer(OverlayLayer.ABOVE_WIDGETS);
		setPriority(PRIORITY_HIGH);
	}

	/** Which game window is open and its frame; null means no bank, exchange or merchant. */
	private Open open()
	{
		Widget bank = client.getWidget(InterfaceID.Bankmain.ITEMS_CONTAINER);
		if (InventoryCheckOverlay.visible(bank))
		{
			return new Open(ShopWindow.Place.BANK, client.getWidget(InterfaceID.Bankmain.UNIVERSE));
		}
		Widget ge = client.getWidget(InterfaceID.GeOffers.UNIVERSE);
		if (InventoryCheckOverlay.visible(ge))
		{
			return new Open(ShopWindow.Place.EXCHANGE, ge);
		}
		Widget shop = client.getWidget(InterfaceID.Shopmain.UNIVERSE);
		if (InventoryCheckOverlay.visible(shop))
		{
			return new Open(ShopWindow.Place.SHOP, shop);
		}
		return null;
	}

	private static final class Open
	{
		final ShopWindow.Place place;
		final Widget frame;

		Open(ShopWindow.Place place, Widget frame)
		{
			this.place = place;
			this.frame = frame;
		}
	}

	/** The window lines the player sees now; null means the window is not shown. The plugin needs it too: we hide the old departure check then. */
	ShopWindow.Result current()
	{
		if (!config.showShopWindow())
		{
			return null;
		}
		Open o = open();
		return o == null ? null : ShopWindow.build(o.place, plugin.getGuideView());
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		Open o = config.showShopWindow() ? open() : null;
		ShopWindow.Result r = o == null ? null : ShopWindow.build(o.place, plugin.getGuideView());
		if (r == null)
		{
			plugin.shopWindowShown(false);
			return null;
		}
		plugin.shopWindowShown(true);
		plugin.uiShown("shop", ShopWindow.plain(r));
		Rectangle frame = o.frame != null && !o.frame.isHidden() ? o.frame.getBounds() : null;
		Dimension size = paint(g, r, WIDTH, config.hudLarge() ? OsrsPathHudOverlay.LARGE : 1f, config.hudOpacity(), place(frame, client.getCanvasWidth(), client.getCanvasHeight(), r, g), config.overlayTheme());
		return size;
	}

	/** The card's top-left corner: to the left of the game window if there is room, otherwise to the right, otherwise in the screen corner. */
	static java.awt.Point place(Rectangle frame, int canvasW, int canvasH, ShopWindow.Result r, Graphics2D g)
	{
		if (frame == null)
		{
			return new java.awt.Point(GAP, GAP);
		}
		int y = Math.max(GAP, Math.min(frame.y, canvasH - 120));
		if (frame.x - WIDTH - GAP >= 0)
		{
			return new java.awt.Point(frame.x - WIDTH - GAP, y);
		}
		if (frame.x + frame.width + GAP + WIDTH <= canvasW)
		{
			return new java.awt.Point(frame.x + frame.width + GAP, y);
		}
		return new java.awt.Point(GAP, GAP);
	}

	/** Drawing apart from the client: a test draws with the real fonts and takes a picture. Returns the card size. */
	static Dimension paint(Graphics2D g, ShopWindow.Result r, int width, float scale, int opacity, java.awt.Point at)
	{
		return paint(g, r, width, scale, opacity, at, OsrsPathBridgeConfig.OverlayTheme.CLASSIC);
	}

	static Dimension paint(Graphics2D g, ShopWindow.Result r, int width, float scale, int opacity, java.awt.Point at, OsrsPathBridgeConfig.OverlayTheme theme)
	{
		Font font = OverlayText.font(g.getFont(), scale);
		g.setFont(font);
		FontMetrics fm = g.getFontMetrics(font);
		int inner = width - 2 * PAD;
		List<String> lines = new ArrayList<>();
		List<Color> colors = new ArrayList<>();
		for (String l : OverlayText.wrap(r.getTitle(), fm, inner))
		{
			lines.add(l);
			colors.add(OsrsPathHudOverlay.TITLE);
		}
		for (ShopWindow.Row row : r.getRows())
		{
			String text = glyph(row.getMark()) + row.getText();
			boolean first = true;
			for (String l : OverlayText.wrap(text, fm, inner))
			{
				if (lines.size() >= MAX_LINES)
				{
					break;
				}
				lines.add(first ? l : "  " + l);
				colors.add(color(row.getMark()));
				first = false;
			}
		}
		int h = lines.size() * fm.getHeight() + 2 * PAD;
		Color accent = r.getRows().stream().anyMatch(x -> x.getMark() == ShopWindow.Mark.BAD) ? OverlayCard.RED
			: r.getTodo() > 0 ? OverlayCard.GOLD : OverlayCard.GREEN;
		g.translate(at.x, at.y);
		OverlayCard.paint(g, width, h, accent, Math.max(opacity, 85), theme);
		int y = PAD + fm.getAscent();
		for (int i = 0; i < lines.size(); i++)
		{
			g.setColor(Color.BLACK);
			g.drawString(lines.get(i), PAD + 1, y + 1);
			g.setColor(colors.get(i));
			g.drawString(lines.get(i), PAD, y);
			y += fm.getHeight();
		}
		g.translate(-at.x, -at.y);
		return new Dimension(width, h);
	}

	private static String glyph(ShopWindow.Mark m)
	{
		switch (m)
		{
			case TODO:
				return "▶ ";
			case BAD:
				return "✗ ";
			case GOOD:
				return "";
			default:
				return "";
		}
	}

	private static Color color(ShopWindow.Mark m)
	{
		switch (m)
		{
			case TODO:
				return OsrsPathHudOverlay.TEXT;
			case BAD:
				return OverlayCard.RED;
			case GOOD:
				return OsrsPathHudOverlay.GOOD;
			default:
				return new Color(170, 170, 170);
		}
	}
}
