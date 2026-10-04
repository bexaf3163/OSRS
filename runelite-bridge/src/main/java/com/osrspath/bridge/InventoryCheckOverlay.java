package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPanel;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;
import net.runelite.client.ui.overlay.components.PanelComponent;

/**
 * Проверка вылета при открытом банке: «✓ Rope 1/1», «✗ Cooked chicken 2/5 · +3 HP», «нет в банке».
 * Подсчёт — в плагине по событиям ItemContainerChanged; здесь только показ. Нужное подсвечивает в банке
 * OsrsPathItemOverlay. Предметы не перекладываются — это делает игрок.
 */
class InventoryCheckOverlay extends OverlayPanel
{
	private static final int MAX_ROWS = 14;
	private static final Color MISSING = new Color(255, 95, 95);
	private static final Color MUTED = new Color(170, 170, 170);

	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private Object builtFor;
	private Dimension last = new Dimension();

	@Inject
	InventoryCheckOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		super(plugin);
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		// Над окнами игры, иначе окно банка закроет панель. Внизу справа — над сумкой, кнопки банка свободны.
		setPosition(OverlayPosition.BOTTOM_RIGHT);
		setLayer(OverlayLayer.ABOVE_WIDGETS);
		setPriority(PRIORITY_HIGH);
		setClearChildren(false);
		setMovable(true);
	}

	static boolean visible(Widget w)
	{
		return w != null && !w.isHidden();
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		Checklist.Result r = plugin.getChecklist();
		ActiveTarget target = plugin.getTarget();
		if (plugin.isShopShown() || !config.showChecklist() || target == null || r.getRows().isEmpty()
			|| !visible(client.getWidget(InterfaceID.Bankmain.ITEMS_CONTAINER)))
		{
			return null;
		}
		boolean large = config.hudLarge();
		Font font = OverlayText.font(g.getFont(), large ? OsrsPathHudOverlay.LARGE : 1f);
		g.setFont(font);
		int width = OsrsPathHudOverlay.panelWidth(this, standardWidth(large));
		Object key = Arrays.asList(r, target.getStepId(), config.hudOpacity(), font, width);
		if (!Objects.equals(key, builtFor))
		{
			build(panelComponent, r, target.getStepId(), g.getFontMetrics(font), width, config.hudOpacity());
			builtFor = key;
		}
		OverlayCard.paint(g, last.width, last.height, accent(r), Math.max(config.hudOpacity(), 85));
		Dimension d = super.render(g);
		last = d == null ? new Dimension() : d;
		return d;
	}

	/** Доля собранного: готовых строк из всех. */
	static double progress(Checklist.Result r)
	{
		int total = r.getRows().size();
		if (total == 0)
		{
			return 0;
		}
		long ready = r.getRows().stream().filter(x -> x.getState() == Checklist.State.IN_BAG_READY).count();
		return (double) ready / total;
	}

	/** Готов — зелёный; чего-то нет и в банке — янтарный; иначе красный: нужно взять из банка. */
	static Color accent(Checklist.Result r)
	{
		if (r.isReady())
		{
			return OverlayCard.GREEN;
		}
		return r.getRows().stream().anyMatch(x -> x.getState() == Checklist.State.NOT_FOUND_IN_BANK) ? OverlayCard.AMBER : OverlayCard.RED;
	}

	static int standardWidth(boolean large)
	{
		return Math.round((OsrsPathHudOverlay.WIDTH + 20) * (large ? OsrsPathHudOverlay.LARGE : 1f));
	}

	/** Содержимое панели. Статическое — тест отрисовывает его настоящими шрифтами без клиента. */
	static void build(PanelComponent panel, Checklist.Result r, String stepId, FontMetrics fm, int width, int opacity)
	{
		int inner = OverlayText.inner(width);
		List<LayoutableRenderableEntity> c = panel.getChildren();
		c.clear();
		panel.setPreferredSize(new Dimension(width, 0));
		OverlayText.frame(panel, fm);
		OverlayText.title(c, "Проверка вылета · " + stepId, OsrsPathHudOverlay.TITLE, fm, inner);
		c.add(new OverlayCard.Bar(progress(r), accent(r)));
		int shown = 0;
		for (Checklist.Row row : r.getRows())
		{
			if (shown++ == MAX_ROWS)
			{
				OverlayText.line(c, "…и ещё " + (r.getRows().size() - MAX_ROWS), MUTED, fm, inner);
				break;
			}
			line(c, row, fm, inner);
		}
		String footer;
		Color color;
		if (r.isReady())
		{
			footer = "Готов к выходу (Ready to depart)";
			color = OsrsPathHudOverlay.GOOD;
		}
		else if (r.getRows().stream().anyMatch(x -> x.getState() == Checklist.State.NOT_FOUND_IN_BANK))
		{
			footer = "Не хватает и в банке — см. «где взять» в приложении";
			color = OsrsPathHudOverlay.WARN;
		}
		else
		{
			footer = "Возьми из банка подсвеченное";
			color = OsrsPathHudOverlay.WARN;
		}
		OverlayText.line(c, footer, color, fm, inner);
	}

	private static void line(List<LayoutableRenderableEntity> c, Checklist.Row row, FontMetrics fm, int inner)
	{
		String mark;
		Color color;
		String right = row.getHave() + "/" + row.getNeed();
		switch (row.getState())
		{
			case IN_BAG_READY:
				mark = "✓ ";
				color = OsrsPathHudOverlay.GOOD;
				break;
			case NOT_FOUND_IN_BANK:
				mark = "✗ ";
				color = OsrsPathHudOverlay.WARN;
				right += row.getInBank() > 0 ? " · в банке " + row.getInBank() : " · нет в банке";
				break;
			default:
				mark = "✗ ";
				color = MISSING;
				if (row.getInBank() > 0)
				{
					right += " · в банке " + row.getInBank();
				}
		}
		String name = row.getName() + (row.getHeals() != null ? " · +" + row.getHeals() + " HP" : "");
		OverlayText.pair(c, mark + name, color, right, color, fm, inner);
	}
}
