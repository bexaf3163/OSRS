package com.osrspath.bridge;

import java.awt.event.MouseEvent;
import java.util.function.Consumer;
import javax.swing.SwingUtilities;
import net.runelite.api.Client;
import net.runelite.api.MenuEntry;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.input.MouseAdapter;

/**
 * Clicks on the "What you need" list on the game screen. A left click on a line with a place gives the arrow and path there (the action
 * goes to the client thread), a click on the heading collapses or expands. A click on the list does not reach the game, like the RuneLite
 * dungeon map (InstanceMapInputListener): the character does not walk to whatever is under the plate. It is a RuneLite
 * window button, nothing is sent into the game.
 *
 * The click goes to the game if: not the left button; Alt is held (RuneLite moves the plates); the game menu is open (its entry is being
 * chosen); a spell or "Use" is selected; a game window is over the list (bank, shop) and the point has its action:
 * the list is drawn under the game windows, and the bank buttons matter more than invisible lines under them.
 */
class GuideMouse extends MouseAdapter
{
	private final Client client;
	private final OsrsPathGuideOverlay overlay;
	private final Consumer<GuideList.Action> act;
	/** The press was taken by the list: the release and the click are its too. */
	private boolean ours;

	GuideMouse(Client client, OsrsPathGuideOverlay overlay, Consumer<GuideList.Action> act)
	{
		this.client = client;
		this.overlay = overlay;
		this.act = act;
	}

	@Override
	public MouseEvent mousePressed(MouseEvent e)
	{
		ours = false;
		if (!SwingUtilities.isLeftMouseButton(e) || e.isAltDown() || client.isMenuOpen() || client.isWidgetSelected())
		{
			return e;
		}
		GuideList.Action a = overlay.actionAt(e.getPoint());
		if (a == null || windowUnderMouse(client.getMenu().getMenuEntries()) || mapCovers(client.getWidget(InterfaceID.Worldmap.WINDOW), e.getPoint()))
		{
			return e;
		}
		ours = true;
		e.consume();
		if (a.isClickable())
		{
			act.accept(a);
		}
		return e;
	}

	@Override
	public MouseEvent mouseReleased(MouseEvent e)
	{
		if (ours && SwingUtilities.isLeftMouseButton(e))
		{
			e.consume();
		}
		return e;
	}

	@Override
	public MouseEvent mouseClicked(MouseEvent e)
	{
		if (ours && SwingUtilities.isLeftMouseButton(e))
		{
			e.consume();
		}
		return e;
	}

	/**
	 * The world map is open over the list: its markers and buttons give menu entries without a widget (RuneLite "Focus on"),
	 * so windowUnderMouse does not see it. The click goes to the map, not to an invisible line under it.
	 */
	static boolean mapCovers(Widget map, java.awt.Point p)
	{
		return InventoryCheckOverlay.visible(map) && map.getBounds() != null && map.getBounds().contains(p);
	}

	/** A game menu entry over the list. */
	static String menuOption(GuideList.Action a)
	{
		switch (a.getKind())
		{
			case PLACE:
				return "Arrow to";
			case BACK:
				return "Arrow back to step";
			case TOGGLE:
				return "Collapse / expand";
			case TAB:
				return "Steps / advice";
			case DETOUR:
				return "Arrow to the stop";
			case TRANSPORT:
				return "Show the way";
			default:
				return "List";
		}
	}

	/**
	 * A game window with an action under the mouse: the top menu entry (which a left click will run) is from a widget, for example
	 * "Withdraw-1" in the bank. Over the world the top entry is "Walk here" or an action on an NPC and object, without a widget.
	 */
	static boolean windowUnderMouse(MenuEntry[] entries)
	{
		if (entries == null || entries.length == 0)
		{
			return false;
		}
		MenuEntry top = entries[entries.length - 1];
		return top != null && top.getWidget() != null;
	}
}
