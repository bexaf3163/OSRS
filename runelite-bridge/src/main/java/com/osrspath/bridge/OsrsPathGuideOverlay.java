package com.osrspath.bridge;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.Rectangle;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import javax.inject.Inject;
import lombok.Getter;
import lombok.Setter;
import net.runelite.api.Client;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPanel;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;
import net.runelite.client.ui.overlay.components.LineComponent;
import net.runelite.client.ui.overlay.components.PanelComponent;

/**
 * Список «Что нужно» на экране игры — под HUD, слева сверху (перетаскивается с Alt). Строки считает
 * {@link GuideList}; строка под мышью подсвечивается, внизу — подсказка к ней. После каждого кадра список
 * запоминает, где на холсте его строки, — по этим прямоугольникам {@link GuideMouse} понимает, куда нажали.
 */
class OsrsPathGuideOverlay extends OverlayPanel
{
	/** Шире HUD: у предметов справа статус, под ними — «где взять». */
	static final int WIDTH = 240;
	/** «Где взять» и подсказка — мельче основного текста. */
	static final float SMALL = 0.85f;
	static final Color HOVER = new Color(255, 255, 255, 40);
	/**
	 * Сколько после последнего кадра клик ещё считается по строкам. Список давно не рисовался (вышел из игры,
	 * плашку скрыли) — клики уходят игре, а не в невидимые кнопки.
	 */
	private static final long FRESH_NANOS = 500_000_000L;

	/** Где на холсте список и его строки — снимок последнего кадра для потока мыши. */
	static final class Hits
	{
		static final Hits NONE = new Hits(new Rectangle(), Collections.emptyList(), Collections.emptyList(), 0);

		final Rectangle area;
		final List<Rectangle> rows;
		final List<GuideList.Action> actions;
		final long at;

		Hits(Rectangle area, List<Rectangle> rows, List<GuideList.Action> actions, long at)
		{
			this.area = area;
			this.rows = rows;
			this.actions = actions;
			this.at = at;
		}

		/** Номер строки под точкой; -1 — не над строкой. */
		int rowAt(int x, int y)
		{
			for (int i = 0; i < rows.size(); i++)
			{
				if (rows.get(i).contains(x, y))
				{
					return i;
				}
			}
			return -1;
		}
	}

	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	private Object builtFor;
	private List<RowComponent> components = Collections.emptyList();
	private volatile Hits hits = Hits.NONE;
	private Dimension last = new Dimension();

