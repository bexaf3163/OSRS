package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/** The inventory cleanup in the game (2.61.0): only shown, for the right character, while the stack is in the bag and the app is about. */
public class CleanupHintTest
{
	private static final Gson GSON = new Gson();
	private static final long NOW = 1_000_000_000L;

	private static final String JSON = "{\"player\":\"Bexqq\",\"lines\":["
		+ "{\"name\":\"Oak logs\",\"id\":1522,\"qty\":40,\"noted\":true,\"action\":\"sell\",\"why\":\"no use ahead\",\"proceeds\":3600},"
		+ "{\"name\":\"Ball of wool\",\"id\":1759,\"qty\":20,\"action\":\"sell\",\"why\":\"keep 3, the rest has no use ahead\",\"proceeds\":1200},"
		+ "{\"name\":\"Research package\",\"id\":290,\"qty\":1,\"action\":\"destroy\",\"why\":\"its quest is done, no other use\"},"
		+ "{\"name\":\"Bronze sword\",\"id\":1277,\"qty\":1,\"action\":\"review\",\"why\":\"gear, maybe a backup\"}]}";

	private static CleanupHint hint(String json)
	{
		return GSON.fromJson(json, CleanupHint.class);
	}

	private static Map<Integer, Integer> bag(int... idCount)
	{
		Map<Integer, Integer> m = new HashMap<>();
		for (int i = 0; i < idCount.length; i += 2)
		{
			m.put(idCount[i], idCount[i + 1]);
		}
		return m;
	}

	private static final Map<Integer, Integer> FULL = bag(1522, 40, 1759, 23, 290, 1, 1277, 1);

	private static StepGuide.View vampyre()
	{
		return new StepGuide.View("[S2-08] Vampyre Slayer", "goal", Arrays.asList(
			new StepGuide.ItemLine("Beer ×3", "status", StepGuide.Have.BANK, "pub", -1, "Beer ×3", "tag")), Collections.emptyList(), null, null, null, null, null, null);
	}

	@Test
	public void aGoodHintPasses_andEveryBadPartIsNamed()
	{
		assertNull(hint(JSON).prepare());
		assertEquals("invalid action", hint(JSON.replace("\"review\"", "\"alch\"")).prepare());
		assertEquals("invalid player", hint(JSON.replace("\"Bexqq\"", "\"  \"")).prepare());
		assertEquals("invalid count", hint(JSON.replace("\"id\":290", "\"id\":0")).prepare());
		assertEquals("invalid count", hint(JSON.replace("\"qty\":40", "\"qty\":-1")).prepare());
		assertEquals("no lines", hint("{\"player\":\"Bexqq\",\"lines\":[]}").prepare());
		StringBuilder many = new StringBuilder("{\"player\":\"Bexqq\",\"lines\":[");
		for (int i = 0; i <= CleanupHint.MAX_LINES; i++)
		{
			many.append(i == 0 ? "" : ",").append("{\"name\":\"X\",\"id\":").append(i + 1).append(",\"qty\":1,\"action\":\"sell\"}");
		}
		assertEquals("too many lines", hint(many + "]}").prepare());
	}

	@Test
	public void aBadCleanupPartIsRejectedAlone_theRestOfTheSnapshotStands()
	{
		PrepEnvelope e = GSON.fromJson("{\"v\":6,\"seq\":5,\"step\":null,\"cleanup\":" + JSON.replace("\"review\"", "\"alch\"") + "}", PrepEnvelope.class);
		assertEquals(Collections.singleton(PrepEnvelope.CLEANUP), e.prepare().keySet());
		PrepEnvelope ok = GSON.fromJson("{\"v\":6,\"seq\":6,\"cleanup\":" + JSON + "}", PrepEnvelope.class);
		assertTrue(ok.prepare().isEmpty());
		assertEquals(4, ok.getCleanup().getLines().size());
		PrepEnvelope old = GSON.fromJson("{\"v\":6,\"seq\":7}", PrepEnvelope.class);
		assertNull("an app without cleanup sends none: nothing is shown", old.getCleanup());
	}

