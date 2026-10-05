package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import javax.imageio.ImageIO;
import net.runelite.client.ui.FontManager;
import net.runelite.client.ui.overlay.components.PanelComponent;
import net.runelite.client.ui.overlay.components.TitleComponent;
import org.junit.Test;

/**
 * The plugin plates drawn with the real RuneLite fonts: no line sticks out of its frame.
 *
 * A pixel check: the panel is drawn on a transparent picture, and everything opaque outside its rectangle is
 * text that stuck out. The texts are everything the plugin can show: the titles and targets of 69 steps and branches, waypoints,
 * purchases from the tool tiers, dictionary places and shops, radar warnings, pace lines, departure
 * check lines and the exchange list. Pictures for the eye are in build/overlay-render.
 */
public class OverlayLayoutTest
{
	private static final Gson GSON = new Gson();
	private static final File DATA = new File(System.getProperty("osrsPath.steps")).getParentFile();
	private static final File OUT = new File("build/overlay-render");
	private static final int MARGIN = 60;
	/** A margin on the right: that much stuck-out text will surely get onto the picture. */
	private static final int SPARE = 200;
	/** For the eye: the step on which the player saw a heading stick out. */
	private static final String SHOWN = "S1-13";

	interface Builder
	{
		void build(PanelComponent panel, FontMetrics fm, int width);
	}

	/** The fonts the player chooses from in RuneLite (regular, bold, small), and the standard Dialog. */
	private static List<Font> fonts()
	{
		return Arrays.asList(FontManager.getRunescapeFont(), FontManager.getRunescapeBoldFont(),
			FontManager.getRunescapeSmallFont(), FontManager.getDefaultFont());
	}

	private static JsonElement read(String name) throws IOException
	{
		return GSON.fromJson(new String(Files.readAllBytes(new File(DATA, name).toPath()), "UTF-8"), JsonElement.class);
	}

	private static JsonArray steps() throws IOException
	{
		JsonElement root = read("steps.json");
		return root.isJsonArray() ? root.getAsJsonArray() : root.getAsJsonObject().getAsJsonArray("steps");
	}

	private static String str(JsonObject o, String key)
	{
		return o != null && o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : null;
	}

	private static JsonObject obj(JsonObject o, String key)
	{
		return o != null && o.has(key) && o.get(key).isJsonObject() ? o.getAsJsonObject(key) : null;
	}

	private static JsonArray arr(JsonObject o, String key)
	{
		return o != null && o.has(key) && o.get(key).isJsonArray() ? o.getAsJsonArray(key) : new JsonArray();
	}

	/** The step target as the app sends it (toInGameTarget): the step's point, otherwise a place on the map. */
	private static String goal(JsonObject step)
	{
		String wp = str(obj(obj(step, "inGame"), "worldPoint"), "label");
		return wp != null ? wp : str(obj(step, "mapLocation"), "label");
	}

	/** A price as in the app: "1,234,567 gp" (thousands separated by commas). */
	private static String gp(int n)
	{
		return String.format(java.util.Locale.ROOT, "%,d", n) + " gp";
	}

	/** The longest distance lines Navigation can produce. */
	private static List<String> distances()
	{
		return Arrays.asList(
			Navigation.readout(3200, 3200, 0, 3200, 9600, 0, false).getText(),
			Navigation.readout(3200, 3200, 0, 4400, 4400, 1, false).getText(),
			Navigation.readout(3200, 3200, 0, 3203, 3201, 2, false).getText(),
			Navigation.readout(3200, 3200, 0, 4400, 4400, 0, false).getText(),
			Navigation.readout(3200, 3200, 0, 3201, 3200, 0, false).getText());
	}

