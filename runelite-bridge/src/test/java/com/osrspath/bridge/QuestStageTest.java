package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.HashSet;
import java.util.List;
import org.junit.Test;

/**
 * A quest with stages (Rune Mysteries, varp 63): the "What you need" list in the game shows the current stage: what to do, the items
 * of exactly this stage and one point, not the whole quest at once, and it does not ask for what was collected and handed in.
 */
public class QuestStageTest
{
	private static final Gson GSON = new Gson();

	/** S2-06 as the app sends it: the places are Horacio, Sedridor, Aubury; the stages refer to them by number. */
	static ActiveTarget runeMysteries()
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-06\",\"title\":\"Rune Mysteries\","
			+ "\"completionTrigger\":{\"type\":\"QUEST_COMPLETED\",\"questName\":\"Rune Mysteries\"},"
			+ "\"guide\":{\"items\":["
			+ "{\"name\":\"Air talisman\",\"id\":1438,\"where\":\"Given by Duke Horacio.\",\"inStep\":true},"
			+ "{\"name\":\"Research package\",\"id\":290,\"where\":\"Given by Sedridor.\",\"inStep\":true}],"
			+ "\"places\":["
			+ "{\"x\":3209,\"y\":3222,\"plane\":1,\"label\":\"Duke Horacio — Lumbridge Castle\",\"npc\":\"Duke Horacio\"},"
			+ "{\"x\":3104,\"y\":9571,\"plane\":0,\"label\":\"Archmage Sedridor — Wizards Tower basement\",\"npc\":\"Archmage Sedridor\"},"
			+ "{\"x\":3253,\"y\":3401,\"plane\":0,\"label\":\"Aubury — Varrock rune shop\",\"npc\":\"Aubury\"}],"
			+ "\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":["
			+ "{\"at\":0,\"steps\":[{\"t\":\"Talk to Duke Horacio.\"}],\"go\":0,\"items\":[]},"
			+ "{\"at\":1,\"steps\":[{\"t\":\"Bring the air talisman to Sedridor.\"}],\"go\":1,\"items\":[{\"name\":\"Air talisman\",\"id\":1438}]},"
			+ "{\"at\":3,\"steps\":[{\"t\":\"Bring the research package to Aubury.\"}],\"go\":2,\"items\":[{\"name\":\"Research package\",\"id\":290}]},"
			+ "{\"at\":5,\"steps\":[{\"t\":\"Bring the notes to Sedridor.\"}],\"go\":1}]}}}", ActiveTarget.class);
		assertNull(t.prepare());
		return t;
	}

	private static StepGuide.View view(int value, boolean done, ItemCounts carried)
	{
		return StepGuide.view(runeMysteries(), carried, null, null, 0, 0, 0, new HashSet<>(), value, done);
	}

	@Test
	public void stageIsChosenByTheVariableValue()
	{
		assertEquals(1, view(0, false, new ItemCounts()).getStage().getIndex());
		assertEquals(2, view(1, false, new ItemCounts()).getStage().getIndex());
		// Between stages (value 2: Sedridor hands out the package) the previous one applies until the next begins.
		assertEquals(2, view(2, false, new ItemCounts()).getStage().getIndex());
		assertEquals(3, view(3, false, new ItemCounts()).getStage().getIndex());
		assertEquals(3, view(4, false, new ItemCounts()).getStage().getIndex());
		assertEquals(4, view(5, false, new ItemCounts()).getStage().getIndex());
		assertEquals("a value above the last: the last stage", 4, view(99, false, new ItemCounts()).getStage().getIndex());
		assertEquals(4, view(0, false, new ItemCounts()).getStage().getTotal());
	}

	@Test
	public void stageHasOnlyItsItemsAndOnePoint()
	{
		StepGuide.View v = view(3, false, new ItemCounts());
		assertEquals("Bring the research package to Aubury.", v.getStage().getSteps().get(0).getT());
		assertEquals(1, v.getItems().size());
		assertEquals("Research package", v.getItems().get(0).getName());
		assertEquals(1, v.getPlaces().size());
		assertEquals("Aubury's point: the original number is kept for the click", 2, v.getPlaces().get(0).getIndex());
		assertNull("'Next' and the step's finale are not needed: the stage is the 'next'", v.getNext());
		assertNull(v.getFinale());
	}

	@Test
	public void stageWithoutItemListShowsTheStepsItems()
	{
		StepGuide.View v = view(5, false, new ItemCounts());
		assertEquals(2, v.getItems().size());
	}

	@Test
	public void stageWithEmptyItemList_asksForNothing()
	{
		StepGuide.View v = view(0, false, new ItemCounts());
		assertTrue(v.getItems().isEmpty());
		assertEquals("Duke Horacio — Lumbridge Castle", v.getPlaces().get(0).getLabel());
	}

	@Test
	public void stageItemInBag_markedGreen()
	{
		ItemCounts bag = new ItemCounts();
		bag.add(290, ActiveTarget.nameKey("Research package"), 1);
		StepGuide.View v = view(3, false, bag);
		assertEquals(StepGuide.Have.BAG, v.getItems().get(0).getHave());
	}

	@Test
	public void questComplete_stagesNotShownAndNothingAsked()
	{
		StepGuide.View v = view(6, true, new ItemCounts());
		assertTrue(v.getStage().isFinished());
		assertTrue(v.getItems().isEmpty());
		assertTrue(v.getPlaces().isEmpty());
		assertEquals("Quest complete ✓", GuideList.stageTitle(v.getStage()));
		HudModel.Card c = card(v);
		assertEquals("Quest complete", c.getHeadline());
		assertFalse(c.plain(true, true), c.plain(true, true).contains("Air talisman"));
	}

	@Test
	public void noVariableValue_stepListAsBefore()
	{
		StepGuide.View v = StepGuide.view(runeMysteries(), new ItemCounts(), null, null, 0, 0, 0, new HashSet<>(), null, false);
		assertNull(v.getStage());
		assertEquals(2, v.getItems().size());
		assertEquals(3, v.getPlaces().size());
	}

	@Test
	public void stepWithoutStages_unchanged()
	{
		ActiveTarget t = StepGuideTest.witchsPotion();
		StepGuide.View v = StepGuide.view(t, new ItemCounts(), null, null, 0, 0, 0, new HashSet<>(), 7, false);
		assertNull(v.getStage());
		assertEquals(3, v.getItems().size());
	}

	@Test
	public void theGuideHasTheStageLine_itsItemFirst_andItsPoint()
	{
		StepGuide.View v = view(3, false, new ItemCounts());
		HudModel.Card c = card(v);
		// The package is not with you and the bank was not seen: getting it comes first, the stage line is what follows.
		assertEquals("Get Research package", c.getHeadline());
		assertEquals("Research package: 0 / 1 · bank not checked", c.getStatus());
		assertEquals("Then: bring the research package to Aubury", c.getThen());
		String open = c.plain(true, true);
		assertTrue(open, open.contains("Stage 3 of 4"));
		assertTrue("Aubury's point is a button: " + open, c.getNext().stream().anyMatch(l -> l.getAction().equals(GuideList.Action.place(2))));
		assertFalse("items of other stages are not shown: " + open, open.contains("Air talisman"));
		ItemCounts bag = new ItemCounts();
		bag.add(290, ActiveTarget.nameKey("Research package"), 1);
		HudModel.Card ready = card(view(3, false, bag));
		assertEquals("Bring the research package to Aubury", ready.getHeadline());
		assertEquals("Stage 3 of 4", ready.getStatus());
	}

	@Test
	public void theClosedCardIsTheLineAndItsStage()
	{
		HudModel.Card c = card(view(0, false, new ItemCounts()));
		assertEquals("Talk to Duke Horacio\nStage 1 of 4", c.plain(false, false));
	}

	@Test
	public void stagesAreValidated()
	{
		assertNotNull(bad("\"stage\":{\"kind\":\"sql\",\"id\":63,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}]}]}"));
		assertNotNull(bad("\"stage\":{\"kind\":\"varp\",\"id\":0,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}]}]}"));
		assertNotNull(bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[]}"));
		assertNotNull("stage values grow", bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[{\"at\":2,\"steps\":[{\"t\":\"x\"}]},{\"at\":1,\"steps\":[{\"t\":\"y\"}]}]}"));
		assertNotNull("empty text", bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\" \"}]}]}"));
		assertNotNull("a point outside the list of places", bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}],\"go\":5}]}"));
		assertNotNull("an item without a name", bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}],\"items\":[{\"name\":\"\"}]}]}"));
		assertNull(bad("\"stage\":{\"kind\":\"varbit\",\"id\":12063,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}],\"go\":0}]}"));
	}

	/** A stage of five steps with tiles: two steps without a tile (think, wait) and two at one place (a lever down and up). */
	private static List<ActiveTarget.StageLine> manor()
	{
		String json = "[{\"t\":\"A\",\"x\":3100,\"y\":3300,\"plane\":0},{\"t\":\"B\"},{\"t\":\"C\",\"x\":3110,\"y\":3300,\"plane\":0},"
			+ "{\"t\":\"D\",\"x\":3120,\"y\":9700,\"plane\":0},{\"t\":\"C-again\",\"x\":3110,\"y\":3300,\"plane\":0},{\"t\":\"E\",\"x\":3200,\"y\":3300,\"plane\":0}]";
		return GSON.fromJson(json, new com.google.gson.reflect.TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
	}

	@Test
	public void currentStepMovesWhenThePlayerReachesTheNext()
	{
		List<ActiveTarget.StageLine> l = manor();
		assertEquals("standing at the first: the first", 0, StepGuide.advance(l, 0, 3101, 3299, 0));
		assertEquals("a step without a tile is jumped when we reach C", 2, StepGuide.advance(l, 0, 3111, 3301, 0));
		assertEquals("at C we stay on C", 2, StepGuide.advance(l, 2, 3110, 3300, 0));
		assertEquals("a step at the same place (C-again) does not jump over C while we stand at C", 2, StepGuide.advance(l, 2, 3110, 3300, 0));
		assertEquals("went into the basement (D): D", 3, StepGuide.advance(l, 2, 3120, 9700, 0));
		assertEquals("came back to C: it is C-again now", 4, StepGuide.advance(l, 3, 3110, 3300, 0));
		assertEquals("not on that plane: nothing", 0, StepGuide.advance(l, 0, 3110, 3300, 1));
		assertEquals("far away: nothing", 0, StepGuide.advance(l, 0, 3300, 3300, 0));
		assertEquals("too far ahead (beyond the window) we do not jump", 0, StepGuide.advance(l, 0, 3200, 3300, 0));
		assertEquals("an empty list", 0, StepGuide.advance(null, 5, 1, 1, 0));
		assertEquals("first entry into the stage: search the whole list (the player is already at E)", 5, StepGuide.advance(l, 0, 3200, 3300, 0, l.size()));
		assertEquals("first entry: at the basement: D", 3, StepGuide.advance(l, 0, 3120, 9700, 0, l.size()));
		assertEquals("first entry: nowhere: the start", 0, StepGuide.advance(l, 0, 5000, 5000, 0, l.size()));
	}

	@Test
	public void theStageLine_theNextOne_andBack()
	{
		HudModel.Card c = card(stage(new StepGuide.StageView(1, 1, manor(), 2, false)));
		assertEquals("C", c.getHeadline());
		assertEquals("the counter: line 3 of 6", "Line 3 of 6", c.getStatus());
		HudModel.Line next = c.getNext().get(0);
		assertEquals("one next line", "D", next.getText());
		assertEquals("how many more after it", "+2", next.getRight());
		String open = c.plain(true, true);
		assertFalse("not more than one ahead: " + open, open.contains("C-again"));
		HudModel.Line back = c.getNext().stream().filter(l -> l.getAction().equals(GuideList.Action.PREV)).findFirst().orElse(null);
		assertNotNull("the line is not the first: there is 'Previous line': " + open, back);
		assertTrue(back.getHint(), back.getHint().contains("B"));
		assertFalse("no 'Back to the current line' outside viewing: " + open, open.contains("Back to the current line"));
		assertTrue("the next line is not a button: you cannot skip forward by click", !next.getAction().isClickable());
	}

	@Test
	public void theFirstLineHasNoPrevious_theLastNoNext()
	{
		HudModel.Card first = card(stage(new StepGuide.StageView(1, 1, manor(), 0, false)));
		assertFalse(first.plain(true, true), first.plain(true, true).contains("Previous line"));
		HudModel.Card last = card(stage(new StepGuide.StageView(1, 1, manor(), 5, false)));
		assertTrue(last.plain(true, true), last.getNext().stream().noneMatch(l -> l.getIcon() == HudModel.Icon.NEXT && !l.getAction().isClickable()));
		assertEquals("Line 6 of 6", last.getStatus());
	}

	@Test
	public void theShortTextLeads_theFullOneIsInTheDetails()
	{
		List<ActiveTarget.StageLine> l = GSON.fromJson("[{\"t\":\"Talk to the Squire in the courtyard of White Knights' castle in Falador. Dialogue: “Yes”.\",\"s\":\"Talk to the Squire (Falador)\"},{\"t\":\"Second step. In detail.\"}]",
			new com.google.gson.reflect.TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
		HudModel.Card c = card(stage(new StepGuide.StageView(1, 1, l, 0, false)));
		assertEquals("Talk to the Squire (Falador)", c.getHeadline());
		assertFalse("the dialogue is not on the closed card", c.plain(false, false).contains("Dialogue"));
		assertTrue("the full text is in the details: " + c.plain(true, false), c.plain(true, false).contains("White Knights"));
		assertEquals("a line without a short text shortens itself", "Second step", c.getNext().get(0).getText());
	}

	@Test
	public void doneButton_onlyOnLinesTheGameCannotSee()
	{
		// manor(): A (3100,3300), B without a place, C (3110,3300)... after A the next line has no place: the game will not show it.
		HudModel.Card manual = card(stage(new StepGuide.StageView(1, 1, manor(), 0, false, null, false, true)));
		HudModel.Line done = manual.getNext().stream().filter(r -> r.getAction().equals(GuideList.Action.NEXT)).findFirst().orElse(null);
		assertNotNull("a line the game does not see has 'Done': " + manual.plain(true, true), done);
		assertEquals("Done - show the next line", done.getText());
		HudModel.Card auto = card(stage(new StepGuide.StageView(1, 1, manor(), 0, false)));
		assertTrue("a line the game sees has no button: " + auto.plain(true, true), auto.getNext().stream().noneMatch(r -> r.getAction().equals(GuideList.Action.NEXT)));
	}

	@Test
	public void warningAndViewing_saidOnTheCard()
	{
		StepGuide.StageView sv = new StepGuide.StageView(1, 1, manor(), 2, false, "Blurite ore is still in your bag - first: Give Thurgo", true);
		HudModel.Card c = card(stage(sv));
		assertEquals("the warning is the one on the closed card", "Blurite ore is still in your bag - first: Give Thurgo", c.getWarning().getText());
		assertTrue(c.getStatus(), c.getStatus().startsWith("Viewing an earlier line"));
		assertFalse("the word 'manually' is no more", c.plain(true, true).contains("manually"));
		HudModel.Line resume = c.getNext().stream().filter(r -> r.getAction().equals(GuideList.Action.RESUME)).findFirst().orElse(null);
		assertNotNull("while viewing there is 'Back to the current line'", resume);
		assertEquals("Back to the current line", resume.getText());
	}

	@Test
	public void onStageTakenAndHandedInHidden_onlyWhatIsNeededRemains()
	{
		java.util.ArrayList<StepGuide.ItemLine> items = new java.util.ArrayList<>();
		items.add(new StepGuide.ItemLine("a", "", StepGuide.Have.DONE, null, -1, "Iron bar ×2", "done"));
		items.add(new StepGuide.ItemLine("b", "", StepGuide.Have.BAG, null, -1, "Bronze pickaxe", "have"));
		items.add(new StepGuide.ItemLine("c", "", StepGuide.Have.NONE, null, -1, "Tinderbox", "none"));
		List<StepGuide.ItemLine> pending = GuideList.pending(items);
		assertEquals(1, pending.size());
		assertEquals("Tinderbox", pending.get(0).getName());
		assertTrue("everything is taken: empty", GuideList.pending(items.subList(0, 2)).isEmpty());
	}

	/** S2-07, stage 7 of 7: as in the game: the ore and bars were handed to Thurgo, the sword for the Squire remains. */
	static ActiveTarget thurgoOre()
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-07\",\"title\":\"The Knight's Sword\",\"guide\":{\"items\":[],\"places\":["
			+ "{\"x\":3008,\"y\":3150,\"plane\":0,\"label\":\"Asgarnian Ice Dungeon entrance\"}],"
			+ "\"stage\":{\"kind\":\"varp\",\"id\":122,\"stages\":[{\"at\":6,\"go\":0,\"items\":["
			+ "{\"name\":\"Iron bar\",\"id\":2351,\"count\":2},{\"name\":\"Bronze pickaxe\",\"id\":1265},{\"name\":\"Blurite ore\",\"id\":668}],\"steps\":["
			+ "{\"t\":\"Climb down into the Asgarnian Ice Dungeon south of Port Sarim.\",\"s\":\"Climb down into the Asgarnian Ice Dungeon\",\"x\":3008,\"y\":3150,\"plane\":0},"
			+ "{\"t\":\"Mine blurite ore.\",\"s\":\"Mine blurite ore\",\"x\":3049,\"y\":9566,\"plane\":0,\"has\":\"Blurite ore\"},"
			+ "{\"t\":\"Give Thurgo the blurite ore and two iron bars.\",\"s\":\"Give Thurgo the blurite ore and 2 iron bars\",\"x\":3000,\"y\":3145,\"plane\":0,\"need\":\"Blurite ore\"},"
			+ "{\"t\":\"Bring the sword to the Squire to finish the quest.\",\"s\":\"Bring the sword to the Squire\",\"x\":2978,\"y\":3341,\"plane\":0}]}]}}}", ActiveTarget.class);
		assertNull(t.prepare());
		return t;
	}

	@Test
	public void stageDone_nothingToGet_onlyTheLineRemains()
	{
		ActiveTarget t = thurgoOre();
		// The bars and ore were handed in (they were in the bag, now they are not), the pickaxe is in the bag: everything needed is already done.
		HashSet<String> got = new HashSet<>(java.util.Arrays.asList(ActiveTarget.nameKey("Iron bar"), ActiveTarget.nameKey("Blurite ore")));
		ItemCounts bag = new ItemCounts();
		bag.add(1265, ActiveTarget.nameKey("Bronze pickaxe"), 1);
		HudModel.Card c = card(StepGuide.view(t, bag, null, null, 0, 0, 0, got, 6, false, 3));
		String all = c.plain(true, true);
		assertEquals("Bring the sword to the Squire", c.getHeadline());
		assertEquals("Line 4 of 4", c.getStatus());
		assertFalse("what was taken and handed in is not asked for: " + all, all.contains("Iron bar") || all.contains("Blurite ore"));
		assertTrue("you can go back: " + all, all.contains("Previous line"));
		assertFalse("the line says where to go, so there is no stage point ('dungeon entrance'): " + all, all.contains("Ice Dungeon entrance"));
		assertTrue("the route step in full when open: " + all, all.contains("S2-07 · The Knight's Sword"));
	}

	@Test
	public void stage_onlyWhatIsMissingRemains()
	{
		ActiveTarget t = thurgoOre();
		ItemCounts bag = new ItemCounts();
		bag.add(1265, ActiveTarget.nameKey("Bronze pickaxe"), 1);
		HudModel.Card c = card(StepGuide.view(t, bag, new ItemCounts(), null, 0, 0, 0, new HashSet<>(), 6, false, 0));
		String all = c.plain(true, true);
		assertTrue("there is no ore and no bars: they are asked for: " + all, all.contains("Blurite ore") && all.contains("Iron bar"));
		assertTrue("the pickaxe is with you: " + all, all.contains("1 item with you"));
		assertTrue(c.getPrepare().stream().noneMatch(l -> l.getText().contains("Bronze pickaxe")));
	}

	private static ActiveTarget sword()
	{
		return GSON.fromJson("{\"stepId\":\"S2-07\",\"title\":\"The Knight's Sword\",\"guide\":{\"items\":[],\"places\":["
			+ "{\"x\":2994,\"y\":3341,\"plane\":0,\"label\":\"Stairs\"},{\"x\":3000,\"y\":3145,\"plane\":0,\"label\":\"Thurgo\"}],"
			+ "\"stage\":{\"kind\":\"varp\",\"id\":122,\"stages\":[{\"at\":0,\"steps\":["
			+ "{\"t\":\"Stairs\",\"x\":2994,\"y\":3341,\"plane\":0,\"has\":\"Portrait\"},"
			+ "{\"t\":\"Cupboard\",\"x\":2985,\"y\":3336,\"plane\":2,\"has\":\"Portrait\"},"
			+ "{\"t\":\"Bring to Thurgo\",\"x\":3000,\"y\":3145,\"plane\":0}],\"go\":0}]}}}", ActiveTarget.class);
	}

	/** S2-07, the "Forge the sword" stage: Thurgo sent them for ore, the player stands next to him. */
	private static List<ActiveTarget.StageLine> ore()
	{
		String json = "[{\"t\":\"Climb down into the Ice Dungeon\",\"x\":3008,\"y\":3150,\"plane\":0},"
			+ "{\"t\":\"Mine blurite ore\",\"x\":3049,\"y\":9566,\"plane\":0},"
			+ "{\"t\":\"Give Thurgo the ore\",\"x\":3000,\"y\":3145,\"plane\":0,\"need\":\"Blurite ore\"},"
			+ "{\"t\":\"Bring the sword to the Squire\",\"x\":2978,\"y\":3341,\"plane\":0}]";
		return GSON.fromJson(json, new com.google.gson.reflect.TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
	}

	@Test
	public void afterThurgoTheArrowLeadsIntoTheDungeon_doesNotStayAtThurgo()
	{
		List<ActiveTarget.StageLine> l = ore();
		ItemCounts empty = new ItemCounts();
		assertEquals("at Thurgo without the ore: to the dungeon entrance, not 'give back the ore'", 0, StepGuide.advance(l, 0, 3000, 3145, 0, l.size(), empty));
		ItemCounts bag = new ItemCounts();
		bag.add(668, ActiveTarget.nameKey("Blurite ore"), 1);
		assertEquals("ore in the bag: 'give back the ore'", 2, StepGuide.advance(l, 0, 3000, 3145, 0, l.size(), bag));
		assertEquals("in the cave at the ore: mine", 1, StepGuide.advance(l, 0, 3049, 9566, 0, l.size(), empty));
		assertEquals("items unknown: the condition is not checked", 2, StepGuide.advance(l, 0, 3000, 3145, 0, l.size()));
	}

	@Test
	public void stageChangedBeforeOurEyes_countFromTheFirstStep_loginIntoStartedStage_byTheWholeList()
	{
		List<ActiveTarget.StageLine> l = manor();
		// The player is at step E (the last) at the moment the stage has just changed: the stage's steps are not done yet, so the start.
		assertEquals(0, StepGuide.advance(l, 0, 3200, 3300, 0, StepGuide.freshWindow(true, l.size())));
		// The same player logs in in the middle of the stage: search the whole list.
		assertEquals(5, StepGuide.advance(l, 0, 3200, 3300, 0, StepGuide.freshWindow(false, l.size())));
	}

	@Test
	public void stepBeforeItemIsSkippedWhenTheItemIsAlreadyInTheBag()
	{
		ActiveTarget t = sword();
		assertNull(t.prepare());
		List<ActiveTarget.StageLine> lines = t.getGuide().getStage().getStages().get(0).getSteps();
		assertEquals("no portrait: we stay", 0, StepGuide.skipDone(lines, 0, new ItemCounts()));
		ItemCounts bag = new ItemCounts();
		bag.add(666, ActiveTarget.nameKey("Portrait"), 1);
		assertEquals("portrait in the bag: to Thurgo", 2, StepGuide.skipDone(lines, 0, bag));
		assertEquals("the last step is not skipped", 2, StepGuide.skipDone(lines, 2, bag));
	}

	@Test
	public void stageArrowIsNotADetourAndThereIsNoReturnButton()
	{
		ActiveTarget t = sword();
		assertNull(t.prepare());
		// The arrow stands on the tile of the current step (the cupboard): "Arrow back to the step" is not needed.
		StepGuide.View v = StepGuide.view(t, new ItemCounts(), null, "Cupboard", 2985, 3336, 2, new HashSet<>(), 0, false, 1);
		assertNull(v.getDetour());
		// The player chose their own place: that is a detour.
		StepGuide.View own = StepGuide.view(t, new ItemCounts(), null, "Bank", 3185, 3436, 0, new HashSet<>(), 0, false, 1);
		assertEquals("Bank", own.getDetour());
	}

	@Test
	public void betterToolCountsInsteadOfWorse()
	{
		ItemCounts bag = new ItemCounts();
		bag.add(1267, ActiveTarget.nameKey("Iron pickaxe"), 1);
		assertEquals("Iron instead of Bronze", 1, bag.count(1265, "Bronze pickaxe"));
		assertEquals("Iron instead of Iron", 1, bag.count(1267, "Iron pickaxe"));
		assertEquals("Steel is no worse: Iron does not replace Steel", 0, bag.count(1269, "Steel pickaxe"));
		assertEquals("a pickaxe does not replace an axe", 0, bag.count(1351, "Bronze axe"));
		assertEquals("Rune platebody is not a tool", 0, bag.count(1127, "Bronze platebody"));
	}

	private static HudModel.Card card(StepGuide.View v)
	{
		return HudModel.build(HudModelTest.input(v, HudModelTest.quiet(), null));
	}

	/** A step with only this stage view: no items, no places. */
	private static StepGuide.View stage(StepGuide.StageView sv)
	{
		return new StepGuide.View("[S2-05] Manor", null, java.util.Collections.emptyList(), java.util.Collections.emptyList(), null, null, null, null, sv);
	}

	private static String bad(String stageJson)
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-06\",\"title\":\"Rune Mysteries\",\"guide\":{\"items\":[],\"places\":["
			+ "{\"x\":3209,\"y\":3222,\"plane\":1,\"label\":\"Horacio\"}]," + stageJson + "}}", ActiveTarget.class);
		return t.prepare();
	}
}
