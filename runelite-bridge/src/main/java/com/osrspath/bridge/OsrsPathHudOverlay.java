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
import lombok.Value;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPanel;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.components.ComponentConstants;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;
import net.runelite.client.ui.overlay.components.PanelComponent;

/**
 * Микро-HUD: код и название шага, текущая цель и расстояние до неё. Слева сверху, под окнами игры,
 * перетаскивается мышью с зажатым Alt (как любая плашка RuneLite).
 *
 * Строки плагин считает раз за игровой тик ({@link State}); здесь панель пересобирается, только
 * когда состояние или настройки изменились, — в обычном кадре ничего не создаётся. Длинные строки,
 * включая название шага, переносятся по ширине плашки ({@link OverlayText}).
 */
class OsrsPathHudOverlay extends OverlayPanel
{
	static final int WIDTH = 190;
	/** Крупный HUD: шрифт и ширина больше на четверть. */
	static final float LARGE = 1.25f;
	static final Color TITLE = new Color(255, 210, 90);
	static final Color TEXT = new Color(230, 230, 230);
	static final Color DISTANCE = new Color(120, 210, 255);
	static final Color GOOD = new Color(90, 220, 120);
	static final Color WARN = new Color(255, 170, 60);
	/** «Почти готово» — золотисто-зелёный. */
	static final Color ALMOST = new Color(200, 225, 90);
	/** Совет по снаряжению: янтарный, как «⚡ Скоростной апгрейд» в приложении. */
	static final Color UPGRADE = new Color(255, 190, 70);

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
		/** «⚡ Надень Iron scimitar — он в банке»; null — совета нет или подсказки апгрейда выключены. */
		String upgrade;
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
		boolean large = config.hudLarge();
		Font font = OverlayText.font(g.getFont(), large ? LARGE : 1f);
		g.setFont(font);
		int width = panelWidth(this, large ? Math.round(WIDTH * LARGE) : WIDTH);
		Object key = Arrays.asList(s, config.hudOpacity(), font, width);
		if (!Objects.equals(key, builtFor))
		{
			build(panelComponent, s, g.getFontMetrics(font), width, config.hudOpacity());
			builtFor = key;
		}
		return super.render(g);
	}

	/** Ширина плашки: своя или та, что игрок задал, растянув её мышью с Alt. */
	static int panelWidth(Overlay overlay, int standard)
	{
		Dimension d = overlay.getPreferredSize();
		return d != null && d.width > 0 ? d.width : standard;
	}

	/** Содержимое HUD. Статическое — чтобы тест мог отрисовать его настоящими шрифтами без клиента. */
	static void build(PanelComponent panel, State s, FontMetrics fm, int width, int opacity)
	{
		int inner = OverlayText.inner(width);
		List<LayoutableRenderableEntity> c = panel.getChildren();
		c.clear();
		panel.setPreferredSize(new Dimension(width, 0));
		panel.setBackgroundColor(background(opacity));
		OverlayText.frame(panel, fm);
		OverlayText.title(c, s.getTitle(), TITLE, fm, inner);
		if (s.getDanger() != null)
		{
			// Опасность — сразу под названием, выше цели: её нельзя пропустить.
			OverlayText.line(c, s.isDangerInside() ? "⚠ ОПАСНО — ты в зоне!" : "⚠ ВНИМАНИЕ", OsrsPathDangerOverlay.DANGER, fm, inner);
			OverlayText.line(c, s.getDanger(), OsrsPathDangerOverlay.DANGER, fm, inner);
		}
		if (s.getGoal() != null && !s.getGoal().isEmpty())
		{
			OverlayText.line(c, s.getGoal(), TEXT, fm, inner);
		}
		if (s.getDistance() != null)
		{
			OverlayText.line(c, s.getDistance(), s.isNear() ? GOOD : DISTANCE, fm, inner);
		}
		if (s.getPacing() != null)
		{
			OverlayText.line(c, s.getPacing(), s.isPacingGood() ? ALMOST : TEXT, fm, inner);
		}
		if (s.getBag() != null)
		{
			OverlayText.line(c, s.getBag(), s.isBagReady() ? GOOD : WARN, fm, inner);
		}
		if (s.getUpgrade() != null)
		{
			OverlayText.line(c, s.getUpgrade(), UPGRADE, fm, inner);
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
