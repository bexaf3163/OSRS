package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.RenderingHints;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import javax.imageio.ImageIO;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/** Окно у банка, биржи и торговца: что взять, что купить, где продаётся — для любого квеста. */
public class ShopWindowTest
{
	private static StepGuide.ItemLine item(String name, String ru, int need, StepGuide.Have have, String where)
	{
		String shown = name + (need > 1 ? " ×" + need : "");
		return new StepGuide.ItemLine(shown + (ru == null ? "" : " (" + ru + ")"), "status", have, where, -1, shown, ru, "tag");
	}

	private static StepGuide.View view(PrepPlan plan, StepGuide.ItemLine... items)
	{
		return new StepGuide.View("[S2-08] Vampyre Slayer", "goal", Arrays.asList(items), Collections.emptyList(), null, null, null, null, null, plan);
	}

	private static PrepPlan plan(String json)
	{
		PrepPlan p = new Gson().fromJson(json, PrepPlan.class);
		assertNull(p.prepare());
		return p;
	}

	private static List<String> texts(ShopWindow.Result r)
	{
		List<String> out = new ArrayList<>();
		for (ShopWindow.Row row : r.getRows())
		{
			out.add(row.getText());
		}
		return out;
	}

	private static StepGuide.View vampyre()
	{
		return view(null,
			item("Beer", "Пиво", 3, StepGuide.Have.BANK, "паб Blue Moon Inn"),
			item("Garlic", null, 1, StepGuide.Have.BAG, null),
			item("Hammer", null, 1, StepGuide.Have.NONE, "Бакалея Лумбриджа."),
			item("Stake", null, 1, StepGuide.Have.IN_STEP, null));
	}