	/** The step's pace lines: without measurements, with a measurement, almost done, done. */
	private static List<String> pacing(JsonObject step)
	{
		List<String> out = new ArrayList<>();
		if (obj(step, "pacing") == null)
		{
			return out;
		}
		ActiveTarget.Pacing p = GSON.fromJson(obj(step, "pacing"), ActiveTarget.Pacing.class);
		int per = (int) Math.ceil(p.getExpPerAction());
		PacingTracker far = new PacingTracker(p);
		far.update(1, 0);
		out.add(far.hudLine(far.snapshot()));
		PacingTracker timed = new PacingTracker(p);
		for (int i = 0; i < 6; i++)
		{
			timed.update(1 + i * per, i * 60_000L);
		}
		out.add(timed.hudLine(timed.snapshot()));
		PacingTracker almost = new PacingTracker(p);
		almost.update(p.getTargetExp() - per, 0);
		out.add(almost.hudLine(almost.snapshot()));
		PacingTracker done = new PacingTracker(p);
		done.update(p.getTargetExp() + 1, 0);
		out.add(done.hudLine(done.snapshot()));
		return out;
	}

	/** All the HUD states the plugin can assemble from the app's data. */
	private static List<OsrsPathHudOverlay.State> hudStates() throws IOException
	{
		List<OsrsPathHudOverlay.State> out = new ArrayList<>();
		List<String> dist = distances();
		List<String> danger = new ArrayList<>();
		for (DangerRadar.Zone z : DangerRadar.load(GSON).getZones())
		{
			danger.add(z.hudText());
		}
		assertTrue("the radar zones did not load", !danger.isEmpty());
		String longestTitle = "";
		int n = 0;
		for (JsonElement e : steps())
		{
			JsonObject step = e.getAsJsonObject();
			String title = "[" + str(step, "id") + "] " + str(step, "title");
			longestTitle = title.length() > longestTitle.length() ? title : longestTitle;
			String goal = goal(step);
			List<String> pace = pacing(step);
			String d = dist.get(n % dist.size());
			String zone = danger.get(n % danger.size());
			out.add(new OsrsPathHudOverlay.State(title, goal, d, false, "Bag: missing 12 of 14", false,
				null, false, pace.isEmpty() ? null : pace.get(0), false, null));
			out.add(new OsrsPathHudOverlay.State(title, goal, "✓ Nearby", true, "Bag ready to leave", true,
				zone, n % 2 == 0, pace.isEmpty() ? null : pace.get(pace.size() - 1), true, null));
			for (String p : pace)
			{
				out.add(new OsrsPathHudOverlay.State(title, goal, d, false, null, false, null, false, p, false, null));
			}
			for (JsonElement b : arr(step, "branches"))
			{
				JsonObject br = b.getAsJsonObject();
				String alt = str(obj(br, "replacementTarget"), "label");
				String label = str(br, "label");
				if (alt != null)
				{
					String g = alt.startsWith(label) ? alt : label + ": " + alt;
					out.add(new OsrsPathHudOverlay.State(title, g, d, false, null, false, null, false, null, false, null));
				}
			}
			JsonArray way = arr(obj(step, "inGame"), "pathWaypoints");
			for (int i = 0; i < way.size(); i++)
			{
				String label = str(way.get(i).getAsJsonObject(), "label");
				String g = "Point " + (i + 1) + "/" + way.size() + (label != null ? ": " + label : "");
				out.add(new OsrsPathHudOverlay.State(title, g, d, false, null, false, null, false, null, false, null));
			}
			if (way.size() > 0)
			{
				out.add(new OsrsPathHudOverlay.State(title, "Route complete · " + goal, d, false, null, false, null, false, null, false, null));
			}
			n++;
		}
		String then = "Then: step " + longestTitle;
		// Upgrade-router purchases: "Buy Steel axe from Bob", at the exchange from the clerk.
		JsonObject tools = read("toolProgression.json").getAsJsonObject();
		for (String branch : tools.keySet())
		{
			if (!tools.get(branch).isJsonArray())
			{
				continue;
			}
			for (JsonElement t : tools.getAsJsonArray(branch))
			{
				JsonObject tier = t.getAsJsonObject();
				String seller = str(obj(tier, "shop"), "npc");
				String title = "Buy " + str(tier, "tier") + " from " + (seller != null ? seller : "Grand Exchange Clerk");
				out.add(new OsrsPathHudOverlay.State(title, then, dist.get(1), false, null, false, null, false, null, false, null));
			}
		}
		// Gear (gear.json): a purchase from a seller and at the exchange, a HUD hint - as the app writes them
		// (gearAdvisor.hudHint): "⚡ Wear ...", "⚡ Stronger: ... from ... (...), ... gp", "⚡ Stronger: ... at the exchange, ~... gp".
		for (JsonElement e : read("gear.json").getAsJsonObject().getAsJsonArray("items"))
		{
			JsonObject item = e.getAsJsonObject();
			String name = str(item, "name");
			out.add(new OsrsPathHudOverlay.State("Buy " + name + " from Grand Exchange Clerk", then, dist.get(1), false, null, false, null, false, null, false, null));
			out.add(new OsrsPathHudOverlay.State(longestTitle, "Cow field east of Lumbridge", dist.get(0), false, null, false, null, false, null, false,
				"⚡ Wear " + name + " - it is in the bank"));
			out.add(new OsrsPathHudOverlay.State(longestTitle, "Cow field east of Lumbridge", dist.get(0), false, null, false, null, false, null, false,
				"⚡ Stronger: " + name + " at the exchange, ~" + gp(1_234_567)));
			for (JsonElement sh : arr(item, "shops"))
			{
				JsonObject shop = sh.getAsJsonObject();
				String seller = str(shop, "owner") != null ? str(shop, "owner") : str(shop, "shop");
				out.add(new OsrsPathHudOverlay.State("Buy " + name + " from " + seller, then, dist.get(1), false, null, false, null, false, null, false, null));
				out.add(new OsrsPathHudOverlay.State(longestTitle, "Cow field east of Lumbridge", dist.get(0), false, "Bag: missing 12 of 14", false,
					null, false, null, false, "⚡ Stronger: " + name + " from " + seller + " (" + str(shop, "location") + "), " + gp(shop.get("price").getAsInt())));
			}
		}
		// "Go to: ..." - dictionary places and their other names, shops and cities from the item dossier.
		Set<String> places = new LinkedHashSet<>();
		JsonObject locations = read("majorLocations.json").getAsJsonObject().getAsJsonObject("locations");
		for (String name : locations.keySet())
		{
			places.add(name);
			for (JsonElement a : arr(locations.getAsJsonObject(name), "aliases"))
			{
				places.add(a.getAsString());
			}
		}
		for (JsonElement i : read("f2p-items.json").getAsJsonArray())
		{
			for (JsonElement b : arr(i.getAsJsonObject(), "buyLocations"))
			{
				places.add(str(b.getAsJsonObject(), "shopName"));
				places.add(str(b.getAsJsonObject(), "location"));
			}
			for (JsonElement s : arr(i.getAsJsonObject(), "freeSpawns"))
			{
				places.add(s.getAsString());
			}
		}
		places.remove(null);
		for (String place : places)
		{
			out.add(new OsrsPathHudOverlay.State("Go to: " + place, then, dist.get(0), false, null, false, null, false, null, false, null));
		}
		return out;
	}

