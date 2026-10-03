package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.geom.RoundRectangle2D;
import lombok.Setter;
import net.runelite.client.ui.overlay.components.LayoutableRenderableEntity;

/**
 * Вид плашек плагина: тёмная скруглённая карточка с цветной полоской слева (цвет — состояние: золото, зелёный,
 * красный) и тонкой рамкой. Вместо плоского коричневатого фона PanelComponent.
 *
 * Карточка рисуется до панели по её размеру из прошлого кадра — так же, как свой фон рисует PanelComponent.
 * Размер меняется только вместе с содержимым, то есть раз в игровой тик, и разница в один кадр не видна.
 */
final class OverlayCard
{
	static final int RADIUS = 12;
	/** Ширина цветной полоски слева. */
	static final int BAR = 3;
	private static final Color TOP = new Color(32, 36, 49);
	private static final Color BOTTOM = new Color(15, 17, 24);
	private static final Color BORDER = new Color(255, 255, 255, 36);
	private static final Color TRACK = new Color(255, 255, 255, 38);

	/** Акценты состояний: те же цвета, что у текста плашек. */
	static final Color GOLD = OsrsPathHudOverlay.TITLE;
	static final Color GREEN = OsrsPathHudOverlay.GOOD;
	static final Color AMBER = OsrsPathHudOverlay.WARN;
	static final Color RED = OsrsPathDangerOverlay.DANGER;
	static final Color BLUE = GuideList.LINK;

	private OverlayCard()
	{
	}

	static int alpha(int opacityPercent)
	{
		return Math.max(0, Math.min(255, Math.round(opacityPercent * 2.55f)));
	}

	private static Color withAlpha(Color c, int a)
	{
		return new Color(c.getRed(), c.getGreen(), c.getBlue(), a);
	}

	/** Карточка размером w×h с левого верхнего угла (RuneLite уже сдвинул холст к плашке). */
	static void paint(Graphics2D g, int w, int h, Color accent, int opacityPercent)
	{
		if (w <= 2 || h <= 2)
		{
			return;
		}
		Graphics2D c = (Graphics2D) g.create();
		try
		{
			c.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			int a = alpha(opacityPercent);
			Shape card = new RoundRectangle2D.Float(0.5f, 0.5f, w - 1, h - 1, RADIUS, RADIUS);
			c.setPaint(new GradientPaint(0, 0, withAlpha(TOP, a), 0, h, withAlpha(BOTTOM, a)));
			c.fill(card);
			if (accent != null)
			{
				c.setClip(card);
				c.setColor(accent);
				c.fillRect(0, 0, BAR, h);
				c.setClip(null);
			}
			c.setColor(BORDER);
			c.setStroke(new BasicStroke(1f));
			c.draw(card);
		}
		finally
		{
			c.dispose();
		}
	}

	/** Тонкая полоска прогресса: «этап 3 из 9», «собрано 4 из 6». */
	static final class Bar implements LayoutableRenderableEntity
	{
		static final int HEIGHT = 9;
		private static final int THICK = 4;

		private final double fraction;
		private final Color color;
		@Setter
		private Point preferredLocation = new Point();
		@Setter
		private Dimension preferredSize = new Dimension();
		private final java.awt.Rectangle bounds = new java.awt.Rectangle();

		Bar(double fraction, Color color)
		{
			this.fraction = Math.max(0, Math.min(1, fraction));
			this.color = color;
		}

		@Override
		public Dimension render(Graphics2D g)
		{
			paint(g, preferredLocation.x, preferredLocation.y, preferredSize.width, fraction, color);
			bounds.setBounds(preferredLocation.x, preferredLocation.y, preferredSize.width, HEIGHT);
			return new Dimension(preferredSize.width, HEIGHT);
		}

		@Override
		public java.awt.Rectangle getBounds()
		{
			return bounds;
		}
	}

	/** Полоска шириной width с левого верхнего угла (x, y) высотой {@link Bar#HEIGHT} вместе с отступами. */
	static void paint(Graphics2D g, int x, int y, int width, double fraction, Color color)
	{
		if (width <= 4)
		{
			return;
		}
		Graphics2D c = (Graphics2D) g.create();
		try
		{
			c.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			int top = y + (Bar.HEIGHT - Bar.THICK) / 2;
			c.setColor(TRACK);
			c.fillRoundRect(x, top, width, Bar.THICK, Bar.THICK, Bar.THICK);
			int filled = (int) Math.round(width * Math.max(0, Math.min(1, fraction)));
			if (filled > 0)
			{
				c.setColor(color);
				c.fillRoundRect(x, top, Math.max(Bar.THICK, filled), Bar.THICK, Bar.THICK, Bar.THICK);
			}
		}
		finally
		{
			c.dispose();
		}
	}
}
