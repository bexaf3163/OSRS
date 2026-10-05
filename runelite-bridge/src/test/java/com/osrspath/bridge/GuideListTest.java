package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.awt.Canvas;
import java.awt.FontMetrics;
import java.awt.Rectangle;
import java.awt.event.InputEvent;
import java.awt.event.MouseEvent;
import java.awt.image.BufferedImage;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import net.runelite.api.Client;
import net.runelite.api.Menu;
import net.runelite.api.MenuEntry;
import net.runelite.api.widgets.Widget;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/**
 * The "What you need" list on the game screen: which lines, which of them are buttons, what the hint says, how it collapses,
 * and what a click does: whether it reaches the game.
 */
public class GuideListTest
{
	private static final FontMetrics FM = metrics(1f);
	private static final FontMetrics SMALL = metrics(OsrsPathGuideOverlay.SMALL);

	private static FontMetrics metrics(float scale)
	{
		return new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
			.getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), scale));
	}

	/** The line's text in full, without wrapping: "left | right", as if the width were infinite. */
	private static String text(GuideList.Row r)
	{
		String left = r.getLines().stream().map(GuideList.Line::getLeft).filter(s -> !s.isEmpty())
			.map(String::trim).collect(Collectors.joining(" "));
		String right = r.getLines().stream().map(GuideList.Line::getRight).filter(s -> s != null)
			.collect(Collectors.joining(" "));
		return left + (right.isEmpty() ? "" : " | " + right);
	}

	private static List<GuideList.Row> rows(StepGuide.View v, boolean collapsed)
	{
		return GuideList.rows(v, collapsed, FM, SMALL, OsrsPathGuideOverlay.WIDTH);
	}

	/** S2-03: the onion is in the bag, the eye of newt is in step at Betty's, no lobsters (the bank was opened, empty). */
	private static StepGuide.View witchsPotion(String navLabel, int x, int y)
	{
		return StepGuide.view(StepGuideTest.witchsPotion(), StepGuideTest.counts(1957, "Onion", 1), StepGuideTest.counts(),
			navLabel, x, y, 0);
	}

	private static StepGuide.ItemLine itemLine(String name, StepGuide.Have have)
	{
		return new StepGuide.ItemLine(name, "", have, "", -1, name, "");
	}

	private static ActiveTarget.StageLine stageLine(String text)
	{
		ActiveTarget.StageLine l = new ActiveTarget.StageLine();
		l.setT(text);
		l.setS(text);
		return l;
	}

	@Test
	public void onAStage_theBagRowSaysWhatTheGameSeesInTheBag_notWhatIsBankedHandedInOrMissing()
	{
		StepGuide.StageView sv = new StepGuide.StageView(3, 7, java.util.Arrays.asList(stageLine("Have Ned make a wig; buy rope too"), stageLine("Dye the wig yellow")), 0, false);
		List<StepGuide.ItemLine> items = java.util.Arrays.asList(itemLine("Ball of wool ×3", StepGuide.Have.BAG), itemLine("Rope", StepGuide.Have.BAG),
			itemLine("Bronze bar", StepGuide.Have.BANK), itemLine("Beer", StepGuide.Have.DONE), itemLine("Onion", StepGuide.Have.NONE), itemLine("Ashes", StepGuide.Have.UNKNOWN));
		StepGuide.View v = new StepGuide.View("[S2-10] Prince Ali Rescue", null, items, java.util.Collections.emptyList(), null, null, null, null, sv);
		String all = GuideList.plain(rows(v, false));
		assertTrue("2 in the bag of the 5 that count (the handed-in beer is not counted): " + all, all.contains("In your bag: 2 of 5 items"));
		assertFalse("the held items are not listed by name on a stage: " + all, all.contains("Ball of wool") || all.contains("Rope"));
		GuideList.Row bag = GuideList.bagRow(items, SMALL, 200);
		assertNotNull(bag);
		assertTrue(bag.getHint(), bag.getHint().contains("Ball of wool ×3, Rope") && !bag.getHint().contains("Bronze bar,") && !bag.getHint().contains("Onion"));
		assertFalse("not a button", bag.getAction().isClickable());
		assertNull("nothing in the bag: no row", GuideList.bagRow(java.util.Arrays.asList(itemLine("Onion", StepGuide.Have.NONE)), SMALL, 200));
		assertNull(GuideList.bagRow(java.util.Collections.emptyList(), SMALL, 200));
	}

	@Test
	public void aStepWithoutAStage_hasNoBagRow_itsItemsAreListedWithTheirStatus()
	{
		String all = GuideList.plain(rows(witchsPotion(null, 0, 0), false));
		assertFalse(all, all.contains("In your bag"));
	}

	/** The rows as one string: a long row wraps to two lines at the real card width, and the text must still be found. */
	private static String flat(List<GuideList.Row> rows)
	{
		return GuideList.plain(rows).replace("\n", " ");
	}

	/** S2-10, stage 3 of 7, the step on the cursor, with the real lines from the game screenshot. */
	private static StepGuide.View princeAli(int cursor, String warning, boolean peeking)
	{
		StepGuide.StageView sv = new StepGuide.StageView(3, 7, java.util.Arrays.asList(
			stageLine("Have Ned make a wig (3 balls of wool); buy rope too"),
			stageLine("Dye the wig yellow (Aggie: 2 onions + 5 gp)"),
			stageLine("Aggie: get skin paste (ashes, redberries, flour, water)"),
			stageLine("Lady Keli: use soft clay on the key for a print"),
			stageLine("Use the key print and bronze bar on a furnace"),
			stageLine("Talk to Leela (east of Draynor Village)")), cursor, false, warning, peeking, true);
		List<StepGuide.ItemLine> items = java.util.Arrays.asList(itemLine("Ball of wool ×3", StepGuide.Have.BAG), itemLine("Rope", StepGuide.Have.BAG),
			itemLine("Bronze bar", StepGuide.Have.BANK), itemLine("Onion ×2", StepGuide.Have.NONE));
		return new StepGuide.View("[S2-10] Prince Ali Rescue", null, items, java.util.Collections.emptyList(), null, null, null, null, sv);
	}

	@Test
	public void concise_dropsTheRecipeAndKeepsWho()
	{
		assertEquals("Dye the wig yellow (Aggie)", GuideList.concise("Dye the wig yellow (Aggie: 2 onions + 5 gp)"));
		assertEquals("Have Ned make a wig", GuideList.concise("Have Ned make a wig (3 balls of wool); buy rope too"));
		assertEquals("Aggie: get skin paste", GuideList.concise("Aggie: get skin paste (ashes, redberries, flour, water)"));
		assertEquals("Talk to Leela", GuideList.concise("Talk to Leela (east of Draynor Village)"));
		assertEquals("Use Bronze bar on Thurgo", GuideList.concise("Use Bronze bar (x1) on Thurgo"));
		assertEquals("Nothing to cut", GuideList.concise("Nothing to cut"));
		assertEquals("Unbalanced (bracket", GuideList.concise("Unbalanced (bracket"));
		assertEquals("", GuideList.concise(null));
		assertEquals("", GuideList.concise(""));
	}

	@Test
	public void strictView_isTwoRows_withNoRecipeNextBackBagOrPlaces()
	{
		List<GuideList.Row> rows = GuideList.expandedRows(princeAli(1, null, false), 0, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false);
		assertEquals(2, rows.size());
		assertEquals("S2-10 · Stage 3 of 7 ~▲", GuideList.plain(rows.subList(0, 1)));
		String all = flat(rows);
		assertTrue(all, all.contains("▶ [2/6] Dye the wig yellow (Aggie)"));
		for (String gone : new String[] {"Next:", "Done", "Back", "In your bag", "Where to go", "onions", "Needed now", "Tip"})
		{
			assertFalse(gone + " must wait for the mouse: " + all, all.contains(gone));
		}
	}

	@Test
	public void openCard_hasTheSameTwoRowsOnTop_andTheWholeListUnder()
	{
		StepGuide.View v = princeAli(1, null, false);
		List<GuideList.Row> closed = GuideList.expandedRows(v, 0, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false);
		List<GuideList.Row> open = GuideList.expandedRows(v, GuideList.EXPAND_STEPS, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false);
		assertEquals("the heading does not move", closed.get(0), open.get(0));
		assertEquals("the step line does not move or change", closed.get(1), open.get(1));
		String all = flat(open);
		for (String shown : new String[] {"Details: Dye the wig yellow (Aggie: 2 onions + 5 gp)", "Next: Aggie: get skin paste", "✓ Done - next", "◀ Back: Have Ned make a wig",
			"In your bag: 2 of 4 items", "Needed now", "Onion"})
		{
			assertTrue(shown + " is in the open card: " + all, all.contains(shown));
		}
	}

	@Test
	public void openingRevealsRowsOneByOne_neverShrinks_andEndsWithTheFullList()
	{
		StepGuide.View v = princeAli(1, null, false);
		int previous = 0;
		for (int step = 0; step <= GuideList.EXPAND_STEPS; step++)
		{
			int n = GuideList.expandedRows(v, step, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false).size();
			assertTrue("step " + step + ": " + n + " rows after " + previous, n >= previous);
			previous = n;
		}
		assertEquals(2, GuideList.expandedRows(v, 0, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false).size());
		assertTrue(previous > 6);
		assertEquals("more than the end is the same as the end", previous, GuideList.expandedRows(v, 99, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false).size());
	}

	@Test
	public void nothingTheFullListShowsIsLost_itWaitsForTheMouse()
	{
		StepGuide.View v = princeAli(1, null, false);
		List<GuideList.Row> full = rows(v, false);
		List<GuideList.Row> open = GuideList.expandedRows(v, GuideList.EXPAND_STEPS, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false);
		String openText = flat(open);
		for (int i = 1; i < full.size(); i++)
		{
			GuideList.Row r = full.get(i);
			if (r.getHint() != null && r.getHint().contains("Dye the wig yellow") && r.getAction() == GuideList.Action.NONE)
			{
				continue; // the step line itself, which is the second row in the strict view
			}
			for (GuideList.Line l : r.getLines())
			{
				assertTrue("'" + l.getLeft() + "' is still in the open card: " + openText, openText.contains(l.getLeft()));
			}
		}
		assertEquals("the buttons are still buttons", full.stream().filter(r -> r.getAction().isClickable()).count(), open.stream().filter(r -> r.getAction().isClickable()).count());
	}

	@Test
	public void aWarningIsNeverHiddenInTheStrictView()
	{
		String warning = "Bronze bar is still in your bag - first: furnace";
		List<GuideList.Row> rows = GuideList.expandedRows(princeAli(1, warning, false), 0, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false);
		assertEquals(3, rows.size());
		assertTrue(flat(rows), flat(rows).contains("⚠ Bronze bar is still in your bag"));
		List<GuideList.Row> open = GuideList.expandedRows(princeAli(1, warning, false), GuideList.EXPAND_STEPS, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false);
		assertEquals("the warning is not shown twice when open", 1, open.stream().filter(r -> GuideList.plain(java.util.Collections.singletonList(r)).contains("⚠ Bronze bar")).count());
	}

	@Test
	public void viewingAnEarlierStepIsSaidInTheStrictView()
	{
		String all = flat(GuideList.expandedRows(princeAli(0, null, true), 0, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false));
		assertTrue(all, all.contains("viewing · ▶ [1/6] Have Ned make a wig"));
		assertFalse(all, all.contains("balls of wool"));
	}

	@Test
	public void aStepWithoutAStage_isTwoRowsToo()
	{
		List<GuideList.Row> rows = GuideList.expandedRows(witchsPotion(null, 0, 0), 0, FM, SMALL, OsrsPathGuideOverlay.WIDTH, false);
		assertEquals(2, rows.size());
		assertEquals("S2-03 · What you need ~▲", GuideList.plain(rows.subList(0, 1)));
	}

	@Test
	public void theCardOpensWhileTheMouseIsOverIt_andClosesOnlyAfterTheGrace()
	{
		assertFalse("not over, never was", GuideList.expandWanted(false, -1));
		assertTrue(GuideList.expandWanted(true, -1));
		assertTrue("just left", GuideList.expandWanted(false, GuideList.COLLAPSE_GRACE_NANOS - 1));
		assertFalse("left a while ago", GuideList.expandWanted(false, GuideList.COLLAPSE_GRACE_NANOS));
		assertEquals("at least one portion at once", 1, GuideList.revealSteps(0));
		assertEquals(GuideList.EXPAND_STEPS, GuideList.revealSteps(GuideList.EXPAND_NANOS));
		assertEquals(GuideList.EXPAND_STEPS, GuideList.revealSteps(Long.MAX_VALUE / 100));
		int prev = 0;
		for (long t = 0; t <= GuideList.EXPAND_NANOS; t += GuideList.EXPAND_NANOS / 20)
		{
			int r = GuideList.revealSteps(t);
			assertTrue(r >= prev);
			prev = r;
		}
	}

	@Test
	public void theCompactListIsOnByDefault_underANewStableKey() throws Exception
	{
		assertTrue(new OsrsPathBridgeConfig() { }.guideCompact());
		assertEquals("guideCompact", OsrsPathBridgeConfig.class.getMethod("guideCompact").getAnnotation(net.runelite.client.config.ConfigItem.class).keyName());
	}

	@Test
	public void itemsWithStatusAndWhereToGet_placeIsButton()
	{
		List<GuideList.Row> rows = rows(witchsPotion(null, 0, 0), false);
		assertEquals(GuideList.Kind.TOGGLE, rows.get(0).getAction().getKind());
		assertEquals("S2-03 · What you need | ▲", text(rows.get(0)));

		// What is missing goes on top, the onion already in the bag goes down.
		GuideList.Row onion = rows.get(3);
		assertEquals("in the bag: one line, not a button", "✓ Onion | have", text(onion));
		assertFalse(onion.getAction().isClickable());

		GuideList.Row newt = rows.get(1);
		assertEquals("name and status on one line", "• Eye of newt | in step", newt.getLines().get(0).getLeft() + " | " + newt.getLines().get(0).getRight());
		assertTrue("where to get it is under the name", text(newt).contains("Buy from Betty in Port Sarim for 3 gp."));
		assertEquals("where to get it in link colour", GuideList.LINK, newt.getLines().get(1).getLeftColor());
		assertTrue("where to get it in a small font", newt.getLines().get(1).isSmall());
		assertEquals(GuideList.Action.place(2), newt.getAction());
		assertTrue(newt.getHint(), newt.getHint().contains("Eye of newt") && newt.getHint().contains("Click for the arrow and path: Eye of newt — Betty, Port Sarim"));

		GuideList.Row lobster = rows.get(2);
		assertEquals("✗ Lobster ×5 | none", lobster.getLines().get(0).getLeft() + " | " + lobster.getLines().get(0).getRight());
		assertEquals("no place: not a button", GuideList.Action.NONE, lobster.getAction());
		assertEquals(GuideList.MUTED, lobster.getLines().get(1).getLeftColor());
		assertTrue("the hint does not promise a path", !lobster.getHint().contains("Click"));

		// Where to go is only for those the item lines do not lead to: the onion patch and Betty are already buttons above.
		assertEquals("Where to go", text(rows.get(4)));
		assertEquals("► Hetty — house in Rimmington", text(rows.get(5)));
		assertEquals(GuideList.Action.place(0), rows.get(5).getAction());
		assertTrue(rows.get(5).getHint().contains("Hetty will be highlighted"));
		assertEquals(6, rows.size());
		assertTrue(newt.getHint(), newt.getHint().contains("Betty will be highlighted"));
	}

	@Test
	public void arrowPointsAtPoint_itIsMarkedAndNotButton_thereIsReturnToStep()
	{
		List<GuideList.Row> rows = rows(witchsPotion("Eye of newt — Betty, Port Sarim", 3014, 3259), false);
		GuideList.Row back = rows.get(1);
		assertEquals("← Arrow back to the step", text(back));
		assertEquals(GuideList.Action.BACK, back.getAction());
		GuideList.Row newt = rows.get(2);
		assertTrue(text(newt), text(newt).contains("● arrow points there"));
		assertFalse("already points there: not a button", newt.getAction().isClickable());
		assertEquals("► Hetty — house in Rimmington", text(rows.get(rows.size() - 1)));

		// The arrow points to a place where no items are taken: it is in "Where to go" with "●" and not a button.
		List<GuideList.Row> toHetty = rows(witchsPotion("Hetty — house in Rimmington", 2968, 3204), false);
		GuideList.Row hetty = toHetty.get(toHetty.size() - 1);
		assertEquals("● Hetty — house in Rimmington", text(hetty));
		assertFalse(hetty.getAction().isClickable());
	}

	@Test
	public void collapsed_oneLineWithSummary()
	{
		List<GuideList.Row> rows = rows(witchsPotion(null, 0, 0), true);
		assertEquals(1, rows.size());
		assertEquals("S2-03 · What you need: missing 1 · in step 1 | ▼", text(rows.get(0)));
		assertEquals(GuideList.Action.TOGGLE, rows.get(0).getAction());
		StepGuide.View allIn = StepGuide.view(StepGuideTest.witchsPotion(),
			StepGuideTest.counts(1957, "Onion", 1, 221, "Eye of newt", 1, 379, "Lobster", 5), null, null, 0, 0, 0);
		assertEquals("S2-03 · What you need: all in your bag | ▼", text(rows(allIn, true).get(0)));
	}

	@Test
	public void whenToShow()
	{
		assertFalse(GuideList.worthShowing(null));
		assertFalse("no step selected", GuideList.worthShowing(StepGuide.EMPTY));
		ActiveTarget onePlace = new com.google.gson.Gson().fromJson("{\"stepId\":\"S1-07\",\"title\":\"X\",\"guide\":{\"items\":[],"
			+ "\"places\":[{\"x\":3236,\"y\":3155,\"plane\":0,\"label\":\"Abigale\"}]}}", ActiveTarget.class);
		assertNull(onePlace.prepare());
		assertFalse("one point without items: the HUD and arrow are enough",
			GuideList.worthShowing(StepGuide.view(onePlace, StepGuideTest.counts(), null, null, 0, 0, 0)));
		assertTrue("a temporary target: the return to the step is needed",
			GuideList.worthShowing(StepGuide.view(onePlace, StepGuideTest.counts(), null, "Bob", 3230, 3203, 0)));
		assertTrue(GuideList.worthShowing(witchsPotion(null, 0, 0)));
	}

	@Test
	public void longWhereToGet_twoLinesAndEllipsis()
	{
		String where = "Raw rat meat from a giant rat by the Port Sarim chapel (or raw beef); cook it on Hetty's fireplace twice until it burns.";
		int width = OverlayText.inner(OsrsPathGuideOverlay.WIDTH);
		List<GuideList.Line> lines = GuideList.clip("   ", where, GuideList.MUTED, SMALL, width, 2, true);
		assertEquals(2, lines.size());
		assertTrue(lines.get(1).getLeft(), lines.get(1).getLeft().endsWith("…"));
		for (GuideList.Line l : lines)
		{
			assertTrue(l.getLeft(), SMALL.stringWidth(l.getLeft()) <= width);
		}
		assertEquals("short as is", 1, GuideList.clip("   ", "Buy from Ned.", GuideList.MUTED, SMALL, width, 2, true).size());
	}

	@Test
	public void stepWithoutItems_headingWhereToGo()
	{
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-05\",\"title\":\"Romeo & Juliet\",\"guide\":{\"items\":[],\"places\":["
			+ "{\"x\":3211,\"y\":3422,\"plane\":0,\"label\":\"Romeo in Varrock Square\",\"npc\":\"Romeo\"},"
			+ "{\"x\":3159,\"y\":3426,\"plane\":1,\"label\":\"Juliet — mansion\",\"npc\":\"Juliet\"}]}}", ActiveTarget.class);
		assertNull(t.prepare());
		List<GuideList.Row> rows = rows(StepGuide.view(t, StepGuideTest.counts(), null, null, 0, 0, 0), false);
		assertEquals("S2-05 · Where to go | ▲", text(rows.get(0)));
		assertEquals("without a second heading", 3, rows.size());
		assertEquals("► Juliet — mansion", text(rows.get(2)));
		assertEquals("S2-05 · Where to go: 2 places | ▼", text(rows(StepGuide.view(t, StepGuideTest.counts(), null, null, 0, 0, 0), true).get(0)));
	}

	@Test
	public void placeWithNpcWhereEverythingIsTaken_backInWhereToGo()
	{
		// An NPC hands out an item and is also where to go next in the quest: while the item is missing, the item line leads to them,
		// once it is taken the NPC is back in "Where to go". A patch without an NPC, where everything is already in the bag, is not needed.
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-06\",\"title\":\"Rune Mysteries\",\"guide\":{"
			+ "\"items\":[{\"name\":\"Research package\"},{\"name\":\"Onion\"}],\"places\":["
			+ "{\"x\":3210,\"y\":3221,\"plane\":1,\"label\":\"Duke Horacio\",\"npc\":\"Duke Horacio\"},"
			+ "{\"x\":3103,\"y\":9571,\"plane\":0,\"label\":\"Archmage Sedridor — Wizards' Tower basement\",\"npc\":\"Archmage Sedridor\",\"items\":[\"Research package\"]},"
			+ "{\"x\":2950,\"y\":3251,\"plane\":0,\"label\":\"Onion — patch\",\"items\":[\"Onion\"]}]}}", ActiveTarget.class);
		assertNull(t.prepare());
		List<String> before = rows(StepGuide.view(t, StepGuideTest.counts(), StepGuideTest.counts(), null, 0, 0, 0), false).stream()
			.map(GuideListTest::text).collect(Collectors.toList());
		assertFalse(before.toString(), before.stream().anyMatch(r -> r.startsWith("► Archmage Sedridor")));
		List<String> after = rows(StepGuide.view(t, StepGuideTest.counts(-1, "Research package", 1, -1, "Onion", 1), null, null, 0, 0, 0), false)
			.stream().map(GuideListTest::text).collect(Collectors.toList());
		assertTrue(after.toString(), after.stream().anyMatch(r -> r.startsWith("► Archmage Sedridor")));
		assertFalse(after.toString(), after.stream().anyMatch(r -> r.startsWith("► Onion")));
	}

	/** S2-03 as the app 2.12 sends it: four items "in step", the places of Betty and the rat, the finale is "Give everything to Hetty". */
	private static ActiveTarget hetty()
	{
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-03\",\"title\":\"Witch's Potion\",\"guide\":{"
			+ "\"items\":[{\"name\":\"Onion\",\"inStep\":true},{\"name\":\"Eye of newt\",\"inStep\":true},{\"name\":\"Rat's tail\",\"inStep\":true}],"
			+ "\"places\":["
			+ "{\"x\":2968,\"y\":3204,\"plane\":0,\"label\":\"Hetty — house in Rimmington\",\"npc\":\"Hetty\"},"
			+ "{\"x\":2957,\"y\":3204,\"plane\":0,\"label\":\"Rat — Brian's Archery Supplies\",\"npc\":\"Rat\",\"items\":[\"Rat's tail\"]},"
			+ "{\"x\":3014,\"y\":3259,\"plane\":0,\"label\":\"Eye of newt — Betty, Port Sarim\",\"npc\":\"Betty\",\"items\":[\"Eye of newt\"]},"
			+ "{\"x\":2950,\"y\":3251,\"plane\":0,\"label\":\"Onion — patch\",\"items\":[\"Onion\"]}],"
			+ "\"steps\":[\"Talk to Hetty.\",\"Pick the onion.\",\"Give everything to Hetty and drink from the cauldron (Drink From).\"]}}", ActiveTarget.class);
		assertNull(t.prepare());
		return t;
	}

	private static List<String> shown(StepGuide.View v)
	{
		return rows(v, false).stream().map(GuideListTest::text).collect(Collectors.toList());
	}

	@Test
	public void everythingCollected_placesOfCollectedGo_whatToDoNextIsShown()
	{
		ActiveTarget t = hetty();
		java.util.Set<String> got = new java.util.HashSet<>();
		StepGuide.View partial = StepGuide.view(t, StepGuideTest.counts(1957, "Onion", 1), StepGuideTest.counts(), null, 0, 0, 0, got);
		List<String> before = shown(partial);
		assertNull(partial.getNext());
		assertTrue(before.toString(), before.stream().noneMatch(r -> r.startsWith("▶")));
		assertTrue("Betty is still needed: no Eye of newt, the item line leads there", before.stream().anyMatch(r -> r.contains("Eye of newt")));

		StepGuide.View all = StepGuide.view(t, StepGuideTest.counts(1957, "Onion", 1, 221, "Eye of newt", 1, 300, "Rat's tail", 1),
			StepGuideTest.counts(), null, 0, 0, 0, got);
		List<String> after = shown(all);
		assertTrue(after.toString(), after.stream().anyMatch(r -> r.startsWith("▶ Next: Give everything to Hetty")));
		assertTrue("Hetty, the main point, stays", after.stream().anyMatch(r -> r.startsWith("► Hetty")));
		assertTrue("Betty and the rat are no longer needed: " + after, after.stream().noneMatch(r -> r.startsWith("► Eye of newt") || r.startsWith("► Rat")));
	}

	@Test
	public void itemsHandedIn_listDoesNotAskForThemAgain()
	{
		ActiveTarget t = hetty();
		java.util.Set<String> got = new java.util.HashSet<>();
		StepGuide.view(t, StepGuideTest.counts(1957, "Onion", 1, 221, "Eye of newt", 1, 300, "Rat's tail", 1), StepGuideTest.counts(), null, 0, 0, 0, got);
		// Handed to Hetty: the bag is empty, the bank was opened: before, the list wrote "none" again.
		StepGuide.View handed = StepGuide.view(t, StepGuideTest.counts(), StepGuideTest.counts(), null, 0, 0, 0, got);
		for (StepGuide.ItemLine i : handed.getItems())
		{
			assertEquals(i.getName(), StepGuide.Have.DONE, i.getHave());
			assertEquals("done", i.getTag());
		}
		assertNotNull("and the 'what next' hint stays", handed.getNext());
		// Without memory (the old behaviour): as before.
		assertEquals(StepGuide.Have.IN_STEP, StepGuide.view(t, StepGuideTest.counts(), StepGuideTest.counts(), null, 0, 0, 0).getItems().get(0).getHave());
	}

	@Test
	public void npcOfPlaceAtLastStep_stays()
	{
		// "Give to Brian...": the place's NPC is mentioned in the finale, so we do not hide the place even when everything has been taken from there.
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-06\",\"title\":\"T\",\"guide\":{\"items\":[{\"name\":\"Package\"}],\"places\":["
			+ "{\"x\":3210,\"y\":3221,\"plane\":1,\"label\":\"Duke\",\"npc\":\"Duke\"},"
			+ "{\"x\":3103,\"y\":9571,\"plane\":0,\"label\":\"Sedridor — basement\",\"npc\":\"Sedridor\",\"items\":[\"Package\"]}],"
			+ "\"steps\":[\"Bring the package to Sedridor.\"]}}", ActiveTarget.class);
		assertNull(t.prepare());
		List<String> r = shown(StepGuide.view(t, StepGuideTest.counts(-1, "Package", 1), null, null, 0, 0, 0, new java.util.HashSet<>()));
		assertTrue(r.toString(), r.stream().anyMatch(x -> x.startsWith("► Sedridor")));
	}

	@Test
	public void longList_onOneLineAndMissingOnTop()
	{
		StringBuilder items = new StringBuilder();
		for (int i = 0; i < 12; i++)
		{
			items.append(i == 0 ? "" : ",").append("{\"name\":\"Item").append(i).append("\",\"where\":\"A very long text about where to get this item, three lines or more, to test the compression.\"}");
		}
		StringBuilder places = new StringBuilder();
		for (int i = 0; i < 8; i++)
		{
			places.append(i == 0 ? "" : ",").append("{\"x\":").append(3200 + i).append(",\"y\":3200,\"plane\":0,\"label\":\"NPC").append(i)
				.append(" — a very long place label that does not fit on one line\",\"npc\":\"Npc").append(i).append("\"}");
		}
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-10\",\"title\":\"Prince Ali Rescue\",\"guide\":{\"items\":["
			+ items + "],\"places\":[" + places + "]}}", ActiveTarget.class);
		assertNull(t.prepare());
		StepGuide.View v = StepGuide.view(t, StepGuideTest.counts(-1, "Item5", 1), StepGuideTest.counts(), null, 0, 0, 0);
		List<GuideList.Row> rows = rows(v, false);
		// No more than eight items, each with "where to get it" on one line; Item5 is already in the bag, so not in the first lines.
		List<GuideList.Row> itemRows = rows.subList(1, 1 + GuideList.MAX_ITEMS);
		for (GuideList.Row r : itemRows)
		{
			assertTrue(text(r), r.getLines().size() <= 2);
			assertFalse(text(r), text(r).startsWith("✓"));
		}
		assertTrue(text(rows.get(1 + GuideList.MAX_ITEMS)), text(rows.get(1 + GuideList.MAX_ITEMS)).startsWith("… 4 more"));
		GuideList.Row firstPlace = rows.get(3 + GuideList.MAX_ITEMS);
		assertEquals("the place is on one line with an ellipsis", 1, firstPlace.getLines().size());
		assertTrue(firstPlace.getLines().get(0).getLeft().endsWith("…"));
		assertTrue("in full in the hint", firstPlace.getHint().contains("does not fit on one line"));
	}

	@Test
	public void placeWithoutNpcInLabel_npcFirst()
	{
		GuideList.Row r = GuideList.place(new StepGuide.PlaceLine("Lumbridge Castle kitchen", 0, false, "Cook", false), FM,
			OverlayText.inner(OsrsPathGuideOverlay.WIDTH));
		assertTrue(text(r), text(r).startsWith("► Cook — Lumbridge Castle kitchen"));
		GuideList.Row same = GuideList.place(new StepGuide.PlaceLine("Hetty — house in Rimmington", 0, false, "Hetty", false), FM,
			OverlayText.inner(OsrsPathGuideOverlay.WIDTH));
		assertEquals("► Hetty — house in Rimmington", text(same));
	}

	// ---------- Clicks ----------

	private static Widget widget()
	{
		return (Widget) Proxy.newProxyInstance(Widget.class.getClassLoader(), new Class<?>[]{Widget.class}, (p, m, a) -> null);
	}

	private static MenuEntry entry(Widget w)
	{
		return (MenuEntry) Proxy.newProxyInstance(MenuEntry.class.getClassLoader(), new Class<?>[]{MenuEntry.class},
			(p, m, a) -> "getWidget".equals(m.getName()) ? w : null);
	}

	/** The client: whether a menu is open, whether a spell is selected, what is in the menu under the mouse (the last entry is the left click). */
	private static Client client(boolean menuOpen, boolean widgetSelected, MenuEntry... entries)
	{
		Menu menu = (Menu) Proxy.newProxyInstance(Menu.class.getClassLoader(), new Class<?>[]{Menu.class},
			(p, m, a) -> "getMenuEntries".equals(m.getName()) ? entries : null);
		return (Client) Proxy.newProxyInstance(Client.class.getClassLoader(), new Class<?>[]{Client.class}, (p, m, a) ->
		{
			switch (m.getName())
			{
				case "isMenuOpen":
					return menuOpen;
				case "isWidgetSelected":
					return widgetSelected;
				case "getMenu":
					return menu;
				default:
					return null;
			}
		});
	}

	private static MouseEvent press(int x, int y, int button, int modifiers)
	{
		return new MouseEvent(new Canvas(), MouseEvent.MOUSE_PRESSED, 0, modifiers, x, y, 1, false, button);
	}

	/** The list on the canvas at (10, 50): a heading, an item line without a place, a place line. */
	private static OsrsPathGuideOverlay overlay(Client c, long renderedAt)
	{
		OsrsPathGuideOverlay o = new OsrsPathGuideOverlay(c, null, null);
		o.setHits(new OsrsPathGuideOverlay.Hits(new Rectangle(10, 50, 220, 100),
			Arrays.asList(new Rectangle(14, 54, 212, 16), new Rectangle(14, 70, 212, 30), new Rectangle(14, 100, 212, 16)),
			Arrays.asList(GuideList.Action.TOGGLE, GuideList.Action.NONE, GuideList.Action.place(3)), renderedAt));
		return o;
	}

	@Test
	public void clickOnPlace_actionAndClickDoesNotGoToGame()
	{
		Client c = client(false, false, entry(null));
		List<GuideList.Action> done = new ArrayList<>();
		GuideMouse mouse = new GuideMouse(c, overlay(c, System.nanoTime()), done::add);
		MouseEvent e = mouse.mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK));
		assertTrue("the game will not get the click: the character will not walk under the plate", e.isConsumed());
		assertEquals(Collections.singletonList(GuideList.Action.place(3)), done);
		MouseEvent up = new MouseEvent(new Canvas(), MouseEvent.MOUSE_RELEASED, 0, 0, 50, 105, 1, false, MouseEvent.BUTTON1);
		assertTrue(mouse.mouseReleased(up).isConsumed());

		// A line without a place: the click does not go to the game either, but does nothing.
		done.clear();
		assertTrue(mouse.mousePressed(press(50, 80, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertTrue(done.isEmpty());
		// The heading: collapse.
		mouse.mousePressed(press(50, 58, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK));
		assertEquals(Collections.singletonList(GuideList.Action.TOGGLE), done);
	}

	@Test
	public void clickGoesToGame_outsideList_right_withAlt_menu_bankOverList_listNotDrawn()
	{
		List<GuideList.Action> done = new ArrayList<>();
		Client world = client(false, false, entry(null));
		GuideMouse mouse = new GuideMouse(world, overlay(world, System.nanoTime()), done::add);
		assertFalse("beside the list", mouse.mousePressed(press(400, 300, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertFalse("right button: the game menu", mouse.mousePressed(press(50, 105, MouseEvent.BUTTON3, InputEvent.BUTTON3_DOWN_MASK)).isConsumed());
		assertFalse("Alt: RuneLite moves the plate",
			mouse.mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK | InputEvent.ALT_DOWN_MASK)).isConsumed());
		MouseEvent up = new MouseEvent(new Canvas(), MouseEvent.MOUSE_RELEASED, 0, 0, 400, 300, 1, false, MouseEvent.BUTTON1);
		assertFalse("release of someone else's press goes to the game", mouse.mouseReleased(up).isConsumed());

		Client menuOpen = client(true, false, entry(null));
		assertFalse("the game menu is open: its entry is being chosen",
			new GuideMouse(menuOpen, overlay(menuOpen, System.nanoTime()), done::add).mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		Client spell = client(false, true, entry(null));
		assertFalse("a spell or 'Use' is selected",
			new GuideMouse(spell, overlay(spell, System.nanoTime()), done::add).mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		Client bank = client(false, false, entry(null), entry(widget()));
		assertFalse("a bank over the list: 'Withdraw-1' matters more",
			new GuideMouse(bank, overlay(bank, System.nanoTime()), done::add).mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertFalse("the list has not been drawn for a long time (left the game, hidden): clicks go to the game",
			new GuideMouse(world, overlay(world, System.nanoTime() - 2_000_000_000L), done::add).mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertTrue(done.isEmpty());
	}

	@Test
	public void gameWindowUnderMouse_byTopMenuEntry()
	{
		assertFalse(GuideMouse.windowUnderMouse(null));
		assertFalse(GuideMouse.windowUnderMouse(new MenuEntry[0]));
		assertFalse("Walk here: the world", GuideMouse.windowUnderMouse(new MenuEntry[]{entry(null), entry(null)}));
		assertTrue("Withdraw-1: the bank window", GuideMouse.windowUnderMouse(new MenuEntry[]{entry(null), entry(widget())}));
		assertSame(GuideList.Action.NONE, GuideList.Action.NONE);
	}

	/** A menu entry over the list, in Latin letters and by the line's action. */
	@Test
	public void menuOptionOverListIsLatin()
	{
		assertEquals("Arrow to", GuideMouse.menuOption(GuideList.Action.place(0)));
		assertEquals("Arrow back to step", GuideMouse.menuOption(GuideList.Action.BACK));
		assertEquals("Collapse / expand", GuideMouse.menuOption(GuideList.Action.TOGGLE));
		assertEquals("List", GuideMouse.menuOption(GuideList.Action.NONE));
	}

	/** An open world map over the list: a click on its marker goes to the map, not to the line under it. */
	@Test
	public void worldMapOverList_clickGoesToMap()
	{
		Widget map = (Widget) Proxy.newProxyInstance(Widget.class.getClassLoader(), new Class<?>[]{Widget.class}, (p, m, a) ->
			"isHidden".equals(m.getName()) ? Boolean.FALSE : "getBounds".equals(m.getName()) ? new Rectangle(0, 0, 500, 400) : null);
		Client world = client(false, false, entry(null));
		Client withMap = (Client) Proxy.newProxyInstance(Client.class.getClassLoader(), new Class<?>[]{Client.class}, (p, m, a) ->
			"getWidget".equals(m.getName()) ? map : m.invoke(world, a));
		List<GuideList.Action> done = new ArrayList<>();
		assertFalse(new GuideMouse(withMap, overlay(withMap, System.nanoTime()), done::add)
			.mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertTrue(done.isEmpty());
		assertFalse("the map is closed", GuideMouse.mapCovers(null, new java.awt.Point(50, 105)));
	}

	@Test
	public void briefView_sameButtonsAndSameActions_linesNoLonger()
	{
		StepGuide.View v = witchsPotion(null, 0, 0);
		List<GuideList.Row> normal = GuideList.rows(v, false, FM, SMALL, OsrsPathGuideOverlay.WIDTH);
		List<GuideList.Row> terse = GuideList.rows(v, false, FM, SMALL, OsrsPathGuideOverlay.WIDTH, true);
		assertEquals("the buttons are the same: the brief view does not take actions away", normal.stream().map(GuideList.Row::getAction).collect(Collectors.toList()),
			terse.stream().map(GuideList.Row::getAction).collect(Collectors.toList()));
		int normalLines = normal.stream().mapToInt(r -> r.getLines().size()).sum();
		int terseLines = terse.stream().mapToInt(r -> r.getLines().size()).sum();
		assertTrue("no more lines (" + terseLines + " against " + normalLines + ")", terseLines <= normalLines);
		// The full description does not vanish: it is in the hover hint.
		for (int i = 0; i < normal.size(); i++)
		{
			assertEquals("hint of line " + i, normal.get(i).getHint(), terse.get(i).getHint());
		}
	}
}
