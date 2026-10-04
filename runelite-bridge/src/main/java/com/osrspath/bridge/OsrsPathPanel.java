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
 * The "OSRS Path" side panel in RuneLite: the step, what you need (in the bag, in the bank, missing) and where to get it, the step's points.
 * "Go here" sets a temporary target: the arrow and Shortest Path lead there, and on arrival the arrow returns to the step.
 * This is a RuneLite window, not the game: clicks here do not reach the game. {@link StepGuide} computes the rows on the client
 * thread; a ready view arrives here, and the panel is rebuilt only when it changed.
 */
class OsrsPathPanel extends PluginPanel
{
	interface Actions
	{
		/** Point the arrow at the step point with this number. */
		void go(int place);

		/** Clear the temporary target: the arrow goes back to the step. */
		void back();
	}

	private static final Color GOOD = StepGuide.GOOD;
	private static final Color BANK = StepGuide.BANK;
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

	/** Show the view (on the Swing thread). The same view does nothing. */
	void show(StepGuide.View v)
	{
		if (v.equals(shown))
		{
			return;
		}
		shown = v;
		// The scroll position stays: the panel is rebuilt on every change of bag and target, and without this
		// the list scrolled away after "Go here".
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
			add(text("Arrow points to: " + v.getDetour(), small(), BANK));
			add(button("Return the arrow to the step", actions::back));
		}
		if (v.getNote() != null)
		{
			gap(6);
			add(text(v.getNote(), small(), MUTED));
		}
		StepGuide.StageView stage = v.getStage();
		if (stage != null)
		{
			header(GuideList.stageTitle(stage));
			if (stage.getWarning() != null)
			{
				add(text("⚠ " + stage.getWarning(), small(), StepGuide.BANK));
			}
			JPanel card = card();
			if (stage.isFinished())
			{
				card.add(text("Quest complete - the step will tick itself.", regular(), GOOD));
			}
			else
			{
				for (int i = 0; i < stage.getSteps().size(); i++)
				{
					boolean now = i == stage.getCursor() && stage.getSteps().size() > 1;
					String mark = stage.getSteps().size() == 1 ? "" : i < stage.getCursor() ? "✓ " : now ? "▶ " : (i + 1) + ". ";
					card.add(text(mark + stage.getSteps().get(i).getT(), regular(), i < stage.getCursor() ? GOOD : now ? new Color(255, 210, 90) : TEXT));
				}
			}
			add(card);
		}
		if (!v.getItems().isEmpty())
		{
			header(stage != null ? "Needed now" : "What you need");
			for (StepGuide.ItemLine i : v.getItems())
			{
				JPanel card = card();
				card.add(text(i.getTitle(), regular(), TEXT));
				card.add(text(i.getStatus(), small(), StepGuide.color(i.getHave())));
				if (i.getWhere() != null && !GuideList.got(i))
				{
					card.add(text("Where to get it: " + i.getWhere(), small(), MUTED));
				}
				// As in the in-game list: the place number may not be in the shown list, then there is simply no button (it used to crash).
				StepGuide.PlaceLine p = placeFor(v, i);
				if (p != null && !GuideList.got(i))
				{
					card.add(p.isActive() ? text("● Arrow points here", small(), GOOD)
						: button("Go here", () -> actions.go(i.getPlace())));
				}
				add(card);
			}
		}
		if (v.getNext() != null)
		{
			header("Next");
			JPanel card = card();
			card.add(text(v.getNext(), regular(), GOOD));
			add(card);
		}
		if (!v.getPlaces().isEmpty())
		{
			// As in the on-screen game list: "Where to go" is the step's point, where the quest's items and NPCs are.
			header("Where to go");
			for (StepGuide.PlaceLine p : v.getPlaces())
			{
				JPanel card = card();
				card.add(text(p.getLabel(), regular(), TEXT));
				// As in the in-game list: we label NPCs at places without items (places with items are labelled by the item).
				if (p.getNpc() != null && !p.isItems() && !p.getLabel().toLowerCase().contains(p.getNpc().toLowerCase()))
				{
					card.add(text("NPC: " + p.getNpc(), small(), MUTED));
				}
				card.add(p.isActive() ? text("● Arrow points here", small(), GOOD)
					: button("Go here", () -> actions.go(p.getIndex())));
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
	 * The panel fonts are like the plates in the game (OverlayText.font): the RuneScape fonts lack some symbols, and without the replacement
	 * letters went in a small pixel font and symbols in a large system one in one line.
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

	/** The text width: the RuneLite panel is 225 points minus the panel and card margins. */
	static final int TEXT_WIDTH = PluginPanel.PANEL_WIDTH - 16 - 12;

	/**
	 * Text with word wrapping, as a label, with no frame or cursor. A JTextArea, not a JLabel with HTML: HTML takes the
	 * font by name and loses the substitution RuneLite does for its own fonts. The width is set
	 * in advance, otherwise in a vertical row the wrapping is computed by one long line.
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

	private static BufferedImage mapIcon;

	/** The world map marker: a gold circle with an arrow, visible on land and on water. */
	static synchronized BufferedImage mapIcon()
	{
		if (mapIcon != null)
		{
			return mapIcon;
		}
		BufferedImage img = new BufferedImage(20, 20, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g.setColor(new Color(20, 20, 20));
		g.fillOval(0, 0, 20, 20);
		g.setColor(OsrsPathHudOverlay.TITLE);
		g.fillOval(2, 2, 16, 16);
		g.setColor(new Color(20, 20, 20));
		g.fillPolygon(ArrowGeometry.arrow(10, 10, 6.5, -Math.PI / 2));
		g.dispose();
		mapIcon = img;
		return img;
	}

	/** The place the item leads to; null means the number is not in the shown list of places (that is how the panel crashed in a live game). */
	static StepGuide.PlaceLine placeFor(StepGuide.View v, StepGuide.ItemLine i)
	{
		return i.getPlace() >= 0 && i.getPlace() < v.getPlaces().size() ? v.getPlaces().get(i.getPlace()) : null;
	}

	/** The side-panel button icon: an arrow like the big arrow in the game. */
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
