package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;

/**
 * The stage step cursor is counted from the game state, not from clicks. The case it all started with (S2-07): the ore was mined,
 * the step was not counted; the player clicked "done" past handing the ore to Thurgo and got stuck on "Bring the sword to the Squire" with the ore in the bag,
 * not knowing where they were or how to get back. So moving a step forward by click is now not possible at all; "back" is only
 * a temporary view, then the facts lead the cursor again (S2-08: "manual" got stuck and did not move by itself).
 */
public class StageTrackerTest
{
	private static final String STEP = "S2-07";
	/** The dungeon entrance, the ore cave, Thurgo, the Squire. */
	private static final int[] DUNGEON = {3008, 3150};
	private static final int[] CAVE = {3049, 9566};
	private static final int[] THURGO = {3000, 3145};
	private static final int[] SQUIRE = {2978, 3341};
	private static final int[] FAR = {3200, 3200};

	private static List<ActiveTarget.StageLine> lines()
	{
		return QuestStageTest.thurgoOre().getGuide().getStage().getStages().get(0).getSteps();
	}

	private static ItemCounts bag(int ore, int bars)
	{
		ItemCounts b = new ItemCounts();
		if (ore > 0)
		{
			b.add(668, ActiveTarget.nameKey("Blurite ore"), ore);
		}
		if (bars > 0)
		{
			b.add(2351, ActiveTarget.nameKey("Iron bar"), bars);
		}
		return b;
	}

	private static int update(StageTracker t, int[] at, ItemCounts bag)
	{
		return t.update(STEP, 0, lines(), at[0], at[1], 0, bag);
	}

	@Test
	public void oreInBag_miningStepCountedByItself_andArrowToThurgo()
	{
		StageTracker t = new StageTracker();
		assertEquals("entering the stage at the dungeon entrance", 0, update(t, DUNGEON, bag(0, 2)));
		assertEquals("in the cave we mine", 1, update(t, CAVE, bag(0, 2)));
		assertEquals("ore in the bag: the mining step is done, hand in to Thurgo", 2, update(t, CAVE, bag(1, 2)));
		assertNull(t.warning());
	}

	@Test
	public void oreInBag_stepsWithoutConditionsBeforeItAreSkipped()
	{
		StageTracker t = new StageTracker();
		assertEquals(0, update(t, FAR, bag(0, 0)));
		assertEquals("there is ore but the player was not at the entrance: the descent has no conditions, the cave was visited", 2, update(t, FAR, bag(1, 2)));
	}