	private static List<String> itemNames() throws IOException
	{
		List<String> out = new ArrayList<>();
		for (JsonElement i : read("f2p-items.json").getAsJsonArray())
		{
			out.add(str(i.getAsJsonObject(), "nameEn"));
		}
		return out;
	}

	/** The departure check: all the database items in batches, in all states, with the longest right-hand parts. */
	private static List<Checklist.Result> checklists() throws IOException
	{
		List<Checklist.Result> out = new ArrayList<>();
		List<String> names = itemNames();
		Checklist.State[] states = Checklist.State.values();
		for (int from = 0; from < names.size(); from += 16)
		{
			List<Checklist.Row> rows = new ArrayList<>();
			for (int i = from; i < Math.min(names.size(), from + 16); i++)
			{
				Checklist.State state = states[i % states.length];
				rows.add(new Checklist.Row(names.get(i), 3, 28, i % 3 == 0 ? -1 : 1234, i % 4 == 0 ? 20 : null, state));
			}
			out.add(new Checklist.Result(rows, from % 32 == 0));
		}
		return out;
	}

	/** The exchange list: all the database items in batches, in all states. */
	private static List<List<ShoppingPlan.Row>> shoppingLists() throws IOException
	{
		List<List<ShoppingPlan.Row>> out = new ArrayList<>();
		List<String> names = itemNames();
		ShoppingPlan.RowState[] states = ShoppingPlan.RowState.values();
		for (int from = 0; from < names.size(); from += 14)
		{
			List<ShoppingPlan.Row> rows = new ArrayList<>();
			for (int i = from; i < Math.min(names.size(), from + 14); i++)
			{
				ShoppingPlan.RowState state = states[i % states.length];
				String offer = state == ShoppingPlan.RowState.BOUGHT ? "bought - collect it"
					: state == ShoppingPlan.RowState.BUYING ? "order 1234/10000" : null;
				rows.add(new ShoppingPlan.Row(names.get(i), i % 5 == 0 ? 0 : 10000, i % 5 == 0 ? 1234 : 12, state, offer, i == from));
			}
			out.add(rows);
		}
		return out;
	}

