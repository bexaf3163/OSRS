package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import java.util.List;
import org.junit.Test;

/**
 * Курсор шага этапа считается по состоянию, а не только по кликам. Случай, с которого всё началось (S2-07): руду добыли,
 * шаг не засчитался; игрок прокликал «сделано» мимо сдачи руды Thurgo и застрял на «Отнеси меч Squire» с рудой в сумке,
 * не зная, где он и как вернуться.
 */
public class StageTrackerTest
{
	private static final String STEP = "S2-07";
	/** Вход в подземелье, пещера с рудой, Thurgo, Squire. */
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
	public void рудаВСумке_шагДобычиЗасчитанСам_иСтрелкаКThurgo()
	{
		StageTracker t = new StageTracker();
		assertEquals("входим в этап у входа в подземелье", 0, update(t, DUNGEON, bag(0, 2)));
		assertEquals("в пещере копаем", 1, update(t, CAVE, bag(0, 2)));
		assertEquals("руда в сумке — шаг добычи сделан, сдавать Thurgo", 2, update(t, CAVE, bag(1, 2)));
		assertNull(t.warning());
	}

	@Test
	public void рудаВСумке_шагиБезУсловийПередНейПропускаются()
	{
		StageTracker t = new StageTracker();
		assertEquals(0, update(t, FAR, bag(0, 0)));
		assertEquals("руда есть, а у входа не были: спуск без условий — в пещере уже были", 2, update(t, FAR, bag(1, 2)));
	}

