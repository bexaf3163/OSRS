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
import net.runelite.client.ui.overlay.components.PanelComponent;

/**
 * The "What you need" list on the game screen: under the HUD, top left (draggable with Alt). {@link GuideList} computes the
 * lines; the line under the mouse is highlighted, with a hint for it at the bottom. After each frame the list
 * remembers where its lines are on the canvas, and {@link GuideMouse} uses those rectangles to tell where a click landed.
 */
class OsrsPathGuideOverlay extends OverlayPanel
{
	/** Wider than the HUD: items have a status on the right, and "where to get it" under them. */
	static final int WIDTH = 300;
	static final Color MODERN_LINK = new Color(177, 180, 255);
	static final Color MODERN_TEXT = new Color(235, 238, 245);
	/** "Where to get it" and the hint are smaller than the main text. */
	static final float SMALL = 0.9f;
	static final Color HOVER = new Color(255, 255, 255, 40);
	/** A click this close to the left of the right label still counts as on it. */
	private static final int TAB_SLACK = 20;
	/**
	 * For how long after the last frame a click still counts against the lines. If the list has not been drawn for a long time (left the game,
	 * the plate was hidden), clicks go to the game, not to invisible buttons.
	 */
	private static final long FRESH_NANOS = 500_000_000L;

	/** Where the list and its lines are on the canvas: a snapshot of the last frame for the mouse thread. */
	static final class Hits
	{
		static final Hits NONE = new Hits(new Rectangle(), Collections.emptyList(), Collections.emptyList(), 0);

		final Rectangle area;
		final List<Rectangle> rows;
		final List<GuideList.Action> actions;
		/** For the tab strip: the x (canvas) where the right label begins; clicks left of it select "Steps", from it "Advice". Else Integer.MAX_VALUE. */
		final List<Integer> splits;
		final long at;

		Hits(Rectangle area, List<Rectangle> rows, List<GuideList.Action> actions, long at)
		{
			this(area, rows, actions, Collections.nCopies(rows.size(), Integer.MAX_VALUE), at);
		}

		Hits(Rectangle area, List<Rectangle> rows, List<GuideList.Action> actions, List<Integer> splits, long at)
		{
			this.area = area;
			this.rows = rows;
			this.actions = actions;
			this.splits = splits;
			this.at = at;
		}

		/** The number of the line under a point; -1 means not over a line. */
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
	private final GuideDisclosure disclosure = new GuideDisclosure();

	void selectDetails(boolean advice)
	{
		disclosure.select(advice);
		builtFor = null;
	}