	@Test
	public void вБанке_взять_нетВБанке_ужеВСумке()
	{
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.BANK, vampyre());
		assertEquals("Банк · что взять · S2-08", r.getTitle());
		List<String> t = texts(r);
		assertEquals("Взять: Beer ×3 (Пиво)", t.get(0));
		assertEquals("Нет в банке: Hammer — Бакалея Лумбриджа", t.get(1));
		assertEquals("Уже в сумке: Garlic", t.get(2));
		assertEquals("взять и купить — это дела здесь", 2, r.getTodo());
		assertFalse("«добудешь по ходу» окно не касается", String.join("|", t).contains("Stake"));
	}

	@Test
	public void наБирже_купитьТоЧегоНетНигде_ЛежащееВБанкеНеПокупаем()
	{
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.EXCHANGE, vampyre());
		assertEquals("Биржа · что купить · S2-08", r.getTitle());
		List<String> t = texts(r);
		assertEquals("Купить: Hammer — Бакалея Лумбриджа", t.get(0));
		assertTrue(t.contains("Лежит в банке (не покупай): Beer ×3 (Пиво)"));
		assertTrue(t.contains("Уже в сумке: Garlic"));
		assertEquals(1, r.getTodo());
	}

	@Test
	public void уТорговца_тоЖеЧтоНаБирже_ноСвоимЗаголовком()
	{
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.SHOP, vampyre());
		assertEquals("Магазин · что купить · S2-08", r.getTitle());
		assertEquals("Купить: Hammer — Бакалея Лумбриджа", texts(r).get(0));
	}

	@Test
	public void действиеПрограммыЗаменяетОбщееГдеВзять()
	{
		PrepPlan p = plan("{\"stepId\":\"S2-08\",\"lines\":[{\"name\":\"Hammer\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"IMPORTANT\",\"timing\":\"NOW\","
			+ "\"action\":\"Купи у Betty — 3 gp\"}]}");
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.SHOP, view(p, item("Hammer", null, 1, StepGuide.Have.NONE, "Бакалея.")));
		assertEquals("Купить: Hammer — Купи у Betty — 3 gp", texts(r).get(0));
	}

	@Test
	public void строкиПланаБезПредметаВСписке_добавляются_иВесИНеБериСейчасВБанке()
	{
		PrepPlan p = plan("{\"stepId\":\"S2-08\",\"weight\":\"Сними в банк: Iron platebody\",\"slots\":\"Всё сразу не влезет\",\"later\":[\"Blue dye\",\"Orange dye\"],"
			+ "\"lines\":[{\"name\":\"Lobster\",\"need\":5,\"where\":\"BANK\",\"priority\":\"IMPORTANT\",\"timing\":\"SOON\"},"
			+ "{\"name\":\"Rope\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"IMPORTANT\",\"timing\":\"SOON\"},"
			+ "{\"name\":\"Spade\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"OPTIONAL\",\"timing\":\"SOON\"},"
			+ "{\"name\":\"Pickaxe\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"IMPORTANT\",\"timing\":\"IN_STEP\"}]}");
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.BANK, view(p, item("Garlic", null, 1, StepGuide.Have.BAG, null)));
		List<String> t = texts(r);
		assertEquals("Взять: Lobster ×5", t.get(0));
		assertEquals("Нет в банке: Rope", t.get(1));
		assertFalse("необязательное и «по ходу» не тащим", String.join("|", t).contains("Spade") || String.join("|", t).contains("Pickaxe"));
		assertTrue(t.contains("Вес: Сними в банк: Iron platebody"));
		assertTrue(t.contains("⚠ Всё сразу не влезет"));
		assertTrue(t.contains("Не бери сейчас: Blue dye, Orange dye"));
	}

	@Test
	public void всёЕстьИлиПокупатьНечего_окноГоворитОбЭтом()
	{
		StepGuide.View ok = view(null, item("Garlic", null, 1, StepGuide.Have.BAG, null));
		assertEquals("Всё нужное уже в сумке ✓", texts(ShopWindow.build(ShopWindow.Place.BANK, ok)).get(0));
		assertEquals("Здесь покупать нечего ✓", texts(ShopWindow.build(ShopWindow.Place.EXCHANGE, ok)).get(0));
		assertEquals(0, ShopWindow.build(ShopWindow.Place.BANK, ok).getTodo());
	}

	@Test
	public void безШагаИлиБезПредметов_окнаНет()
	{
		assertNull(ShopWindow.build(ShopWindow.Place.BANK, null));
		assertNull(ShopWindow.build(ShopWindow.Place.BANK, view(null)));
		assertNull("всё «по ходу шага» — у банка нечего делать", ShopWindow.build(ShopWindow.Place.BANK, view(null, item("Pickaxe", null, 1, StepGuide.Have.IN_STEP, null))));
	}

	@Test
	public void длинныйСписокОбрезаетсяСПометкой()
	{
		StepGuide.ItemLine[] many = new StepGuide.ItemLine[20];
		for (int i = 0; i < many.length; i++)
		{
			many[i] = item("Item" + i, null, 1, StepGuide.Have.NONE, null);
		}
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.EXCHANGE, view(null, many));
		assertTrue(r.getRows().size() <= ShopWindow.MAX_ROWS + 1);
		assertEquals("…и ещё 8", texts(r).get(texts(r).size() - 1));
	}

	@Test
	public void карточкаСтоитСбокуОтОкнаИгры()
	{
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.BANK, vampyre());
		Point left = OsrsPathShopOverlay.place(new Rectangle(700, 40, 500, 600), 1900, 1000, r, null);
		assertEquals(700 - OsrsPathShopOverlay.WIDTH - 8, left.x);
		assertEquals(40, left.y);
		Point right = OsrsPathShopOverlay.place(new Rectangle(100, 40, 500, 600), 1900, 1000, r, null);
		assertEquals(100 + 500 + 8, right.x);
		Point corner = OsrsPathShopOverlay.place(new Rectangle(100, 40, 1700, 600), 1900, 1000, r, null);
		assertEquals(new Point(8, 8), corner);
		assertEquals(new Point(8, 8), OsrsPathShopOverlay.place(null, 1900, 1000, r, null));
	}

	@Test
	public void рисуетсяНастоящимШрифтомВРамке_иКартинкаДляГлаза() throws IOException
	{
		PrepPlan p = plan("{\"stepId\":\"S2-08\",\"weight\":\"Сними в банк: Iron platebody, Iron plateskirt, Iron kiteshield и ещё 2\",\"slots\":\"Всё сразу не влезет — на 1 ячейку больше\","
			+ "\"later\":[\"Blue dye\",\"Orange dye\"],\"lines\":[{\"name\":\"Lobster\",\"need\":5,\"where\":\"BANK\",\"priority\":\"IMPORTANT\",\"timing\":\"NOW\"}]}");
		File out = new File("build/overlay-render");
		assertTrue(out.isDirectory() || out.mkdirs());
		for (ShopWindow.Place place : ShopWindow.Place.values())
		{
			ShopWindow.Result r = ShopWindow.build(place, view(p,
				item("Beer", "Пиво", 3, StepGuide.Have.BANK, "паб Blue Moon Inn, Varrock (бармен)"),
				item("Hammer", null, 1, StepGuide.Have.NONE, "Бакалея Лумбриджа, Lumbridge General Store (Shop keeper)"),
				item("Garlic", null, 1, StepGuide.Have.BAG, null)));
			assertNotNull(r);
			BufferedImage img = new BufferedImage(OsrsPathShopOverlay.WIDTH + 200, 520, BufferedImage.TYPE_INT_ARGB);
			Graphics2D g = img.createGraphics();
			g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			g.setFont(FontManager.getRunescapeFont());
			Dimension d = OsrsPathShopOverlay.paint(g, r, OsrsPathShopOverlay.WIDTH, 1f, 85, new Point(0, 0));
			g.dispose();
			int stray = 0;
			for (int y = 0; y < img.getHeight(); y++)
			{
				for (int x = 0; x < img.getWidth(); x++)
				{
					boolean outside = x >= d.width + 2 || y >= d.height + 2;
					if (outside && ((img.getRGB(x, y) >> 24) & 0xFF) != 0)
					{
						stray++;
					}
				}
			}
			assertEquals(place + ": за рамкой ничего не нарисовано", 0, stray);
			assertTrue(place + ": высота разумна " + d.height, d.height < 420);
			BufferedImage flat = new BufferedImage(d.width, d.height, BufferedImage.TYPE_INT_RGB);
			Graphics2D fg = flat.createGraphics();
			fg.setColor(new java.awt.Color(60, 90, 50));
			fg.fillRect(0, 0, d.width, d.height);
			fg.drawImage(img.getSubimage(0, 0, d.width, d.height), 0, 0, null);
			fg.dispose();
			ImageIO.write(flat, "png", new File(out, "shop-" + place.name().toLowerCase() + ".png"));
		}
	}
}