	@Test
	public void шагиСПредметамиНеПерепрыгиваются_предметыВЛюбомПорядке()
	{
		List<ActiveTarget.StageLine> l = new Gson().fromJson("[{\"t\":\"A\",\"has\":\"Onion\"},{\"t\":\"B\",\"has\":\"Eye of newt\"},{\"t\":\"C\"}]",
			new TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
		ItemCounts onlyNewt = new ItemCounts();
		onlyNewt.add(221, ActiveTarget.nameKey("Eye of newt"), 1);
		StageTracker t = new StageTracker();
		assertEquals("глаз есть, лука нет — шаг лука остаётся", 0, t.update("S2-03", 0, l, 3000, 3000, 0, onlyNewt));
	}

	@Test
	public void рудаОтданаУThurgo_шагСдан_идёмКSquire()
	{
		StageTracker t = new StageTracker();
		update(t, CAVE, bag(1, 2));
		assertEquals(2, update(t, THURGO, bag(1, 2)));
		assertEquals("руда и прутья ушли у Thurgo — меч Squire", 3, update(t, THURGO, bag(0, 0)));
	}

	@Test
	public void рудаИсчезлаДалекоОтThurgo_этоНеСдача()
	{
		StageTracker t = new StageTracker();
		assertEquals(2, update(t, CAVE, bag(1, 2)));
		assertEquals("выбросил или потерял в пещере — шаг «верни» остаётся", 2, update(t, CAVE, bag(0, 2)));
	}

	@Test
	public void двеРуды_одна_отдана_шагСдан()
	{
		StageTracker t = new StageTracker();
		update(t, THURGO, bag(2, 2));
		assertEquals(2, update(t, THURGO, bag(2, 2)));
		assertEquals("осталась лишняя руда, но число упало рядом с Thurgo — сдано", 3, update(t, THURGO, bag(1, 0)));
	}

	@Test
	public void игрокУSquireСРудой_курсорВозвращаетсяКThurgoИОбъясняет()
	{
		StageTracker t = new StageTracker();
		int cur = update(t, SQUIRE, bag(1, 2));
		assertEquals("к Squire с рудой — вернуть к Thurgo, а не к мечу", 2, cur);
		assertNotNull(t.warning());
		assertTrue(t.warning(), t.warning().contains("Blurite ore") && t.warning().contains("Верни Thurgo"));
		assertEquals("предупреждение держится, пока руда в сумке", 2, update(t, SQUIRE, bag(1, 2)));
		assertNotNull(t.warning());
	}

	@Test
	public void кликСделано_наШагеСдачи_сРудойВСумке_сначалаПредупреждает_вторымПодтверждает()
	{
		StageTracker t = new StageTracker();
		assertEquals(2, update(t, THURGO, bag(1, 2)));
		assertFalse("первый клик — предупреждение", t.next(lines(), bag(1, 2)));
		assertEquals(2, t.cursor());
		assertNotNull(t.warning());
		assertTrue(t.warning(), t.warning().contains("Нажми ещё раз"));
		assertEquals("предупреждение не пропадает на следующем тике", 2, update(t, THURGO, bag(1, 2)));
		assertNotNull(t.warning());
		assertTrue("второй клик — подтверждение: человек знает лучше", t.next(lines(), bag(1, 2)));
		assertEquals(3, t.cursor());
		assertEquals("подтверждённый шаг не возвращается назад", 3, update(t, THURGO, bag(1, 2)));
		assertNull(t.warning());
	}

	@Test
	public void кликСделано_безПредмета_засчитываетсяСразу()
	{
		StageTracker t = new StageTracker();
		update(t, DUNGEON, bag(0, 0));
		assertTrue(t.next(lines(), bag(0, 0)));
		assertEquals(1, t.cursor());
	}

	@Test
	public void назад_возвращаетШагИДержитЕгоПокаНеНажатоСделано()
	{
		StageTracker t = new StageTracker();
		update(t, CAVE, bag(1, 2));
		t.next(lines(), bag(1, 2));
		t.next(lines(), bag(1, 2));
		assertEquals("прощёлкали мимо сдачи", 3, t.cursor());
		t.back();
		assertEquals(2, t.cursor());
		assertTrue(t.held());
		assertEquals("автоматика не уносит курсор вперёд, пока он выбран вручную", 2, update(t, SQUIRE, bag(1, 2)));
		assertEquals(2, update(t, THURGO, bag(0, 0)));
		assertTrue("«сделано» снимает ручной режим", t.next(lines(), bag(0, 0)));
		assertFalse(t.held());
		assertEquals(3, t.cursor());
	}

	@Test
	public void назад_наПервомШагеНичегоНеДелает()
	{
		StageTracker t = new StageTracker();
		update(t, DUNGEON, bag(0, 0));
		t.back();
		assertEquals(0, t.cursor());
		assertFalse(t.held());
	}

	@Test
	public void этапСменился_ручнойРежимИПамятьСброшены()
	{
		StageTracker t = new StageTracker();
		update(t, CAVE, bag(1, 2));
		t.next(lines(), bag(1, 2));
		t.back();
		assertTrue(t.held());
		t.update(STEP, 1, lines(), THURGO[0], THURGO[1], 0, bag(0, 0));
		assertFalse(t.held());
		assertEquals(STEP + "#1", t.key());
	}

	@Test
	public void предметыНеизвестны_условияНеПроверяются()
	{
		StageTracker t = new StageTracker();
		assertEquals("без сумки — по положению, как раньше", 2, t.update(STEP, 0, lines(), THURGO[0], THURGO[1], 0, null));
		assertTrue(t.next(lines(), null));
		assertEquals(3, t.cursor());
	}

	@Test
	public void последнийШагНеПропускается_ЭтапКончаетИгра()
	{
		StageTracker t = new StageTracker();
		update(t, THURGO, bag(1, 2));
		update(t, THURGO, bag(0, 0));
		assertEquals(3, t.cursor());
		assertEquals(3, update(t, SQUIRE, bag(0, 0)));
		assertTrue("на последнем шаге «сделано» не уходит за край", t.next(lines(), bag(0, 0)));
		assertEquals(3, t.cursor());
	}

	@Test
	public void положениеРаботаетПоПрежнему()
	{
		StageTracker t = new StageTracker();
		assertEquals(0, update(t, FAR, bag(0, 0)));
		assertEquals("у Squire без руды — шаг Squire", 3, update(t, SQUIRE, bag(0, 0)));
	}
}
