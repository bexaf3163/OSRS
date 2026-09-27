package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.util.Arrays;
import java.util.Objects;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPanel;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.components.LineComponent;
import net.runelite.client.ui.overlay.components.TitleComponent;

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
		if (!config.showChecklist() || target == null || r.getRows().isEmpty()
			|| !visible(client.getWidget(InterfaceID.Bankmain.ITEMS_CONTAINER)))
		{
			return null;
		}
		Object key = Arrays.asList(r, target.getStepId(), config.hudOpacity(), config.hudLarge());
		if (!Objects.equals(key, builtFor))
		{
			build(r, target.getStepId());
			builtFor = key;
		}
		return super.render(g);
	}

	private void build(Checklist.Result r, String stepId)
	{
		int width = config.hudLarge() ? OsrsPathHudOverlay.WIDTH * 5 / 4 + 20 : OsrsPathHudOverlay.WIDTH + 20;
		panelComponent.getChildren().clear();
		panelComponent.setPreferredSize(new Dimension(width, 0));
		panelComponent.setBackgroundColor(OsrsPathHudOverlay.background(Math.max(config.hudOpacity(), 85)));
		panelComponent.getChildren().add(TitleComponent.builder().text("Проверка вылета · " + stepId)
			.color(OsrsPathHudOverlay.TITLE).build());
		int shown = 0;
		for (Checklist.Row row : r.getRows())
		{
			if (shown++ == MAX_ROWS)
			{
				panelComponent.getChildren().add(LineComponent.builder()
					.left("…и ещё " + (r.getRows().size() - MAX_ROWS)).leftColor(MUTED).build());
				break;
			}
			panelComponent.getChildren().add(line(row));
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
		panelComponent.getChildren().add(LineComponent.builder().left(footer).leftColor(color).build());
	}

	private static LineComponent line(Checklist.Row row)
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
		return LineComponent.builder().left(mark + name).leftColor(color).right(right).rightColor(color).build();
	}
}
