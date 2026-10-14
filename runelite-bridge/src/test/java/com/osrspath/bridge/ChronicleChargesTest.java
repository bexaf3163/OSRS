package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

/** The Chronicle's charges from the game's messages, and the purchases of a transport's preparation in the shop and exchange windows (2.53). */
public class ChronicleChargesTest
{
	@Test
	public void everyMessageOfTheBook_givesItsCount()
	{
		assertEquals(Integer.valueOf(12), ChronicleCharges.parse("Your book has 12 charges left."));
		assertEquals(Integer.valueOf(1), ChronicleCharges.parse("You have one charge left in your book."));
		assertEquals(Integer.valueOf(0), ChronicleCharges.parse("Your book has run out of charges."));
		assertEquals(Integer.valueOf(0), ChronicleCharges.parse("Your book does not have any charges. Purchase some Teleport Cards from Diango."));
		assertEquals(Integer.valueOf(1000), ChronicleCharges.parse("Your book is fully charged! It has 1,000 charges already."));
		assertEquals(Integer.valueOf(6), ChronicleCharges.parse("You add 5 charges to your book. It now has 6 charges."));
		assertEquals(Integer.valueOf(1), ChronicleCharges.parse("You add a single charge to your book. It now has one charge."));
		assertEquals("a thousand is written with a comma", Integer.valueOf(1000), ChronicleCharges.parse("You add 988 charges to your book. It now has 1,000 charges."));
	}

	@Test
	public void otherMessagesAndNonsense_sayNothing()
	{
		assertNull(ChronicleCharges.parse(null));
		assertNull(ChronicleCharges.parse("Welcome to Old School RuneScape."));
		assertNull(ChronicleCharges.parse("Your amulet has 3 charges left."));
		assertNull("more than the book holds is not believed", ChronicleCharges.parse("Your book has 5000 charges left."));
	}

	@Test
	public void aStoredCountIsReadBack_garbageIsUnknownNotZero()
	{
		assertEquals(Integer.valueOf(250), ChronicleCharges.read("250"));
		assertEquals(Integer.valueOf(0), ChronicleCharges.read("0"));
		assertNull(ChronicleCharges.read(null));
		assertNull(ChronicleCharges.read("abc"));
		assertNull(ChronicleCharges.read("-3"));
		assertNull(ChronicleCharges.read("1001"));
	}

	private static final String STOCK = "{\"type\":\"item_teleport\",\"destination\":\"Diango's Toy Store\",\"interactionId\":0,\"item\":\"Chronicle\",\"tile\":{\"x\":3081,\"y\":3246,\"plane\":0},"
		+ "\"state\":\"prepare\",\"summary\":\"Stock up for the road: buy Teleport card ×5 at Diango's Toy Store (~750 gp) · Chronicle ×6 save ~3 min\","
		+ "\"text\":\"Stock up for the road at Diango's Toy Store: Teleport card ×5.\",\"chip\":\"⚡ Buy Teleport card ×5 at Diango's Toy Store\","
		+ "\"buy\":[{\"name\":\"Teleport card\",\"quantity\":5,\"where\":\"Diango's Toy Store — Draynor Village\"},{\"name\":\"Law rune\",\"quantity\":4,\"where\":\"Grand Exchange\"}]}";

	private static PrepPlan plan(String transport)
	{
		PrepPlan p = new Gson().fromJson("{\"stepId\":\"S2-03\",\"lines\":[],\"later\":[],\"recommendedTransport\":" + transport + "}", PrepPlan.class);
		assertNull(p.prepare());
		return p;
	}

	private static String rejected(String transport)
	{
		return new Gson().fromJson("{\"stepId\":\"S2-03\",\"lines\":[],\"later\":[],\"recommendedTransport\":" + transport + "}", PrepPlan.class).prepare();
	}

	private static StepGuide.View view(PrepPlan p)
	{
		return new StepGuide.View("[S2-03] Imp Catcher", "goal", Collections.emptyList(), Collections.emptyList(), null, null, null, null, null, p);
	}

	@Test
	public void theShopTheArrowLeadsTo_listsItsPurchases_theExchangeListsItsOwn()
	{
		PrepPlan p = plan(STOCK);
		assertTrue(p.hasTransport());
		ShopWindow.Result shop = ShopWindow.build(ShopWindow.Place.SHOP, view(p), true);
		assertEquals(Arrays.asList("For the road: Teleport card ×5"), texts(shop));
		assertEquals(1, shop.getTodo());
		ShopWindow.Result exchange = ShopWindow.build(ShopWindow.Place.EXCHANGE, view(p), false);
		assertEquals(Arrays.asList("For the road: Law rune ×4"), texts(exchange));
		assertNull("another shop: nothing of the road, and with no items no window", ShopWindow.build(ShopWindow.Place.SHOP, view(p), false));
		assertNull("the bank never lists purchases", ShopWindow.build(ShopWindow.Place.BANK, view(p), true));
	}

	@Test
	public void theRoadRowsAreDrawnInsideTheShopCard() throws java.io.IOException
	{
		ShopWindow.Result r = ShopWindow.build(ShopWindow.Place.SHOP, view(plan(STOCK)), true);
		java.awt.image.BufferedImage img = new java.awt.image.BufferedImage(OsrsPathShopOverlay.WIDTH + 100, 300, java.awt.image.BufferedImage.TYPE_INT_ARGB);
		java.awt.Graphics2D g = img.createGraphics();
		g.setFont(net.runelite.client.ui.FontManager.getRunescapeFont());
		java.awt.Dimension d = OsrsPathShopOverlay.paint(g, r, OsrsPathShopOverlay.WIDTH, 1f, 85, new java.awt.Point(0, 0));
		g.dispose();
		assertTrue("one title and one row fit a small card: " + d, d.height > 20 && d.height < 200 && d.width <= OsrsPathShopOverlay.WIDTH + 2);
		java.io.File out = new java.io.File("build/overlay-render");
		assertTrue(out.isDirectory() || out.mkdirs());
		javax.imageio.ImageIO.write(img.getSubimage(0, 0, d.width, d.height), "png", new java.io.File(out, "shop-road.png"));
	}

	@Test
	public void aReadyWayBuysNothing_andABadPurchaseDropsTheWholeWay()
	{
		PrepPlan ready = plan(STOCK.replace("\"state\":\"prepare\"", "\"state\":\"ready\""));
		assertTrue(ready.hasTransport());
		assertTrue(ready.getRecommendedTransport().buysFor(false).isEmpty());
		assertEquals("invalid transport", rejected(STOCK.replace("\"quantity\":5", "\"quantity\":0")));
		assertEquals("invalid transport", rejected(STOCK.replace("\"where\":\"Grand Exchange\"", "\"where\":null")));
		assertTrue("an older app sends no purchases", plan(STOCK.replaceFirst(",\"buy\":\\[.*\\]", "")).hasTransport());
	}

	private static java.util.List<String> texts(ShopWindow.Result r)
	{
		java.util.List<String> out = new java.util.ArrayList<>();
		for (ShopWindow.Row row : r.getRows())
		{
			out.add(row.getText());
		}
		return out;
	}
}
