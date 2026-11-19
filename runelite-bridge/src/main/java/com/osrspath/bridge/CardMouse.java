package com.osrspath.bridge;

import java.awt.Point;
import java.awt.Rectangle;
import java.awt.event.MouseEvent;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;
import javax.swing.SwingUtilities;
import net.runelite.api.Client;
import net.runelite.client.input.MouseAdapter;

/**
 * Clicks on the small cards (CardFold): a left click on a card's title folds or opens it, and Alt+drag moves the shop
 * window card, which places itself beside the window so RuneLite cannot move it. RuneLite moves the other cards with
 * Alt+drag itself, so an Alt press anywhere else is left to it. A taken press, its release and its click never reach the game.
 */
class CardMouse extends MouseAdapter
{
	private final Client client;
	/** Each card's title area by its CardFold name; null while the card is not drawn. */
	private final Map<String, Supplier<Rectangle>> titles;
	private final OsrsPathShopOverlay shop;
	private final Consumer<String> fold;
	private final Consumer<Point> moved;
	private boolean ours;
	private Point dragFrom;
	private Point offsetFrom;

	CardMouse(Client client, Map<String, Supplier<Rectangle>> titles, OsrsPathShopOverlay shop, Consumer<String> fold, Consumer<Point> moved)
	{
		this.client = client;
		this.titles = titles;
		this.shop = shop;
		this.fold = fold;
		this.moved = moved;
	}

	@Override
	public MouseEvent mousePressed(MouseEvent e)
	{
		ours = false;
		if (!SwingUtilities.isLeftMouseButton(e) || client.isMenuOpen())
		{
			return e;
		}
		if (e.isAltDown())
		{
			Rectangle card = shop.drawn();
			if (card != null && card.contains(e.getPoint()))
			{
				dragFrom = e.getPoint();
				offsetFrom = shop.offset();
				ours = true;
				e.consume();
			}
			return e;
		}
		for (Map.Entry<String, Supplier<Rectangle>> t : titles.entrySet())
		{
			Rectangle area = t.getValue().get();
			if (area != null && area.contains(e.getPoint()))
			{
				ours = true;
				fold.accept(t.getKey());
				e.consume();
				return e;
			}
		}
		return e;
	}

	@Override
	public MouseEvent mouseDragged(MouseEvent e)
	{
		if (dragFrom != null)
		{
			shop.setOffset(new Point(offsetFrom.x + e.getX() - dragFrom.x, offsetFrom.y + e.getY() - dragFrom.y));
			e.consume();
		}
		return e;
	}

	@Override
	public MouseEvent mouseReleased(MouseEvent e)
	{
		if (dragFrom != null)
		{
			moved.accept(shop.offset());
			dragFrom = null;
		}
		if (ours)
		{
			e.consume();
		}
		return e;
	}

	@Override
	public MouseEvent mouseClicked(MouseEvent e)
	{
		if (ours)
		{
			ours = false;
			e.consume();
		}
		return e;
	}
}
