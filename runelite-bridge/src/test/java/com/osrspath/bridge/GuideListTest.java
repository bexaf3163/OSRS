package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.awt.Canvas;
import java.awt.Rectangle;
import java.awt.event.InputEvent;
import java.awt.event.MouseEvent;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import net.runelite.api.Client;
import net.runelite.api.Menu;
import net.runelite.api.MenuEntry;
import net.runelite.api.widgets.Widget;
import org.junit.Test;

/**
 * The in-game guide's shared rules: how a quest's fixed stage text is read against the bag, and what a click on the card does: whether it reaches the game.
 * What the card says is {@link HudModelTest}; how it is drawn, {@link HudRenderTest}.
 */
public class GuideListTest
{
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

	/** S2-10, stage 3 of 7, the step on the cursor, with the real lines from the game screenshot. */
	private static StepGuide.View princeAli(int cursor)
	{
		StepGuide.StageView sv = new StepGuide.StageView(3, 7, Arrays.asList(
			stageLine("Have Ned make a wig (3 balls of wool); buy rope too"),
			stageLine("Dye the wig yellow (Aggie: 2 onions + 5 gp)"),
			stageLine("Aggie: get skin paste (ashes, redberries, flour, water)")), cursor, false, null, false, true);
		List<StepGuide.ItemLine> items = Arrays.asList(itemLine("Ball of wool ×3", StepGuide.Have.BAG), itemLine("Rope", StepGuide.Have.BAG),
			itemLine("Bronze bar", StepGuide.Have.BANK), itemLine("Onion ×2", StepGuide.Have.NONE));
		return new StepGuide.View("[S2-10] Prince Ali Rescue", null, items, Collections.emptyList(), null, null, null, null, sv);
	}

	private static StepGuide.View withItems(StepGuide.View base, StepGuide.ItemLine... items)
	{
		return new StepGuide.View(base.getTitle(), null, Arrays.asList(items), Collections.emptyList(), null, null, null, null, base.getStage());
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
	public void anAlternativeIsSetApart_onlyAWholeOne()
	{
		assertEquals(27, GuideList.alternativeAt("Defeat the Ancient Guardian or mine 4 pillars"));
		assertEquals("an 'or' in a bracket is part of the item", -1, GuideList.alternativeAt("Use essence (rune or pure) on the altar"));
		assertEquals("an 'or' after a colon is a restriction", -1, GuideList.alternativeAt("Fight: melee or ranged only"));
		assertEquals(-1, GuideList.alternativeAt(null));
	}

	@Test
	public void aLineNamesTheItemsOfTheStep_pluralsAndCountsDoNotMatter()
	{
		assertTrue(GuideList.mentions("Have Ned make a wig (3 balls of wool); buy rope too", "Ball of wool ×3"));
		assertTrue(GuideList.mentions("Dye the wig yellow (Aggie: 2 onions + 5 gp)", "Onion ×2"));
		assertTrue(GuideList.mentions("Aggie: get skin paste (ashes, redberries, flour, water)", "Redberries"));
		assertFalse("only whole words in a row", GuideList.mentions("Talk to Leela", "Bronze bar"));
		assertFalse(GuideList.mentions("Make a ropeway", "Rope"));
		assertFalse(GuideList.mentions("anything", ""));
		assertEquals("Ball of wool", GuideList.baseName("Ball of wool ×3"));
		assertEquals("Redberries", GuideList.baseName("Redberries"));
	}

	@Test
	public void anErrandThatTheBagHasDoneIsCutFromTheDetails_onlyThen()
	{
		String line = "Have Ned make a wig (3 balls of wool); buy rope too";
		StepGuide.View base = princeAli(0);
		assertEquals("rope is in the bag: the errand is done", "Have Ned make a wig (3 balls of wool)",
			GuideList.withoutDoneErrands(withItems(base, itemLine("Rope", StepGuide.Have.BAG)), line));
		assertEquals("rope was handed in or used earlier: done too", "Have Ned make a wig (3 balls of wool)",
			GuideList.withoutDoneErrands(withItems(base, itemLine("Rope", StepGuide.Have.DONE)), line));
		for (StepGuide.Have not : new StepGuide.Have[] {StepGuide.Have.NONE, StepGuide.Have.BANK, StepGuide.Have.UNKNOWN})
		{
			assertEquals("rope is " + not + ": the errand stays", line, GuideList.withoutDoneErrands(withItems(base, itemLine("Rope", not)), line));
		}
		assertEquals("a clause that names no item of the step stays", "Have Ned make a wig; then run east",
			GuideList.withoutDoneErrands(withItems(base, itemLine("Rope", StepGuide.Have.BAG)), "Have Ned make a wig; then run east"));
		assertEquals("a clause that is not an errand stays", "Have Ned make a wig; rope is optional",
			GuideList.withoutDoneErrands(withItems(base, itemLine("Rope", StepGuide.Have.BAG)), "Have Ned make a wig; rope is optional"));
		assertEquals("one item still missing keeps the whole errand", "Buy it; buy rope and a bucket",
			GuideList.withoutDoneErrands(withItems(base, itemLine("Rope", StepGuide.Have.BAG), itemLine("Bucket", StepGuide.Have.NONE)), "Buy it; buy rope and a bucket"));
		assertEquals("", GuideList.withoutDoneErrands(base, null));
		assertEquals("No semicolon", GuideList.withoutDoneErrands(base, "No semicolon"));
	}

	/** S2-03 as the app 2.12 sends it: four items "in step", the places of Betty and the rat, the finale is "Give everything to Hetty". */
	static ActiveTarget hetty()
	{
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-03\",\"title\":\"Witch's Potion\",\"guide\":{"
			+ "\"items\":[{\"name\":\"Onion\",\"inStep\":true},{\"name\":\"Eye of newt\",\"inStep\":true},{\"name\":\"Rat's tail\",\"inStep\":true}],"
			+ "\"places\":["
			+ "{\"x\":2968,\"y\":3204,\"plane\":0,\"label\":\"Hetty — house in Rimmington\",\"npc\":\"Hetty\"},"
			+ "{\"x\":2957,\"y\":3204,\"plane\":0,\"label\":\"Rat — Brian's Archery Supplies\",\"npc\":\"Rat\",\"items\":[\"Rat's tail\"]},"
			+ "{\"x\":3014,\"y\":3259,\"plane\":0,\"label\":\"Eye of newt — Betty, Port Sarim\",\"npc\":\"Betty\",\"items\":[\"Eye of newt\"]},"
			+ "{\"x\":2950,\"y\":3251,\"plane\":0,\"label\":\"Onion — patch\",\"items\":[\"Onion\"]}],"
			+ "\"steps\":[\"Talk to Hetty.\",\"Pick the onion.\",\"Give everything to Hetty and drink from the cauldron (Drink From).\"]}}", ActiveTarget.class);
		assertEquals(null, t.prepare());
		return t;
	}