	@Test
	public void theCardRowSaysTheActionCountReasonAndEstimate()
	{
		List<CleanupHint.Line> l = hint(JSON).visible("Bexqq", FULL, NOW, NOW);
		assertEquals("Sell: Oak logs ×40 (noted) — no use ahead · ~3.6k gp", l.get(0).text());
		assertEquals("Destroy: Research package — its quest is done, no other use", l.get(2).text());
		assertEquals("Review: Bronze sword — gear, maybe a backup", l.get(3).text());
		assertEquals("950 gp", CleanupHint.gp(950));
		assertEquals("12k gp", CleanupHint.gp(12_000));
		assertEquals("1.2M gp", CleanupHint.gp(1_234_567));
		assertEquals("150k gp", CleanupHint.gp(150_400));
	}

	@Test
	public void onlyForTheCharacterItWasMadeFor()
	{
		assertEquals(4, hint(JSON).visible("bexqq", FULL, NOW, NOW).size());
		assertEquals("the game's name may hold a non-breaking space", 4, hint(JSON.replace("Bexqq", "Bex qq")).visible("Bex qq", FULL, NOW, NOW).size());
		assertTrue("another character on the same machine sees nothing", hint(JSON).visible("Someone Else", FULL, NOW, NOW).isEmpty());
		assertTrue(hint(JSON).visible(null, FULL, NOW, NOW).isEmpty());
	}

	@Test
	public void aStackThatLeftTheBagIsNotShown_aSmallerOneShowsWhatIsLeft()
	{
		List<CleanupHint.Line> l = hint(JSON).visible("Bexqq", bag(1522, 10, 1759, 23, 1277, 1), NOW, NOW);
		assertEquals(3, l.size());
		assertEquals("the sold part is gone from the count", 10, l.get(0).getQty());
		assertEquals("and from the estimate", 900, l.get(0).getProceeds());
		assertFalse("the destroyed package is gone", l.stream().anyMatch(x -> x.getId() == 290));
		assertEquals("the stack grew: the advice still names only the surplus", 20, l.get(1).getQty());
		assertTrue(hint(JSON).visible("Bexqq", Collections.emptyMap(), NOW, NOW).isEmpty());
	}

	@Test
	public void theAdviceExpiresWhenTheAppHasBeenGoneTenMinutes()
	{
		assertEquals(4, hint(JSON).visible("Bexqq", FULL, NOW, NOW - CleanupHint.STALE_MS).size());
		assertTrue(hint(JSON).visible("Bexqq", FULL, NOW, NOW - CleanupHint.STALE_MS - 1).isEmpty());
	}

	@Test
	public void theBankCardAddsTheCleanupUnderTheStepsRows_withoutChangingWhatIsToDo()
	{
		ShopWindow.Result step = ShopWindow.build(ShopWindow.Place.BANK, vampyre());
		List<CleanupHint.Line> lines = hint(JSON).visible("Bexqq", FULL, NOW, NOW);
		ShopWindow.Result r = ShopWindow.withCleanup(step, ShopWindow.Place.BANK, lines);
		assertEquals(step.getTitle(), r.getTitle());
		assertEquals("cleanup is never a to-do", step.getTodo(), r.getTodo());
		List<String> t = texts(r);
		assertEquals("Take: Beer ×3", t.get(0));
		assertTrue(t.toString(), t.contains("Inventory cleanup (advice only):"));
		assertTrue(t.toString(), t.contains("Destroy: Research package — its quest is done, no other use"));
		assertEquals(ShopWindow.Mark.SELL, r.getRows().get(t.indexOf("Sell: Oak logs ×40 (noted) — no use ahead · ~3.6k gp")).getMark());
		assertEquals(ShopWindow.Mark.REVIEW, r.getRows().get(t.size() - 1).getMark());
	}

	@Test
	public void atTheExchangeOnlyTheSales_andWithNoStepCardTheCleanupHasItsOwn()
	{
		List<CleanupHint.Line> lines = hint(JSON).visible("Bexqq", FULL, NOW, NOW);
		ShopWindow.Result ge = ShopWindow.withCleanup(null, ShopWindow.Place.EXCHANGE, lines);
		assertEquals("Exchange · what can be sold", ge.getTitle());
		assertEquals(0, ge.getTodo());
		List<String> t = texts(ge);
		assertEquals(3, t.size());
		assertTrue(t.toString(), t.stream().skip(1).allMatch(s -> s.startsWith("Sell: ")));
		assertEquals("Bank · inventory cleanup", ShopWindow.withCleanup(null, ShopWindow.Place.BANK, lines).getTitle());
		assertNull("nothing to clean and no step: no card", ShopWindow.withCleanup(null, ShopWindow.Place.SHOP, Collections.emptyList()));
		List<CleanupHint.Line> review = Collections.singletonList(lines.get(3));
		assertNull("only a review line: nothing at the exchange", ShopWindow.withCleanup(null, ShopWindow.Place.EXCHANGE, review));
		ShopWindow.Result same = ShopWindow.build(ShopWindow.Place.EXCHANGE, vampyre());
		assertSame(same, ShopWindow.withCleanup(same, ShopWindow.Place.EXCHANGE, review));
	}

