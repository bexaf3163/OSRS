package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class AutoCompletionManagerTest
{
	private final List<String> completed = new ArrayList<>();
	private Boolean questFinished = false;
	private int questChecks;

	private final AutoCompletionManager manager = new AutoCompletionManager(name ->
	{
		questChecks++;
		return "Cook's Assistant".equals(name) ? questFinished : null;
	}, completed::add);

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