	/**
	 * How many opaque points ended up outside the panel's frame. PanelComponent draws the background at the size of the previous
	 * pass, so the layout is first computed on an empty sketch and then the panel is drawn clean.
	 */
	/** Where it stuck out in the last check: "left 3, bottom 1". */
	private static String lastWhere = "";

	private static int overflow(Builder builder, Font font, int width, String save) throws IOException
	{
		PanelComponent panel = new PanelComponent();
		Graphics2D scratch = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
		scratch.setFont(font);
		builder.build(panel, scratch.getFontMetrics(font), width);
		panel.setPreferredLocation(new Point(MARGIN, MARGIN));
		panel.render(scratch);
		Dimension size = panel.render(scratch);
		scratch.dispose();
		int w = MARGIN * 2 + Math.max(size.width, width) + SPARE;
		int h = MARGIN * 2 + size.height;
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setFont(font);
		g.translate(MARGIN, MARGIN);
		OverlayCard.paint(g, size.width, size.height, OverlayCard.GOLD, 85);
		g.translate(-MARGIN, -MARGIN);
		Dimension d = panel.render(g);
		g.dispose();
		int[] px = ((DataBufferInt) img.getRaster().getDataBuffer()).getData();
		int outside = 0;
		int left = 0;
		int right = 0;
		int top = 0;
		int bottom = 0;
		for (int y = 0; y < h; y++)
		{
			for (int x = 0; x < w; x++)
			{
				boolean inside = x >= MARGIN && x < MARGIN + d.width && y >= MARGIN && y < MARGIN + d.height;
				if (!inside && (px[y * w + x] >>> 24) != 0)
				{
					outside++;
					left = Math.max(left, MARGIN - x);
					right = Math.max(right, x - (MARGIN + d.width - 1));
					top = Math.max(top, MARGIN - y);
					bottom = Math.max(bottom, y - (MARGIN + d.height - 1));
				}
			}
		}
		lastWhere = "left " + left + ", right " + right + ", top " + top + ", bottom " + bottom;
		if (save != null)
		{
			OUT.mkdirs();
			ImageIO.write(img, "png", new File(OUT, save + ".png"));
		}
		return outside;
	}

	/** States saved as a picture for the eye: as in the game for the player, danger with pace, a purchase, a place. */
	private static String sample(OsrsPathHudOverlay.State s)
	{
		String t = s.getTitle();
		if (t.startsWith("[" + SHOWN + "]") && !s.isNear() && s.getPacing() == null)
		{
			return SHOWN;
		}
		if (t.startsWith("[S1-11]") && s.getDanger() != null)
		{
			return "S1-11-danger";
		}
		if (t.equals("Buy Steel axe from Bob"))
		{
			return "buy";
		}
		if (t.equals("Go to: Lumbridge Swamp fishing spots"))
		{
			return "place";
		}
		return null;
	}

	private static String fontName(Font f)
	{
		return f.getFamily().replaceAll("[^A-Za-z]", "");
	}

	@Test
	public void detectorCatchesAnOldTitle() throws IOException
	{
		// It used to be: one TitleComponent with a long step name, centred and sticking out on both sides.
		Builder old = (panel, fm, width) ->
		{
			panel.setPreferredSize(new Dimension(width, 0));
			panel.setBackgroundColor(OsrsPathHudOverlay.background(70));
			panel.getChildren().add(TitleComponent.builder().text("[S1-13] Earning money for supplies: selling cowhides and buying leather").build());
		};
		assertTrue(overflow(old, FontManager.getRunescapeFont(), OsrsPathHudOverlay.WIDTH, "old-title") > 0);
	}

