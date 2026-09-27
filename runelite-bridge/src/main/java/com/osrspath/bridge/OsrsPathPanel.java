package com.osrspath.bridge;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Polygon;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.SwingUtilities;
import javax.swing.border.EmptyBorder;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.ui.FontManager;
import net.runelite.client.ui.PluginPanel;

/**
 * Боковая панель «OSRS Путь» в RuneLite: шаг, что нужно (есть в сумке, в банке, нет) и где это взять, точки шага.
 * «Путь сюда» ставит временную цель — стрелка и Shortest Path ведут туда, по приходу стрелка возвращается к шагу.
 * Это окно RuneLite, а не игра: нажатия здесь не попадают в игру. Строки считает {@link StepGuide} на потоке
 * клиента; сюда приходит готовый вид, панель перестраивается, только когда он изменился.
 */
class OsrsPathPanel extends PluginPanel
{
	interface Actions
	{
		/** Повести стрелку к точке шага с этим номером. */
		void go(int place);

		/** Снять временную цель: стрелка снова к шагу. */
		void back();
	}

	static final Color GOOD = new Color(90, 220, 120);
	static final Color BANK = new Color(255, 190, 70);
	static final Color MISSING = new Color(255, 110, 90);
	static final Color IN_STEP = new Color(120, 210, 255);
	private static final Color TEXT = new Color(225, 225, 225);
	private static final Color MUTED = new Color(160, 160, 160);

	private final Actions actions;
	private final JPanel body = new JPanel();
	private StepGuide.View shown;

	OsrsPathPanel(Actions actions)
	{
		this.actions = actions;
		setLayout(new BorderLayout());
		setBorder(new EmptyBorder(8, 8, 8, 8));
		body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
		body.setOpaque(false);
		add(body, BorderLayout.NORTH);
		show(StepGuide.EMPTY);
	}

	/** Показать вид (на потоке Swing). Тот же вид — ничего не делает. */
	void show(StepGuide.View v)
	{
		if (v.equals(shown))
		{
			return;
		}
		shown = v;
		// Прокрутка остаётся на месте: панель перестраивается при каждом изменении сумки и цели, и без этого
		// после «Путь сюда» список уезжал.
		JScrollPane scroll = getScrollPane();
		int at = scroll == null ? 0 : scroll.getVerticalScrollBar().getValue();
		body.removeAll();
		if (v.getTitle() != null)
		{
			add(text(v.getTitle(), bold(), TEXT));
		}
		if (v.getGoal() != null && !v.getGoal().isEmpty())
		{
			add(text(v.getGoal(), small(), MUTED));
		}
		if (v.getDetour() != null)
		{
			gap(6);
			add(text("Стрелка ведёт: " + v.getDetour(), small(), BANK));
			add(button("Вернуть стрелку к шагу", actions::back));
		}
		if (v.getNote() != null)
		{
			gap(6);
			add(text(v.getNote(), small(), MUTED));
		}
		if (!v.getItems().isEmpty())
		{
			header("Что нужно");
			for (StepGuide.ItemLine i : v.getItems())
			{
				JPanel card = card();
				card.add(text(i.getTitle(), regular(), TEXT));
				card.add(text(i.getStatus(), small(), colorOf(i.getHave())));
				if (i.getWhere() != null && i.getHave() != StepGuide.Have.BAG)
				{
					card.add(text("Где взять: " + i.getWhere(), small(), MUTED));
				}
				if (i.getPlace() >= 0 && i.getHave() != StepGuide.Have.BAG)
				{
					StepGuide.PlaceLine p = v.getPlaces().get(i.getPlace());
					card.add(p.isActive() ? text("● Стрелка ведёт сюда", small(), GOOD)
						: button("Путь сюда", () -> actions.go(i.getPlace())));
				}
				add(card);
			}
		}
		if (!v.getPlaces().isEmpty())
		{
			header("Точки шага");
			for (StepGuide.PlaceLine p : v.getPlaces())
			{
				JPanel card = card();
				card.add(text(p.getLabel(), regular(), TEXT));
				card.add(p.isActive() ? text("● Стрелка ведёт сюда", small(), GOOD)
					: button("Путь сюда", () -> actions.go(p.getIndex())));
				add(card);
			}
		}
		body.revalidate();
		body.repaint();
		if (scroll != null)
		{
			SwingUtilities.invokeLater(() -> scroll.getVerticalScrollBar().setValue(at));
		}
	}