	@Inject
	OsrsPathGuideOverlay(Client client, OsrsPathBridgePlugin plugin, OsrsPathBridgeConfig config)
	{
		super(plugin);
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.TOP_LEFT);
		setLayer(OverlayLayer.UNDER_WIDGETS);
		// Below the HUD in the top-left stack: the HUD has higher priority.
		setPriority(PRIORITY_LOW);
		setClearChildren(false);
		setMovable(true);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		Graphics2D own = (Graphics2D) g.create();
		try
		{
			own.setRenderingHint(java.awt.RenderingHints.KEY_TEXT_ANTIALIASING, java.awt.RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			own.setRenderingHint(java.awt.RenderingHints.KEY_FRACTIONALMETRICS, java.awt.RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
			return renderGuide(own);
		}
		finally { own.dispose(); }
	}

	private Dimension renderGuide(Graphics2D g)
	{
		StepGuide.View v = plugin.getGuideView();
		// Smart reveal: while travelling and at the exchange the step list would block the view; it is needed at the bank and near the step.
		if (!GuideList.shown(config.showGuide(), false, v, config.smartOverlays(), plugin.overlayContext()))
		{
			hits = Hits.NONE;
			plugin.guideShown(false);
			return null;
		}
		// Training on a paced step: the HUD carries the step, the kills left and the progress; the card comes back when the fighting stops or the bank opens.
		OsrsPathHudOverlay.State trainingHud = plugin.getHud();
		if (trainingHud != null && trainingHud.isTraining() && config.showHud())
		{
			hits = Hits.NONE;
			plugin.guideShown(false);
			return null;
		}
		// The docked bar keeps the list closed until the mouse is over the bar or the list, or the bank is open.
		if (config.dockBar() && plugin.dockHidesList())
		{
			hits = Hits.NONE;
			plugin.guideShown(false);
			return null;
		}
		float scale = config.hudLarge() ? OsrsPathHudOverlay.LARGE : 1f;
		boolean modern = config.overlayTheme() == OsrsPathBridgeConfig.OverlayTheme.GLASS;
		Font font = modern ? GuideFont.font(scale) : OverlayText.font(g.getFont(), scale);
		Font small = modern ? GuideFont.font(scale * SMALL) : OverlayText.font(g.getFont(), scale * SMALL);
		g.setFont(font);
		int width = OsrsPathHudOverlay.panelWidth(this, Math.round(WIDTH * scale));
		int hovered = hovered();
		boolean terse = config.smartOverlays();
		// By default the card is two rows and opens while the mouse is over it. The docked bar opens the list itself, so there the list is always whole.
		boolean compact = config.guideCompact() && !config.dockBar() && !config.guideCollapsed();
		disclosure.forStep(GuideList.code(v));
		int reveal = compact && !disclosure.isOpen() ? 0 : GuideList.EXPAND_STEPS;
		OsrsPathHudOverlay.State hud = plugin.getHud();
		String distance = hud == null ? null : hud.getDistance();
		Object key = Arrays.asList(v, config.guideCollapsed(), hovered, config.hudOpacity(), font, small, width, terse, compact, reveal, distance);
		if (!key.equals(builtFor))
		{
			components = build(panelComponent, v, config.guideCollapsed(), hovered, GuideFont.metrics(g, font), GuideFont.metrics(g, small),
				font, small, width, config.hudOpacity(), terse, compact, reveal, distance);
			builtFor = key;
			// What exactly the player sees goes to the debug log (only when the plate was rebuilt, not every frame).
			List<GuideList.Row> shown = new ArrayList<>();
			for (RowComponent rc : components)
			{
				if (!rc.isHint())
				{
					shown.add(rc.getRow());
				}
			}
			plugin.uiShown("guide", GuideList.plain(shown));
			// The card is painted under the rows, so it needs the size of THIS content. The panel reports the size of its previous pass: a card that had
			// just grown (a wrapped heading, an opened list, a new stage) drew its last rows outside its background (seen live).
			Dimension now = dryRun(g, super::render);
			last = now == null ? new Dimension() : now;
		}
		OverlayCard.paintGuide(g, last.width, last.height, accent(v), config.hudOpacity(), config.overlayTheme());
		Dimension d = super.render(g);
		last = d == null ? new Dimension() : d;
		remember(g, d);
		paintTooltip(g, d, hovered, small);
		plugin.guideShown(true);
		return d;
	}

	/**
	 * Lay the rows out without painting them (an empty clip) and return the size they take. RuneLite's panel returns the size of the children of its
	 * previous pass, so it is laid out twice. Only when the content was rebuilt, never per frame.
	 */
	static Dimension dryRun(Graphics2D g, java.util.function.Function<Graphics2D, Dimension> render)
	{
		Graphics2D dry = (Graphics2D) g.create();
		try
		{
			dry.setClip(0, 0, 0, 0);
			render.apply(dry);
			return render.apply(dry);
		}
		finally
		{
			dry.dispose();
		}
	}

	/**
	 * The explanation of the line under the mouse, drawn beside the plate (see {@link OverlayTooltip}). The plate itself does not change, so the
	 * lines do not move under the mouse while it is read. The coordinates are the plate's own, as the graphics are already moved to it.
	 */
	private void paintTooltip(Graphics2D g, Dimension d, int hovered, Font small)
	{
		if (d == null || hovered < 0 || hovered >= components.size())
		{
			return;
		}
		RowComponent rc = components.get(hovered);
		String hint = rc.getRow().getHint();
		if (hint == null || hint.trim().isEmpty())
		{
			return;
		}
		FontMetrics fm = GuideFont.metrics(g, small);
		List<String> lines = OverlayTooltip.wrap(hint, fm);
		if (lines.isEmpty())
		{
			return;
		}
		Rectangle at = getBounds();
		Rectangle canvas = new Rectangle(-at.x, -at.y, Math.max(1, client.getCanvasWidth()), Math.max(1, client.getCanvasHeight()));
		Rectangle tip = OverlayTooltip.place(new Rectangle(0, 0, d.width, d.height), rc.getBounds(), OverlayTooltip.size(lines, fm), canvas);
		OverlayTooltip.paint(g, tip, lines, small);
	}

	/** The strip colour: quest complete is green, going by stages is blue, otherwise gold. */
	static Color accent(StepGuide.View v)
	{
		StepGuide.StageView s = v.getStage();
		if (s != null)
		{
			return s.isFinished() ? OverlayCard.GREEN : OverlayCard.BLUE;
		}
		return OverlayCard.GOLD;
	}

	/** The line under the mouse by the previous frame; -1 means the mouse is not over the list, the game menu is open or a game window is over the list. */
	private int hovered()
	{
		net.runelite.api.Point m = freeMouse();
		return m == null ? -1 : hits.rowAt(m.getX(), m.getY());
	}

	/** The mouse point, or null if there is none, the game menu is open, or a game window (bank, shop, world map) is over the list. */
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

	/** The line rectangles on the canvas: at drawing time the plate already stands in its place (getBounds). */
	private void remember(Graphics2D g, Dimension d)
	{
		if (d == null)
		{
			hits = Hits.NONE;
			return;
		}
		Rectangle at = getBounds();
		List<Rectangle> rects = new ArrayList<>();
		List<GuideList.Action> actions = new ArrayList<>();
		List<Integer> splits = new ArrayList<>();
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
			// The tab strip is two buttons on one row: the right label starts where its painted text starts.
			splits.add(c.getRow().getAction().getKind() == GuideList.Kind.TAB ? r.x + r.width - c.rightLabelWidth(g) - TAB_SLACK : Integer.MAX_VALUE);
		}
		setHits(new Hits(new Rectangle(at.x, at.y, d.width, d.height), rects, actions, splits, System.nanoTime()));
	}