	@Test
	public void aFontWithoutTheSymbolsIsReplacedWhole()
	{
		for (Font base : fonts())
		{
			Font f = OverlayText.font(base, 1f);
			assertEquals("symbols in " + f, -1, new Font(f.getFamily(), f.getStyle(), f.getSize()).canDisplayUpTo("Cow field ~62 tiles ↓ ⚠ ✓ ≈ ▶ ✗ … ⚡"));
			assertEquals(base.getStyle(), f.getStyle());
		}
		assertNotEquals(FontManager.getRunescapeFont().getFamily(), OverlayText.font(FontManager.getRunescapeFont(), 1f).getFamily());
		// A font that has the symbols was chosen by the player: it is left as it is.
		assertEquals(FontManager.getDefaultFont(), OverlayText.font(FontManager.getDefaultFont(), 1f));
		assertEquals(20f, OverlayText.font(FontManager.getRunescapeFont(), 1.25f).getSize2D(), 0.01);
	}

	@Test
	public void wrappingByWordsAndLetters()
	{
		FontMetrics fm = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
			.getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), 1f));
		List<String> lines = OverlayText.wrap("[S1-13] Earning money for supplies: selling cowhides", fm, 182);
		assertTrue(lines.size() >= 2);
		assertEquals("[S1-13] Earning money for supplies: selling cowhides", String.join(" ", lines));
		for (String l : OverlayText.wrap("Averyveryverylongwordwithoutanyspaces", fm, 60))
		{
			assertTrue(l, fm.stringWidth(l) <= 60);
		}
		assertTrue(OverlayText.wrap("   ", fm, 100).isEmpty());
		assertTrue(OverlayText.wrap(null, fm, 100).isEmpty());
	}

	@Test
	public void numbersAndPrepositionsAreNotTornOff()
	{
		FontMetrics fm = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
			.getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), 1f));
		String[] texts = {
			"Bag: missing 12 of 14", "Bulk list · buy 10", "Name: use the 'Copy' button in OSRS Path",
			"✗ Adamant pickaxe · +20 HP", "⚠ DANGER - you are in the zone!", "~62 tiles ↓", "Ready to depart",
			"[S1-09] Stronghold of Security and 10,000 Coins",
		};
		for (String t : texts)
		{
			int widest = 0;
			for (String g : OverlayText.groups(t.split(" ")))
			{
				widest = Math.max(widest, fm.stringWidth(g));
			}
			for (int w = 30; w <= 300; w++)
			{
				List<String> lines = OverlayText.wrap(t, fm, w);
				// Nothing is lost (a word wider than the line is cut by letters - the spaces are then different).
				assertEquals(t.replace(" ", ""), String.join("", lines).replace(" ", ""));
				for (String l : lines)
				{
					assertTrue(t + " @" + w + ": '" + l + "'", fm.stringWidth(l) <= w || l.codePointCount(0, l.length()) == 1);
				}
				String[] words = t.split(" ");
				boolean gluedCostsLine = OverlayText.layout(OverlayText.groups(words), fm, w).size()
					> OverlayText.layout(Arrays.asList(words), fm, w).size();
				assertTrue(t + " @" + w + ": more lines than by words", lines.size() <= OverlayText.layout(Arrays.asList(words), fm, w).size());
				if (w < widest || lines.size() < 2 || gluedCostsLine)
				{
					continue;
				}
				// The links fit and do not cost an extra line - which means nothing is torn off.
				for (int i = 0; i < lines.size(); i++)
				{
					String[] parts = lines.get(i).split(" ");
					String end = parts[parts.length - 1];
					assertTrue(t + " @" + w + ": a line ends with a preposition '" + end + "'",
						i == lines.size() - 1 || !(end.length() <= 2 && end.chars().allMatch(Character::isLetter)));
					assertTrue(t + " @" + w + ": a line starts with '" + parts[0] + "'", !"—".equals(parts[0]) && !"·".equals(parts[0]));
				}
				String tail = lines.get(lines.size() - 1);
				assertTrue(t + " @" + w + ": a lonely tail '" + tail + "'", tail.contains(" ") || tail.length() > 4);
			}
		}
	}

	@Test
	public void hudDoesNotStickOutOfTheFrame() throws IOException
	{
		List<OsrsPathHudOverlay.State> states = hudStates();
		assertTrue("too few states: " + states.size(), states.size() > 300);
		List<String> bad = new ArrayList<>();
		Set<String> saved = new LinkedHashSet<>();
		for (Font base : fonts())
		{
			for (boolean large : new boolean[]{false, true})
			{
				Font font = OverlayText.font(base, large ? OsrsPathHudOverlay.LARGE : 1f);
				int standard = large ? Math.round(OsrsPathHudOverlay.WIDTH * OsrsPathHudOverlay.LARGE) : OsrsPathHudOverlay.WIDTH;
				// Its own width and one narrowed by the player with the mouse.
				for (int width : new int[]{standard, 140})
				{
					for (OsrsPathHudOverlay.State s : states)
					{
						String save = null;
						String sample = sample(s);
						if (width == standard && sample != null && saved.add(sample + fontName(base) + large))
						{
							save = "hud-" + sample + "-" + fontName(base) + (large ? "-large" : "");
						}
						int out = overflow((panel, fm, w) -> OsrsPathHudOverlay.build(panel, s, fm, w, 70), font, width, save);
						if (out > 0)
						{
							bad.add(fontName(base) + (large ? " large" : "") + " " + width + "px: " + s.getTitle() + " / " + s.getGoal() + " - " + out + " points (" + lastWhere + ")");
						}
					}
				}
			}
		}
		assertTrue("sticks out of the frame (" + bad.size() + "):\n" + String.join("\n", bad.subList(0, Math.min(20, bad.size()))), bad.isEmpty());
	}

	@Test
	public void departureCheckAndExchangeDoNotStickOut() throws IOException
	{
		List<String> bad = new ArrayList<>();
		List<Checklist.Result> checks = checklists();
		List<List<ShoppingPlan.Row>> lists = shoppingLists();
		for (Font base : fonts())
		{
			for (boolean large : new boolean[]{false, true})
			{
				Font font = OverlayText.font(base, large ? OsrsPathHudOverlay.LARGE : 1f);
				String tag = fontName(base) + (large ? "-large" : "");
				for (int i = 0; i < checks.size(); i++)
				{
					Checklist.Result r = checks.get(i);
					int out = overflow((panel, fm, w) -> InventoryCheckOverlay.build(panel, r, SHOWN, fm, w, 70), font,
						InventoryCheckOverlay.standardWidth(large), i == 0 ? "bank-" + tag : null);
					if (out > 0)
					{
						bad.add("bank " + tag + " #" + i + " - " + out + " points (" + lastWhere + ")");
					}
				}
				for (int i = 0; i < lists.size(); i++)
				{
					List<ShoppingPlan.Row> rows = lists.get(i);
					int out = overflow((panel, fm, w) -> GrandExchangeHelperOverlay.build(panel, rows, fm, w, 70), font,
						GrandExchangeHelperOverlay.standardWidth(large), i == 0 ? "ge-" + tag : null);
					if (out > 0)
					{
						bad.add("exchange " + tag + " #" + i + " - " + out + " points (" + lastWhere + ")");
					}
				}
			}
		}
		assertTrue("sticks out of the frame:\n" + String.join("\n", bad), bad.isEmpty());
	}

	@Test
	public void whatYouNeedListDoesNotStickOut() throws IOException
	{
		// The targets exactly as the app sends them (active-steps.json), with all the places and NPCs.
		List<StepGuide.View> views = new ArrayList<>();
		for (ActiveStepsTest.Sent sent : ActiveStepsTest.all())
		{
			ActiveTarget t = sent.target;
			assertTrue(sent.name, t.prepare() == null);
			// The bank was not opened; opened and empty; everything on hand; the arrow leads to the first point (there is "← to the step").
			views.add(StepGuide.view(t, new ItemCounts(), null, null, 0, 0, 0));
			views.add(StepGuide.view(t, new ItemCounts(), new ItemCounts(), null, 0, 0, 0));
			ItemCounts all = new ItemCounts();
			for (ActiveTarget.GuideItem i : t.getGuide().getItems())
			{
				all.add(i.getId() == null ? -1 : i.getId(), ActiveTarget.nameKey(i.getName()), 10_000);
			}
			views.add(StepGuide.view(t, all, null, null, 0, 0, 0));
			if (!t.getGuide().getPlaces().isEmpty())
			{
				ActiveTarget.GuidePlace p = t.getGuide().getPlaces().get(0);
				views.add(StepGuide.view(t, new ItemCounts(), new ItemCounts(), p.getLabel(), p.getX(), p.getY(), p.getPlane()));
			}
			ActiveTarget.Stage st = t.getGuide().getStage();
			if (st != null)
			{
				// Quest stages: each stage with the first, the middle and the last step, and "quest complete".
				for (ActiveTarget.StageStep ss : st.getStages())
				{
					int n = ss.getSteps().size();
					for (int cursor : new int[]{0, n / 2, n - 1})
					{
						views.add(StepGuide.view(t, new ItemCounts(), new ItemCounts(), null, 0, 0, 0, null, ss.getAt(), false, cursor));
					}
				}
				views.add(StepGuide.view(t, new ItemCounts(), new ItemCounts(), null, 0, 0, 0, null, null, true, 0));
			}
		}
		views.removeIf(v -> !GuideList.worthShowing(v));
		assertTrue("too few steps with a list: " + views.size(), views.size() > 100);
		List<String> bad = new ArrayList<>();
		Set<String> saved = new LinkedHashSet<>();
		Graphics2D scratch = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics();
		for (Font base : fonts())
		{
			for (boolean large : new boolean[]{false, true})
			{
				float scale = large ? OsrsPathHudOverlay.LARGE : 1f;
				Font font = OverlayText.font(base, scale);
				Font small = OverlayText.font(base, scale * OsrsPathGuideOverlay.SMALL);
				FontMetrics smallFm = scratch.getFontMetrics(small);
				int standard = Math.round(OsrsPathGuideOverlay.WIDTH * scale);
				for (int width : new int[]{standard, 170})
				{
					for (StepGuide.View v : views)
					{
						// The mouse is over the first button after the heading - with the tooltip at the bottom; and collapsed.
						List<GuideList.Row> rows = GuideList.rows(v, false, scratch.getFontMetrics(font), smallFm, width);
						int hover = -1;
						for (int i = 1; i < rows.size() && hover < 0; i++)
						{
							hover = rows.get(i).getAction().isClickable() ? i : -1;
						}
						for (int mode = 0; mode < 3; mode++)
						{
							boolean collapsed = mode == 2;
							int h = mode == 1 ? hover : -1;
							String save = null;
							String id = v.getTitle().substring(1, 6);
							String name = "guide-" + id + (v.getStage() != null ? "-stage" + v.getStage().getIndex() + "c" + v.getStage().getCursor() : "") + "-" + (collapsed ? "collapsed" : h >= 0 ? "hover" : "list") + "-" + fontName(base) + (large ? "-large" : "");
							// For the eye: the first view (the bank was not opened): S2-03 as for the player in the screenshot, a quest with many NPCs and Cook's Assistant.
							if (width == standard && (id.equals("S2-03") || id.equals("S2-10") || id.equals("S1-03") || (id.equals("S2-07") && v.getStage() != null && v.getStage().getCursor() > 0)) && v.getDetour() == null && saved.add(name))
							{
								save = name;
							}
							int out = overflow((panel, fm, w) -> OsrsPathGuideOverlay.build(panel, v, collapsed, h, fm, smallFm, font, small, w, 70),
								font, width, save);
							if (out > 0)
							{
								bad.add(fontName(base) + (large ? " large" : "") + " " + width + "px " + v.getTitle() + " mode " + mode + " - " + out + " points (" + lastWhere + ")");
							}
						}
					}
				}
			}
		}
		assertTrue("sticks out of the frame (" + bad.size() + "):\n" + String.join("\n", bad.subList(0, Math.min(20, bad.size()))), bad.isEmpty());
	}
}
