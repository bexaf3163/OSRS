package com.osrspath.bridge;

import com.osrspath.bridge.OsrsPathGuideOverlay.Layout;
import com.osrspath.bridge.OsrsPathGuideOverlay.Part;
import com.osrspath.bridge.OsrsPathGuideOverlay.Row;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.TexturePaint;
import java.awt.geom.Arc2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * The Ledger look of the in-game HUD (2.81.31, the owner's pick of 2026-11-01), the app's design on the game screen: a leather plaque
 * with a progress ring, the step code and a NOW stamp; opened, a parchment page behind tabs (Now, Prepare, Next, Advice) shows one
 * section at a time, with the next step as its footer. It lays the same {@link HudModel.Card} out into the classic card's rows, so the
 * clicks, the hints and the cut with a pointer to the side panel stay shared with {@link OsrsPathGuideOverlay}.
 */
final class LedgerGuide
{
	/** The plaque is wider and shorter than the classic card; never narrower than this, so the header keeps one row. */
	static final int WIDTH = 380;
	static final int MIN_WIDTH = 300;
	static final int NOW = 0, PREPARE = 1, NEXT = 2, ADVICE = 3;
	private static final String[] TABS = {"NOW", "PREPARE", "NEXT", "ADVICE"};
	private static final String[] TAB_HINTS = {
		"The step: what to do and how.",
		"What to bring, and whether it is with you.",
		"What comes after this step.",
		"Optional advice: stops on the way, gear, weight, cleanup."};

	static final Color LEATHER = new Color(42, 29, 19);
	static final Color LEATHER_DARK = new Color(22, 16, 11);
	static final Color PARCH = new Color(233, 222, 194);
	static final Color PARCH_DARK = new Color(220, 205, 171);
	static final Color INK = new Color(43, 29, 17);
	static final Color INK_SOFT = new Color(90, 70, 48);
	static final Color GOLD = new Color(201, 162, 75);
	static final Color GOLD_LIGHT = new Color(236, 209, 138);
	static final Color GOLD_DARK = new Color(123, 96, 48);
	static final Color EMBER = new Color(196, 81, 42);
	static final Color FADED = new Color(168, 152, 124);
	private static final Color GOOD = new Color(63, 125, 98);
	private static final Color CAUTION = new Color(138, 90, 16);
	private static final Color DANGER = new Color(168, 50, 28);
	static final int PAD = 12, TOP = 10, PAGE_PAD = 16;
	/** The size of the page's and the hints' text at the normal scale. */
	static final float SMALL = 14.5f;
	private static final TexturePaint GRAIN = grain();

	private LedgerGuide()
	{
	}

	/** The player's width (Alt-stretched), kept within the plaque's limits. */
	static int width(int wanted, float scale)
	{
		return Math.max(Math.round(MIN_WIDTH * scale), Math.min(Math.round(OsrsPathGuideOverlay.MAX_WIDTH * scale), wanted));
	}

	/** The page's inks: the same tones as the classic card, dark on parchment. */
	static Color ink(HudModel.Tone t)
	{
		switch (t)
		{
			case MUTED: return INK_SOFT;
			case LINK: return EMBER;
			case GOOD: return GOOD;
			case CAUTION: return CAUTION;
			case DANGER: return DANGER;
			default: return INK;
		}
	}

	// ---------------------------------------------------------------------------------------------------------------------------------
	// Layout: pure, so a test lays the plaque out with the real fonts and checks every row is inside it.

	static Layout layout(HudModel.Card c, boolean expanded, int tab, Graphics2D g, float scale, int width, int maxHeight)
	{
		Font title = LedgerFont.display(16f * scale), body = LedgerFont.text(15.5f * scale), small = LedgerFont.text(SMALL * scale);
		Font label = LedgerFont.label(9f * scale), step = LedgerFont.display(13.5f * scale);
		FontMetrics tm = GuideFont.metrics(g, title), fm = GuideFont.metrics(g, body), sm = GuideFont.metrics(g, small), stm = GuideFont.metrics(g, step);
		List<Row> rows = new ArrayList<>();
		int ring = ring(scale), x0 = PAD + ring + 12, y = TOP;

		// The step code and the NOW stamp sit right of the headline, or stacked under the ring when the plaque is too narrow for both,
		// so the headline keeps its width and the closed plaque gets no taller.
		String code = code(c.getStep());
		int codeW = LedgerFont.advance(g, code, label) + 8 + stamp(g, label), labelH = Math.round(14 * scale);
		boolean under = width - x0 - codeW - 38 < Math.round(150 * scale);
		int headW = width - x0 - (under ? 30 : codeW + 38);
		Rectangle at = under ? new Rectangle(PAD, TOP + ring + 6, x0 - PAD - 6, 2 * labelH + 4) : new Rectangle(width - 34 - codeW, y + 1, codeW, labelH);
		rows.add(new Row(Part.LABEL, at, at.x, Collections.singletonList(code), null, label, GOLD, HudModel.Icon.NONE, null, GuideList.Action.NONE, null));
		List<String> wrapped = OverlayText.wrap(c.getHeadline(), tm, headW);
		List<String> headline = OsrsPathGuideOverlay.clip(wrapped, OsrsPathGuideOverlay.HEAD_LINES, tm, headW);
		rows.add(new Row(Part.TITLE, new Rectangle(x0, y, headW, headline.size() * tm.getHeight()), x0, headline, null, title, GOLD_LIGHT,
			c.getIcon(), GOLD_LIGHT, GuideList.Action.NONE, null));
		y += headline.size() * tm.getHeight();
		if (c.getStatus() != null)
		{
			int sw = width - x0 - PAD;
			List<String> st = OsrsPathGuideOverlay.clip(OverlayText.wrap(c.getStatus(), sm, sw), 2, sm, sw);
			rows.add(new Row(Part.STATUS, new Rectangle(x0, y, sw, st.size() * sm.getHeight()), x0, st, null, small, PARCH_DARK, HudModel.Icon.NONE,
				null, GuideList.Action.NONE, null));
			y += st.size() * sm.getHeight();
		}
		y = Math.max(y, under ? at.y + at.height : TOP + ring) + 4;
		String toggle = expanded ? "Click to close the details." : "Click for the details: the step, how to prepare, what comes next.";
		rows.add(0, new Row(Part.HEADER, new Rectangle(2, 2, width - 4, y - 4), x0, Collections.emptyList(), null, title, GOLD_LIGHT, c.getIcon(),
			GOLD_LIGHT, GuideList.Action.TOGGLE, headline == wrapped ? toggle : c.getHeadline() + ". " + toggle));

		if (c.getThen() != null && !(expanded && c.thenInNext()))
		{
			int lw = LedgerFont.advance(g, "THEN", label) + 8, tw = width - x0 - lw - PAD;
			List<String> th = OsrsPathGuideOverlay.clip(OverlayText.wrap(then(c), sm, tw), 2, sm, tw);
			rows.add(new Row(Part.THEN, new Rectangle(x0, y, width - x0 - PAD, th.size() * sm.getHeight()), x0 + lw, th, null, small, FADED,
				HudModel.Icon.NONE, null, GuideList.Action.NONE, null));
			y += th.size() * sm.getHeight() + 4;
		}
		if (c.getWarning() != null)
		{
			HudModel.Line w = c.getWarning();
			int tx = PAD + Math.round(20 * scale) + 10, ww = width - tx - PAD;
			List<String> wl = OsrsPathGuideOverlay.clip(OverlayText.wrap(w.getText(), fm, ww), OsrsPathGuideOverlay.WARNING_LINES, fm, ww);
			int wh = wl.size() * fm.getHeight() + 10;
			rows.add(new Row(Part.WARNING, new Rectangle(0, y, width, wh), tx, wl, null, body, PARCH, w.getIcon(), OsrsPathGuideOverlay.toneColor(w.getTone()),
				GuideList.Action.NONE, w.getHint()));
			y += wh;
		}
		if (expanded) y = page(rows, c, tab, g, scale, width, y + (c.getWarning() == null ? 0 : 6), maxHeight, fm, sm, stm, body, small, step);
		else if (c.getWarning() == null) y += 4;
		HudModel.Tone warningTone = c.getWarning() == null ? null : c.getWarning().getTone();
		return new Layout(Collections.unmodifiableList(rows), new Dimension(width, y), c.getProgress(), c.getSegments(), OsrsPathGuideOverlay.accent(c),
			warningTone);
	}

	/** The tabs and the open tab's page, cut short (with a pointer to the side panel) when it would pass maxHeight. */
	private static int page(List<Row> rows, HudModel.Card c, int tab, Graphics2D g, float scale, int width, int y, int maxHeight, FontMetrics fm,
		FontMetrics sm, FontMetrics stm, Font body, Font small, Font step)
	{
		List<Integer> tabs = new ArrayList<>();
		tabs.add(NOW);
		if (!c.getPrepare().isEmpty()) tabs.add(PREPARE);
		if (!c.getNext().isEmpty()) tabs.add(NEXT);
		if (c.adviceCount() > 0) tabs.add(ADVICE);
		int active = tabs.contains(tab) ? tab : NOW;
		Font tf = LedgerFont.label(10f * scale);
		int th = Math.round(28 * scale), inner = width - 20, n = tabs.size();
		// The open tab is wide enough for its icon, name and badge; the others share the rest and show their icon.
		int activeW = n == 1 ? inner : Math.min(inner - (n - 1) * Math.round(34 * scale), tabContent(g, TABS[active], badge(c, active), tf, scale, true) + 20);
		int restW = n == 1 ? 0 : (inner - activeW) / (n - 1);
		int x = 10;
		for (int k : tabs)
		{
			int tw = k == active ? activeW : restW;
			rows.add(new Row(Part.TAB, new Rectangle(x, y, tw, th), x, Collections.singletonList(TABS[k]), badge(c, k), tf, k == active ? INK : GOLD,
				tabIcon(k), k == active ? INK_SOFT : GOLD, k == active ? GuideList.Action.NONE : GuideList.Action.tab(k), TAB_HINTS[k]));
			x += tw;
		}
		y += th + 12;

		List<Part> parts = new ArrayList<>();
		List<HudModel.Line> lines = new ArrayList<>();
		if (active == NOW)
		{
			String rest = rest(c.getStep());
			if (rest != null)
			{
				parts.add(Part.STEP);
				lines.add(HudModel.Line.small(HudModel.Icon.NONE, rest, HudModel.Tone.MUTED));
			}
		}
		for (HudModel.Line l : active == NOW ? c.getNow() : active == PREPARE ? c.getPrepare() : active == NEXT ? c.getNext() : c.getAdvice())
		{
			parts.add(Part.LINE);
			lines.add(l);
		}
		boolean footer = active == NOW && !c.getNext().isEmpty();
		int fh = Math.round(30 * scale);
		for (int i = 0; i < lines.size(); i++)
		{
			Part part = parts.get(i);
			Row r = OsrsPathGuideOverlay.lineRow(part, lines.get(i), fm, part == Part.STEP ? stm : sm, body, part == Part.STEP ? step : small, width, y,
				PAGE_PAD, LedgerGuide::ink);
			int bottom = r.getBox().y + r.getBox().height;
			boolean last = i == lines.size() - 1;
			if (bottom + OsrsPathGuideOverlay.PAD_BOTTOM + (last ? (footer ? fh + 4 : 0) : 2 * sm.getHeight() + 8) > maxHeight)
			{
				Row more = OsrsPathGuideOverlay.lineRow(Part.LINE, HudModel.Line.small(HudModel.Icon.DOT, "More in the OSRS Path panel on the right",
					HudModel.Tone.MUTED), fm, sm, body, small, width, y + 2, PAGE_PAD, LedgerGuide::ink);
				rows.add(more);
				return more.getBox().y + more.getBox().height + 10;
			}
			rows.add(r);
			y = bottom + (part == Part.STEP ? 10 : 2);
		}
		y += 8;
		if (footer)
		{
			// The first line the page does not already show: on a detour the next line is the step's own activity, titled like the step.
			String shown = rest(c.getStep());
			HudModel.Line next = c.getNext().stream().filter(l -> !l.getText().equalsIgnoreCase(shown)).findFirst().orElse(c.getNext().get(0));
			int tx = PAGE_PAD + 14 + LedgerFont.advance(g, "NEXT", LedgerFont.label(9f * scale)) + 10, tw = width - tx - PAGE_PAD;
			List<String> wrapped = OverlayText.wrap(next.getText(), fm, tw);
			List<String> one = OsrsPathGuideOverlay.clip(wrapped, 1, fm, tw);
			rows.add(new Row(Part.FOOT, new Rectangle(0, y, width, fh), tx, one, null, body, INK, HudModel.Icon.NEXT, EMBER, GuideList.Action.tab(NEXT),
				(one == wrapped ? "" : next.getText() + ". ") + "Click for what comes next."));
			y += fh;
		}
		return y + 2;
	}

	static int ring(float scale)
	{
		return Math.round(38 * scale);
	}

	private static int stamp(Graphics2D g, Font label)
	{
		return LedgerFont.advance(g, "NOW", label) + 12;
	}

	/** The width of a tab's icon, name (when shown) and badge. */
	private static int tabContent(Graphics2D g, String name, String badge, Font tf, float scale, boolean named)
	{
		return Math.round(14 * scale) + (named ? 7 + LedgerFont.advance(g, name, tf) : 0) + (badge == null ? 0 : Math.round(22 * scale));
	}

	private static HudModel.Icon tabIcon(int k)
	{
		return k == NOW ? HudModel.Icon.TRAIN : k == PREPARE ? HudModel.Icon.PREPARE : k == NEXT ? HudModel.Icon.GO : HudModel.Icon.NONE;
	}

	/** Prepare: "ok" when nothing is missing, else how many lines want something; Advice: how many; others none. */
	static String badge(HudModel.Card c, int tab)
	{
		if (tab == ADVICE) return String.valueOf(c.adviceCount());
		if (tab != PREPARE) return null;
		int missing = 0;
		for (HudModel.Line l : c.getPrepare())
		{
			if (l.getIcon() == HudModel.Icon.MISSING || l.getTone() == HudModel.Tone.DANGER || l.getTone() == HudModel.Tone.CAUTION) missing++;
		}
		return missing == 0 ? "ok" : String.valueOf(missing);
	}

	static String code(String step)
	{
		int i = step == null ? -1 : step.indexOf(" · ");
		return i < 0 ? "NOW" : step.substring(0, i);
	}

	static String rest(String step)
	{
		if (step == null) return null;
		int i = step.indexOf(" · ");
		return i < 0 ? step : step.substring(i + 3);
	}

	/** The THEN label says it, so the line drops its own "Then: ". */
	static String then(HudModel.Card c)
	{
		return c.getThen().replaceFirst("^Then: ", "");
	}

	// ---------------------------------------------------------------------------------------------------------------------------------
	// Painting.

	private static BufferedImage drawn;
	private static Layout drawnLayout;
	private static Row drawnHover;
	private static int drawnOpacity;

	/**
	 * Draws the laid-out plaque from (0, 0), the button under the mouse highlighted. The leather, the gradients and the spaced labels cost
	 * about three times the classic card per frame, and the plaque only changes with its layout, the hover or the opacity, so it is
	 * drawn once into an image and that image is copied every frame. Only the client thread paints.
	 */
	static void paint(Graphics2D g, Layout l, Row hovered, int opacity)
	{
		if (drawn == null || l != drawnLayout || hovered != drawnHover || opacity != drawnOpacity)
		{
			BufferedImage img = new BufferedImage(l.getSize().width, l.getSize().height, BufferedImage.TYPE_INT_ARGB);
			Graphics2D c = img.createGraphics();
			try
			{
				c.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
				c.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
				draw(c, l, hovered, opacity);
			}
			finally
			{
				c.dispose();
			}
			drawn = img;
			drawnLayout = l;
			drawnHover = hovered;
			drawnOpacity = opacity;
		}
		g.drawImage(drawn, 0, 0, null);
	}

	private static void draw(Graphics2D g, Layout l, Row hovered, int opacity)
	{
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		int w = l.getSize().width, h = l.getSize().height, a = Math.max(OverlayCard.alpha(opacity), 236);
		float scale = layoutScale(l);
		Shape card = new RoundRectangle2D.Float(0.5f, 0.5f, w - 1, h - 1, 12, 12);
		g.setPaint(new GradientPaint(0, 0, alpha(LEATHER, a), 0, 110, alpha(LEATHER_DARK, a)));
		g.fill(card);
		Shape clip = g.getClip();
		g.clip(card);
		g.setPaint(GRAIN);
		g.fillRect(0, 0, w, h);
		int pageTop = -1;
		for (Row r : l.getRows()) if (r.getPart() == Part.TAB && pageTop < 0) pageTop = r.getBox().y + r.getBox().height;
		if (pageTop >= 0)
		{
			g.setPaint(new GradientPaint(0, pageTop, PARCH, 0, h, PARCH_DARK));
			g.fillRect(0, pageTop, w, h - pageTop);
		}
		Row prev = null;
		for (Row r : l.getRows())
		{
			paintRow(g, r, r == hovered, prev, scale);
			prev = r;
		}
		g.setClip(clip);
		paintRing(g, PAD, TOP, ring(scale), l, scale);
		OsrsPathGuideOverlay.paintChevron(g, w - 22, TOP + 4, Math.round(10 * scale), pageTop >= 0, GOLD);
		g.setColor(new Color(201, 162, 75, 45));
		g.draw(new RoundRectangle2D.Float(3.5f, 3.5f, w - 7, h - 7, 9, 9));
		g.setColor(GOLD_DARK);
		g.setStroke(new BasicStroke(1f));
		g.draw(card);
	}

	/** The scale the plaque was laid out at, read back from where the headline starts (right of the ring). */
	private static float layoutScale(Layout l)
	{
		for (Row r : l.getRows()) if (r.getPart() == Part.TITLE) return (r.getTextX() - PAD - 12) / 38f;
		return 1f;
	}

	private static void paintRow(Graphics2D g, Row r, boolean hovered, Row prev, float scale)
	{
		Rectangle b = r.getBox();
		switch (r.getPart())
		{
			case HEADER:
				if (hovered)
				{
					g.setColor(new Color(255, 236, 200, 14));
					g.fillRoundRect(b.x, b.y, b.width, b.height, 9, 9);
				}
				return;
			case LABEL:
			{
				Font f = r.getFont();
				String code = r.getTexts().get(0);
				int cw = LedgerFont.advance(g, code, f), sw = LedgerFont.advance(g, "NOW", f) + 12, sh = Math.round(14 * scale);
				// Stacked under the ring when the row is too narrow for the code and the stamp side by side.
				boolean stacked = b.width < cw + 8 + sw;
				int cx = stacked ? b.x + (b.width - cw) / 2 : b.x, sx = stacked ? b.x + (b.width - sw) / 2 : b.x + cw + 8, sy = stacked ? b.y + sh + 4 : b.y;
				LedgerFont.draw(g, code, f, GOLD, cx, b.y + Math.round(10 * scale));
				g.setColor(EMBER);
				g.fillRect(sx, sy, sw, sh);
				g.setColor(new Color(255, 230, 200, 60));
				g.drawRect(sx + 1, sy + 1, sw - 3, sh - 3);
				LedgerFont.draw(g, "NOW", f, PARCH, sx + 6, sy + Math.round(10 * scale));
				return;
			}
			case THEN:
				LedgerFont.draw(g, "THEN", LedgerFont.label(9f * scale), GOLD, b.x, b.y + GuideFont.metrics(g, r.getFont()).getAscent() - 1);
				OsrsPathGuideOverlay.paintText(g, r, b.y);
				return;
			case WARNING:
				paintWarning(g, r, scale);
				return;
			case TAB:
				paintTab(g, r, hovered, prev, scale);
				return;
			case FOOT:
			{
				g.setColor(hovered ? new Color(212, 195, 158) : PARCH_DARK);
				g.fillRect(b.x, b.y, b.width, b.height);
				g.setColor(new Color(123, 96, 48, 80));
				g.fillRect(b.x, b.y, b.width, 1);
				FontMetrics fm = GuideFont.metrics(g, r.getFont());
				int top = b.y + (b.height - fm.getHeight()) / 2;
				HudIcons.paint(g, HudModel.Icon.NEXT, PAGE_PAD - 2, b.y + (b.height - 12) / 2, 12, EMBER);
				LedgerFont.draw(g, "NEXT", LedgerFont.label(9f * scale), EMBER, PAGE_PAD + 14, top + fm.getAscent() - 1);
				OsrsPathGuideOverlay.paintText(g, r, top);
				return;
			}
			case STEP:
			{
				OsrsPathGuideOverlay.paintText(g, r, b.y + 1);
				int y = b.y + b.height + 3;
				g.setColor(new Color(123, 96, 48, 110));
				g.fillRect(PAGE_PAD, y, 26, 1);
				diamond(g, PAGE_PAD + 30, y, GOLD_DARK);
				return;
			}
			case TITLE:
			case STATUS:
				OsrsPathGuideOverlay.paintText(g, r, b.y);
				return;
			default:
			{
				if (hovered)
				{
					g.setColor(new Color(43, 29, 17, 22));
					g.fillRoundRect(b.x, b.y, b.width, b.height, 7, 7);
				}
				FontMetrics fm = GuideFont.metrics(g, r.getFont());
				if (r.getIcon() != HudModel.Icon.NONE)
				{
					int size = r.getFont().getSize() < 14 ? OsrsPathGuideOverlay.ICON - 2 : OsrsPathGuideOverlay.ICON;
					HudIcons.paint(g, r.getIcon(), b.x + 4, b.y + 1 + (fm.getAscent() - size) / 2 + 1, size, r.getIconColor());
				}
				OsrsPathGuideOverlay.paintText(g, r, b.y + 1);
				if (r.getRight() != null)
				{
					g.setColor(INK_SOFT);
					GuideFont.draw(g, r.getRight(), r.getFont(), b.x + b.width - 4 - fm.stringWidth(r.getRight()), b.y + 1 + fm.getAscent());
				}
			}
		}
	}

	private static void paintWarning(Graphics2D g, Row r, float scale)
	{
		Rectangle b = r.getBox();
		boolean danger = r.getIconColor() != null && r.getIconColor().equals(OsrsPathGuideOverlay.DANGER);
		g.setPaint(new GradientPaint(0, b.y, danger ? new Color(176, 67, 42) : new Color(154, 114, 40), 0, b.y + b.height,
			danger ? new Color(122, 34, 20) : new Color(110, 80, 24)));
		g.fillRect(b.x, b.y, b.width, b.height);
		g.setColor(new Color(255, 220, 180, 50));
		g.fillRect(b.x, b.y, b.width, 1);
		int d = Math.round(20 * scale), cx = PAD + d / 2, cy = b.y + b.height / 2;
		g.setColor(PARCH);
		g.fillOval(PAD, cy - d / 2, d, d);
		g.setColor(danger ? new Color(156, 50, 32) : new Color(138, 100, 32));
		g.setStroke(new BasicStroke(2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
		g.drawLine(cx, cy - d / 4, cx, cy + 1);
		g.fillOval(cx - 1, cy + d / 4 - 1, 3, 3);
		g.setStroke(new BasicStroke(1f));
		OsrsPathGuideOverlay.paintText(g, r, b.y + 5);
	}

	private static void paintTab(Graphics2D g, Row r, boolean hovered, Row prev, float scale)
	{
		Rectangle b = r.getBox();
		boolean on = r.getColor().equals(INK);
		if (on)
		{
			g.setColor(PARCH);
			g.fill(new RoundRectangle2D.Float(b.x, b.y, b.width, b.height + 10, 10, 10));
		}
		else
		{
			if (hovered)
			{
				g.setColor(new Color(201, 162, 75, 34));
				g.fill(new RoundRectangle2D.Float(b.x + 2, b.y + 2, b.width - 4, b.height - 4, 8, 8));
			}
			if (prev != null && prev.getPart() == Part.TAB && !prev.getColor().equals(INK))
			{
				g.setColor(new Color(201, 162, 75, 60));
				g.fillRect(b.x, b.y + 8, 1, b.height - 16);
			}
		}
		String name = r.getTexts().get(0);
		int content = tabContent(g, name, r.getRight(), r.getFont(), scale, on);
		int icon = Math.round(14 * scale), x = b.x + (b.width - content) / 2, cy = b.y + b.height / 2 + (on ? 1 : 2);
		if (r.getIcon() == HudModel.Icon.NONE) sparkle(g, x + icon / 2, cy, icon / 2, r.getIconColor());
		else HudIcons.paint(g, r.getIcon(), x, cy - icon / 2, icon, r.getIconColor());
		x += icon;
		if (on)
		{
			FontMetrics fm = GuideFont.metrics(g, r.getFont());
			x += 7 + LedgerFont.draw(g, name, r.getFont(), INK, x + 7, cy + fm.getAscent() / 2 - 1);
		}
		if (r.getRight() != null) badge(g, r.getRight(), x + 4, cy - Math.round(9 * scale), Math.round(18 * scale), name.equals(TABS[ADVICE]));
	}

	private static void badge(Graphics2D g, String badge, int x, int y, int d, boolean advice)
	{
		boolean ok = badge.equals("ok");
		g.setColor(ok ? GOOD : advice ? GOLD_DARK : EMBER);
		g.fillOval(x, y, d, d);
		if (ok)
		{
			HudIcons.paint(g, HudModel.Icon.CHECK, x + 3, y + 3, d - 6, PARCH);
			return;
		}
		Font f = LedgerFont.text(d * 0.68f);
		FontMetrics fm = GuideFont.metrics(g, f);
		g.setColor(PARCH);
		GuideFont.draw(g, badge, f, x + (d - fm.stringWidth(badge)) / 2, y + (d + fm.getAscent()) / 2 - 2);
	}

	/** The progress ring with the percentage inside, one arc per quest stage when the strip has stages; the card's icon when no progress. */
	private static void paintRing(Graphics2D g, int x, int y, int d, Layout l, float scale)
	{
		g.setColor(new Color(18, 12, 8));
		g.fillOval(x, y, d, d);
		float sw = Math.max(3f, 3.5f * scale);
		g.setStroke(new BasicStroke(sw, BasicStroke.CAP_BUTT, BasicStroke.JOIN_ROUND));
		g.setColor(new Color(43, 30, 20));
		g.drawOval(x + 4, y + 4, d - 8, d - 8);
		Double f = l.getProgress();
		if (f != null)
		{
			double done = Math.max(0, Math.min(1, f));
			g.setPaint(new GradientPaint(x, y, GOLD, x + d, y + d, GOLD_LIGHT));
			int segments = l.getSegments();
			if (segments > 1)
			{
				double step = 360.0 / segments;
				for (int i = 0; i < Math.round(done * segments); i++) g.draw(new Arc2D.Double(x + 4, y + 4, d - 8, d - 8, 90 - i * step - 2, -(step - 4), Arc2D.OPEN));
			}
			else g.draw(new Arc2D.Double(x + 4, y + 4, d - 8, d - 8, 90, -360 * done, Arc2D.OPEN));
			String pct = Math.round(done * 100) + "%";
			Font pf = LedgerFont.display(10 * scale);
			FontMetrics fm = GuideFont.metrics(g, pf);
			g.setColor(GOLD_LIGHT);
			GuideFont.draw(g, pct, pf, x + (d - fm.stringWidth(pct)) / 2, y + (d + fm.getAscent()) / 2 - 2);
		}
		else
		{
			HudModel.Icon icon = HudModel.Icon.NONE;
			for (Row r : l.getRows()) if (r.getPart() == Part.TITLE) icon = r.getIcon();
			int s = Math.round(18 * scale);
			HudIcons.paint(g, icon, x + (d - s) / 2, y + (d - s) / 2, s, GOLD_LIGHT);
		}
		g.setStroke(new BasicStroke(1f));
		g.setColor(new Color(201, 162, 75, 140));
		g.drawOval(x, y, d, d);
	}

	private static void diamond(Graphics2D g, int cx, int cy, Color c)
	{
		g.setColor(c);
		g.fillPolygon(new int[]{cx - 3, cx, cx + 3, cx}, new int[]{cy, cy - 3, cy, cy + 3}, 4);
	}

	/** The advice tab's mark: a four-pointed star. */
	private static void sparkle(Graphics2D g, int cx, int cy, int r, Color c)
	{
		int q = Math.max(2, r / 3);
		g.setColor(c);
		g.fillPolygon(new int[]{cx, cx + q, cx + r, cx + q, cx, cx - q, cx - r, cx - q}, new int[]{cy - r, cy - q, cy, cy + q, cy + r, cy + q, cy, cy - q}, 8);
	}

	private static Color alpha(Color c, int a)
	{
		return new Color(c.getRed(), c.getGreen(), c.getBlue(), a);
	}

	/** The leather's grain: a fixed tile of faint light and dark specks, painted once. */
	private static TexturePaint grain()
	{
		BufferedImage tile = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
		Random r = new Random(7);
		for (int i = 0; i < 64 * 64 / 7; i++)
		{
			tile.setRGB(r.nextInt(64), r.nextInt(64), r.nextBoolean() ? new Color(255, 230, 190, 7).getRGB() : new Color(0, 0, 0, 14).getRGB());
		}
		return new TexturePaint(tile, new Rectangle(0, 0, 64, 64));
	}
}