	void setHits(Hits h)
	{
		hits = h;
	}

	/**
	 * What is under a canvas point (mouse thread). null means not the list, the click goes to the game; Action.NONE means the list but not a button:
	 * the click must not go to the game and walk the character to whatever is under the plate.
	 */
	GuideList.Action actionAt(Point p)
	{
		Hits h = hits;
		if (System.nanoTime() - h.at > FRESH_NANOS || !h.area.contains(p))
		{
			return null;
		}
		int row = h.rowAt(p.x, p.y);
		if (row < 0)
		{
			return GuideList.Action.NONE;
		}
		GuideList.Action a = h.actions.get(row);
		if (a.getKind() == GuideList.Kind.TAB)
		{
			return p.x >= h.splits.get(row) ? GuideList.Action.TAB_ADVICE : GuideList.Action.TAB_STEPS;
		}
		return a;
	}

	/** The plate contents. Static: a test draws it with the real fonts without a client. */
	static List<RowComponent> build(PanelComponent panel, StepGuide.View v, boolean collapsed, int hovered, FontMetrics fm,
		FontMetrics smallFm, Font font, Font small, int width, int opacity)
	{
		return build(panel, v, collapsed, hovered, fm, smallFm, font, small, width, opacity, false);
	}

	/** terse is the brief view for the game (smart reveal): the details stay in the hint and in the app window. */
	static List<RowComponent> build(PanelComponent panel, StepGuide.View v, boolean collapsed, int hovered, FontMetrics fm,
		FontMetrics smallFm, Font font, Font small, int width, int opacity, boolean terse)
	{
		return build(panel, v, collapsed, hovered, fm, smallFm, font, small, width, opacity, terse, false, GuideList.EXPAND_STEPS);
	}

	/** compact is the strict two-line view; reveal is how much of the rest is open (0 is closed), see {@link GuideList#expandedRows}. */
	static List<RowComponent> build(PanelComponent panel, StepGuide.View v, boolean collapsed, int hovered, FontMetrics fm,
		FontMetrics smallFm, Font font, Font small, int width, int opacity, boolean terse, boolean compact, int reveal)
	{
		return build(panel, v, collapsed, hovered, fm, smallFm, font, small, width, opacity, terse, compact, reveal, null);
	}

	private static String leftText(GuideList.Row r)
	{
		return r.getLines().stream().map(GuideList.Line::getLeft).collect(java.util.stream.Collectors.joining(" "));
	}

	/** The same warning as another row: same action and full text (the hint), whatever size it was set in. */
	static boolean sameAlert(GuideList.Row a, GuideList.Row b)
	{
		return a.getAction().getKind() == b.getAction().getKind() && a.getHint() != null && a.getHint().equals(b.getHint())
			&& leftText(a).startsWith("⚠") && leftText(b).startsWith("⚠");
	}