	@Test
	public void aLongListIsCounted()
	{
		List<CleanupHint.Line> many = new ArrayList<>();
		for (int i = 0; i < 9; i++)
		{
			many.add(new CleanupHint.Line("Thing " + i, 100 + i, 1, false, "drop", "x", 0));
		}
		List<String> t = texts(ShopWindow.withCleanup(null, ShopWindow.Place.BANK, many));
		assertEquals(1 + ShopWindow.CLEANUP_SHOWN + 1, t.size());
		assertEquals("... and 4 more in the app (Shopping)", t.get(t.size() - 1));
	}

	@Test
	public void theGuideHasTheCleanupUnderMoreAdvice_itsFirstLinesOnly()
	{
		StepGuide.View v = vampyre().withCleanup(hint(JSON).visible("Bexqq", FULL, NOW, NOW));
		HudModel.Card c = HudModel.build(HudModelTest.input(v, HudModelTest.quiet(), null));
		assertEquals("each line is one suggestion; the label is not counted", 4, c.adviceCount());
		assertEquals(0, HudModel.build(HudModelTest.input(v.withCleanup(Collections.emptyList()), HudModelTest.quiet(), null)).adviceCount());
		String closed = c.plain(true, false);
		assertTrue("the control counts it: " + closed, closed.contains("More advice · 4"));
		assertFalse("not before it is asked for: " + closed, closed.contains("Inventory cleanup"));
		assertFalse("never on the closed card", c.plain(false, false).contains("Oak logs"));
		String adv = c.plain(true, true);
		assertTrue(adv, adv.contains("Inventory cleanup (advice only):"));
		assertTrue(adv, adv.contains("Sell: Oak logs ×40 (noted) — no use ahead · ~3.6k gp"));
		assertTrue(adv, adv.contains("Review: Bronze sword"));
		assertTrue("nothing in it is a button: the plugin does nothing with the items",
			c.getAdvice().stream().noneMatch(l -> l.getAction().isClickable()));
		assertEquals("the view keeps its lines through the other withers", 4, v.withAdviceTab(true).withNote("n").withPrep(null).getCleanup().size());
		List<CleanupHint.Line> many = new ArrayList<>();
		for (int i = 0; i < 9; i++)
		{
			many.add(new CleanupHint.Line("Thing " + i, 100 + i, 1, false, "drop", "x", 0));
		}
		String long_ = HudModel.build(HudModelTest.input(v.withCleanup(many), HudModelTest.quiet(), null)).plain(true, true);
		assertTrue(long_, long_.contains("and 5 more on the bank card and in the app"));
	}

	@Test
	public void drawnOnTheBankCardWithTheRealFont_andAPictureForTheEye() throws IOException
	{
		ShopWindow.Result r = ShopWindow.withCleanup(ShopWindow.build(ShopWindow.Place.BANK, vampyre()), ShopWindow.Place.BANK,
			hint(JSON).visible("Bexqq", FULL, NOW, NOW));
		BufferedImage img = new BufferedImage(OsrsPathShopOverlay.WIDTH, 420, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setColor(new java.awt.Color(60, 90, 50));
		g.fillRect(0, 0, img.getWidth(), img.getHeight());
		g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g.setFont(FontManager.getRunescapeFont());
		Dimension d = OsrsPathShopOverlay.paint(g, r, OsrsPathShopOverlay.WIDTH, 1f, 85, new Point(0, 0));
		g.dispose();
		assertTrue("the card fits: " + d.height, d.height < 400);
		File out = new File("build/overlay-render");
		assertTrue(out.isDirectory() || out.mkdirs());
		ImageIO.write(img.getSubimage(0, 0, d.width, d.height), "png", new File(out, "shop-bank-cleanup.png"));
	}

	private static List<String> texts(ShopWindow.Result r)
	{
		assertNotNull(r);
		List<String> out = new ArrayList<>();
		for (ShopWindow.Row row : r.getRows())
		{
			out.add(row.getText());
		}
		return out;
	}
}