	/**
	 * Шрифты панели — как у плашек в игре (OverlayText.font): у шрифтов RuneScape нет кириллицы, и без замены
	 * латиница шла мелким пиксельным шрифтом, а кириллица — крупным системным в одной строке.
	 */
	private static Font small()
	{
		return OverlayText.font(FontManager.getRunescapeSmallFont(), 1f);
	}

	private static Font regular()
	{
		return OverlayText.font(FontManager.getRunescapeFont(), 1f);
	}

	private static Font bold()
	{
		return OverlayText.font(FontManager.getRunescapeBoldFont(), 1f);
	}

	static Color colorOf(StepGuide.Have h)
	{
		switch (h)
		{
			case BAG:
				return GOOD;
			case BANK:
				return BANK;
			case NONE:
				return MISSING;
			case IN_STEP:
				return IN_STEP;
			default:
				return MUTED;
		}
	}

	private void add(JPanel card)
	{
		gap(4);
		card.setAlignmentX(Component.LEFT_ALIGNMENT);
		body.add(card);
	}

	private void add(JTextArea t)
	{
		t.setAlignmentX(Component.LEFT_ALIGNMENT);
		body.add(t);
	}

	private void add(JButton b)
	{
		b.setAlignmentX(Component.LEFT_ALIGNMENT);
		body.add(b);
	}

	private void gap(int h)
	{
		body.add(Box.createRigidArea(new Dimension(0, h)));
	}

	private void header(String s)
	{
		gap(10);
		add(text(s, bold(), new Color(255, 190, 70)));
	}

	private static JPanel card()
	{
		JPanel p = new JPanel();
		p.setLayout(new BoxLayout(p, BoxLayout.Y_AXIS));
		p.setBackground(ColorScheme.DARKER_GRAY_COLOR);
		p.setBorder(BorderFactory.createEmptyBorder(6, 6, 6, 6));
		return p;
	}

	/** Ширина текста: панель RuneLite 225 точек минус поля панели и карточки. */
	static final int TEXT_WIDTH = PluginPanel.PANEL_WIDTH - 16 - 12;

	/**
	 * Текст с переносом по словам — как подпись, без рамки и курсора. JTextArea, а не JLabel с HTML: HTML берёт
	 * шрифт по имени и теряет подстановку кириллицы, которую RuneLite делает для своих шрифтов. Ширина задаётся
	 * заранее — иначе в вертикальном ряду перенос считается по одной длинной строке.
	 */
	private static JTextArea text(String s, Font font, Color color)
	{
		JTextArea t = new JTextArea(s)
		{
			@Override
			public Dimension getPreferredSize()
			{
				setSize(TEXT_WIDTH, Short.MAX_VALUE);
				Dimension d = super.getPreferredSize();
				return new Dimension(TEXT_WIDTH, d.height);
			}

			@Override
			public Dimension getMaximumSize()
			{
				return getPreferredSize();
			}
		};
		t.setLineWrap(true);
		t.setWrapStyleWord(true);
		t.setEditable(false);
		t.setFocusable(false);
		t.setOpaque(false);
		t.setBorder(null);
		t.setFont(font);
		t.setForeground(color);
		t.setAlignmentX(Component.LEFT_ALIGNMENT);
		return t;
	}

	private static JButton button(String s, Runnable r)
	{
		JButton b = new JButton(s);
		b.setFont(small());
		b.setFocusPainted(false);
		b.setAlignmentX(Component.LEFT_ALIGNMENT);
		b.addActionListener(e -> r.run());
		return b;
	}

	/** Значок кнопки на боковой полосе: стрелка, как большая стрелка в игре. */
	static BufferedImage icon()
	{
		BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		Polygon p = ArrowGeometry.arrow(8, 8, 7.5, -Math.PI / 4);
		g.setColor(OsrsPathArrowOverlay.FAR);
		g.fillPolygon(p);
		g.setColor(new Color(20, 20, 20));
		g.drawPolygon(p);
		g.dispose();
		return img;
	}
}