	/** The "Details: ..." row of the open list: the action row of this card already shows that text in full. */
	static boolean repeatsAction(GuideList.Row r)
	{
		return r.getAction() == GuideList.Action.NONE && leftText(r).startsWith("Details: ");
	}

	static List<RowComponent> build(PanelComponent panel, StepGuide.View v, boolean collapsed, int hovered, FontMetrics fm,
		FontMetrics smallFm, Font font, Font small, int width, int opacity, boolean terse, boolean compact, int reveal, String distance)
	{
		List<LayoutableRenderableEntity> c = panel.getChildren();
		c.clear();
		panel.setPreferredSize(new Dimension(width, 0));
		OverlayText.frame(panel, fm);
		List<GuideList.Row> rows = new ArrayList<>(collapsed ? GuideList.rows(v, true, fm, smallFm, width, terse)
			: GuideList.expandedRows(v, compact ? reveal : GuideList.EXPAND_STEPS, fm, smallFm, width, terse));
		if (!collapsed && (!compact || reveal > 0) && v.isAdviceTab() && GuideList.adviceCount(v.getPrep()) == 0)
		{
			rows = new ArrayList<>(GuideList.coreRows(v, fm, width));
			rows.add(new GuideList.Row(GuideList.text("No advice for this step.", GuideList.MUTED, smallFm, OverlayText.inner(width), true), GuideList.Action.NONE, null));
		}
		// The current action row below already shows the whole recipe of the line: a "Details:" row would repeat it word for word.
		rows.removeIf(OsrsPathGuideOverlay::repeatsAction);
		// Critical warnings must also survive an Advice selection or the header-only collapse. The open list already has them
		// (set in another size, so the rows are not equal): the same warning is never drawn twice.
		for (GuideList.Row alert : GuideList.alertRows(v, fm, width))
		{
			if (alert.getAction().getKind() != GuideList.Kind.DETOUR && rows.stream().noneMatch(r -> sameAlert(r, alert))) rows.add(alert);
		}
		if (!collapsed)
		{
			int at = Math.min(2, rows.size());
			String place = v.getPlaces().stream().filter(StepGuide.PlaceLine::isActive).map(StepGuide.PlaceLine::getLabel).findFirst().orElse(v.getStage() == null ? v.getGoal() : null);
			if (place != null && !place.trim().isEmpty())
			{
				rows.add(at++, new GuideList.Row(GuideList.clip("", place, GuideList.MUTED, smallFm, OverlayText.inner(width), 2, true),
					GuideList.Action.NONE, place));
			}
			int advice = GuideList.adviceCount(v.getPrep());
			// Keep the same tab actions directly under the current action in both reveal states.
			rows.removeIf(r -> r.getAction().getKind() == GuideList.Kind.TAB);
			rows.add(at, GuideList.tabRow(v.isAdviceTab(), advice, fm, OverlayText.inner(width)));
			if (compact && reveal <= 0)
			{
				// The closed card: one travel line above the tabs (a shortcut, what to get for it, or a stop on the way), never two.
				rows.removeIf(r -> r.getAction().getKind() == GuideList.Kind.DETOUR || r.getAction().getKind() == GuideList.Kind.TRANSPORT);
				GuideList.Row travel = GuideList.travelRow(v, smallFm, width);
				if (travel != null)
				{
					rows.add(Math.min(at, rows.size()), travel);
				}
			}
		}
		List<RowComponent> out = new ArrayList<>();
		FontMetrics actionFm = new FontMetrics(GuideFont.action(font))
		{
			@Override
			public int stringWidth(String text)
			{
				return (int) Math.ceil(getFont().getStringBounds(text, fm.getFontRenderContext()).getWidth());
			}
		};
		for (int i = 0; i < rows.size(); i++)
		{
			GuideList.Row r = rows.get(i);
			boolean heading = i == 0;
			boolean current = !heading && r.getAction() == GuideList.Action.NONE && !r.getLines().isEmpty()
				&& r.getLines().get(0).getLeft().contains("▶ [");
			if (heading)
			{
				String title = v.getTitle() == null ? "OSRS Path" : v.getTitle().replaceFirst("^\\[[^\\]]+\\]\\s*", "");
				List<GuideList.Line> header = new ArrayList<>(GuideList.pair(title, new Color(231, 237, 245), "",
					GuideList.MUTED, fm, OverlayText.inner(width) - 40, false));
				String meta = v.getStage() == null ? "Current step" : GuideList.stageTitle(v.getStage());
				header.addAll(GuideList.pair(meta, GuideList.MUTED, distance == null ? "" : distance, GuideList.MUTED, smallFm, OverlayText.inner(width) - 28, true));
				r = new GuideList.Row(header, r.getAction(), r.getHint());
			}
			else if (current)
			{
				String action = r.getLines().stream().map(GuideList.Line::getLeft).collect(java.util.stream.Collectors.joining(" "))
					.replaceFirst("▶ \\[\\d+/\\d+\\]\\s*", "");
				StepGuide.StageView stage = v.getStage();
				if (stage != null && stage.getSteps() != null && stage.getCursor() >= 0 && stage.getCursor() < stage.getSteps().size())
					action = (stage.isPeeking() ? "Viewing · " : "") + GuideList.withoutDoneErrands(v, stage.getSteps().get(stage.getCursor()).shown());
				int alternative = GuideList.alternativeAt(action);
				List<GuideList.Line> actionLines = new ArrayList<>();
				if (alternative > 0)
				{
					actionLines.addAll(GuideList.text(action.substring(0, alternative), MODERN_TEXT, actionFm, OverlayText.inner(width) - 2, false));
					actionLines.addAll(GuideList.text(action.substring(alternative + 1), GuideList.MUTED, smallFm, OverlayText.inner(width) - 2, true));
				}
				else actionLines.addAll(GuideList.text(action, MODERN_TEXT, actionFm, OverlayText.inner(width) - 2, false));
				r = new GuideList.Row(actionLines, r.getAction(), r.getHint());
			}
			RowComponent rc = new RowComponent(r, i == hovered && r.getAction().isClickable(), false, font, small, heading, current);
			rc.folded = collapsed || (compact && reveal <= 0);
			out.add(rc);
			c.add(rc);
			if (i == 0 && !collapsed && v.getStage() != null && v.getStage().getTotal() > 0)
			{
				// Under the stage heading is the quest progress strip.
				StepGuide.StageView sv = v.getStage();
				c.add(new OverlayCard.Bar(sv.isFinished() ? 1 : (double) sv.getIndex() / sv.getTotal(),
					sv.isFinished() ? OverlayCard.GREEN : MODERN_LINK, sv.getTotal()));
			}
		}
		// The hint of the hovered line is not a row of the plate: it is drawn beside it (OverlayTooltip), so the plate never changes size under the mouse.
		return out;
	}

