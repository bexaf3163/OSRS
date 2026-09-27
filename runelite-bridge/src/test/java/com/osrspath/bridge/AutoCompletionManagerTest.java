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

	/** Уровни из игры по ключу навыка; нет ключа — уровень неизвестен (не в игре). */
	private final Map<String, Integer> levels = new HashMap<>();
	/** Предметы у игрока: по названию и по ID. */
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
	public void квестПроверяетсяСразуИПотомРедко()
	{
		ActiveTarget t = target("S1-03", "QUEST_COMPLETED");
		t.getCompletionTrigger().setQuestName("Cook's Assistant");
		manager.setTarget(t);

		manager.onGameTick();
		assertEquals("при взводе квест проверяется сразу", 1, questChecks);
		for (int i = 0; i < AutoCompletionManager.QUEST_POLL_TICKS - 2; i++)
		{
			manager.onGameTick();
		}
		assertEquals("без изменений переменных — не каждый тик", 1, questChecks);

		questFinished = true;
		manager.onVarbitChanged(123, 1);
		manager.onGameTick();
		assertEquals(List.of("S1-03"), completed);
		assertFalse(manager.isArmed());

		manager.onVarbitChanged(123, 2);
		manager.onGameTick();
		assertEquals("второй раз не шлём", 1, completed.size());
	}

	@Test
	public void квестВыполненДоПоказаВИгре()
	{
		questFinished = true;
		ActiveTarget t = target("S1-03", "QUEST_COMPLETED");
		t.getCompletionTrigger().setQuestName("Cook's Assistant");
		manager.setTarget(t);
		manager.onGameTick();
		assertEquals(List.of("S1-03"), completed);
	}

	@Test
	public void неизвестныйКвестВыключаетАвтоотметку()
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
	public void сообщениеОНовомУровнеСТегамиЦвета()
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
	public void varbitТолькоТочноеЗначение()
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
	public void новаяЦельВзводитЗаново()
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
	public void уровниВсеСразуИТолькоНастоящие()
	{
		ActiveTarget t = target("S2-13", "SKILL_LEVEL");
		t.getCompletionTrigger().setLevels(List.of(level("fishing", 30), level("cooking", 30)));
		manager.setTarget(t);
		manager.onGameTick();
		assertTrue("уровни ещё неизвестны — не в игре", completed.isEmpty());

		levels.put("fishing", 31);
		levels.put("cooking", 29);
		manager.onStateChanged();
		manager.onGameTick();
		assertTrue("готовка 29 — рано", completed.isEmpty());

		levels.put("cooking", 30);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals(List.of("S2-13"), completed);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals("второй раз не шлём", 1, completed.size());
	}

	@Test
	public void уровниУжеЕстьКПоказуШага()
	{
		levels.put("magic", 40);
		ActiveTarget t = target("S2-04", "SKILL_LEVEL");
		t.getCompletionTrigger().setLevels(List.of(level("magic", 25)));
		manager.setTarget(t);
		manager.onGameTick();
		assertEquals(List.of("S2-04"), completed);
	}

	@Test
	public void безИзмененийСостояниеПроверяетсяРедко()
	{
		ActiveTarget t = target("S2-04", "SKILL_LEVEL");
		t.getCompletionTrigger().setLevels(List.of(level("magic", 25)));
		manager.setTarget(t);
		manager.onGameTick();
		// Уровень поменялся без события (так не бывает, но проверка всё равно дойдёт) — не позже чем через QUEST_POLL_TICKS.
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
	public void уровниИПредметыВместе()
	{
		// S1-11: рыбалка 20, готовка 15 и 50 креветок или анчоусов — вместе.
		ActiveTarget t = target("S1-11", "SKILL_LEVEL");
		t.getCompletionTrigger().setLevels(List.of(level("fishing", 20), level("cooking", 15)));
		t.getCompletionTrigger().setItems(List.of(item(null, 50, "Shrimps", "Anchovies")));
		manager.setTarget(t);
		levels.put("fishing", 20);
		levels.put("cooking", 15);
		byName.put("Shrimps", 30);
		manager.onStateChanged();
		manager.onGameTick();
		assertTrue("30 креветок — мало", completed.isEmpty());
		byName.put("Anchovies", 20);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals("креветки и анчоусы считаются вместе", List.of("S1-11"), completed);
	}

	@Test
	public void предметПоIdНеПутаетсяСТезками()
	{
		// Три куска карты Dragon Slayer I называются одинаково «Map part»: нужен именно кусок Melzar (1535).
		ActiveTarget t = target("S5-03", "ITEM_OWNED");
		t.getCompletionTrigger().setItems(List.of(item(1535, 1, "Map part")));
		manager.setTarget(t);
		byName.put("Map part", 1);
		byId.put(1537, 1);
		manager.onStateChanged();
		manager.onGameTick();
		assertTrue("чужой кусок карты не засчитывается", completed.isEmpty());
		byId.put(1535, 1);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals(List.of("S5-03"), completed);
	}

	@Test
	public void квестИПредметВдобавок()
	{
		ActiveTarget t = target("S9-04", "QUEST_COMPLETED");
		t.getCompletionTrigger().setQuestName("Monkey Madness I");
		t.getCompletionTrigger().setItems(List.of(item(null, 1, "Dragon scimitar")));
		manager.setTarget(t);
		questFinished = true;
		manager.onGameTick();
		assertTrue("квест есть, ятагана ещё нет", completed.isEmpty());
		byName.put("Dragon scimitar", 1);
		manager.onStateChanged();
		manager.onGameTick();
		assertEquals(List.of("S9-04"), completed);
	}

	@Test
	public void пустыеУсловияНеВзводят()
	{
		manager.setTarget(target("S2-13", "SKILL_LEVEL"));
		assertFalse("SKILL_LEVEL без уровней", manager.isArmed());
		manager.setTarget(target("S5-02", "ITEM_OWNED"));
		assertFalse("ITEM_OWNED без предметов", manager.isArmed());
	}

	@Test
	public void битыйШаблонНеВзводит()
	{
		ActiveTarget t = target("S2-04", "CHAT_MESSAGE");
		t.getCompletionTrigger().setChatPattern("([");
		manager.setTarget(t);
		assertFalse(manager.isArmed());
		ActiveTarget v = target("S2-04", "VARBIT_CHANGED");
		manager.setTarget(v);
		assertFalse("varbit без номера и значения не взводится", manager.isArmed());
	}
}
