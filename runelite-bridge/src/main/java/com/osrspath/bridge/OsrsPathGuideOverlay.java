package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.function.Function;
import javax.inject.Inject;
import lombok.Value;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;

/**
 * The one OSRS Path HUD on the game screen (2.74.0): {@link HudModel} decides what it says, this class draws it and tells clicks where they landed.
 *
 * {@link LedgerGuide} lays the card out and paints it: closed, the current action, its status and what comes first; open, the
 * route step and one section at a time behind tabs. The open or closed choice is saved (the hidden setting hudExpanded) and is
 * never changed by the mouse passing over the card or by a state update.
 *
 * The class keeps its old name, from when it was the "What you need" card beside a second HUD plate: RuneLite saves an overlay's place and size under the
 * class name, so a player who moved the card keeps that place. A fresh layout puts the card top right, beside the minimap: clear of RuneLite's hover text
 * (top left), the chat (bottom left), the inventory (bottom right) and the middle of the game. RuneLite keeps it inside the window when the window or the
 * scaling changes, and an Alt-drag moves it or stretches its width.
 *
 * Clicks: the card is opaque, so a click on it never walks the character to whatever lies under it ({@link GuideMouse}); outside its drawn rectangle every
 * click goes to the game. It reads no keys.
 */
class OsrsPathGuideOverlay extends Overlay
{
	/** The card width in logical pixels at the normal text size; stretched with Alt, it keeps the player's width within the limits. */
	static final int MAX_WIDTH = 420;
	/** The open card takes at most this share of the window height; the rest is in the side panel. */
	static final double MAX_HEIGHT_SHARE = 0.6;
	static final int PAD_BOTTOM = 9;
	static final int ICON = 12;
	static final int HEAD_LINES = 3;

	static final Color TEXT = new Color(231, 237, 245);
	static final Color MUTED = new Color(160, 173, 191);
	static final Color LINK = GuideList.LINK;
	static final Color GOOD = new Color(110, 205, 135);
	static final Color CAUTION = new Color(240, 185, 85);
	static final Color DANGER = new Color(250, 110, 95);
	static final Color GOLD = Hud.TITLE;
	static final Color TRAIN = new Color(125, 185, 245);
	static final Color FILL = new Color(17, 23, 32);
	/** For how long after the last frame a click still counts against the card: hidden for longer, clicks go to the game. */
	private static final long FRESH_NANOS = 500_000_000L;

	/** What a row of the card is, for drawing. */
	enum Part
	{
		HEADER, STATUS, THEN, WARNING, STEP, LABEL, LINE,
		/** The Ledger card's own rows: its headline (the header row is then only the click area), a tab, the next step's footer. */
		TITLE, TAB, FOOT
	}

	/** One drawn row of the card, in the card's own coordinates. */
	@Value
	static class Row
	{
		Part part;
		/** The row's area: the hover highlight and the clicks. */
		Rectangle box;
		/** Where the text starts and its wrapped lines. */
		int textX;
		List<String> texts;
		String right;
		Font font;
		Color color;
		HudModel.Icon icon;
		Color iconColor;
		GuideList.Action action;
		String hint;
	}

	/** The card laid out for one width and state: its rows and size. */
	@Value
	static class Layout
	{
		List<Row> rows;
		Dimension size;
		Double progress;
		int segments;
		Color accent;
		HudModel.Tone warningTone;
	}

	/** Where the card and its buttons are on the canvas: a snapshot of the last frame for the mouse thread. */
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

		/** The number of the button under a point; -1 means none. */
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
	private Layout layout;
	private volatile Hits hits = Hits.NONE;