	@Inject
	OsrsPathGuideOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		super(plugin);
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.TOP_LEFT);
		setLayer(OverlayLayer.UNDER_WIDGETS);
		// Ниже HUD в стопке слева сверху: у HUD приоритет выше.
		setPriority(PRIORITY_LOW);
		setClearChildren(false);
		setMovable(true);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		StepGuide.View v = plugin.getGuideView();
		// Умное проявление: в пути и на бирже список шага закрывал бы обзор — он нужен у банка и рядом со шагом.
		if (!GuideList.shown(config.showGuide(), false, v, config.smartOverlays(), plugin.overlayContext()))
		{
			hits = Hits.NONE;
			plugin.guideShown(false);
			return null;
		}
		float scale = config.hudLarge() ? OsrsPathHudOverlay.LARGE : 1f;
		Font font = OverlayText.font(g.getFont(), scale);
		Font small = OverlayText.font(g.getFont(), scale * SMALL);
		g.setFont(font);
		int width = OsrsPathHudOverlay.panelWidth(this, Math.round(WIDTH * scale));
		int hovered = hovered();
		boolean terse = config.smartOverlays();
		Object key = Arrays.asList(v, config.guideCollapsed(), hovered, config.hudOpacity(), font, small, width, terse);
		if (!key.equals(builtFor))
		{
			components = build(panelComponent, v, config.guideCollapsed(), hovered, g.getFontMetrics(font), g.getFontMetrics(small),
				font, small, width, config.hudOpacity(), terse);
			builtFor = key;
			// Что именно видит игрок — в журнал отладки (только когда плашка пересобрана, не каждый кадр).
			List<GuideList.Row> shown = new ArrayList<>();
			for (RowComponent rc : components)
			{
				if (!rc.isHint())
				{
					shown.add(rc.getRow());
				}
			}
			plugin.uiShown("guide", GuideList.plain(shown));
		}
		OverlayCard.paint(g, last.width, last.height, accent(v), config.hudOpacity());
		Dimension d = super.render(g);
		last = d == null ? new Dimension() : d;
		remember(d);
		plugin.guideShown(true);
		return d;
	}

	/** Цвет полоски: квест пройден — зелёный, идёт по этапам — голубой, иначе золото. */
	static Color accent(StepGuide.View v)
	{
		StepGuide.StageView s = v.getStage();
		if (s != null)
		{
			return s.isFinished() ? OverlayCard.GREEN : OverlayCard.BLUE;
		}
		return OverlayCard.GOLD;
	}

	/** Строка под мышью по прошлому кадру; -1 — мышь не над списком, открыто меню игры или над списком окно игры. */
	private int hovered()
	{
		if (client.isMenuOpen())
		{
			return -1;
		}
		net.runelite.api.Point m = client.getMouseCanvasPosition();
		// Над списком окно игры (банк, магазин, карта мира) — строка под ним не подсвечивается и не подсказывает.
		if (m == null || GuideMouse.windowUnderMouse(client.getMenu().getMenuEntries())
			|| GuideMouse.mapCovers(client.getWidget(net.runelite.api.gameval.InterfaceID.Worldmap.WINDOW), new java.awt.Point(m.getX(), m.getY())))
		{
			return -1;
		}
		return hits.rowAt(m.getX(), m.getY());
	}

	/** Прямоугольники строк на холсте: при отрисовке плашка уже стоит на своём месте (getBounds). */
	private void remember(Dimension d)
	{
		if (d == null)
		{
			hits = Hits.NONE;
			return;
		}
		Rectangle at = getBounds();
		List<Rectangle> rects = new ArrayList<>();
		List<GuideList.Action> actions = new ArrayList<>();
		for (RowComponent c : components)
		{
			if (c.isHint())
			{
				continue;
			}
			Rectangle r = new Rectangle(c.getBounds());
			r.translate(at.x, at.y);
			rects.add(r);
			actions.add(c.getRow().getAction());
		}
		setHits(new Hits(new Rectangle(at.x, at.y, d.width, d.height), rects, actions, System.nanoTime()));
	}

	void setHits(Hits h)
	{
		hits = h;
	}

	/**
	 * Что под точкой холста (поток мыши). null — не список, клик уходит игре; Action.NONE — список, но не кнопка:
	 * клик по нему не должен уйти игре и повести персонажа туда, что под плашкой.
	 */
	GuideList.Action actionAt(Point p)
	{
		Hits h = hits;
		if (System.nanoTime() - h.at > FRESH_NANOS || !h.area.contains(p))
		{
			return null;
		}
		int row = h.rowAt(p.x, p.y);
		return row < 0 ? GuideList.Action.NONE : h.actions.get(row);
	}

	/** Содержимое плашки. Статическое — тест рисует его настоящими шрифтами без клиента. */
	static List<RowComponent> build(PanelComponent panel, StepGuide.View v, boolean collapsed, int hovered, FontMetrics fm,
		FontMetrics smallFm, Font font, Font small, int width, int opacity)
	{
		return build(panel, v, collapsed, hovered, fm, smallFm, font, small, width, opacity, false);
	}

	/** terse — краткий вид для игры (умное проявление): подробности остаются в подсказке и в окне программы. */
	static List<RowComponent> build(PanelComponent panel, StepGuide.View v, boolean collapsed, int hovered, FontMetrics fm,
		FontMetrics smallFm, Font font, Font small, int width, int opacity, boolean terse)
	{
		List<LayoutableRenderableEntity> c = panel.getChildren();
		c.clear();
		panel.setPreferredSize(new Dimension(width, 0));
		OverlayText.frame(panel, fm);
		List<GuideList.Row> rows = GuideList.rows(v, collapsed, fm, smallFm, width, terse);
		List<RowComponent> out = new ArrayList<>();
		for (int i = 0; i < rows.size(); i++)
		{
			GuideList.Row r = rows.get(i);
			RowComponent rc = new RowComponent(r, i == hovered && r.getAction().isClickable(), false, font, small);
			out.add(rc);
			c.add(rc);
			if (i == 0 && !collapsed && v.getStage() != null && v.getStage().getTotal() > 0)
			{
				// Под заголовком этапа — полоска прохождения квеста.
				StepGuide.StageView sv = v.getStage();
				c.add(new OverlayCard.Bar(sv.isFinished() ? 1 : (double) (sv.getIndex() - 1) / sv.getTotal(),
					sv.isFinished() ? OverlayCard.GREEN : OverlayCard.BLUE));
			}
		}
		if (hovered >= 0 && hovered < rows.size() && rows.get(hovered).getHint() != null)
		{
			RowComponent hint = new RowComponent(GuideList.hint(rows.get(hovered).getHint(), smallFm, width), false, true, font, small);
			out.add(hint);
			c.add(hint);
		}
		return out;
	}

	/** Строка списка: её строки текста и подсветка, когда мышь над кнопкой. Размер и место — после отрисовки. */
	static final class RowComponent implements LayoutableRenderableEntity
	{
		@Getter
		private final GuideList.Row row;
		private final boolean hovered;
		@Getter
		private final boolean hint;
		private final List<LineComponent> lines = new ArrayList<>();
		private final List<Font> fonts = new ArrayList<>();
		@Getter
		private final Rectangle bounds = new Rectangle();
		@Setter
		private Point preferredLocation = new Point();
		@Setter
		private Dimension preferredSize = new Dimension(OsrsPathGuideOverlay.WIDTH, 0);

		RowComponent(GuideList.Row row, boolean hovered, boolean hint, Font font, Font small)
		{
			this.row = row;
			this.hovered = hovered;
			this.hint = hint;
			for (GuideList.Line l : row.getLines())
			{
				Font f = l.isSmall() ? small : font;
				LineComponent.LineComponentBuilder b = LineComponent.builder().left(l.getLeft()).leftColor(l.getLeftColor()).leftFont(f).rightFont(f);
				if (l.getRight() != null)
				{
					b.right(l.getRight()).rightColor(l.getRightColor());
				}
				lines.add(b.build());
				fonts.add(f);
			}
		}

		@Override
		public Dimension render(Graphics2D g)
		{
			int x = preferredLocation.x;
			int y = preferredLocation.y;
			int width = preferredSize.width;
			if (hovered || hint)
			{
				int h = 0;
				for (Font f : fonts)
				{
					h += g.getFontMetrics(f).getHeight();
				}
				// Подсветка — в пределах рамки панели (4 точки с каждой стороны): за плашку ничего не вылезает.
				g.setColor(HOVER);
				g.fillRoundRect(x - 4, y + 1, width + 8, h + 1, 8, 8);
			}
			int at = y;
			for (LineComponent l : lines)
			{
				l.setPreferredLocation(new Point(x, at));
				l.setPreferredSize(new Dimension(width, 0));
				at += l.render(g).height;
			}
			bounds.setBounds(x, y, width, at - y);
			return new Dimension(width, at - y);
		}
	}
}
