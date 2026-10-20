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
import java.awt.geom.RoundRectangle2D;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
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
 * Collapsed (the default): the current action, one status line, a progress strip when there is progress, "Then: ..." when something comes first, and at most
 * one warning. A click on the header (or its chevron) opens the details on the same card: the route step in full, how to do the action, the preparation,
 * what comes next and, on request, "More advice". The open or closed choice is saved (the hidden setting hudExpanded) and is never changed by the mouse
 * passing over the card or by a state update.
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
	static final int WIDTH = 300;
	static final int MIN_WIDTH = 240;
	static final int MAX_WIDTH = 420;
	/** The secondary text and the headline, as a share of the body text size. */
	static final float SMALL = 0.9f;
	static final float HEAD = 1.14f;
	/** The open card takes at most this share of the window height; the rest is in the side panel. */
	static final double MAX_HEIGHT_SHARE = 0.6;
	static final int PAD_X = 10;
	static final int PAD_TOP = 9;
	static final int PAD_BOTTOM = 9;
	static final int ICON = 12;
	static final int ICON_GAP = 7;
	static final int CHEVRON = 10;
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
	static final Color BORDER = new Color(64, 74, 92);
	static final Color RULE = new Color(255, 255, 255, 26);
	static final Color HOVER = new Color(255, 255, 255, 24);
	static final Color TRACK = new Color(255, 255, 255, 36);
	/** For how long after the last frame a click still counts against the card: hidden for longer, clicks go to the game. */
	private static final long FRESH_NANOS = 500_000_000L;

	/** What a row of the card is, for drawing. */
	enum Part
	{
		HEADER, STATUS, PROGRESS, THEN, WARNING, STEP, LABEL, LINE, MORE, RULE
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
		setMinimumSize(MIN_WIDTH);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		HudModel.Card card = plugin.getHudCard();
		if (card == null || !config.showGuide() || client.getGameState() != GameState.LOGGED_IN)
		{
			hits = Hits.NONE;
			plugin.guideShown(false);
			return null;
		}
		Graphics2D own = (Graphics2D) g.create();
		try
		{
			own.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			own.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
			own.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			boolean expanded = expanded(config.hudExpanded(), config.smartOverlays(), plugin.overlayContext());
			float scale = config.hudLarge() ? Hud.LARGE : 1f;
			Font font = GuideFont.font(scale);
			Font small = GuideFont.font(scale * SMALL);
			Font head = GuideFont.font(scale * HEAD);
			int width = width(Hud.panelWidth(this, Math.round(WIDTH * scale)), scale);
			int maxHeight = Math.max(160, (int) (client.getCanvasHeight() * MAX_HEIGHT_SHARE));
			boolean advice = plugin.isAdviceOpen();
			Object key = Arrays.asList(card, expanded, advice, width, font, maxHeight);
			if (!key.equals(builtFor))
			{
				layout = layout(card, expanded, advice, own, font, small, head, width, maxHeight);
				builtFor = key;
				plugin.uiShown("hud", card.plain(expanded, advice));
			}
			Row under = under(layout);
			paint(own, layout, under, config.hudOpacity());
			remember(layout);
			paintTooltip(own, layout, under, small);
			plugin.guideShown(true);
			return layout.getSize();
		}
		finally
		{
			own.dispose();
		}
	}

	/**
	 * Whether the card is drawn open: the player's choice (the header click), except at the exchange and, with the smart reveal, while travelling, where it
	 * stays closed for the moment. That does not change the saved choice, and nothing but the player opens the card.
	 */
	static boolean expanded(boolean chosen, boolean smart, SmartView.Context context)
	{
		return chosen && !(SmartView.exchangeFocus(context) || smart && SmartView.compactHud(context));
	}

	/** The player's width (Alt-stretched) kept within the limits, scaled with the text. */
	static int width(int wanted, float scale)
	{
		return Math.max(Math.round(MIN_WIDTH * scale), Math.min(Math.round(MAX_WIDTH * scale), wanted));
	}

	// ------------------------------------------------------------------------------------------------------------
	// Layout: pure, so a test lays the card out with the real fonts and checks every row is inside it.

	static Layout layout(HudModel.Card c, boolean expanded, boolean adviceOpen, Graphics2D g, Font font, Font small, Font head, int width, int maxHeight)
	{
		FontMetrics fm = GuideFont.metrics(g, font);
		FontMetrics sm = GuideFont.metrics(g, small);
		FontMetrics hm = GuideFont.metrics(g, head);
		List<Row> rows = new ArrayList<>();
		Color accent = accent(c);
		int textX = PAD_X + ICON + ICON_GAP;
		int headW = width - textX - PAD_X - CHEVRON - 6;
		int y = PAD_TOP;
		List<String> wrapped = OverlayText.wrap(c.getHeadline(), hm, headW);
		List<String> headline = clip(wrapped, HEAD_LINES, hm, headW);
		int h = headline.size() * hm.getHeight();
		String toggle = expanded ? "Click to close the details." : "Click for the details: the route step, how, what to prepare, what comes next.";
		rows.add(new Row(Part.HEADER, new Rectangle(2, 2, width - 4, y + h - 2), textX, headline, null, head, TEXT, c.getIcon(), accent,
			GuideList.Action.TOGGLE, headline == wrapped ? toggle : c.getHeadline() + ". " + toggle));
		y += h;
		int bodyW = width - textX - PAD_X;
		if (c.getStatus() != null)
		{
			List<String> st = clip(OverlayText.wrap(c.getStatus(), sm, bodyW), 2, sm, bodyW);
			rows.add(new Row(Part.STATUS, new Rectangle(textX, y, bodyW, st.size() * sm.getHeight()), textX, st, null, small,
				c.getTone() == HudModel.Tone.TEXT ? MUTED : TEXT, HudModel.Icon.NONE, null, GuideList.Action.NONE, null));
			y += st.size() * sm.getHeight();
		}
		if (c.getProgress() != null)
		{
			y += 5;
			rows.add(new Row(Part.PROGRESS, new Rectangle(textX, y, bodyW, 4), textX, Collections.emptyList(), null, small, accent, HudModel.Icon.NONE,
				null, GuideList.Action.NONE, null));
			y += 4;
		}
		if (c.getThen() != null)
		{
			y += 3;
			List<String> th = clip(OverlayText.wrap(c.getThen(), sm, bodyW), 2, sm, bodyW);
			rows.add(new Row(Part.THEN, new Rectangle(textX, y, bodyW, th.size() * sm.getHeight()), textX, th, null, small, MUTED, HudModel.Icon.NONE,
				null, GuideList.Action.NONE, null));
			y += th.size() * sm.getHeight();
		}
		if (c.getWarning() != null)
		{
			y += 8;
			HudModel.Line w = c.getWarning();
			int wx = PAD_X + ICON + ICON_GAP;
			int ww = width - wx - PAD_X - 4;
			List<String> wl = clip(OverlayText.wrap(w.getText(), sm, ww), 3, sm, ww);
			int wh = wl.size() * sm.getHeight() + 10;
			rows.add(new Row(Part.WARNING, new Rectangle(PAD_X - 4, y, width - 2 * PAD_X + 8, wh), wx, wl, null, small, TEXT, w.getIcon(), toneColor(w.getTone()),
				GuideList.Action.NONE, w.getHint()));
			y += wh;
		}
		if (expanded)
		{
			y = details(rows, c, adviceOpen, fm, sm, font, small, width, y, maxHeight);
		}
		y += PAD_BOTTOM;
		return new Layout(Collections.unmodifiableList(rows), new Dimension(width, y), c.getProgress(), c.getSegments(), accent,
			c.getWarning() == null ? null : c.getWarning().getTone());
	}

	/** The open card's sections, cut short (with a pointer to the side panel) when they would pass maxHeight. */
	private static int details(List<Row> rows, HudModel.Card c, boolean adviceOpen, FontMetrics fm, FontMetrics sm, Font font, Font small, int width, int y,
		int maxHeight)
	{
		int inner = width - 2 * PAD_X;
		y += 8;
		rows.add(new Row(Part.RULE, new Rectangle(PAD_X, y, inner, 1), PAD_X, Collections.emptyList(), null, small, RULE, HudModel.Icon.NONE, null,
			GuideList.Action.NONE, null));
		y += 7;
		List<Part> parts = new ArrayList<>();
		List<HudModel.Line> lines = new ArrayList<>();
		if (c.getStep() != null)
		{
			parts.add(Part.STEP);
			lines.add(HudModel.Line.small(HudModel.Icon.NONE, c.getStep(), HudModel.Tone.MUTED));
		}
		for (HudModel.Line l : c.getNow())
		{
			parts.add(Part.LINE);
			lines.add(l);
		}
		section(parts, lines, "Prepare", c.getPrepare());
		section(parts, lines, "Next", c.getNext());
		if (!c.getAdvice().isEmpty())
		{
			parts.add(Part.MORE);
			lines.add(new HudModel.Line(HudModel.Icon.MORE, "More advice · " + c.adviceCount(), null, HudModel.Tone.LINK, true, GuideList.Action.MORE,
				adviceOpen ? "Click to hide the optional advice." : "Click for the optional advice: stops on the way, gear, weight, cleanup."));
			if (adviceOpen)
			{
				for (HudModel.Line l : c.getAdvice())
				{
					parts.add(Part.LINE);
					lines.add(l);
				}
			}
		}
		for (int i = 0; i < lines.size(); i++)
		{
			Part part = parts.get(i);
			Row r = lineRow(part, lines.get(i), fm, sm, font, small, width, y + (part == Part.LABEL || part == Part.MORE ? 6 : 0));
			int bottom = r.getBox().y + r.getBox().height;
			// The row must leave room for the pointer to the side panel, unless it is the last of all.
			boolean last = i == lines.size() - 1;
			if (bottom + PAD_BOTTOM + (last ? 0 : 2 * sm.getHeight() + 8) > maxHeight)
			{
				Row more = lineRow(Part.LINE, HudModel.Line.small(HudModel.Icon.DOT, "More in the OSRS Path panel on the right", HudModel.Tone.MUTED), fm, sm, font,
					small, width, y + 2);
				rows.add(more);
				return more.getBox().y + more.getBox().height;
			}
			rows.add(r);
			y = bottom + (part == Part.STEP ? 4 : 2);
		}
		return y;
	}

	private static void section(List<Part> parts, List<HudModel.Line> lines, String label, List<HudModel.Line> section)
	{
		if (section.isEmpty())
		{
			return;
		}
		parts.add(Part.LABEL);
		lines.add(HudModel.Line.small(HudModel.Icon.NONE, label, HudModel.Tone.MUTED));
		for (HudModel.Line l : section)
		{
			parts.add(Part.LINE);
			lines.add(l);
		}
	}

	private static Row lineRow(Part part, HudModel.Line l, FontMetrics fm, FontMetrics sm, Font font, Font small, int width, int y)
	{
		boolean isSmall = l.isSmall() || part != Part.LINE;
		FontMetrics m = isSmall ? sm : fm;
		boolean icon = l.getIcon() != HudModel.Icon.NONE;
		int textX = PAD_X + (icon ? ICON + 5 : 0);
		int rightW = l.getRight() == null ? 0 : m.stringWidth(l.getRight()) + 8;
		int textW = width - textX - PAD_X - rightW;
		int max = part == Part.STEP ? 2 : isSmall ? 3 : 2;
		List<String> wrapped = OverlayText.wrap(l.getText(), m, textW);
		List<String> texts = clip(wrapped, max, m, textW);
		int h = texts.size() * m.getHeight();
		Color color = part == Part.LABEL ? MUTED : part == Part.MORE ? LINK : toneColor(l.getTone());
		// A line cut short keeps its whole text in the hint beside the card.
		String hint = texts == wrapped || l.getHint() != null && l.getHint().startsWith(l.getText()) ? l.getHint()
			: l.getText() + (l.getHint() == null ? "" : ". " + l.getHint());
		return new Row(part, new Rectangle(PAD_X - 4, y, width - 2 * PAD_X + 8, h + 2), textX, texts, l.getRight(), isSmall ? small : font, color, l.getIcon(),
			toneColor(l.getTone()), l.getAction(), hint);
	}

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

	/** Draws the laid-out card from (0, 0), the button under the mouse highlighted. Static: a test paints it into an image. */
	static void paint(Graphics2D g, Layout l, Row hovered, int opacity)
	{
		Dimension d = l.getSize();
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		RoundRectangle2D card = new RoundRectangle2D.Float(0.5f, 0.5f, d.width - 1, d.height - 1, 9, 9);
		// Dark and nearly opaque whatever the setting says, so the text reads over snow and grass alike.
		g.setColor(new Color(FILL.getRed(), FILL.getGreen(), FILL.getBlue(), Math.max(OverlayCard.alpha(opacity), 236)));
		g.fill(card);
		g.setColor(BORDER);
		g.setStroke(new BasicStroke(1f));
		g.draw(card);
		for (Row r : l.getRows())
		{
			if (r == hovered && r.getAction().isClickable())
			{
				g.setColor(HOVER);
				Rectangle b = r.getBox();
				g.fillRoundRect(b.x, b.y, b.width, b.height, 7, 7);
			}
			paintRow(g, r, l);
		}
	}

	private static void paintRow(Graphics2D g, Row r, Layout l)
	{
		Rectangle b = r.getBox();
		FontMetrics fm = GuideFont.metrics(g, r.getFont());
		switch (r.getPart())
		{
			case RULE:
				g.setColor(RULE);
				g.fillRect(b.x, b.y, b.width, 1);
				return;
			case PROGRESS:
				paintProgress(g, b, l.getProgress() == null ? 0 : l.getProgress(), l.getSegments(), r.getColor());
				return;
			case WARNING:
			{
				Color tone = r.getIconColor();
				g.setColor(new Color(tone.getRed() / 3, tone.getGreen() / 4, tone.getBlue() / 5, 150));
				g.fillRoundRect(b.x, b.y, b.width, b.height, 7, 7);
				g.setColor(new Color(tone.getRed(), tone.getGreen(), tone.getBlue(), 170));
				g.drawRoundRect(b.x, b.y, b.width, b.height, 7, 7);
				paintIcon(g, r.getIcon(), PAD_X, b.y + 5 + (fm.getAscent() - ICON) / 2 + 1, ICON, tone);
				paintText(g, r, b.y + 5);
				return;
			}
			case HEADER:
			{
				int top = PAD_TOP;
				paintIcon(g, r.getIcon(), PAD_X, top + (fm.getAscent() - ICON) / 2 + 2, ICON, r.getIconColor());
				paintText(g, r, top);
				boolean open = r.getHint() != null && r.getHint().startsWith("Click to close");
				paintChevron(g, b.x + b.width - PAD_X + 2 - CHEVRON, top + (fm.getAscent() - CHEVRON) / 2 + 2, CHEVRON, open, MUTED);
				return;
			}
			default:
			{
				if (r.getIcon() != HudModel.Icon.NONE)
				{
					int size = ICON - 2;
					paintIcon(g, r.getIcon(), PAD_X, b.y + 1 + (fm.getAscent() - size) / 2 + 1, size, r.getIconColor());
				}
				paintText(g, r, b.y + 1);
				if (r.getRight() != null)
				{
					g.setColor(TEXT);
					GuideFont.draw(g, r.getRight(), r.getFont(), b.x + b.width - 4 - fm.stringWidth(r.getRight()), b.y + 1 + fm.getAscent());
				}
			}
		}
	}

	private static void paintText(Graphics2D g, Row r, int top)
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

	/** A thin strip: plain, or one segment per quest stage. */
	static void paintProgress(Graphics2D g, Rectangle b, double fraction, int segments, Color color)
	{
		double f = Math.max(0, Math.min(1, fraction));
		if (segments > 1)
		{
			int gap = 3;
			int done = (int) Math.round(f * segments);
			for (int i = 0; i < segments; i++)
			{
				int left = b.x + i * b.width / segments;
				int right = b.x + (i + 1) * b.width / segments - gap;
				g.setColor(i < done ? color : TRACK);
				g.fillRoundRect(left, b.y, Math.max(1, right - left), b.height, b.height, b.height);
			}
			return;
		}
		g.setColor(TRACK);
		g.fillRoundRect(b.x, b.y, b.width, b.height, b.height, b.height);
		int filled = (int) Math.round(b.width * f);
		if (filled > 0)
		{
			g.setColor(color);
			g.fillRoundRect(b.x, b.y, Math.max(b.height, filled), b.height, b.height, b.height);
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

	/** The card's small vector icons, all from the same strokes: no emoji, no font glyphs. (x, y) is the icon box's top left. */
	static void paintIcon(Graphics2D g, HudModel.Icon icon, int x, int y, int s, Color c)
	{
		if (icon == HudModel.Icon.NONE || c == null)
		{
			return;
		}
		Graphics2D k = (Graphics2D) g.create();
		try
		{
			k.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			k.setColor(c);
			k.setStroke(new BasicStroke(1.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
			float m = s / 2f;
			Path2D p = new Path2D.Float();
			switch (icon)
			{
				case QUEST:
				{
					// A small hexagon: the quest marker of the old card, smaller.
					for (int i = 0; i < 6; i++)
					{
						double a = Math.PI / 3 * i - Math.PI / 2;
						float px = (float) (x + m + Math.cos(a) * (m - 0.5));
						float py = (float) (y + m + Math.sin(a) * (m - 0.5));
						if (i == 0)
						{
							p.moveTo(px, py);
						}
						else
						{
							p.lineTo(px, py);
						}
					}
					p.closePath();
					k.draw(p);
					k.fillOval(Math.round(x + m - 1.5f), Math.round(y + m - 1.5f), 3, 3);
					return;
				}
				case TRAIN:
					// A target: what the training aims at.
					k.drawOval(x + 1, y + 1, s - 2, s - 2);
					k.fillOval(Math.round(x + m - 2), Math.round(y + m - 2), 4, 4);
					return;
				case PREPARE:
					// A bag with a handle.
					k.drawRoundRect(x + 1, y + 4, s - 2, s - 5, 3, 3);
					k.drawArc(Math.round(x + m - 3), y + 1, 6, 6, 0, 180);
					return;
				case GO:
					p.moveTo(x + 1.5f, y + m);
					p.lineTo(x + s - 2f, y + m);
					p.moveTo(x + s - 6f, y + m - 3.5f);
					p.lineTo(x + s - 2f, y + m);
					p.lineTo(x + s - 6f, y + m + 3.5f);
					k.draw(p);
					return;
				case NEXT:
					p.moveTo(x + m - 2f, y + m - 3.5f);
					p.lineTo(x + m + 1.5f, y + m);
					p.lineTo(x + m - 2f, y + m + 3.5f);
					k.draw(p);
					return;
				case BACK:
					p.moveTo(x + m + 2f, y + m - 3.5f);
					p.lineTo(x + m - 1.5f, y + m);
					p.lineTo(x + m + 2f, y + m + 3.5f);
					k.draw(p);
					return;
				case MORE:
					p.moveTo(x + m - 3.5f, y + m - 1.5f);
					p.lineTo(x + m, y + m + 2f);
					p.lineTo(x + m + 3.5f, y + m - 1.5f);
					k.draw(p);
					return;
				case CHECK:
					p.moveTo(x + 2f, y + m);
					p.lineTo(x + m - 1f, y + s - 3f);
					p.lineTo(x + s - 1.5f, y + 2.5f);
					k.draw(p);
					return;
				case MISSING:
					k.drawOval(x + 1, y + 1, s - 2, s - 2);
					k.drawLine(Math.round(x + m - 2.5f), Math.round(y + m - 2.5f), Math.round(x + m + 2.5f), Math.round(y + m + 2.5f));
					k.drawLine(Math.round(x + m + 2.5f), Math.round(y + m - 2.5f), Math.round(x + m - 2.5f), Math.round(y + m + 2.5f));
					return;
				case BANK:
					// A chest: the bank.
					k.drawRoundRect(x + 1, y + 3, s - 2, s - 5, 2, 2);
					k.drawLine(x + 1, Math.round(y + m), x + s - 1, Math.round(y + m));
					return;
				case UNKNOWN:
				{
					// A dashed circle: not checked.
					float r = m - 1;
					for (int i = 0; i < 8; i += 2)
					{
						k.drawArc(Math.round(x + m - r), Math.round(y + m - r), Math.round(2 * r), Math.round(2 * r), i * 45 + 10, 25);
					}
					return;
				}
				case WARN:
				case DANGER:
				{
					p.moveTo(x + m, y + 1f);
					p.lineTo(x + s - 0.5f, y + s - 1.5f);
					p.lineTo(x + 0.5f, y + s - 1.5f);
					p.closePath();
					if (icon == HudModel.Icon.DANGER)
					{
						k.fill(p);
						k.setColor(FILL);
					}
					else
					{
						k.draw(p);
					}
					k.fillRect(Math.round(x + m - 0.75f), y + 4, 2, Math.max(2, s - 9));
					k.fillRect(Math.round(x + m - 0.75f), y + s - 4, 2, 2);
					return;
				}
				case DOT:
					k.fillOval(Math.round(x + m - 1.5f), Math.round(y + m - 1.5f), 3, 3);
					return;
				default:
			}
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
