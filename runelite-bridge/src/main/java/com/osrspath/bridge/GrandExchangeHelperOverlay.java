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
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPanel;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;
import net.runelite.client.ui.overlay.components.PanelComponent;

/**
 * Подсказка на Grand Exchange: оптовый список из приложения, что уже есть, что в ордере и что
 * искать следующим.
 *
 * Текст в поиск биржи не подставляется: у RuneLite нет для этого публичного API, а запись в поле ввода
 * чата — это уже автоматизация ввода. Название копируется кнопкой «📋 Копировать название» в приложении.
 * Ордера не выставляются и не подтверждаются — только игроком.
 */
class GrandExchangeHelperOverlay extends OverlayPanel
{
	private static final int MAX_ROWS = 12;
	private static final Color NEXT = new Color(120, 210, 255);
	private static final Color MUTED = new Color(160, 160, 160);

	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private Object builtFor;
	private Dimension last = new Dimension();

	@Inject
	GrandExchangeHelperOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		super(plugin);
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.BOTTOM_RIGHT);
		setLayer(OverlayLayer.ABOVE_WIDGETS);
		setPriority(PRIORITY_HIGH);
		setClearChildren(false);
		setMovable(true);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		List<ShoppingPlan.Row> rows = plugin.getShopping();
		if (!config.showGeHelper() || rows.isEmpty() || !InventoryCheckOverlay.visible(client.getWidget(InterfaceID.GeOffers.UNIVERSE)))
		{
			return null;
		}
		boolean large = config.hudLarge();
		Font font = OverlayText.font(g.getFont(), large ? OsrsPathHudOverlay.LARGE : 1f);
		g.setFont(font);
		int width = OsrsPathHudOverlay.panelWidth(this, standardWidth(large));
		Object key = Arrays.asList(rows, config.hudOpacity(), font, width);
		if (!Objects.equals(key, builtFor))
		{
			build(panelComponent, rows, g.getFontMetrics(font), width, config.hudOpacity());
			builtFor = key;
		}
		OverlayCard.paint(g, last.width, last.height, accent(rows), Math.max(config.hudOpacity(), 85));
		Dimension d = super.render(g);
		last = d == null ? new Dimension() : d;
		return d;
	}

	/** Доля готового: строки «есть» из всех. */
	static double progress(List<ShoppingPlan.Row> rows)
	{
		if (rows.isEmpty())
		{
			return 0;
		}
		return (double) rows.stream().filter(r -> r.getState() == ShoppingPlan.RowState.HAVE).count() / rows.size();
	}

	static Color accent(List<ShoppingPlan.Row> rows)
	{
		return rows.stream().allMatch(r -> r.getState() == ShoppingPlan.RowState.HAVE) ? OverlayCard.GREEN : OverlayCard.GOLD;
	}

	static int standardWidth(boolean large)
	{
		return Math.round((OsrsPathHudOverlay.WIDTH + 30) * (large ? OsrsPathHudOverlay.LARGE : 1f));
	}

	/** Содержимое панели. Статическое — тест отрисовывает его настоящими шрифтами без клиента. */
	static void build(PanelComponent panel, List<ShoppingPlan.Row> rows, FontMetrics fm, int width, int opacity)
	{
		int inner = OverlayText.inner(width);
		List<LayoutableRenderableEntity> c = panel.getChildren();
		c.clear();
		panel.setPreferredSize(new Dimension(width, 0));
		OverlayText.frame(panel, fm);
		long left = rows.stream().filter(r -> r.getState() != ShoppingPlan.RowState.HAVE).count();
		OverlayText.title(c, left == 0 ? "Оптовый список: всё есть" : "Оптовый список · купить " + left,
			left == 0 ? OsrsPathHudOverlay.GOOD : OsrsPathHudOverlay.TITLE, fm, inner);
		c.add(new OverlayCard.Bar(progress(rows), left == 0 ? OverlayCard.GREEN : OverlayCard.GOLD));
		// Сначала то, что осталось купить: готовое уходит вниз.
		List<ShoppingPlan.Row> ordered = rows.stream()
			.sorted((a, b) -> Boolean.compare(a.getState() == ShoppingPlan.RowState.HAVE, b.getState() == ShoppingPlan.RowState.HAVE))
			.collect(java.util.stream.Collectors.toList());
		int shown = 0;
		for (ShoppingPlan.Row r : ordered)
		{
			if (shown++ == MAX_ROWS)
			{
				OverlayText.line(c, "…и ещё " + (rows.size() - MAX_ROWS), MUTED, fm, inner);
				break;
			}
			line(c, r, fm, inner);
		}
		OverlayText.line(c, "Название — кнопкой «Копировать» в OSRS Путь", MUTED, fm, inner);
	}

	private static void line(List<LayoutableRenderableEntity> c, ShoppingPlan.Row r, FontMetrics fm, int inner)
	{
		String amount = r.getNeed() > 0 ? r.getHave() + "/" + r.getNeed() : (r.getHave() > 0 ? "есть " + r.getHave() : "по ситуации");
		switch (r.getState())
		{
			case HAVE:
				OverlayText.pair(c, "✓ " + r.getName(), OsrsPathHudOverlay.GOOD, amount, OsrsPathHudOverlay.GOOD, fm, inner);
				return;
			case BOUGHT:
			case BUYING:
				OverlayText.pair(c, "… " + r.getName(), OsrsPathHudOverlay.TEXT, r.getOffer() == null ? "" : r.getOffer(),
					r.getState() == ShoppingPlan.RowState.BOUGHT ? OsrsPathHudOverlay.GOOD : MUTED, fm, inner);
				return;
			default:
				Color color = r.isNext() ? NEXT : OsrsPathHudOverlay.TEXT;
				OverlayText.pair(c, (r.isNext() ? "▶ " : "• ") + r.getName(), color, amount, color, fm, inner);
		}
	}
}
