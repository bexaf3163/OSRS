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
 * Курсор шага этапа считается по состоянию игры, а не по кликам. Случай, с которого всё началось (S2-07): руду добыли,
 * шаг не засчитался; игрок прокликал «сделано» мимо сдачи руды Thurgo и застрял на «Отнеси меч Squire» с рудой в сумке,
 * не зная, где он и как вернуться. Поэтому вперёд по клику пропустить шаг теперь нельзя вовсе; «назад» — только
 * просмотр на время, потом курсор снова ведут факты (S2-08: «вручную» застряло и не двигалось само).
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
	public void вперёдПоКлику_шагПропуститьНельзя_еслиИграСамаВидитРезультат()
	{
		StageTracker t = new StageTracker();
		update(t, DUNGEON, bag(0, 0));
		assertFalse("у S2-07 каждый шаг определяется по игре (место, предмет) — кнопки «сделано» нет", t.canStepForward(lines()));
		assertFalse(t.forward(lines()));
		assertEquals("клик не сдвинул курсор", 0, t.cursor());
		update(t, THURGO, bag(1, 2));
		assertFalse(t.forward(lines()));
		assertEquals(2, t.cursor());
	}

	/** Рычаги подряд на одном месте: игра между ними ничего не показывает. */
	private static List<ActiveTarget.StageLine> levers()
	{
		return new Gson().fromJson("[{\"t\":\"A\",\"x\":3100,\"y\":3300,\"plane\":0},{\"t\":\"B\",\"x\":3101,\"y\":3301,\"plane\":0},"
			+ "{\"t\":\"C\",\"x\":3200,\"y\":3300,\"plane\":0},{\"t\":\"D\"},{\"t\":\"E\",\"x\":3300,\"y\":3300,\"plane\":0}]",
			new TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
	}

	@Test
	public void вперёдПоКлику_толькоГдеИграНеВидит_подрядНаОдномМесте()
	{
		List<ActiveTarget.StageLine> l = levers();
		assertTrue("A→B на одном месте", StageTracker.needsManualStep(l, 0));
		assertFalse("B→C: C в другом месте — дошёл, курсор перешёл", StageTracker.needsManualStep(l, 1));
		assertTrue("C→D: у D нет места и предмета — вручную", StageTracker.needsManualStep(l, 2));
		assertFalse("последний шаг — этап кончит игра", StageTracker.needsManualStep(l, 4));
		StageTracker t = new StageTracker();
		t.update("S2-11", 0, l, 3100, 3300, 0, null);
		assertEquals(0, t.cursor());
		assertTrue(t.canStepForward(l));
		assertTrue(t.forward(l));
		assertEquals(1, t.cursor());
		assertEquals("у B игра сама увидит C", 1, t.update("S2-11", 0, l, 3101, 3301, 0, null));
		assertFalse(t.forward(l));
		assertEquals("дошёл до C — курсор сам", 2, t.update("S2-11", 0, l, 3200, 3300, 0, null));
	}

	@Test
	public void впросмотре_кнопкиСделаноНет()
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
	public void назад_смотрим_прежнийШаг_автоматикаНеУносит_апотомВозвращаетПоФактам()
	{
		AtomicLong now = new AtomicLong(1_000_000);
		StageTracker t = new StageTracker(now::get);
		assertEquals(2, update(t, THURGO, bag(1, 2)));
		t.back();
		assertEquals(1, t.cursor());
		assertTrue(t.peeking());
		assertEquals("во время просмотра автоматика не уносит курсор", 1, update(t, THURGO, bag(1, 2)));
		now.addAndGet(StageTracker.PEEK_MS - 1);
		assertEquals(1, update(t, THURGO, bag(1, 2)));
		assertTrue(t.peeking());
		now.addAndGet(2);
		assertEquals("просмотр кончился — снова по фактам: руда в сумке, Thurgo рядом", 2, update(t, THURGO, bag(1, 2)));
		assertFalse(t.peeking());
	}

	@Test
	public void кТекущему_возвращаетСразу()
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
	public void назадНесколькоРаз_каждыйСбрасываетВремя()
	{
		AtomicLong now = new AtomicLong(0);
		StageTracker t = new StageTracker(now::get);
		update(t, THURGO, bag(1, 2));
		t.back();
		now.addAndGet(StageTracker.PEEK_MS - 10);
		t.back();
		assertEquals(0, t.cursor());
		now.addAndGet(StageTracker.PEEK_MS - 10);
		assertTrue("второй клик продлил просмотр", t.peeking());
	}

	@Test
	public void назад_наПервомШагеНичегоНеДелает()
	{
		StageTracker t = new StageTracker();
		update(t, DUNGEON, bag(0, 0));
		t.back();
		assertEquals(0, t.cursor());
		assertFalse(t.peeking());
	}

	@Test
	public void сдачаВоВремяПросмотра_замечается_ипослеПросмотраКурсорУжеЗаНей()
	{
		AtomicLong now = new AtomicLong(0);
		StageTracker t = new StageTracker(now::get);
		update(t, THURGO, bag(1, 2));
		t.back();
		assertEquals(1, t.cursor());
		// Пока смотрели прежний шаг, игрок сдал руду.
		assertEquals(1, update(t, THURGO, bag(0, 0)));
		now.addAndGet(StageTracker.PEEK_MS + 1);
		assertEquals("просмотр кончился: сдача была — к Squire", 3, update(t, THURGO, bag(0, 0)));
	}

	@Test
	public void этапСменился_просмотрИПамятьСброшены()
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
	public void предметыНеизвестны_условияНеПроверяются()
	{
		StageTracker t = new StageTracker();
		assertEquals("без сумки — по положению, как раньше", 2, t.update(STEP, 0, lines(), THURGO[0], THURGO[1], 0, null));
	}

	@Test
	public void последнийШагНеПропускается_ЭтапКончаетИгра()
	{
		StageTracker t = new StageTracker();
		update(t, THURGO, bag(1, 2));
		update(t, THURGO, bag(0, 0));
		assertEquals(3, t.cursor());
		assertEquals(3, update(t, SQUIRE, bag(0, 0)));
	}

	@Test
	public void положениеРаботаетПоПрежнему()
	{
		StageTracker t = new StageTracker();
		assertEquals(0, update(t, FAR, bag(0, 0)));
		assertEquals("у Squire без руды — шаг Squire", 3, update(t, SQUIRE, bag(0, 0)));
	}

	// ---------- S2-08 Vampire Slayer: этап из пяти шагов, как в данных программы ----------

	private static final int[] HARLOW = {3222, 3399};
	private static final int[] MANOR = {3108, 3353};
	private static final int[] STAIRS = {3116, 3358};
	private static final int[] COFFIN = {3078, 9776};

	private static List<ActiveTarget.StageLine> vampire()
	{
		return new Gson().fromJson("[{\"t\":\"Купи пиво.\",\"s\":\"Купи Beer у бармена Blue Moon Inn\",\"has\":\"Beer\"},"
			+ "{\"t\":\"Отдай пиво Dr. Harlow.\",\"s\":\"Отдай Dr. Harlow Beer — получишь Stake\",\"x\":3222,\"y\":3399,\"plane\":0,\"need\":\"Beer\",\"has\":\"Stake\"},"
			+ "{\"t\":\"Подготовься к бою и войди.\",\"s\":\"Подготовься к бою и войди в Draynor Manor\",\"x\":3108,\"y\":3353,\"plane\":0},"
			+ "{\"t\":\"Спустись в подвал.\",\"s\":\"Спустись в подвал Draynor Manor\",\"x\":3116,\"y\":3358,\"plane\":0},"
			+ "{\"t\":\"Открой Coffin.\",\"s\":\"Открой Coffin, убей Count Draynor\",\"x\":3078,\"y\":9776,\"plane\":0}]",
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
	public void vampireSlayer_весьЭтапИдётСамСКонцаВКонец_безЕдиногоКлика()
	{
		StageTracker t = new StageTracker();
		assertEquals("Купи Beer", 0, v(t, FAR, vbag(0, 0)));
		assertEquals("пиво в сумке — к Dr. Harlow", 1, v(t, FAR, vbag(1, 0)));
		assertEquals("у Harlow с пивом — отдаём", 1, v(t, HARLOW, vbag(1, 0)));
		assertEquals("пиво ушло, кол пришёл — готовься к бою", 2, v(t, HARLOW, vbag(0, 1)));
		assertEquals("у особняка — «подготовься и войди»", 2, v(t, MANOR, vbag(0, 1)));
		assertEquals("у лестницы в подвал", 3, v(t, STAIRS, vbag(0, 1)));
		assertEquals("в подвале у гроба — последний шаг", 4, v(t, COFFIN, vbag(0, 1)));
	}

	@Test
	public void vampireSlayer_колУжеВСумке_приВходеВИгру_сразуКоВходуВОсобняк()
	{
		StageTracker t = new StageTracker();
		assertEquals("кол уже есть (пиво отдано раньше): «Купи» и «Отдай» уже сделаны", 2, v(t, FAR, vbag(0, 1)));
	}

	@Test
	public void vampireSlayer_смотрелНазад_иСамВернулсяКУ_особняка()
	{
		AtomicLong now = new AtomicLong(0);
		StageTracker t = new StageTracker(now::get);
		v(t, MANOR, vbag(0, 1));
		t.back();
		assertEquals(1, t.cursor());
		assertEquals("просмотр", 1, v(t, MANOR, vbag(0, 1)));
		now.addAndGet(StageTracker.PEEK_MS + 5);
		assertEquals("прошла минута — снова «в особняк»: не «вручную» навсегда", 2, v(t, MANOR, vbag(0, 1)));
		assertEquals("спустился — идём дальше сами", 3, v(t, STAIRS, vbag(0, 1)));
	}
}
