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
 * Плашки плагина, нарисованные настоящими шрифтами RuneLite: ни одна строка не выходит за рамку.
 *
 * Проверка по пикселям: панель рисуется на прозрачной картинке, и всё непрозрачное за её прямоугольником —
 * вылезший текст. Тексты — всё, что плагин может показать: названия и цели 69 шагов и веток, путевые точки,
 * покупки из ступеней инструментов, места словаря и магазинов, предупреждения радара, строки темпа, строки
 * проверки вылета и списка биржи. Картинки для глаза — в build/overlay-render.
 */
public class OverlayLayoutTest
{
	private static final Gson GSON = new Gson();
	private static final File DATA = new File(System.getProperty("osrsPath.steps")).getParentFile();
	private static final File OUT = new File("build/overlay-render");
	private static final int MARGIN = 60;
	/** Запас справа: столько вылезшего текста точно попадёт на картинку. */
	private static final int SPARE = 200;
	/** Для глаза: шаг, на котором игрок увидел вылезший заголовок. */
	private static final String SHOWN = "S1-13";

	interface Builder
	{
		void build(PanelComponent panel, FontMetrics fm, int width);
	}

	/** Шрифты, из которых игрок выбирает в RuneLite (обычный, жирный, мелкий), и стандартный Dialog. */
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

	/** Цель шага так, как её шлёт приложение (toInGameTarget): точка шага, иначе место на карте. */
	private static String goal(JsonObject step)
	{
		String wp = str(obj(obj(step, "inGame"), "worldPoint"), "label");
		return wp != null ? wp : str(obj(step, "mapLocation"), "label");
	}

	/** Цена как в приложении: «1 234 567 gp» (разряды через пробел). */
	private static String gp(int n)
	{
		return String.format(java.util.Locale.ROOT, "%,d", n).replace(',', ' ') + " gp";
	}

	/** Самые длинные строки расстояния, какие умеет Navigation. */
	private static List<String> distances()
	{
		return Arrays.asList(
			Navigation.readout(3200, 3200, 0, 3200, 9600, 0, false).getText(),
			Navigation.readout(3200, 3200, 0, 4400, 4400, 1, false).getText(),
			Navigation.readout(3200, 3200, 0, 3203, 3201, 2, false).getText(),
			Navigation.readout(3200, 3200, 0, 4400, 4400, 0, false).getText(),
			Navigation.readout(3200, 3200, 0, 3201, 3200, 0, false).getText());
	}

	/** Строки темпа шага: без замеров, с замером, почти готово, готово. */
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