	@Test
	public void stepsWithItemsAreNotJumped_itemsInAnyOrder()
	{
		List<ActiveTarget.StageLine> l = new Gson().fromJson("[{\"t\":\"A\",\"has\":\"Onion\"},{\"t\":\"B\",\"has\":\"Eye of newt\"},{\"t\":\"C\"}]",
			new TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
		ItemCounts onlyNewt = new ItemCounts();
		onlyNewt.add(221, ActiveTarget.nameKey("Eye of newt"), 1);
		StageTracker t = new StageTracker();
		assertEquals("the eye is there, the onion is not: the onion step stays", 0, t.update("S2-03", 0, l, 3000, 3000, 0, onlyNewt));
	}

	@Test
	public void oreGivenToThurgo_stepDone_goToSquire()
	{
		StageTracker t = new StageTracker();
		update(t, CAVE, bag(1, 2));
		assertEquals(2, update(t, THURGO, bag(1, 2)));
		assertEquals("the ore and bars left at Thurgo: the sword to the Squire", 3, update(t, THURGO, bag(0, 0)));
	}

	@Test
	public void oreVanishedFarFromThurgo_isNotAHandIn()
	{
		StageTracker t = new StageTracker();
		assertEquals(2, update(t, CAVE, bag(1, 2)));
		assertEquals("dropped or lost in the cave: the 'give back' step stays", 2, update(t, CAVE, bag(0, 2)));
	}

	@Test
	public void twoOres_oneGiven_stepDone()
	{
		StageTracker t = new StageTracker();
		update(t, THURGO, bag(2, 2));
		assertEquals(2, update(t, THURGO, bag(2, 2)));
		assertEquals("an extra ore remains, but the count fell next to Thurgo: handed in", 3, update(t, THURGO, bag(1, 0)));
	}

	@Test
	public void playerAtSquireWithOre_cursorReturnsToThurgoAndExplains()
	{
		StageTracker t = new StageTracker();
		int cur = update(t, SQUIRE, bag(1, 2));
		assertEquals("to the Squire with the ore: back to Thurgo, not to the sword", 2, cur);
		assertNotNull(t.warning());
		assertTrue(t.warning(), t.warning().contains("Blurite ore") && t.warning().contains("Give Thurgo"));
		assertEquals("the warning holds while the ore is in the bag", 2, update(t, SQUIRE, bag(1, 2)));
		assertNotNull(t.warning());
	}

	@Test
	public void forwardByClick_cannotSkipAStep_ifTheGameSeesTheResult()
	{
		StageTracker t = new StageTracker();
		update(t, DUNGEON, bag(0, 0));
		assertFalse("every S2-07 step is determined by the game (place, item): there is no 'done' button", t.canStepForward(lines()));
		assertFalse(t.forward(lines()));
		assertEquals("the click did not move the cursor", 0, t.cursor());
		update(t, THURGO, bag(1, 2));
		assertFalse(t.forward(lines()));
		assertEquals(2, t.cursor());
	}

	/** Levers in a row at one place: the game shows nothing between them. */
	private static List<ActiveTarget.StageLine> levers()
	{
		return new Gson().fromJson("[{\"t\":\"A\",\"x\":3100,\"y\":3300,\"plane\":0},{\"t\":\"B\",\"x\":3101,\"y\":3301,\"plane\":0},"
			+ "{\"t\":\"C\",\"x\":3200,\"y\":3300,\"plane\":0},{\"t\":\"D\"},{\"t\":\"E\",\"x\":3300,\"y\":3300,\"plane\":0}]",
			new TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
	}

	@Test
	public void forwardByClick_onlyWhereTheGameCannotSee_inARowAtOnePlace()
	{
		List<ActiveTarget.StageLine> l = levers();
		assertTrue("A->B at one place", StageTracker.needsManualStep(l, 0));
		assertFalse("B->C: C is at another place: arrived, the cursor moved on", StageTracker.needsManualStep(l, 1));
		assertTrue("C->D: D has no place or item: manual", StageTracker.needsManualStep(l, 2));
		assertFalse("the last step: the game will end the stage", StageTracker.needsManualStep(l, 4));
		StageTracker t = new StageTracker();
		t.update("S2-11", 0, l, 3100, 3300, 0, null);
		assertEquals(0, t.cursor());
		assertTrue(t.canStepForward(l));
		assertTrue(t.forward(l));
		assertEquals(1, t.cursor());
		assertEquals("at B the game will itself see C", 1, t.update("S2-11", 0, l, 3101, 3301, 0, null));
		assertFalse(t.forward(l));
		assertEquals("reached C: the cursor by itself", 2, t.update("S2-11", 0, l, 3200, 3300, 0, null));
	}

	@Test
	public void whileViewing_thereIsNoDoneButton()
	{
		AtomicLong now = new AtomicLong(0);
		StageTracker t = new StageTracker(now::get);
		List<ActiveTarget.StageLine> l = levers();
		t.update("S2-11", 0, l, 3101, 3301, 0, null);
		t.forward(l);
		t.back();
		assertTrue(t.peeking());
		assertFalse(t.canStepForward(l));
		assertFalse(t.forward(l));
	}

	@Test
	public void back_viewPreviousStep_automationDoesNotCarryAway_thenFactsReturn()
	{
		AtomicLong now = new AtomicLong(1_000_000);
		StageTracker t = new StageTracker(now::get);
		assertEquals(2, update(t, THURGO, bag(1, 2)));
		t.back();
		assertEquals(1, t.cursor());
		assertTrue(t.peeking());
		assertEquals("while viewing, the automation does not carry the cursor away", 1, update(t, THURGO, bag(1, 2)));
		now.addAndGet(StageTracker.PEEK_MS - 1);
		assertEquals(1, update(t, THURGO, bag(1, 2)));
		assertTrue(t.peeking());
		now.addAndGet(2);
		assertEquals("viewing is over: by the facts again: ore in the bag, Thurgo nearby", 2, update(t, THURGO, bag(1, 2)));
		assertFalse(t.peeking());
	}

	@Test
	public void toCurrent_returnsAtOnce()
	{
		AtomicLong now = new AtomicLong(5);
		StageTracker t = new StageTracker(now::get);
		update(t, THURGO, bag(1, 2));
		t.back();
		assertTrue(t.peeking());
		t.resume();
		assertFalse(t.peeking());
		assertEquals(2, update(t, THURGO, bag(1, 2)));
	}

	@Test
	public void backSeveralTimes_eachResetsTheTime()
	{
		AtomicLong now = new AtomicLong(0);
		StageTracker t = new StageTracker(now::get);
		update(t, THURGO, bag(1, 2));
		t.back();
		now.addAndGet(StageTracker.PEEK_MS - 10);
		t.back();
		assertEquals(0, t.cursor());
		now.addAndGet(StageTracker.PEEK_MS - 10);
		assertTrue("the second click extended viewing", t.peeking());
	}

	@Test
	public void back_onTheFirstStepDoesNothing()
	{
		StageTracker t = new StageTracker();
		update(t, DUNGEON, bag(0, 0));
		t.back();
		assertEquals(0, t.cursor());
		assertFalse(t.peeking());
	}

	@Test
	public void handInDuringViewing_isNoticed_andAfterViewingTheCursorIsPastIt()
	{
		AtomicLong now = new AtomicLong(0);
		StageTracker t = new StageTracker(now::get);
		update(t, THURGO, bag(1, 2));
		t.back();
		assertEquals(1, t.cursor());
		// While viewing the previous step, the player handed in the ore.
		assertEquals(1, update(t, THURGO, bag(0, 0)));
		now.addAndGet(StageTracker.PEEK_MS + 1);
		assertEquals("viewing is over: the hand-in happened: to the Squire", 3, update(t, THURGO, bag(0, 0)));
	}

	@Test
	public void stageChanged_viewingAndMemoryReset()
	{
		StageTracker t = new StageTracker();
		update(t, THURGO, bag(1, 2));
		t.back();
		assertTrue(t.peeking());
		t.update(STEP, 1, lines(), THURGO[0], THURGO[1], 0, bag(0, 0));
		assertFalse(t.peeking());
		assertEquals(STEP + "#1", t.key());
	}

	@Test
	public void itemsUnknown_conditionsNotChecked()
	{
		StageTracker t = new StageTracker();
		assertEquals("without the bag: by position, as before", 2, t.update(STEP, 0, lines(), THURGO[0], THURGO[1], 0, null));
	}

	@Test
	public void lastStepIsNotSkipped_theGameEndsTheStage()
	{
		StageTracker t = new StageTracker();
		update(t, THURGO, bag(1, 2));
		update(t, THURGO, bag(0, 0));
		assertEquals(3, t.cursor());
		assertEquals(3, update(t, SQUIRE, bag(0, 0)));
	}

	@Test
	public void positionStillWorks()
	{
		StageTracker t = new StageTracker();
		assertEquals(0, update(t, FAR, bag(0, 0)));
		assertEquals("at the dungeon entrance: the first step", 0, update(t, DUNGEON, bag(0, 0)));
		assertEquals("in the cave: the mining step", 1, update(t, CAVE, bag(0, 0)));
	}

	@Test
	public void ranToSquireWithoutOre_miningStepIsNotJumped()
	{
		StageTracker t = new StageTracker();
		assertEquals(0, update(t, DUNGEON, bag(0, 0)));
		// Before, the cursor went to the Squire and the arrow led to a sword that does not exist; now it waits on the step that is not done.
		assertEquals("mining is not done: the cursor is on it, not at the Squire", 1, update(t, SQUIRE, bag(0, 0)));
		assertTrue(t.reason(), t.reason().startsWith("BLOCK"));
	}

	// ---------- S2-08 Vampire Slayer: a stage of five steps, as in the app's data ----------

	private static final int[] HARLOW = {3222, 3399};
	private static final int[] MANOR = {3108, 3353};
	private static final int[] STAIRS = {3116, 3358};
	private static final int[] COFFIN = {3078, 9776};

	private static List<ActiveTarget.StageLine> vampire()
	{
		return new Gson().fromJson("[{\"t\":\"Buy a beer.\",\"s\":\"Buy a beer from the Blue Moon Inn bartender\",\"has\":\"Beer\"},"
			+ "{\"t\":\"Give the beer to Dr. Harlow.\",\"s\":\"Give Dr. Harlow the beer for a stake\",\"x\":3222,\"y\":3399,\"plane\":0,\"need\":\"Beer\",\"has\":\"Stake\"},"
			+ "{\"t\":\"Prepare for combat and enter.\",\"s\":\"Prepare for combat and enter Draynor Manor\",\"x\":3108,\"y\":3353,\"plane\":0},"
			+ "{\"t\":\"Go down to the basement.\",\"s\":\"Go down to the Draynor Manor basement\",\"x\":3116,\"y\":3358,\"plane\":0},"
			+ "{\"t\":\"Open the coffin.\",\"s\":\"Open the coffin, kill Count Draynor\",\"x\":3078,\"y\":9776,\"plane\":0}]",
			new TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
	}

	private static ItemCounts vbag(int beer, int stake)
	{
		ItemCounts b = new ItemCounts();
		if (beer > 0)
		{
			b.add(1917, ActiveTarget.nameKey("Beer"), beer);
		}
		if (stake > 0)
		{
			b.add(1549, ActiveTarget.nameKey("Stake"), stake);
		}
		return b;
	}

	private static int v(StageTracker t, int[] at, ItemCounts bag)
	{
		return t.update("S2-08", 2, vampire(), at[0], at[1], 0, bag);
	}

	@Test
	public void vampireSlayer_wholeStageRunsByItselfEndToEnd_withoutASingleClick()
	{
		StageTracker t = new StageTracker();
		assertEquals("Buy beer", 0, v(t, FAR, vbag(0, 0)));
		assertEquals("beer in the bag: to Dr. Harlow", 1, v(t, FAR, vbag(1, 0)));
		assertEquals("at Harlow with the beer: we hand it in", 1, v(t, HARLOW, vbag(1, 0)));
		assertEquals("the beer is gone, the stake came: prepare for combat", 2, v(t, HARLOW, vbag(0, 1)));
		assertEquals("at the manor: 'prepare and enter'", 2, v(t, MANOR, vbag(0, 1)));
		assertEquals("at the stairs to the basement", 3, v(t, STAIRS, vbag(0, 1)));
		assertEquals("in the basement at the coffin: the last step", 4, v(t, COFFIN, vbag(0, 1)));
	}

	@Test
	public void vampireSlayer_stakeAlreadyInBag_onLogin_straightToTheManorEntrance()
	{
		StageTracker t = new StageTracker();
		assertEquals("the stake is already there (the beer was handed in earlier): 'Buy' and 'Give' are already done", 2, v(t, FAR, vbag(0, 1)));
	}

	@Test
	public void vampireSlayer_viewedBack_andReturnedToTheManorHimself()
	{
		AtomicLong now = new AtomicLong(0);
		StageTracker t = new StageTracker(now::get);
		v(t, MANOR, vbag(0, 1));
		t.back();
		assertEquals(1, t.cursor());
		assertEquals("viewing", 1, v(t, MANOR, vbag(0, 1)));
		now.addAndGet(StageTracker.PEEK_MS + 5);
		assertEquals("a minute passed: 'to the manor' again, not 'manual' forever", 2, v(t, MANOR, vbag(0, 1)));
		assertEquals("went down: we go on by ourselves", 3, v(t, STAIRS, vbag(0, 1)));
	}

	/** S2-08 (from a player's screenshot): "enter Draynor Manor" at the door, "go down to the basement" eight tiles away, inside the house. */
	private static List<ActiveTarget.StageLine> manor()
	{
		return new Gson().fromJson("[{\"t\":\"Enter\",\"x\":3108,\"y\":3353,\"plane\":0},{\"t\":\"Go down to the basement\",\"x\":3116,\"y\":3358,\"plane\":0},"
			+ "{\"t\":\"Kill the count\",\"x\":3077,\"y\":9770,\"plane\":0}]", new TypeToken<List<ActiveTarget.StageLine>>() {}.getType());
	}

	private static int manor(StageTracker t, int x, int y)
	{
		return t.update("S2-08", 2, manor(), x, y, 0, new ItemCounts());
	}

	@Test
	public void wasAtTheDoorAndMovedAway_stepDone_arrowToTheStairsAtOnce()
	{
		StageTracker t = new StageTracker();
		assertEquals("far away: the first step", 0, manor(t, 3110, 3329));
		assertEquals("at the door: the first step, the arrow at the door", 0, manor(t, 3108, 3352));
		// The path inside the house winds: the stairs are still far (more than four tiles), but they have already moved away from the door.
		assertEquals("six tiles from the door: still close", 0, manor(t, 3103, 3359));
		assertEquals("seven tiles: the 'enter' step is done", 1, manor(t, 3102, 3360));
		assertTrue(t.reason(), t.reason().startsWith("LEFT"));
	}

	@Test
	public void stoodAtTheDoor_stepStays()
	{
		StageTracker t = new StageTracker();
		manor(t, 3108, 3352);
		for (int i = 0; i < 200; i++)
		{
			assertEquals(0, manor(t, 3109 + i % 2, 3352));
		}
	}

	@Test
	public void wasNotAtTheStepPoint_movingFarIsNotEnough()
	{
		StageTracker t = new StageTracker();
		// Appeared already to the side (login, teleport): they were not at the door, so the step is not closed.
		assertEquals(0, manor(t, 3102, 3360));
	}

	@Test
	public void stepWithConditionIsNotClosedByLeaving()
	{
		List<ActiveTarget.StageLine> l = new Gson().fromJson("[{\"t\":\"Give\",\"x\":3108,\"y\":3353,\"plane\":0,\"need\":\"Beer\"},"
			+ "{\"t\":\"Next\",\"x\":3116,\"y\":3358,\"plane\":0}]", new TypeToken<List<ActiveTarget.StageLine>>() {}.getType());
		ItemCounts beer = new ItemCounts();
		beer.add(1, ActiveTarget.nameKey("Beer"), 1);
		StageTracker t = new StageTracker();
		t.update("S", 0, l, 3108, 3353, 0, beer);
		assertEquals("the beer is not handed in: leaving is not enough", 0, t.update("S", 0, l, 3102, 3360, 0, beer));
	}

	/** S2-09 (from a player's screenshot): "put the rum in the crate" and "fill the crate" at one place, then Luthas five tiles away. */
	private static List<ActiveTarget.StageLine> crate()
	{
		return new Gson().fromJson("[{\"t\":\"Put the rum\",\"x\":2939,\"y\":3149,\"plane\":0},{\"t\":\"Fill the crate\",\"x\":2939,\"y\":3149,\"plane\":0},"
			+ "{\"t\":\"Tell Luthas\",\"x\":2938,\"y\":3156,\"plane\":0},{\"t\":\"Return\",\"x\":3027,\"y\":3222,\"plane\":0}]", new TypeToken<List<ActiveTarget.StageLine>>() {}.getType());
	}

	private static int crate(StageTracker t, int x, int y)
	{
		return t.update("S2-09", 1, crate(), x, y, 0, new ItemCounts());
	}

	@Test
	public void stepTheGameWillNotSee_isNotJumpedByPosition()
	{
		StageTracker t = new StageTracker();
		assertEquals("at the crate: 'put the rum'", 0, crate(t, 2939, 3150));
		// Went to Luthas without ticking "put the rum": before, the cursor jumped at once to "Tell Luthas", skipping "fill the crate".
		assertEquals("next to Luthas the cursor still waits on the step with no signs", 0, crate(t, 2938, 3155));
		assertTrue(t.reason(), t.reason().startsWith("GATE"));
		assertTrue("the 'done' button is on it: no dead end", t.canStepForward(crate()));
		assertTrue(t.forward(crate()));
		assertEquals("'fill the crate': the next step is at Luthas, distinguishable by place: we go on by ourselves", 2, crate(t, 2938, 3155));
	}

	@Test
	public void loginMidStage_freelyStandsOnTheNearestStep()
	{
		StageTracker t = new StageTracker();
		assertEquals("logged in next to Luthas: the steps at the crate are already behind", 2, crate(t, 2938, 3155));
	}
}