	@Test
	public void itemsHandedIn_theGuideDoesNotAskForThemAgain()
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

	/** The card on the canvas at (10, 50): the header, a line without a place, a place line. */
	private static OsrsPathGuideOverlay overlay(Client c, long renderedAt)
	{
		OsrsPathGuideOverlay o = new OsrsPathGuideOverlay(c, null, null);
		o.setHits(new OsrsPathGuideOverlay.Hits(new Rectangle(10, 50, 220, 100),
			Arrays.asList(new Rectangle(14, 54, 212, 16), new Rectangle(14, 100, 212, 16)),
			Arrays.asList(GuideList.Action.TOGGLE, GuideList.Action.place(3)), renderedAt));
		return o;
	}

	@Test
	public void clickOnPlace_actionAndClickDoesNotGoToGame()
	{
		Client c = client(false, false, entry(null));
		List<GuideList.Action> done = new ArrayList<>();
		GuideMouse mouse = new GuideMouse(c, overlay(c, System.nanoTime()), done::add);
		MouseEvent e = mouse.mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK));
		assertTrue("the game will not get the click: the character will not walk under the card", e.isConsumed());
		assertEquals(Collections.singletonList(GuideList.Action.place(3)), done);
		MouseEvent up = new MouseEvent(new Canvas(), MouseEvent.MOUSE_RELEASED, 0, 0, 50, 105, 1, false, MouseEvent.BUTTON1);
		assertTrue(mouse.mouseReleased(up).isConsumed());

		// A line without a place: the click does not go to the game either, but does nothing.
		done.clear();
		assertTrue(mouse.mousePressed(press(50, 80, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertTrue(done.isEmpty());
		// The header: open or close the details.
		mouse.mousePressed(press(50, 58, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK));
		assertEquals(Collections.singletonList(GuideList.Action.TOGGLE), done);
	}

	@Test
	public void clickGoesToGame_outsideCard_right_withAlt_menu_bankOverCard_cardNotDrawn()
	{
		List<GuideList.Action> done = new ArrayList<>();
		Client world = client(false, false, entry(null));
		GuideMouse mouse = new GuideMouse(world, overlay(world, System.nanoTime()), done::add);
		assertFalse("beside the card", mouse.mousePressed(press(400, 300, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertFalse("just outside its right edge", mouse.mousePressed(press(231, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertFalse("right button: the game menu", mouse.mousePressed(press(50, 105, MouseEvent.BUTTON3, InputEvent.BUTTON3_DOWN_MASK)).isConsumed());
		assertFalse("Alt: RuneLite moves the card",
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
		assertFalse("a bank over the card: 'Withdraw-1' matters more",
			new GuideMouse(bank, overlay(bank, System.nanoTime()), done::add).mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertFalse("the card has not been drawn for a long time (left the game, hidden): clicks go to the game",
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

	/** A menu entry over the card, in Latin letters and by the line's action. */
	@Test
	public void menuOptionOverCardIsLatin()
	{
		assertEquals("Arrow to", GuideMouse.menuOption(GuideList.Action.place(0)));
		assertEquals("Arrow back to step", GuideMouse.menuOption(GuideList.Action.BACK));
		assertEquals("Details", GuideMouse.menuOption(GuideList.Action.TOGGLE));
		assertEquals("More advice", GuideMouse.menuOption(GuideList.Action.MORE));
		assertEquals("List", GuideMouse.menuOption(GuideList.Action.NONE));
		for (GuideList.Kind k : GuideList.Kind.values())
		{
			assertTrue(k.name(), GuideMouse.menuOption(new GuideList.Action(k, 0)).matches("[A-Za-z /]+"));
		}
	}

	/** An open world map over the card: a click on its marker goes to the map, not to the line under it. */
	@Test
	public void worldMapOverCard_clickGoesToMap()
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
}