	/** Все состояния HUD, какие плагин может собрать из данных приложения. */
	private static List<OsrsPathHudOverlay.State> hudStates() throws IOException
	{
		List<OsrsPathHudOverlay.State> out = new ArrayList<>();
		List<String> dist = distances();
		List<String> danger = new ArrayList<>();
		for (DangerRadar.Zone z : DangerRadar.load(GSON).getZones())
		{
			danger.add(z.hudText());
		}
		assertTrue("зоны радара не загрузились", !danger.isEmpty());
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
			out.add(new OsrsPathHudOverlay.State(title, goal, d, false, "Сумка: не хватает 12 из 14", false,
				null, false, pace.isEmpty() ? null : pace.get(0), false, null));
			out.add(new OsrsPathHudOverlay.State(title, goal, "✓ Рядом", true, "Сумка готова к выходу", true,
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
				String g = "Точка " + (i + 1) + "/" + way.size() + (label != null ? ": " + label : "");
				out.add(new OsrsPathHudOverlay.State(title, g, d, false, null, false, null, false, null, false, null));
			}
			if (way.size() > 0)
			{
				out.add(new OsrsPathHudOverlay.State(title, "Маршрут пройден · " + goal, d, false, null, false, null, false, null, false, null));
			}
			n++;
		}
		String then = "Потом — шаг " + longestTitle;
		// Покупки роутера апгрейдов: «Купи Steel axe у Bob», с биржи — у клерка.
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
				String title = "Купи " + str(tier, "tier") + " у " + (seller != null ? seller : "Grand Exchange Clerk");
				out.add(new OsrsPathHudOverlay.State(title, then, dist.get(1), false, null, false, null, false, null, false, null));
			}
		}
		// Снаряжение (gear.json): покупка у продавца и на бирже, совет в HUD — как их пишет приложение
		// (gearAdvisor.hudHint): «⚡ Надень …», «⚡ Сильнее: … у … (…), … gp», «⚡ Сильнее: … на бирже, ~… gp».
		for (JsonElement e : read("gear.json").getAsJsonObject().getAsJsonArray("items"))
		{
			JsonObject item = e.getAsJsonObject();
			String name = str(item, "name");
			out.add(new OsrsPathHudOverlay.State("Купи " + name + " у Grand Exchange Clerk", then, dist.get(1), false, null, false, null, false, null, false, null));
			out.add(new OsrsPathHudOverlay.State(longestTitle, "Коровье поле к востоку от Lumbridge", dist.get(0), false, null, false, null, false, null, false,
				"⚡ Надень " + name + " — он в банке"));
			out.add(new OsrsPathHudOverlay.State(longestTitle, "Коровье поле к востоку от Lumbridge", dist.get(0), false, null, false, null, false, null, false,
				"⚡ Сильнее: " + name + " на бирже, ~" + gp(1_234_567)));
			for (JsonElement sh : arr(item, "shops"))
			{
				JsonObject shop = sh.getAsJsonObject();
				String seller = str(shop, "owner") != null ? str(shop, "owner") : str(shop, "shop");
				out.add(new OsrsPathHudOverlay.State("Купи " + name + " у " + seller, then, dist.get(1), false, null, false, null, false, null, false, null));
				out.add(new OsrsPathHudOverlay.State(longestTitle, "Коровье поле к востоку от Lumbridge", dist.get(0), false, "Сумка: не хватает 12 из 14", false,
					null, false, null, false, "⚡ Сильнее: " + name + " у " + seller + " (" + str(shop, "location") + "), " + gp(shop.get("price").getAsInt())));
			}
		}
		// «К месту: …» — места словаря и их другие имена, магазины и города из досье предметов.
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
			out.add(new OsrsPathHudOverlay.State("К месту: " + place, then, dist.get(0), false, null, false, null, false, null, false, null));
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

	/** Проверка вылета: все предметы базы порциями, во всех состояниях, с самыми длинными правыми частями. */
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

	/** Список биржи: все предметы базы порциями, во всех состояниях. */
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
				String offer = state == ShoppingPlan.RowState.BOUGHT ? "куплено — забери"
					: state == ShoppingPlan.RowState.BUYING ? "ордер 1234/10000" : null;
				rows.add(new ShoppingPlan.Row(names.get(i), i % 5 == 0 ? 0 : 10000, i % 5 == 0 ? 1234 : 12, state, offer, i == from));
			}
			out.add(rows);
		}
		return out;
	}

	/**
	 * Сколько непрозрачных точек оказалось за рамкой панели. PanelComponent рисует фон по размерам прошлого
	 * прохода, поэтому раскладка сперва считается на пустом наброске, а потом панель рисуется начисто.
	 */
	/** Куда вылезло в последней проверке: «слева 3, снизу 1». */
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
		lastWhere = "слева " + left + ", справа " + right + ", сверху " + top + ", снизу " + bottom;
		if (save != null)
		{
			OUT.mkdirs();
			ImageIO.write(img, "png", new File(OUT, save + ".png"));
		}
		return outside;
	}

	/** Состояния, которые сохраняются картинкой для глаза: как в игре у игрока, опасность с темпом, покупка, место. */
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
		if (t.equals("Купи Steel axe у Bob"))
		{
			return "buy";
		}
		if (t.equals("К месту: Lumbridge Swamp fishing spots"))
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
	public void детекторЛовитСтарыйЗаголовок() throws IOException
	{
		// Так было: один TitleComponent с длинным названием шага — центрировался и вылезал с обеих сторон.
		Builder old = (panel, fm, width) ->
		{
			panel.setPreferredSize(new Dimension(width, 0));
			panel.setBackgroundColor(OsrsPathHudOverlay.background(70));
			panel.getChildren().add(TitleComponent.builder().text("[S1-13] Заработок на закупки: коровьи шкуры").build());
		};
		assertTrue(overflow(old, FontManager.getRunescapeFont(), OsrsPathHudOverlay.WIDTH, "old-title") > 0);
	}

	@Test
	public void шрифтБезКириллицыЗаменяетсяЦеликом()
	{
		for (Font base : fonts())
		{
			Font f = OverlayText.font(base, 1f);
			assertEquals("кириллица в " + f, -1, new Font(f.getFamily(), f.getStyle(), f.getSize()).canDisplayUpTo("Коровье поле ~62 клетки ↓ ⚠ ✓ ≈ ▶ ✗ … ⚡"));
			assertEquals(base.getStyle(), f.getStyle());
		}
		assertNotEquals(FontManager.getRunescapeFont().getFamily(), OverlayText.font(FontManager.getRunescapeFont(), 1f).getFamily());
		// Шрифт с кириллицей игрок выбрал сам — его и оставляем.
		assertEquals(FontManager.getDefaultFont(), OverlayText.font(FontManager.getDefaultFont(), 1f));
		assertEquals(20f, OverlayText.font(FontManager.getRunescapeFont(), 1.25f).getSize2D(), 0.01);
	}

	@Test
	public void переносПоСловамИБуквам()
	{
		FontMetrics fm = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
			.getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), 1f));
		List<String> lines = OverlayText.wrap("[S1-13] Заработок на закупки: коровьи шкуры", fm, 182);
		assertTrue(lines.size() >= 2);
		assertEquals("[S1-13] Заработок на закупки: коровьи шкуры", String.join(" ", lines));
		for (String l : OverlayText.wrap("Оченьоченьоченьдлинноесловобезпробелов", fm, 60))
		{
			assertTrue(l, fm.stringWidth(l) <= 60);
		}
		assertTrue(OverlayText.wrap("   ", fm, 100).isEmpty());
		assertTrue(OverlayText.wrap(null, fm, 100).isEmpty());
	}

	@Test
	public void числаИПредлогиНеОтрываются()
	{
		FontMetrics fm = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
			.getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), 1f));
		String[] texts = {
			"Сумка: не хватает 12 из 14", "Оптовый список · купить 10", "Название — кнопкой «Копировать» в OSRS Путь",
			"✗ Adamant pickaxe · +20 HP", "⚠ ОПАСНО — ты в зоне!", "~62 клетки ↓", "Готов к выходу (Ready to depart)",
			"[S1-09] Stronghold of Security и 10 000 Coins",
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
				// Ничего не потеряно (слово шире строки режется по буквам — пробелы тогда другие).
				assertEquals(t.replace(" ", ""), String.join("", lines).replace(" ", ""));
				for (String l : lines)
				{
					assertTrue(t + " @" + w + ": «" + l + "»", fm.stringWidth(l) <= w || l.codePointCount(0, l.length()) == 1);
				}
				String[] words = t.split(" ");
				boolean gluedCostsLine = OverlayText.layout(OverlayText.groups(words), fm, w).size()
					> OverlayText.layout(Arrays.asList(words), fm, w).size();
				assertTrue(t + " @" + w + ": строк больше, чем по словам", lines.size() <= OverlayText.layout(Arrays.asList(words), fm, w).size());
				if (w < widest || lines.size() < 2 || gluedCostsLine)
				{
					continue;
				}
				// Связки влезают и не стоят лишней строки — значит, ничего не оторвано.
				for (int i = 0; i < lines.size(); i++)
				{
					String[] parts = lines.get(i).split(" ");
					String end = parts[parts.length - 1];
					assertTrue(t + " @" + w + ": строка кончается предлогом «" + end + "»",
						i == lines.size() - 1 || !(end.length() <= 2 && end.chars().allMatch(Character::isLetter)));
					assertTrue(t + " @" + w + ": строка начинается с «" + parts[0] + "»", !"—".equals(parts[0]) && !"·".equals(parts[0]));
				}
				String tail = lines.get(lines.size() - 1);
				assertTrue(t + " @" + w + ": одинокий хвост «" + tail + "»", tail.contains(" ") || tail.length() > 4);
			}
		}
	}

	@Test
	public void hudНеВылезаетЗаРамку() throws IOException
	{
		List<OsrsPathHudOverlay.State> states = hudStates();
		assertTrue("мало состояний: " + states.size(), states.size() > 300);
		List<String> bad = new ArrayList<>();
		Set<String> saved = new LinkedHashSet<>();
		for (Font base : fonts())
		{
			for (boolean large : new boolean[]{false, true})
			{
				Font font = OverlayText.font(base, large ? OsrsPathHudOverlay.LARGE : 1f);
				int standard = large ? Math.round(OsrsPathHudOverlay.WIDTH * OsrsPathHudOverlay.LARGE) : OsrsPathHudOverlay.WIDTH;
				// Своя ширина и суженная игроком мышью.
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
							bad.add(fontName(base) + (large ? " крупный" : "") + " " + width + "px: " + s.getTitle() + " / " + s.getGoal() + " — " + out + " точек (" + lastWhere + ")");
						}
					}
				}
			}
		}
		assertTrue("вылезает за рамку (" + bad.size() + "):\n" + String.join("\n", bad.subList(0, Math.min(20, bad.size()))), bad.isEmpty());
	}

	@Test
	public void проверкаВылетаИБиржаНеВылезают() throws IOException
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
						bad.add("банк " + tag + " #" + i + " — " + out + " точек (" + lastWhere + ")");
					}
				}
				for (int i = 0; i < lists.size(); i++)
				{
					List<ShoppingPlan.Row> rows = lists.get(i);
					int out = overflow((panel, fm, w) -> GrandExchangeHelperOverlay.build(panel, rows, fm, w, 70), font,
						GrandExchangeHelperOverlay.standardWidth(large), i == 0 ? "ge-" + tag : null);
					if (out > 0)
					{
						bad.add("биржа " + tag + " #" + i + " — " + out + " точек (" + lastWhere + ")");
					}
				}
			}
		}
		assertTrue("вылезает за рамку:\n" + String.join("\n", bad), bad.isEmpty());
	}
}
