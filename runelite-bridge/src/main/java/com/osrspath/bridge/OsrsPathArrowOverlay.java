package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Polygon;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.Player;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;

/**
 * Большая стрелка к текущей цели: вверху по центру экрана, над сценой, но под окнами игры — не закрывает
 * миникарту, чат и сумку и не мешает кликам. Поворачивается вместе с камерой, как миникарта; рядом с целью
 * превращается в «✓ Рядом», без цели — не рисуется. Подпись — то же расстояние, что в микро-HUD.
 * Перетаскивается мышью с зажатым Alt, размер — в настройках.
 */
class OsrsPathArrowOverlay extends Overlay
{
	static final Color FAR = new Color(120, 210, 255);
	static final Color CLOSE = new Color(255, 210, 90);
	static final Color NEAR = new Color(90, 220, 120);
	static final Color OTHER = new Color(255, 170, 60);
	private static final Color OUTLINE = new Color(20, 20, 20, 220);
	private static final int PAD = 6;
	private static final int TEXT_GAP = 3;

	private final Client client;
	private final OsrsPathBridgePlugin plugin;
	private final OsrsPathBridgeConfig config;
	/** Угол, нарисованный в прошлом кадре; NaN — стрелки не было. */
	private double angle = Double.NaN;

	@Inject
	OsrsPathArrowOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		super(plugin);
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.TOP_CENTER);
		setLayer(OverlayLayer.UNDER_WIDGETS);
		setPriority(PRIORITY_HIGH);
		setMovable(true);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		WorldPoint target = config.bigArrow() ? plugin.arrowTarget() : null;
		Player me = client.getLocalPlayer();
		// Открыта карта мира: стрелка рисуется над окнами и легла бы на карту — там цель показывает метка.
		if (target == null || me == null || InventoryCheckOverlay.visible(client.getWidget(net.runelite.api.gameval.InterfaceID.Worldmap.WINDOW)))
		{
			angle = Double.NaN;
			return null;
		}
		WorldPoint pos = me.getWorldLocation();
		boolean underTarget = Navigation.underground(target.getY());
		boolean underMe = Navigation.underground(pos.getY());
		int layer = underTarget == underMe ? Integer.compare(target.getPlane(), pos.getPlane()) : (underTarget ? -2 : 2);
		int dx = target.getX() - pos.getX();
		int dy = target.getY() - pos.getY();
		ArrowGeometry.State state = ArrowGeometry.state(Navigation.distance(pos.getX(), pos.getY(), target.getX(), target.getY()),
			layer == 0, plugin.isNavNear());
		angle = ArrowGeometry.smooth(angle, ArrowGeometry.screenAngle(dx, dy, client.getCameraYawTarget()));
		OsrsPathHudOverlay.State hud = plugin.getHud();
		String text = hud != null ? label(hud.getDistance()) : null;
		Font font = OverlayText.font(g.getFont(), config.hudLarge() ? OsrsPathHudOverlay.LARGE : 1f);
		return draw(g, font, state, angle, layer, text, config.arrowSize().diameter);
	}

	/**
	 * Рисует стрелку и подпись от (0, 0) и возвращает занятый размер. Статический — тест рисует его в картинку
	 * настоящими шрифтами и проверяет, что всё внутри рамки. layer: 0 — тот же уровень; ±1 — этаж выше/ниже;
	 * ±2 — на поверхности / под землёй (тогда вместо стрелки — шеврон вверх или вниз: направление по карте
	 * между поверхностью и подземельем ничего не значит).
	 */
	static Dimension draw(Graphics2D g, Font font, ArrowGeometry.State state, double angle, int layer, String text, int diameter)
	{
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setFont(font);
		FontMetrics fm = g.getFontMetrics(font);
		String label = state == ArrowGeometry.State.VERY_CLOSE ? "Рядом" : text;
		int textW = label == null ? 0 : fm.stringWidth(label);
		int width = Math.max(diameter, textW) + 2 * PAD;
		int height = diameter + 2 * PAD + (label == null ? 0 : TEXT_GAP + fm.getHeight());

		// Без плашки: стрелка с тёмным контуром и подпись с обводкой видны и на траве, и на снегу, и в темноте.

		double cx = width / 2.0;
		double cy = PAD + diameter / 2.0;
		double r = diameter / 2.0;
		Color color = colorOf(state);
		if (state == ArrowGeometry.State.VERY_CLOSE)
		{
			g.setColor(color);
			g.fillOval((int) Math.round(cx - r * 0.8), (int) Math.round(cy - r * 0.8), (int) Math.round(r * 1.6), (int) Math.round(r * 1.6));
			g.setColor(OUTLINE);
			g.setStroke(new BasicStroke((float) Math.max(3, r * 0.16), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
			Path2D tick = new Path2D.Double();
			tick.moveTo(cx - r * 0.38, cy + r * 0.02);
			tick.lineTo(cx - r * 0.08, cy + r * 0.32);
			tick.lineTo(cx + r * 0.42, cy - r * 0.3);
			g.draw(tick);
		}
		else
		{
			// Шеврон вверх/вниз между поверхностью и подземельем; иначе стрелка по направлению.
			double a = Math.abs(layer) == 2 ? (layer > 0 ? -Math.PI / 2 : Math.PI / 2) : angle;
			double scale = state == ArrowGeometry.State.APPROACHING ? 1.0 : 0.92;
			Polygon p = ArrowGeometry.arrow(cx, cy, r * scale, a);
			g.setColor(color);
			g.fillPolygon(p);
			g.setColor(OUTLINE);
			g.setStroke(new BasicStroke(state == ArrowGeometry.State.APPROACHING ? 3f : 2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
			g.drawPolygon(p);
		}

		if (label != null)
		{
			int baseline = PAD + diameter + TEXT_GAP + fm.getAscent();
			int x = (int) Math.round(cx - textW / 2.0);
			// Обводка в четыре стороны и тень: без плашки подпись должна читаться на любом фоне.
			g.setColor(new Color(0, 0, 0, 230));
			for (int[] d : new int[][]{{-1, 0}, {1, 0}, {0, -1}, {0, 1}, {1, 1}})
			{
				g.drawString(label, x + d[0], baseline + d[1]);
			}
			g.setColor(state == ArrowGeometry.State.VERY_CLOSE ? NEAR : Color.WHITE);
			g.drawString(label, x, baseline);
		}
		return new Dimension(width, height);
	}

	/**
	 * Подпись под стрелкой — расстояние из HUD без значка стороны света: «↑» в HUD значит «на север», а
	 * стрелка рядом повёрнута по камере, и два разных «вверх» путали бы. «~62 клетки ↑, этажом выше» →
	 * «~62 клетки, этажом выше».
	 */
	static String label(String distance)
	{
		if (distance == null)
		{
			return null;
		}
		return distance.replaceAll(" ?[→↗↑↖←↙↓↘]", "").trim();
	}

	static Color colorOf(ArrowGeometry.State state)
	{
		switch (state)
		{
			case APPROACHING:
				return CLOSE;
			case VERY_CLOSE:
				return NEAR;
			case OTHER_LEVEL:
				return OTHER;
			default:
				return FAR;
		}
	}
}
