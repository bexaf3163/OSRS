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
import lombok.AllArgsConstructor;
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
	@AllArgsConstructor
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
		/** «HP 12/40 — ешь! Бьёт до 8»; null — здоровье в порядке или у шага нет противника с известным ударом. */
		String health;
		/** Здоровье не выше одного максимального удара: следующий удар может убить. */
		boolean healthCritical;
		/** «Use Raw rat meat на Fireplace»: что сделать сейчас по шагу; null — нечего напоминать. */
		String action;
		/** Расстояние до цели в клетках по прямой; -1 — не известно (цели нет, другой этаж, под землёй). */
		int tiles;

		/** Без предупреждения о здоровье и действия — как было до 2.15. */
		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, null, false, null, -1);
		}

		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade, String health, boolean healthCritical)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, health, healthCritical, null, -1);
		}

		/** Без расстояния в клетках — как было до 2.19. */
		State(String title, String goal, String distance, boolean near, String bag, boolean bagReady, String danger,
			boolean dangerInside, String pacing, boolean pacingGood, String upgrade, String health, boolean healthCritical, String action)
		{
			this(title, goal, distance, near, bag, bagReady, danger, dangerInside, pacing, pacingGood, upgrade, health, healthCritical, action, -1);
		}
	}

	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private Object builtFor;
	/** Размер плашки в прошлом кадре — по нему рисуется карточка. */
	private Dimension last = new Dimension();

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
		// Умное проявление: в пути и на бирже — одна строка (действие и расстояние), остальное в игре не нужно.
		if (config.smartOverlays() && SmartView.compactHud(plugin.overlayContext()))
		{
			s = SmartView.compact(s);
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
		OverlayCard.paint(g, last.width, last.height, accent(s), config.hudOpacity());
		Dimension d = super.render(g);
		last = d == null ? new Dimension() : d;
		return d;
	}

	/** Цвет полоски: опасность — красный, цель рядом — зелёный, остальное — золото. */
	static Color accent(State s)
	{
		if (s.getDanger() != null || s.isHealthCritical())
		{
			return OverlayCard.RED;
		}
		return s.isNear() ? OverlayCard.GREEN : OverlayCard.GOLD;
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
		OverlayText.frame(panel, fm);
		OverlayText.title(c, s.getTitle(), TITLE, fm, inner);
		if (s.getDanger() != null)
		{
			// Опасность — сразу под названием, выше цели: её нельзя пропустить.
			OverlayText.line(c, s.isDangerInside() ? "⚠ ОПАСНО — ты в зоне!" : "⚠ ВНИМАНИЕ", OsrsPathDangerOverlay.DANGER, fm, inner);
			OverlayText.line(c, s.getDanger(), OsrsPathDangerOverlay.DANGER, fm, inner);
		}
		if (s.getHealth() != null)
		{
			OverlayText.line(c, s.getHealth(), s.isHealthCritical() ? OsrsPathDangerOverlay.DANGER : WARN, fm, inner);
		}
		if (s.getGoal() != null && !s.getGoal().isEmpty())
		{
			OverlayText.line(c, s.getGoal(), TEXT, fm, inner);
		}
		if (s.getAction() != null)
		{
			OverlayText.line(c, s.getAction(), GOOD, fm, inner);
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