	/** A list line: its text lines and the highlight when the mouse is over a button. The size and place are set after drawing. */
	static final class RowComponent implements LayoutableRenderableEntity
	{
		@Getter
		private final GuideList.Row row;
		private final boolean hovered;
		@Getter
		private final boolean hint;
		private final List<Font> fonts = new ArrayList<>();
		private final boolean heading;
		private final boolean current;
		private boolean folded;
		@Getter
		private final Rectangle bounds = new Rectangle();
		@Setter
		private Point preferredLocation = new Point();
		@Setter
		private Dimension preferredSize = new Dimension(OsrsPathGuideOverlay.WIDTH, 0);

		/** The painted width of the right label of the first line (0 when there is none): where a second button on the row begins. */
		int rightLabelWidth(Graphics2D g)
		{
			for (int i = 0; i < row.getLines().size(); i++)
			{
				String right = row.getLines().get(i).getRight();
				if (right != null)
				{
					return GuideFont.metrics(g, fonts.get(i)).stringWidth(right);
				}
			}
			return 0;
		}

		RowComponent(GuideList.Row row, boolean hovered, boolean hint, Font font, Font small)
		{
			this(row, hovered, hint, font, small, false, false);
		}

		RowComponent(GuideList.Row row, boolean hovered, boolean hint, Font font, Font small, boolean heading, boolean current)
		{
			this.row = row;
			this.hovered = hovered;
			this.hint = hint;
			this.heading = heading;
			this.current = current;
			for (GuideList.Line l : row.getLines())
			{
				Font f = l.isSmall() ? small : font;
				if (current && !l.isSmall()) f = GuideFont.action(f);
				// Quest titles stay secondary to the current action.
				fonts.add(f);
			}
		}