	@Inject
	OsrsPathGuideOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		super(plugin);
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.TOP_RIGHT);
		setLayer(OverlayLayer.UNDER_WIDGETS);
		setPriority(PRIORITY_LOW);
		setMovable(true);
		setResizable(true);
		setMinimumSize(LedgerGuide.MIN_WIDTH);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		long started = System.nanoTime();
		try
		{
			return draw(g);
		}
		finally
		{
			RenderCost.add(System.nanoTime() - started, true);
		}
	}

	private Dimension draw(Graphics2D g)
	{
		HudModel.Card card = plugin.getHudCard();
		if (card == null || !config.showGuide() || client.getGameState() != GameState.LOGGED_IN)
		{
			hits = Hits.NONE;
			plugin.debug.guideShown(false);
			return null;
		}
		Graphics2D own = (Graphics2D) g.create();
		try
		{
			own.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			own.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
			own.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			boolean expanded = expanded(config.hudExpanded());
			float scale = config.hudLarge() ? Hud.LARGE : 1f;
			int width = LedgerGuide.width(Hud.panelWidth(this, Math.round(LedgerGuide.WIDTH * scale)), scale);
			int maxHeight = Math.max(160, (int) (client.getCanvasHeight() * MAX_HEIGHT_SHARE));
			int tab = plugin.getHudTab();
			Object key = Arrays.asList(card, expanded, scale, width, maxHeight, tab);
			if (!key.equals(builtFor))
			{
				layout = LedgerGuide.layout(card, expanded, tab, own, scale, width, maxHeight);
				builtFor = key;
				plugin.debug.uiShown("hud", card.plain(expanded, tab == LedgerGuide.ADVICE));
			}
			Row under = under(layout);
			LedgerGuide.paint(own, layout, under, config.hudOpacity());
			remember(layout);
			paintTooltip(own, layout, under, LedgerFont.text(LedgerGuide.SMALL * scale));
			plugin.debug.guideShown(true);
			return layout.getSize();
		}
		finally
		{
			own.dispose();
		}
	}


	/**
	 * Only an explicit header choice opens the details. Travel and exchange contexts must not make that click appear to do nothing.
	 */
	static boolean expanded(boolean chosen)
	{
		return chosen;
	}

	// ------------------------------------------------------------------------------------------------------------
	// Layout: pure, so a test lays the card out with the real fonts and checks every row is inside it.

	/** A line at a side padding, coloured by a theme's inks (the Ledger page is light). */
	static Row lineRow(Part part, HudModel.Line l, FontMetrics fm, FontMetrics sm, Font font, Font small, int width, int y, int pad,
		Function<HudModel.Tone, Color> ink)
	{
		boolean isSmall = l.isSmall() || part != Part.LINE;
		FontMetrics m = isSmall ? sm : fm;
		boolean icon = l.getIcon() != HudModel.Icon.NONE;
		int textX = pad + (icon ? ICON + 5 : 0);
		int rightW = l.getRight() == null ? 0 : m.stringWidth(l.getRight()) + 8;
		int textW = width - textX - pad - rightW;
		// A warning is read whole: "Do not board the ship without it: Elvarg's fire hits…" lost the reason on the screen (2.74.14 session).
		boolean warning = l.getTone() == HudModel.Tone.CAUTION || l.getTone() == HudModel.Tone.DANGER;
		int max = part == Part.STEP ? 2 : warning ? WARNING_LINES : isSmall ? 3 : 2;
		List<String> wrapped = OverlayText.wrap(l.getText(), m, textW);
		List<String> texts = clip(wrapped, max, m, textW);
		int h = texts.size() * m.getHeight();
		Color color = ink.apply(part == Part.LABEL ? HudModel.Tone.MUTED : l.getTone());
		// A line cut short keeps its whole text in the hint beside the card.
		String hint = texts == wrapped || l.getHint() != null && l.getHint().startsWith(l.getText()) ? l.getHint()
			: l.getText() + (l.getHint() == null ? "" : ". " + l.getHint());
		return new Row(part, new Rectangle(pad - 4, y, width - 2 * pad + 8, h + 2), textX, texts, l.getRight(), isSmall ? small : font, color, l.getIcon(),
			ink.apply(l.getTone()), l.getAction(), hint);
	}

	/** A warning keeps up to this many lines: its reason is the point, and the safety texts are written to fit. */
	static final int WARNING_LINES = 7;

	/** At most max lines: the last is cut with an ellipsis, the whole text stays in the hover hint. */
	static List<String> clip(List<String> lines, int max, FontMetrics fm, int width)
	{
		if (lines.size() <= max)
		{
			return lines;
		}
		List<String> out = new ArrayList<>(lines.subList(0, max));
		String last = out.get(max - 1);
		while (!last.isEmpty() && fm.stringWidth(last + "…") > width)
		{
			last = last.substring(0, last.length() - 1).trim();
		}
		out.set(max - 1, last + "…");
		return out;
	}

	/** The headline icon's colour: what kind of moment it is. */
	static Color accent(HudModel.Card c)
	{
		if (c.getTone() == HudModel.Tone.DANGER)
		{
			return DANGER;
		}
		if (c.getTone() == HudModel.Tone.CAUTION || c.getIcon() == HudModel.Icon.PREPARE)
		{
			return CAUTION;
		}
		switch (c.getIcon())
		{
			case TRAIN:
				return TRAIN;
			case CHECK:
				return GOOD;
			case GO:
				return LINK;
			default:
				return GOLD;
		}
	}

	static Color toneColor(HudModel.Tone t)
	{
		switch (t)
		{
			case MUTED:
				return MUTED;
			case LINK:
				return LINK;
			case GOOD:
				return GOOD;
			case CAUTION:
				return CAUTION;
			case DANGER:
				return DANGER;
			default:
				return TEXT;
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// Painting.

	static void paintText(Graphics2D g, Row r, int top)
	{
		FontMetrics fm = GuideFont.metrics(g, r.getFont());
		g.setColor(r.getColor());
		int y = top + fm.getAscent();
		for (String t : r.getTexts())
		{
			GuideFont.draw(g, t, r.getFont(), r.getTextX(), y);
			y += fm.getHeight();
		}
	}

	/** The chevron of the header: down to open, up to close. */
	static void paintChevron(Graphics2D g, int x, int y, int size, boolean open, Color c)
	{
		Graphics2D k = (Graphics2D) g.create();
		try
		{
			k.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			k.setColor(c);
			k.setStroke(new BasicStroke(1.6f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
			Path2D p = new Path2D.Float();
			float m = size / 2f;
			float q = size * 0.28f;
			float dir = open ? -1 : 1;
			p.moveTo(x + m - q * 1.4f, y + m - dir * q * 0.6f);
			p.lineTo(x + m, y + m + dir * q * 0.6f);
			p.lineTo(x + m + q * 1.4f, y + m - dir * q * 0.6f);
			k.draw(p);
		}
		finally
		{
			k.dispose();
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// The mouse: hover by the previous frame, clicks by the remembered buttons.

	/**
	 * The row under the mouse by the previous frame, when it is a button or has a hint; null when there is none, the game menu is open or a game window
	 * covers the card. A button is highlighted; a hint (what a click does, a line's whole text) is shown beside the card.
	 */
	private Row under(Layout l)
	{
		net.runelite.api.Point m = freeMouse();
		if (m == null)
		{
			return null;
		}
		return rowAt(l, m.getX() - getBounds().x, m.getY() - getBounds().y);
	}

	/** The row at a point of the card: a button or a line with a hint; null for none. */
	static Row rowAt(Layout l, int x, int y)
	{
		for (Row r : l.getRows())
		{
			if ((r.getAction().isClickable() || r.getHint() != null) && r.getBox().contains(x, y))
			{
				return r;
			}
		}
		return null;
	}

	/** The mouse point, or null if there is none, the game menu is open, or a game window (bank, shop, world map) is over the card. */
	private net.runelite.api.Point freeMouse()
	{
		if (client.isMenuOpen())
		{
			return null;
		}
		net.runelite.api.Point m = client.getMouseCanvasPosition();
		if (m == null || GuideMouse.windowUnderMouse(client.getMenu().getMenuEntries())
			|| GuideMouse.mapCovers(client.getWidget(net.runelite.api.gameval.InterfaceID.Worldmap.WINDOW), new java.awt.Point(m.getX(), m.getY())))
		{
			return null;
		}
		return m;
	}

	/** The buttons on the canvas: at drawing time the card already stands in its place (getBounds). */
	private void remember(Layout l)
	{
		Rectangle at = getBounds();
		List<Rectangle> rects = new ArrayList<>();
		List<GuideList.Action> actions = new ArrayList<>();
		for (Row r : l.getRows())
		{
			if (!r.getAction().isClickable())
			{
				continue;
			}
			Rectangle b = new Rectangle(r.getBox());
			b.translate(at.x, at.y);
			rects.add(b);
			actions.add(r.getAction());
		}
		hits = new Hits(new Rectangle(at.x, at.y, l.getSize().width, l.getSize().height), rects, actions, System.nanoTime());
	}

	void setHits(Hits h)
	{
		hits = h;
	}

	/** The explanation of the row under the mouse, beside the card (it never covers the card or the line it explains). */
	private void paintTooltip(Graphics2D g, Layout l, Row r, Font small)
	{
		if (r == null || r.getHint() == null || r.getHint().trim().isEmpty())
		{
			return;
		}
		FontMetrics fm = GuideFont.metrics(g, small);
		List<String> lines = OverlayTooltip.wrap(r.getHint(), fm);
		if (lines.isEmpty())
		{
			return;
		}
		Rectangle at = getBounds();
		Rectangle canvas = new Rectangle(-at.x, -at.y, Math.max(1, client.getCanvasWidth()), Math.max(1, client.getCanvasHeight()));
		Rectangle tip = OverlayTooltip.place(new Rectangle(0, 0, l.getSize().width, l.getSize().height), r.getBox(), OverlayTooltip.size(lines, fm), canvas);
		OverlayTooltip.paint(g, tip, lines, small);
	}

	/**
	 * What is under a canvas point (mouse thread). null means not the card: the click goes to the game. Action.NONE means the card but not a button: the
	 * click must not go to the game and walk the character to whatever lies under the card.
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
}
