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
 * Клики по списку «Что нужно» на экране игры. Левый клик по строке с местом — стрелка и путь туда (действие
 * уходит в поток клиента), по заголовку — свернуть или развернуть. Клик по списку в игру не попадает — как у карты
 * подземелий RuneLite (InstanceMapInputListener): персонаж не идёт туда, что под плашкой. Это кнопка окна
 * RuneLite, в игру ничего не отправляется.
 *
 * Клик уходит игре, если: не левая кнопка; зажат Alt (RuneLite двигает плашки); открыто меню игры (выбирают его
 * пункт); выбрано заклинание или «Use»; над списком окно игры (банк, магазин) и у точки есть его действие —
 * список рисуется под окнами игры, и кнопки банка важнее невидимых строк под ним.
 */
class GuideMouse extends MouseAdapter
{
	private final Client client;
	private final OsrsPathGuideOverlay overlay;
	private final Consumer<GuideList.Action> act;
	/** Нажатие забрал список — отпускание и щелчок тоже его. */
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
	 * Над списком открыта карта мира: её метки и кнопки дают пункты меню без виджета (RuneLite «Focus on»),
	 * поэтому windowUnderMouse её не видит. Клик — карте, а не невидимой строке под ней.
	 */
	static boolean mapCovers(Widget map, java.awt.Point p)
	{
		return InventoryCheckOverlay.visible(map) && map.getBounds() != null && map.getBounds().contains(p);
	}

	/** Пункт меню игры над списком (латиницей — шрифт игры без кириллицы). */
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
			default:
				return "List";
		}
	}

	/**
	 * Под мышью окно игры с действием: верхний пункт меню (его выполнит левый клик) — от виджета, например
	 * «Withdraw-1» в банке. Над миром верхний пункт — «Walk here» или действие с NPC и объектом, без виджета.
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