		@Override
		public Dimension render(Graphics2D g)
		{
			int x = preferredLocation.x;
			int y = preferredLocation.y;
			int width = preferredSize.width;
			boolean tab = row.getAction().getKind() == GuideList.Kind.TAB;
			int top = heading ? 4 : current ? 8 : tab ? 8 : 4;
			int bottom = heading ? 10 : tab ? 10 : 6;
			if (hovered || hint)
			{
				int h = top + bottom;
				for (Font f : fonts)
				{
					h += GuideFont.metrics(g, f).getHeight();
				}
				// The highlight stays within the panel frame (4 points on each side): nothing sticks out beyond the plate.
				g.setColor(HOVER);
				g.fillRoundRect(x - 4, y + 1, width + 8, h + 1, 8, 8);
			}
			boolean warning = !row.getLines().isEmpty() && row.getLines().get(0).getLeft().startsWith("⚠");
			if (warning)
			{
				int height = top + bottom;
				for (Font f : fonts) height += GuideFont.metrics(g, f).getHeight();
				g.setColor(new Color(110, 68, 20, 170));
				g.fillRoundRect(x - 3, y, width + 6, height, 6, 6);
				g.setColor(OverlayCard.AMBER);
				g.drawRoundRect(x - 3, y, width + 6, height, 6, 6);
			}
			int at = y + top;
			if (heading)
			{
				// Native vector quest marker, independent of the selected RuneLite font.
				int cx = x + 10;
				int cy = at + 14;
				g.setColor(new Color(63, 48, 20, 220));
				int[] px = {cx, cx + 9, cx + 9, cx, cx - 9, cx - 9};
				int[] py = {cy - 13, cy - 7, cy + 7, cy + 13, cy + 7, cy - 7};
				g.fillPolygon(px, py, 6);
				g.setColor(OverlayCard.GOLD);
				g.drawPolygon(px, py, 6);
				g.fillPolygon(new int[] {cx, cx + 4, cx, cx - 4}, new int[] {cy - 9, cy, cy + 9, cy}, 4);
				int arrowX = x + width - 6;
				g.setColor(GuideList.MUTED);
				if (folded)
				{
					g.drawLine(arrowX - 3, cy - 4, arrowX + 1, cy);
					g.drawLine(arrowX + 1, cy, arrowX - 3, cy + 4);
				}
				else
				{
					g.drawLine(arrowX - 4, cy - 2, arrowX, cy + 2);
					g.drawLine(arrowX, cy + 2, arrowX + 4, cy - 2);
				}
			}
			if (tab)
			{
				g.setColor(GuideList.MUTED);
				g.drawRoundRect(x + 1, at + 2, 9, 12, 2, 2);
				g.drawLine(x + 3, at + 6, x + 8, at + 6);
				g.drawLine(x + 3, at + 9, x + 8, at + 9);
				int adviceX = x + width - rightLabelWidth(g) - 14;
				g.fillRoundRect(adviceX, at + 3, 10, 8, 5, 5);
				g.fillPolygon(new int[] {adviceX + 2, adviceX + 2, adviceX + 6}, new int[] {at + 9, at + 15, at + 9}, 3);
			}
			for (int i = 0; i < row.getLines().size(); i++)
			{
				GuideList.Line l = row.getLines().get(i);
				Font f = fonts.get(i);
				FontMetrics fm = GuideFont.metrics(g, f);
				int inset = heading ? 26 : tab ? 16 : 0;
				g.setColor(tab ? MODERN_LINK : l.getLeftColor());
				GuideFont.draw(g, l.getLeft(), f, x + inset, at + fm.getAscent());
				if (l.getRight() != null)
				{
					g.setColor(tab ? MODERN_LINK : l.getRightColor());
					GuideFont.draw(g, l.getRight(), f, x + width - fm.stringWidth(l.getRight()), at + fm.getAscent());
				}
				at += fm.getHeight();
			}
			if (tab)
			{
				g.setColor(new Color(108, 125, 147, 140));
				g.drawLine(x, at + bottom - 2, x + width, at + bottom - 2);
			}
			if (tab && !folded && !row.getLines().isEmpty())
			{
				GuideList.Line labels = row.getLines().get(0);
				boolean rightActive = GuideList.TITLE.equals(labels.getRightColor());
				int underline = g.getFontMetrics(fonts.get(0)).stringWidth(rightActive ? labels.getRight() : labels.getLeft()) + 16;
				g.setColor(MODERN_LINK);
				g.fillRect(rightActive ? x + width - underline : x, at + bottom - 3, underline, 3);
			}
			bounds.setBounds(x, y, width, at - y + bottom);
			return new Dimension(width, at - y + bottom);
		}
	}
}
