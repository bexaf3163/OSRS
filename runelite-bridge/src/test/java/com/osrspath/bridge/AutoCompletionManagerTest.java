package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public class AutoCompletionManagerTest
{
	private final List<String> completed = new ArrayList<>();
	private Boolean questFinished = false;
	private int questChecks;

	/** Levels from the game by skill key; no key means the level is unknown (not in the game). */
	private final Map<String, Integer> levels = new HashMap<>();
	/** Items the player has: by name and by ID. */
	private final Map<String, Integer> byName = new HashMap<>();
	private final Map<Integer, Integer> byId = new HashMap<>();

	private final AutoCompletionManager manager = new AutoCompletionManager(name ->
	{
		questChecks++;
		return "Cook's Assistant".equals(name) || "Monkey Madness I".equals(name) ? questFinished : null;
	}, levels::get, need ->
	{
		if (need.getId() != null)
		{
			return byId.getOrDefault(need.getId(), 0);
		}
		return need.getNames().stream().mapToInt(n -> byName.getOrDefault(n, 0)).sum();
	}, completed::add);

	private static ActiveTarget.LevelNeed level(String skill, int level)
	{
		ActiveTarget.LevelNeed l = new ActiveTarget.LevelNeed();
		l.setSkill(skill);
		l.setLevel(level);
		return l;
	}

	private static ActiveTarget.ItemNeed item(Integer id, int count, String... names)
	{
		ActiveTarget.ItemNeed i = new ActiveTarget.ItemNeed();
		i.setNames(List.of(names));
		i.setId(id);
		i.setCount(count);
		return i;
	}

	private static ActiveTarget target(String stepId, String type)
	{
		ActiveTarget t = new ActiveTarget();
		t.setStepId(stepId);
		ActiveTarget.Trigger tr = new ActiveTarget.Trigger();
		tr.setType(type);
		t.setCompletionTrigger(tr);
		return t;
	}

	@Test
	public void conditionDescriptionForTheDeveloperBadge()
	{
		assertTrue("no step, no condition", manager.describe().isEmpty());
		ActiveTarget t = target("S2-07", "ITEM_OWNED");
		t.getCompletionTrigger().setItems(List.of(item(1535, 5, "Lobster")));
		manager.setTarget(t);
		assertEquals(List.of("Item(Lobster ×5) = FALSE 0/5"), manager.describe());
		byId.put(1535, 5);
		assertEquals(List.of("Item(Lobster ×5) = TRUE 5/5"), manager.describe());

		ActiveTarget q = target("S1-03", "QUEST_COMPLETED");
		q.getCompletionTrigger().setQuestName("Cook's Assistant");
		manager.setTarget(q);
		questFinished = false;
		assertEquals(List.of("Quest(Cook's Assistant) = FALSE"), manager.describe());
		questFinished = true;
		assertEquals(List.of("Quest(Cook's Assistant) = TRUE"), manager.describe());
		questFinished = null;
		assertEquals("quest unknown - a question, not FALSE", List.of("Quest(Cook's Assistant) = ?"), manager.describe());
	}

	@Test
	public void questIsCheckedAtOnceAndThenRarely()
	{
		ActiveTarget t = target("S1-03", "QUEST_COMPLETED");
		t.getCompletionTrigger().setQuestName("Cook's Assistant");
		manager.setTarget(t);

		manager.onGameTick();
		assertEquals("when armed the quest is checked at once", 1, questChecks);
		for (int i = 0; i < AutoCompletionManager.QUEST_POLL_TICKS - 2; i++)
		{
			manager.onGameTick();
		}
		assertEquals("without variable changes it is not checked every tick", 1, questChecks);

		questFinished = true;
		manager.onVarbitChanged(123, 1);
		manager.onGameTick();
		assertEquals(List.of("S1-03"), completed);
		assertFalse(manager.isArmed());

		manager.onVarbitChanged(123, 2);
		manager.onGameTick();
		assertEquals("we do not send it twice", 1, completed.size());
	}

	@Test
	public void questCompletedBeforeTheStepIsShownInTheGame()
	{
		questFinished = true;
		ActiveTarget t = target("S1-03", "QUEST_COMPLETED");
		t.getCompletionTrigger().setQuestName("Cook's Assistant");
		manager.setTarget(t);
		manager.onGameTick();
		assertEquals(List.of("S1-03"), completed);
	}

	@Test
	public void unknownQuestTurnsAutoTickOff()
	{
		ActiveTarget t = target("S1-99", "QUEST_COMPLETED");
		t.getCompletionTrigger().setQuestName("No Such Quest");
		manager.setTarget(t);
		manager.onGameTick();
		assertFalse(manager.isArmed());
		for (int i = 0; i < 30; i++)
		{
			manager.onGameTick();
		}
		assertEquals(1, questChecks);
		assertTrue(completed.isEmpty());
	}

	@Test
	public void newLevelMessageWithColourTags()
	{
		ActiveTarget t = target("S2-04", "CHAT_MESSAGE");
		t.getCompletionTrigger().setChatPattern("^Congratulations, you've just advanced your Magic level\\. You are now level (2[5-9]|[3-9]\\d)\\.");
		manager.setTarget(t);

		manager.onChatMessage("Congratulations, you've just advanced your Magic level. You are now level 24.");
		assertTrue(completed.isEmpty());
		manager.onChatMessage("<col=ef1020>Congratulations, you've just advanced your Magic level. You are now level 25.</col>");
		assertEquals(List.of("S2-04"), completed);
		manager.onChatMessage("Congratulations, you've just advanced your Magic level. You are now level 26.");
		assertEquals(1, completed.size());
	}

	@Test
	public void varbitOnlyTheExactValue()
	{
		ActiveTarget t = target("S9-99", "VARBIT_CHANGED");
		t.getCompletionTrigger().setVarbitId(1234);
		t.getCompletionTrigger().setTargetValue(3);
		manager.setTarget(t);
		manager.onVarbitChanged(1234, 2);
		manager.onVarbitChanged(999, 3);
		assertTrue(completed.isEmpty());
		manager.onVarbitChanged(1234, 3);
		assertEquals(List.of("S9-99"), completed);
	}

	@Test
	public void aNewTargetArmsAgain()
	{
		ActiveTarget t = target("S2-04", "CHAT_MESSAGE");
		t.getCompletionTrigger().setChatPattern("level 25");
		manager.setTarget(t);
		manager.onChatMessage("You are now level 25.");
		manager.setTarget(t);
		assertTrue(manager.isArmed());
		manager.onChatMessage("You are now level 25.");
		assertEquals(2, completed.size());

		manager.setTarget(null);
		assertFalse(manager.isArmed());
		manager.onChatMessage("You are now level 25.");
		assertEquals(2, completed.size());
	}

	@Test
	public void levelsAllAtOnceAndOnlyRealOnes()
	{
		ActiveTarget t = target("S2-13", "SKILL_LEVEL");
		t.getCompletionTrigger().setLevels(List.of(level("fishing", 30), level("cooking", 30)));
		manager.setTarget(t);
		manager.onGameTick();
		assertTrue("levels are not known yet - not in the game", completed.isEmpty());

		levels.put("fishing", 31);
		levels.put("cooking", 29);
		manager.onStateChanged();
		manager.onGameTick();
		assertTrue("Cooking 29 is too early", completed.isEmpty());

		levels.put("cooking", 30);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals(List.of("S2-13"), completed);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals("we do not send it twice", 1, completed.size());
	}

	@Test
	public void levelsAreAlreadyThereWhenTheStepIsShown()
	{
		levels.put("magic", 40);
		ActiveTarget t = target("S2-04", "SKILL_LEVEL");
		t.getCompletionTrigger().setLevels(List.of(level("magic", 25)));
		manager.setTarget(t);
		manager.onGameTick();
		assertEquals(List.of("S2-04"), completed);
	}

	@Test
	public void withoutChangesTheStateIsCheckedRarely()
	{
		ActiveTarget t = target("S2-04", "SKILL_LEVEL");
		t.getCompletionTrigger().setLevels(List.of(level("magic", 25)));
		manager.setTarget(t);
		manager.onGameTick();
		// The level changed without an event (that does not happen, but the check will still get there) - no later than QUEST_POLL_TICKS.
		levels.put("magic", 25);
		for (int i = 0; i < AutoCompletionManager.QUEST_POLL_TICKS - 2; i++)
		{
			manager.onGameTick();
		}
		assertTrue(completed.isEmpty());
		manager.onGameTick();
		assertEquals(List.of("S2-04"), completed);
	}

	@Test
	public void levelsAndItemsTogether()
	{
		// S1-11: Fishing 20, Cooking 15 and 50 shrimps or anchovies - together.
		ActiveTarget t = target("S1-11", "SKILL_LEVEL");
		t.getCompletionTrigger().setLevels(List.of(level("fishing", 20), level("cooking", 15)));
		t.getCompletionTrigger().setItems(List.of(item(null, 50, "Shrimps", "Anchovies")));
		manager.setTarget(t);
		levels.put("fishing", 20);
		levels.put("cooking", 15);
		byName.put("Shrimps", 30);
		manager.onStateChanged();
		manager.onGameTick();
		assertTrue("30 shrimps are too few", completed.isEmpty());
		byName.put("Anchovies", 20);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals("shrimps and anchovies are counted together", List.of("S1-11"), completed);
	}

	@Test
	public void itemByIdIsNotConfusedWithNamesakes()
	{
		// The three Dragon Slayer I map parts are all called "Map part": the Melzar piece (1535) is the one needed.
		ActiveTarget t = target("S5-03", "ITEM_OWNED");
		t.getCompletionTrigger().setItems(List.of(item(1535, 1, "Map part")));
		manager.setTarget(t);
		byName.put("Map part", 1);
		byId.put(1537, 1);
		manager.onStateChanged();
		manager.onGameTick();
		assertTrue("someone else's map piece does not count", completed.isEmpty());
		byId.put(1535, 1);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals(List.of("S5-03"), completed);
	}

	@Test
	public void questAndAnItemOnTop()
	{
		ActiveTarget t = target("S9-04", "QUEST_COMPLETED");
		t.getCompletionTrigger().setQuestName("Monkey Madness I");
		t.getCompletionTrigger().setItems(List.of(item(null, 1, "Dragon scimitar")));
		manager.setTarget(t);
		questFinished = true;
		manager.onGameTick();
		assertTrue("the quest is done, the scimitar is not yet", completed.isEmpty());
		byName.put("Dragon scimitar", 1);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals(List.of("S9-04"), completed);
	}

	@Test
	public void emptyConditionsDoNotArm()
	{
		manager.setTarget(target("S2-13", "SKILL_LEVEL"));
		assertFalse("SKILL_LEVEL without levels", manager.isArmed());
		manager.setTarget(target("S5-02", "ITEM_OWNED"));
		assertFalse("ITEM_OWNED without items", manager.isArmed());
	}

	@Test
	public void aBrokenTemplateDoesNotArm()
	{
		ActiveTarget t = target("S2-04", "CHAT_MESSAGE");
		t.getCompletionTrigger().setChatPattern("([");
		manager.setTarget(t);
		assertFalse(manager.isArmed());
		ActiveTarget v = target("S2-04", "VARBIT_CHANGED");
		manager.setTarget(v);
		assertFalse("varbit without a number and value does not arm", manager.isArmed());
	}
}
