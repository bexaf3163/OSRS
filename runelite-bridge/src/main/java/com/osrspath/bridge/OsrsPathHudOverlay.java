package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.Graphics2D;
import java.util.Arrays;
import java.util.Objects;
import javax.inject.Inject;
import lombok.Value;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPanel;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.components.ComponentConstants;
import net.runelite.client.ui.overlay.components.LineComponent;
import net.runelite.client.ui.overlay.components.TitleComponent;

/**
 * Микро-HUD: код и название шага, текущая цель и расстояние до неё. Слева сверху, под окнами игры,
 * перетаскивается мышью с зажатым Alt (как любая плашка RuneLite).
 *
 * Строки плагин считает раз за игровой тик ({@link State}); здесь панель пересобирается, только
 * когда состояние или настройки изменились, — в обычном кадре ничего не создаётся.
 */
class OsrsPathHudOverlay extends OverlayPanel
{
	static final int WIDTH = 190;
	static final Color TITLE = new Color(255, 210, 90);
	static final Color TEXT = new Color(230, 230, 230);
	static final Color DISTANCE = new Color(120, 210, 255);
	static final Color GOOD = new Color(90, 220, 120);
	static final Color WARN = new Color(255, 170, 60);
	/** «Почти готово» — золотисто-зелёный. */
	static final Color ALMOST = new Color(200, 225, 90);

	/** Всё, что показывает HUD. Неизменяемое: плагин заменяет его целиком. */
	@Value
	static class State
	{
		String title;
		String goal;
		String distance;
		boolean near;
		/** «Сумка: не хватает 2» / «Сумка готова» — если у шага есть проверка вылета. */
		String bag;
		boolean bagReady;
		/** Предупреждение радара опасности; null — рядом опасного нет. */
		String danger;
		/** Игрок уже внутри опасной зоны, а не на подходе. */
		boolean dangerInside;
		/** «34 креветки до 20 Fishing (~7 мин)»; null — у шага нет темпа. */
		String pacing;
		/** Темп: почти готово или цель достигнута — строка зелёная. */
		boolean pacingGood;
	}

	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private Object builtFor;

	@Inject
	OsrsPathHudOverlay(OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		super(plugin);
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.TOP_LEFT);
		setLayer(OverlayLayer.UNDER_WIDGETS);
		setPriority(PRIORITY_MED);
		setClearChildren(false);
		setMovable(true);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		State s = plugin.getHud();
		if (!config.showHud() || s == null)
		{
			return null;
		}
		Object key = Arrays.asList(s, config.hudOpacity(), config.hudLarge(), g.getFont());
		if (!Objects.equals(key, builtFor))
		{
			build(s, g.getFont());
			builtFor = key;
		}
		return super.render(g);
	}

	private void build(State s, Font base)
	{
		boolean large = config.hudLarge();
		Font font = large ? base.deriveFont(base.getSize2D() * 1.25f) : base;
		panelComponent.getChildren().clear();
		panelComponent.setPreferredSize(new Dimension(large ? WIDTH * 5 / 4 : WIDTH, 0));
		panelComponent.setBackgroundColor(background(config.hudOpacity()));
		panelComponent.getChildren().add(TitleComponent.builder().text(s.getTitle()).color(TITLE).build());
		if (s.getDanger() != null)
		{
			// Опасность — сразу под названием, выше цели: её нельзя пропустить.
			panelComponent.getChildren().add(LineComponent.builder()
				.left(s.isDangerInside() ? "⚠ ОПАСНО — ты в зоне!" : "⚠ ВНИМАНИЕ")
				.leftColor(OsrsPathDangerOverlay.DANGER).leftFont(font).build());
			panelComponent.getChildren().add(LineComponent.builder().left(s.getDanger())
				.leftColor(OsrsPathDangerOverlay.DANGER).leftFont(font).build());
		}
		if (s.getGoal() != null && !s.getGoal().isEmpty())
		{
			panelComponent.getChildren().add(LineComponent.builder().left(s.getGoal()).leftColor(TEXT).leftFont(font).build());
		}
		if (s.getDistance() != null)
		{
			panelComponent.getChildren().add(LineComponent.builder().left(s.getDistance())
				.leftColor(s.isNear() ? GOOD : DISTANCE).leftFont(font).build());
		}
		if (s.getPacing() != null)
		{
			panelComponent.getChildren().add(LineComponent.builder().left(s.getPacing())
				.leftColor(s.isPacingGood() ? ALMOST : TEXT).leftFont(font).build());
		}
		if (s.getBag() != null)
		{
			panelComponent.getChildren().add(LineComponent.builder().left(s.getBag())
				.leftColor(s.isBagReady() ? GOOD : WARN).leftFont(font).build());
		}
	}

	/** Стандартный фон плашек RuneLite с прозрачностью из настроек. */
	static Color background(int opacityPercent)
	{
		Color c = ComponentConstants.STANDARD_BACKGROUND_COLOR;
		int alpha = Math.max(0, Math.min(255, Math.round(opacityPercent * 2.55f)));
		return new Color(c.getRed(), c.getGreen(), c.getBlue(), alpha);
	}
}
