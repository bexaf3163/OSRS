package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

/**
 * Курсор этапа и машина Quest Helper: когда у машины есть доказательство, курсор ставит она; когда нет — место и предметы,
 * как раньше. Нажатое «сделано» и просмотр «назад» сильнее машины. Строки — настоящие, S2-09 (Pirate's Treasure).
 */
public class StageQhTest
{
	private static final String ID = "S2-09";

	private static List<ActiveTarget.StageLine> lines()
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (ID.equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target.getGuide().getStage().getStages().get(1).getSteps();
			}
		}
		throw new AssertionError("нет этапа S2-09#1");
	}

	private static StageTracker.QhPick pick(int line)
	{
		return new StageTracker.QhPick(line, "тест");
	}

	private static int update(StageTracker t, List<ActiveTarget.StageLine> lines, int x, int y, StageTracker.QhPick pick)
	{
		return t.update(ID, 1, lines, x, y, 0, new ItemCounts(), pick);
	}

	@Test
	public void доказательствоМашины_ставитКурсорГдеМестоИПредметыНеВидят()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		assertEquals("без машины, на причале — первая строка", 0, update(t, lines, 3028, 3220, null));
		assertFalse(t.qhStrong());
		// Luthas заплатил 30 монет: строка «заплати Customs officer» — по месту этого не увидеть, игрок стоит у Luthas.
		assertEquals(6, update(t, lines, 2938, 3154, pick(6)));
		assertTrue(t.qhStrong());
		assertTrue(t.reason(), t.reason().startsWith("QH"));
		assertEquals("тик спустя курсор там же", 6, update(t, lines, 2938, 3154, pick(6)));
	}

	@Test
	public void безДоказательства_местоИПредметыКакРаньше()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		update(t, lines, 3040, 3235, null);
		update(t, lines, 3028, 3220, null);
		assertEquals("приплыл — «купи ром»", 1, update(t, lines, 2956, 3146, null));
		assertFalse(t.qhStrong());
		assertTrue(t.reason(), t.reason().startsWith("LEFT"));
	}

	@Test
	public void машинаМожетВернутьКурсорНазад_онаЗнаетБольше()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		update(t, lines, 2938, 3154, pick(6));
		// Дневник и защёлки пересчитались — теперь Quest Helper считает, что ящик ещё не заполнен.
		assertEquals(4, update(t, lines, 2938, 3154, pick(4)));
	}

	@Test
	public void выборВнеСписка_игнорируется()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		assertEquals(0, update(t, lines, 3028, 3220, pick(lines.size())));
		assertEquals(0, update(t, lines, 3028, 3220, pick(-1)));
		assertFalse(t.qhStrong());
	}

	@Test
	public void кнопкаСделаноОстаётсяИПриВыбореМашины_иМашинаНеВозвращаетКурсорНазад()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		// «Положи ром в ящик» и «заполни ящик» стоят у ящика подряд: игра различает их только по сообщению.
		assertEquals(3, update(t, lines, 2939, 3149, pick(3)));
		assertTrue("сообщение могло не дойти — кнопка нужна", t.canStepForward(lines));
		assertTrue(t.forward(lines));
		assertEquals(4, t.cursor());
		assertEquals("машина всё ещё считает, что ром не положен, — игрок отвечает за свою отметку", 4, update(t, lines, 2939, 3149, pick(3)));
		assertFalse(t.qhStrong());
		assertEquals("а когда машина дошла до строки не раньше отметки, ведёт она", 5, update(t, lines, 2938, 3154, pick(5)));
		assertTrue(t.qhStrong());
	}

	@Test
	public void просмотрНазад_сильнееМашины()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		update(t, lines, 2938, 3154, pick(6));
		t.back();
		assertTrue(t.peeking());
		assertEquals(5, update(t, lines, 2938, 3154, pick(6)));
		assertFalse(t.qhStrong());
		t.resume();
		assertEquals(6, update(t, lines, 2938, 3154, pick(6)));
		assertTrue(t.qhStrong());
	}

	@Test
	public void новыйЭтап_сбрасываетОтметкиИГоворитЗаново()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker t = new StageTracker();
		update(t, lines, 2939, 3149, pick(3));
		assertTrue(t.forward(lines));
		// Игра перевела квест на другой этап: отметка прежнего этапа ничего не значит.
		assertEquals(2, t.update(ID, 2, lines, 2939, 3149, 0, new ItemCounts(), pick(2)));
		assertTrue(t.qhStrong());
	}

	@Test
	public void безВыбораМашины_всёКакДо_тикВТикНаТомЖеПути()
	{
		List<ActiveTarget.StageLine> lines = lines();
		StageTracker old = new StageTracker();
		StageTracker now = new StageTracker();
		ItemCounts rum = new ItemCounts();
		rum.add(431, ActiveTarget.nameKey("Karamjan rum"), 1);
		// Путь из живой игры: причал, лодка, берег, Zembo, Luthas, ящик — со сменой сумки.
		int[][] walk = {{3040, 3235, 0}, {3028, 3220, 0}, {2956, 3146, 0}, {2942, 3146, 0}, {2936, 3146, 0}, {2930, 3145, 0}, {2938, 3154, 1},
			{2939, 3149, 1}, {2939, 3149, 0}, {2955, 3146, 0}, {3020, 3230, 0}};
		for (int[] w : walk)
		{
			ItemCounts bag = w[2] == 1 ? rum : new ItemCounts();
			int a = old.update(ID, 1, lines, w[0], w[1], 0, bag);
			int b = now.update(ID, 1, lines, w[0], w[1], 0, bag, null);
			assertEquals("курсор на (" + w[0] + "," + w[1] + ")", a, b);
			assertEquals(old.reason(), now.reason());
			assertEquals(old.warning(), now.warning());
			assertFalse(now.qhStrong());
		}
	}
}
