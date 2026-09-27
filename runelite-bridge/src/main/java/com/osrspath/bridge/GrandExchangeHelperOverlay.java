package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
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
import net.runelite.client.ui.overlay.components.LineComponent;
import net.runelite.client.ui.overlay.components.TitleComponent;

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
		Object key = Arrays.asList(rows, config.hudOpacity(), config.hudLarge());
		if (!Objects.equals(key, builtFor))
		{
			build(rows);
			builtFor = key;
		}
		return super.render(g);
	}

	private void build(List<ShoppingPlan.Row> rows)
	{
		int width = config.hudLarge() ? OsrsPathHudOverlay.WIDTH * 5 / 4 + 30 : OsrsPathHudOverlay.WIDTH + 30;
		panelComponent.getChildren().clear();
		panelComponent.setPreferredSize(new Dimension(width, 0));
		panelComponent.setBackgroundColor(OsrsPathHudOverlay.background(Math.max(config.hudOpacity(), 85)));
		long left = rows.stream().filter(r -> r.getState() != ShoppingPlan.RowState.HAVE).count();
		panelComponent.getChildren().add(TitleComponent.builder()
			.text(left == 0 ? "Оптовый список: всё есть" : "Оптовый список · купить " + left)
			.color(left == 0 ? OsrsPathHudOverlay.GOOD : OsrsPathHudOverlay.TITLE).build());
		// Сначала то, что осталось купить: готовое уходит вниз.
		List<ShoppingPlan.Row> ordered = rows.stream()
			.sorted((a, b) -> Boolean.compare(a.getState() == ShoppingPlan.RowState.HAVE, b.getState() == ShoppingPlan.RowState.HAVE))
			.collect(java.util.stream.Collectors.toList());
		int shown = 0;
		for (ShoppingPlan.Row r : ordered)
		{
			if (shown++ == MAX_ROWS)
			{
				panelComponent.getChildren().add(LineComponent.builder().left("…и ещё " + (rows.size() - MAX_ROWS)).leftColor(MUTED).build());
				break;
			}
			panelComponent.getChildren().add(line(r));
		}
		panelComponent.getChildren().add(LineComponent.builder()
			.left("Название — кнопкой «Копировать» в OSRS Путь").leftColor(MUTED).build());
	}

	private static LineComponent line(ShoppingPlan.Row r)
	{
		String amount = r.getNeed() > 0 ? r.getHave() + "/" + r.getNeed() : (r.getHave() > 0 ? "есть " + r.getHave() : "по ситуации");
		switch (r.getState())
		{
			case HAVE:
				return LineComponent.builder().left("✓ " + r.getName()).leftColor(OsrsPathHudOverlay.GOOD)
					.right(amount).rightColor(OsrsPathHudOverlay.GOOD).build();
			case BOUGHT:
			case BUYING:
				return LineComponent.builder().left("… " + r.getName()).leftColor(OsrsPathHudOverlay.TEXT)
					.right(r.getOffer()).rightColor(r.getState() == ShoppingPlan.RowState.BOUGHT ? OsrsPathHudOverlay.GOOD : MUTED).build();
			default:
				Color c = r.isNext() ? NEXT : OsrsPathHudOverlay.TEXT;
				return LineComponent.builder().left((r.isNext() ? "▶ " : "• ") + r.getName()).leftColor(c)
					.right(amount).rightColor(c).build();
		}
	}
}
