package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.Test;

/** The cards of the brief and of the screenshots, and the HUD as the player sees them, for the tests of the plaque and the guide. */
public class HudRenderTest
{
	/** The cards of the brief and of the screenshots, by name. */
	static Map<String, HudModel.Card> cards()
	{
		Map<String, HudModel.Card> out = new LinkedHashMap<>();
		String s403 = "[S4-03] Attack to 40 and bank 50 Big bones";
		StepGuide.ItemLine salmonBag = HudModelTest.salmon(StepGuide.Have.BAG, 21, 30);
		StepGuide.ItemLine scimitar = HudModelTest.item("Adamant scimitar", StepGuide.Have.BAG, 1, 1, 0, 1, null, false);
		HudModel.Input training = HudModelTest.with(HudModelTest.input(HudModelTest.view(s403, null, scimitar, salmonBag), HudModelTest.quiet(), HudModelTest.attack(30)),
			"planNext", "Fight the Hill Giants until 50 Big bones are in the bank: Edgeville Dungeon.");
		out.put("training", HudModel.build(training));
		HudModel.Input collection = HudModelTest.with(training, "planNow", "Collect 50 Big bones from Hill Giants on Accurate");
		collection = HudModelTest.with(collection, "view", new StepGuide.View(s403, null, Arrays.asList(scimitar, salmonBag),
			Collections.singletonList(new StepGuide.PlaceLine("The trapdoor to the Edgeville Dungeon", 0, false, null, false)), null, null, null, null));
		collection = HudModelTest.with(collection, "planNext", "Train Attack to 40 on cows");
		out.put("collection", HudModel.build(collection));
		PrepPlan food = HudModelTest.plan(HudModelTest.line("Salmon", 21, "BANK", "CRITICAL", "NOW", "CRITICAL", "Take from the bank ×21"),
			HudModelTest.line("Iron chainbody", 1, "BANK", "OPTIMIZATION", "NOW", null, "Take from the bank"));
		StepGuide.ItemLine chain = HudModelTest.item("Iron chainbody", StepGuide.Have.BANK, 0, 1, 1, 0, null, false);
		out.put("food", HudModel.build(HudModelTest.with(HudModelTest.input(HudModelTest.view(s403, food, scimitar, HudModelTest.salmon(StepGuide.Have.BANK, 0, 30), chain),
			HudModelTest.quiet(), HudModelTest.attack(30)), "planNext", "Fight the Hill Giants until 50 Big bones are in the bank: Edgeville Dungeon.")));
		out.put("unknown-bank", HudModel.build(HudModelTest.input(HudModelTest.view(s403, null, HudModelTest.salmon(StepGuide.Have.UNKNOWN, 0, -1)),
			HudModelTest.state("~229 tiles ↘", 229), HudModelTest.attack(30))));
		Hud.State danger = new Hud.State(null, null, "~12 tiles ↑", false, null, false, "Hill Giants (level 28) hit up to 8 here: keep food with you", true, null, false,
			null, "HP 7/24 - EAT NOW! Hits up to 8", true, null, 12, null, 0.4, true, "No Salmon left - bank now", true);
		out.put("danger", HudModel.build(HudModelTest.input(HudModelTest.view(s403, null, scimitar), danger, HudModelTest.attack(31))));
		out.put("stage", HudModel.build(HudModelTest.input(HudModelTest.princeAli(1, false), HudModelTest.quiet(), null)));
		PrepPlan advice = new com.google.gson.Gson().fromJson("{\"stepId\":\"S4-03\",\"lines\":[],\"later\":[\"Lobster ×20\",\"Anti-dragon shield\"],"
			+ "\"weight\":\"Leave the logs: 18 kg slows the run\",\"slots\":\"The bag is full by 3 slots: leave the Oak logs\",\"activeDetour\":{"
			+ "\"text\":\"Bank: Withdraw Hammer at Varrock West Bank (+60 tiles, saves ~84 s)\",\"label\":\"Varrock West Bank\","
			+ "\"targetTile\":{\"x\":3185,\"y\":3436,\"plane\":0},\"costTiles\":60,\"actionType\":\"WITHDRAW\"},"
			+ "\"recommendedTransport\":{\"type\":\"Item teleport\",\"destination\":\"Falador\",\"interactionId\":0,\"item\":\"Falador teleport\","
			+ "\"tile\":{\"x\":2965,\"y\":3378,\"plane\":0},\"text\":\"Falador teleport saves ~120 tiles\"},"
			+ "\"bankWithdrawals\":[{\"itemId\":8007,\"itemName\":\"Falador teleport\",\"quantity\":2}]}", PrepPlan.class);
		assertNull(advice.prepare());
		Hud.State upgrade = new Hud.State(null, null, null, false, null, false, null, false, null, false, "Wear Iron chainbody - it is in the bank", null, false,
			null, -1, null, null, false, null, false);
		out.put("advice", HudModel.build(HudModelTest.input(HudModelTest.view(s403, advice, scimitar, salmonBag), upgrade, HudModelTest.attack(30))));
		out.put("funding", HudModel.build(HudModelTest.with(HudModelTest.input(HudModelTest.view(s403, null), HudModelTest.quiet(), HudModelTest.attack(30)), "funding",
			new HudModel.Funding("Kill cows and sell the cowhides at the Grand Exchange", "12 / 27 Cowhide", true))));
		Preflight.Block pb = new Preflight.Block("Salmon", 21, 3, Preflight.Via.BANK, null, 3117, 9856, 0);
		out.put("preflight", HudModel.build(HudModelTest.with(HudModelTest.input(HudModelTest.view(s403, null), HudModelTest.quiet(), HudModelTest.attack(30)),
			"preflight", pb)));
		return out;
	}

	/** The card as the player sees it: closed, or open on the Now tab (the Advice tab when advice). */
	static OsrsPathGuideOverlay.Layout layout(HudModel.Card c, boolean expanded, boolean advice, int width, float scale, int maxHeight)
	{
		return LedgerGuideTest.layout(c, !expanded ? LedgerGuideTest.CLOSED : advice ? LedgerGuide.ADVICE : LedgerGuide.NOW, width, scale, maxHeight);
	}

	/** The card painted on a patch of grass-green ground, as it stands in the game. */
	static BufferedImage paint(OsrsPathGuideOverlay.Layout l)
	{
		return LedgerGuideTest.paint(l, 85);
	}
}
