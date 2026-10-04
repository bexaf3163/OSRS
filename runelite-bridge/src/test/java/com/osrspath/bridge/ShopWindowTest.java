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

/** The window beside the bank, exchange and merchant: what to take, what to buy, where it is sold - for any quest. */
public class ShopWindowTest
{
	private static StepGuide.ItemLine item(String name, int need, StepGuide.Have have, String where)
	{
		String shown = name + (need > 1 ? " ×" + need : "");
		return new StepGuide.ItemLine(shown, "status", have, where, -1, shown, "tag");
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
			item("Beer", 3, StepGuide.Have.BANK, "Blue Moon Inn pub"),
			item("Garlic", 1, StepGuide.Have.BAG, null),
			item("Hammer", 1, StepGuide.Have.NONE, "Lumbridge General Store."),
			item("Stake", 1, StepGuide.Have.IN_STEP, null));
	}

	@Test
	public void inTheBank_take_notInTheBank_alreadyInTheBag()
	{
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.BANK, vampyre());
		assertEquals("Bank · what to take · S2-08", r.getTitle());
		List<String> t = texts(r);
		assertEquals("Take: Beer ×3", t.get(0));
		assertEquals("Not in the bank: Hammer — Lumbridge General Store", t.get(1));
		assertEquals("Already in the bag: Garlic", t.get(2));
		assertEquals("taking and buying are the jobs here", 2, r.getTodo());
		assertFalse("the window ignores 'you will get it along the way'", String.join("|", t).contains("Stake"));
	}

	@Test
	public void atTheExchange_buyWhatIsNowhere_whatLiesInTheBankIsNotBought()
	{
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.EXCHANGE, vampyre());
		assertEquals("Exchange · what to buy · S2-08", r.getTitle());
		List<String> t = texts(r);
		assertEquals("Buy: Hammer — Lumbridge General Store", t.get(0));
		assertTrue(t.contains("In the bank (do not buy): Beer ×3"));
		assertTrue(t.contains("Already in the bag: Garlic"));
		assertEquals(1, r.getTodo());
	}

	@Test
	public void atAMerchant_sameAsTheExchange_butWithItsOwnTitle()
	{
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.SHOP, vampyre());
		assertEquals("Shop · what to buy · S2-08", r.getTitle());
		assertEquals("Buy: Hammer — Lumbridge General Store", texts(r).get(0));
	}

	@Test
	public void theAppsActionReplacesTheGenericWhereToGet()
	{
		PrepPlan p = plan("{\"stepId\":\"S2-08\",\"lines\":[{\"name\":\"Hammer\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"IMPORTANT\",\"timing\":\"NOW\","
			+ "\"action\":\"Buy from Betty - 3 gp\"}]}");
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.SHOP, view(p, item("Hammer", 1, StepGuide.Have.NONE, "General store.")));
		assertEquals("Buy: Hammer — Buy from Betty - 3 gp", texts(r).get(0));
	}

	@Test
	public void planLinesWithoutAnItemInTheList_areAdded_andWeightAndDoNotTakeNowAtTheBank()
	{
		PrepPlan p = plan("{\"stepId\":\"S2-08\",\"weight\":\"Deposit in the bank: Iron platebody\",\"slots\":\"It will not all fit at once\",\"later\":[\"Blue dye\",\"Orange dye\"],"
			+ "\"lines\":[{\"name\":\"Lobster\",\"need\":5,\"where\":\"BANK\",\"priority\":\"IMPORTANT\",\"timing\":\"SOON\"},"
			+ "{\"name\":\"Rope\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"IMPORTANT\",\"timing\":\"SOON\"},"
			+ "{\"name\":\"Spade\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"OPTIONAL\",\"timing\":\"SOON\"},"
			+ "{\"name\":\"Pickaxe\",\"need\":1,\"where\":\"MISSING\",\"priority\":\"IMPORTANT\",\"timing\":\"IN_STEP\"}]}");
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.BANK, view(p, item("Garlic", 1, StepGuide.Have.BAG, null)));
		List<String> t = texts(r);
		assertEquals("Take: Lobster ×5", t.get(0));
		assertEquals("Not in the bank: Rope", t.get(1));
		assertFalse("optional items and 'along the way' items are not hauled", String.join("|", t).contains("Spade") || String.join("|", t).contains("Pickaxe"));
		assertTrue(t.contains("Weight: Deposit in the bank: Iron platebody"));
		assertTrue(t.contains("⚠ It will not all fit at once"));
		assertTrue(t.contains("Don't take now: Blue dye, Orange dye"));
	}

	@Test
	public void aLongListOfWhatIsAlreadyInTheBag_isCut()
	{
		assertEquals("Already in the bag: A, B", ShopWindow.bagLine(java.util.Arrays.asList("A", "B")));
		assertEquals("Already in the bag: A, B, C, D and 9 more",
			ShopWindow.bagLine(java.util.Arrays.asList("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M")));
	}

	@Test
	public void everythingIsThereOrNothingToBuy_theWindowSaysSo()
	{
		StepGuide.View ok = view(null, item("Garlic", 1, StepGuide.Have.BAG, null));
		assertEquals("Everything needed is already in the bag ✓", texts(ShopWindow.build(ShopWindow.Place.BANK, ok)).get(0));
		assertEquals("Nothing to buy here ✓", texts(ShopWindow.build(ShopWindow.Place.EXCHANGE, ok)).get(0));
		assertEquals(0, ShopWindow.build(ShopWindow.Place.BANK, ok).getTodo());
	}

	@Test
	public void withoutAStepOrWithoutItems_noWindow()
	{
		assertNull(ShopWindow.build(ShopWindow.Place.BANK, null));
		assertNull(ShopWindow.build(ShopWindow.Place.BANK, view(null)));
		assertNull("everything is 'along the way': nothing to do at the bank", ShopWindow.build(ShopWindow.Place.BANK, view(null, item("Pickaxe", 1, StepGuide.Have.IN_STEP, null))));
	}

	@Test
	public void aLongListIsCutWithAMark()
	{
		StepGuide.ItemLine[] many = new StepGuide.ItemLine[20];
		for (int i = 0; i < many.length; i++)
		{
			many[i] = item("Item" + i, 1, StepGuide.Have.NONE, null);
		}
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.EXCHANGE, view(null, many));
		assertTrue(r.getRows().size() <= ShopWindow.MAX_ROWS + 1);
		assertEquals("... and 8 more", texts(r).get(texts(r).size() - 1));
	}

	@Test
	public void theCardStandsBesideTheGameWindow()
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
	public void drawnWithTheRealFontInsideAFrame_andAPictureForTheEye() throws IOException
	{
		PrepPlan p = plan("{\"stepId\":\"S2-08\",\"weight\":\"Deposit in the bank: Iron platebody, Iron plateskirt, Iron kiteshield and 2 more\",\"slots\":\"It will not all fit at once - 1 slot too many\","
			+ "\"later\":[\"Blue dye\",\"Orange dye\"],\"lines\":[{\"name\":\"Lobster\",\"need\":5,\"where\":\"BANK\",\"priority\":\"IMPORTANT\",\"timing\":\"NOW\"}]}");
		File out = new File("build/overlay-render");
		assertTrue(out.isDirectory() || out.mkdirs());
		for (ShopWindow.Place place : ShopWindow.Place.values())
		{
			ShopWindow.Result r = ShopWindow.build(place, view(p,
				item("Beer", 3, StepGuide.Have.BANK, "Blue Moon Inn pub, Varrock (bartender)"),
				item("Hammer", 1, StepGuide.Have.NONE, "Lumbridge General Store (Shop keeper)"),
				item("Garlic", 1, StepGuide.Have.BAG, null)));
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
			assertEquals(place + ": nothing is drawn outside the frame", 0, stray);
			assertTrue(place + ": the height is sensible " + d.height, d.height < 420);
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
