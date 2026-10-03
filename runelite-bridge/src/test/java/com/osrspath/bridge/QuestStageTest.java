package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.awt.FontMetrics;
import java.awt.image.BufferedImage;
import java.util.HashSet;
import java.util.List;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/**
 * Квест с этапами (Rune Mysteries, varp 63): список «Что нужно» в игре показывает текущий этап — что делать, предметы
 * именно этого этапа и одну точку, — а не весь квест сразу и не просит собранное и отданное.
 */
public class QuestStageTest
{
	private static final Gson GSON = new Gson();
	private static final FontMetrics FM = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
		.getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), 1f));

	/** S2-06 как его присылает программа: места — Horacio, Sedridor, Aubury; этапы ссылаются на них номерами. */
	static ActiveTarget runeMysteries()
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-06\",\"title\":\"Rune Mysteries\","
			+ "\"completionTrigger\":{\"type\":\"QUEST_COMPLETED\",\"questName\":\"Rune Mysteries\"},"
			+ "\"guide\":{\"items\":["
			+ "{\"name\":\"Air talisman\",\"id\":1438,\"where\":\"Выдаст герцог Horacio.\",\"inStep\":true},"
			+ "{\"name\":\"Research package\",\"id\":290,\"where\":\"Выдаст Sedridor.\",\"inStep\":true}],"
			+ "\"places\":["
			+ "{\"x\":3209,\"y\":3222,\"plane\":1,\"label\":\"Duke Horacio — замок Lumbridge\",\"npc\":\"Duke Horacio\"},"
			+ "{\"x\":3104,\"y\":9571,\"plane\":0,\"label\":\"Archmage Sedridor — подвал Wizards Tower\",\"npc\":\"Archmage Sedridor\"},"
			+ "{\"x\":3253,\"y\":3401,\"plane\":0,\"label\":\"Aubury — магазин рун в Varrock\",\"npc\":\"Aubury\"}],"
			+ "\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":["
			+ "{\"at\":0,\"steps\":[{\"t\":\"Поговори с Duke Horacio.\"}],\"go\":0,\"items\":[]},"
			+ "{\"at\":1,\"steps\":[{\"t\":\"Отнеси Air talisman Sedridor.\"}],\"go\":1,\"items\":[{\"name\":\"Air talisman\",\"id\":1438}]},"
			+ "{\"at\":3,\"steps\":[{\"t\":\"Отнеси Research package Aubury.\"}],\"go\":2,\"items\":[{\"name\":\"Research package\",\"id\":290}]},"
			+ "{\"at\":5,\"steps\":[{\"t\":\"Отнеси заметки Sedridor.\"}],\"go\":1}]}}}", ActiveTarget.class);
		assertNull(t.prepare());
		return t;
	}

	private static StepGuide.View view(int value, boolean done, ItemCounts carried)
	{
		return StepGuide.view(runeMysteries(), carried, null, null, 0, 0, 0, new HashSet<>(), value, done);
	}

	@Test
	public void этапВыбираетсяПоЗначениюПеременной()
	{
		assertEquals(1, view(0, false, new ItemCounts()).getStage().getIndex());
		assertEquals(2, view(1, false, new ItemCounts()).getStage().getIndex());
		// Между этапами (значение 2 — Sedridor выдаёт посылку) действует прежний, пока не наступит следующий.
		assertEquals(2, view(2, false, new ItemCounts()).getStage().getIndex());
		assertEquals(3, view(3, false, new ItemCounts()).getStage().getIndex());
		assertEquals(3, view(4, false, new ItemCounts()).getStage().getIndex());
		assertEquals(4, view(5, false, new ItemCounts()).getStage().getIndex());
		assertEquals("значение больше последнего — последний этап", 4, view(99, false, new ItemCounts()).getStage().getIndex());
		assertEquals(4, view(0, false, new ItemCounts()).getStage().getTotal());
	}

	@Test
	public void наЭтапеТолькоЕгоПредметыИОднаТочка()
	{
		StepGuide.View v = view(3, false, new ItemCounts());
		assertEquals("Отнеси Research package Aubury.", v.getStage().getSteps().get(0).getT());
		assertEquals(1, v.getItems().size());
		assertEquals("Research package", v.getItems().get(0).getName());
		assertEquals(1, v.getPlaces().size());
		assertEquals("точка Aubury — исходный номер сохранён для клика", 2, v.getPlaces().get(0).getIndex());
		assertNull("«Дальше» и финал шага не нужны: этап и есть «дальше»", v.getNext());
		assertNull(v.getFinale());
	}

	@Test
	public void этапБезСпискаПредметовПоказываетПредметыШага()
	{
		StepGuide.View v = view(5, false, new ItemCounts());
		assertEquals(2, v.getItems().size());
	}

	@Test
	public void этапСПустымСпискомПредметов_ничегоНеПросит()
	{
		StepGuide.View v = view(0, false, new ItemCounts());
		assertTrue(v.getItems().isEmpty());
		assertEquals("Duke Horacio — замок Lumbridge", v.getPlaces().get(0).getLabel());
	}

	@Test
	public void предметЭтапаВСумке_отмеченЗелёным()
	{
		ItemCounts bag = new ItemCounts();
		bag.add(290, ActiveTarget.nameKey("Research package"), 1);
		StepGuide.View v = view(3, false, bag);
		assertEquals(StepGuide.Have.BAG, v.getItems().get(0).getHave());
	}

	@Test
	public void квестПройден_этапыНеПоказываютсяИНичегоНеПросится()
	{
		StepGuide.View v = view(6, true, new ItemCounts());
		assertTrue(v.getStage().isFinished());
		assertTrue(v.getItems().isEmpty());
		assertTrue(v.getPlaces().isEmpty());
		assertEquals("Квест пройден ✓", GuideList.stageTitle(v.getStage()));
		String all = text(GuideList.rows(v, false, FM, FM, 240));
		assertTrue(all, all.contains("Квест пройден"));
		assertFalse(all, all.contains("Air talisman"));
	}

	@Test
	public void безЗначенияПеременной_списокШагаКакРаньше()
	{
		StepGuide.View v = StepGuide.view(runeMysteries(), new ItemCounts(), null, null, 0, 0, 0, new HashSet<>(), null, false);
		assertNull(v.getStage());
		assertEquals(2, v.getItems().size());
		assertEquals(3, v.getPlaces().size());
	}

	@Test
	public void шагБезЭтапов_неМеняется()
	{
		ActiveTarget t = StepGuideTest.witchsPotion();
		StepGuide.View v = StepGuide.view(t, new ItemCounts(), null, null, 0, 0, 0, new HashSet<>(), 7, false);
		assertNull(v.getStage());
		assertEquals(3, v.getItems().size());
	}

	@Test
	public void строкиСписка_этапТекстПредметыТочка()
	{
		StepGuide.View v = view(3, false, new ItemCounts());
		String all = text(GuideList.rows(v, false, FM, FM, 240));
		assertTrue(all, all.contains("Этап 3 из 4"));
		assertTrue(all, all.contains("Отнеси Research package Aubury"));
		assertTrue(all, all.contains("Research package"));
		assertTrue(all, all.contains("Aubury"));
		assertFalse("предметы других этапов не показываются: " + all, all.contains("Air talisman"));
		assertEquals("Этап 3 из 4 · не хватает 1", GuideList.summary(v));
		assertTrue(GuideList.worthShowing(v));
	}

	@Test
	public void свёрнутыйСписок_одноСтрокой()
	{
		StepGuide.View v = view(0, false, new ItemCounts());
		assertEquals("Этап 1 из 4", GuideList.summary(v));
		assertEquals(1, GuideList.rows(v, true, FM, FM, 240).size());
	}

	@Test
	public void этапыПроверяются()
	{
		assertNotNull(bad("\"stage\":{\"kind\":\"sql\",\"id\":63,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}]}]}"));
		assertNotNull(bad("\"stage\":{\"kind\":\"varp\",\"id\":0,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}]}]}"));
		assertNotNull(bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[]}"));
		assertNotNull("значения этапов растут", bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[{\"at\":2,\"steps\":[{\"t\":\"x\"}]},{\"at\":1,\"steps\":[{\"t\":\"y\"}]}]}"));
		assertNotNull("пустой текст", bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\" \"}]}]}"));
		assertNotNull("точка вне списка мест", bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}],\"go\":5}]}"));
		assertNotNull("предмет без названия", bad("\"stage\":{\"kind\":\"varp\",\"id\":63,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}],\"items\":[{\"name\":\"\"}]}]}"));
		assertNull(bad("\"stage\":{\"kind\":\"varbit\",\"id\":12063,\"stages\":[{\"at\":0,\"steps\":[{\"t\":\"x\"}],\"go\":0}]}"));
	}

	/** Этап из пяти шагов с клетками: два шага без клетки (думать, ждать) и два на одном месте (рычаг вниз и вверх). */
	private static List<ActiveTarget.StageLine> manor()
	{
		String json = "[{\"t\":\"A\",\"x\":3100,\"y\":3300,\"plane\":0},{\"t\":\"B\"},{\"t\":\"C\",\"x\":3110,\"y\":3300,\"plane\":0},"
			+ "{\"t\":\"D\",\"x\":3120,\"y\":9700,\"plane\":0},{\"t\":\"C-again\",\"x\":3110,\"y\":3300,\"plane\":0},{\"t\":\"E\",\"x\":3200,\"y\":3300,\"plane\":0}]";
		return GSON.fromJson(json, new com.google.gson.reflect.TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
	}

	@Test
	public void текущийШагСдвигаетсяКогдаИгрокДошёлДоСледующего()
	{
		List<ActiveTarget.StageLine> l = manor();
		assertEquals("стоим у первого — первый", 0, StepGuide.advance(l, 0, 3101, 3299, 0));
		assertEquals("шаг без клетки перескакивается, когда дошли до C", 2, StepGuide.advance(l, 0, 3111, 3301, 0));
		assertEquals("у C остаёмся на C", 2, StepGuide.advance(l, 2, 3110, 3300, 0));
		assertEquals("шаг на том же месте (C-again) не перескакивает C, пока стоим у C", 2, StepGuide.advance(l, 2, 3110, 3300, 0));
		assertEquals("ушли в подвал (D) — D", 3, StepGuide.advance(l, 2, 3120, 9700, 0));
		assertEquals("вернулись к C — это уже C-again", 4, StepGuide.advance(l, 3, 3110, 3300, 0));
		assertEquals("не на том этаже — ничего", 0, StepGuide.advance(l, 0, 3110, 3300, 1));
		assertEquals("далеко — ничего", 0, StepGuide.advance(l, 0, 3300, 3300, 0));
		assertEquals("слишком далеко вперёд (за окно) не перескакиваем", 0, StepGuide.advance(l, 0, 3200, 3300, 0));
		assertEquals("пустой список", 0, StepGuide.advance(null, 5, 1, 1, 0));
		assertEquals("первый заход в этап: ищем по всему списку (игрок уже у E)", 5, StepGuide.advance(l, 0, 3200, 3300, 0, l.size()));
		assertEquals("первый заход: у подвала — D", 3, StepGuide.advance(l, 0, 3120, 9700, 0, l.size()));
		assertEquals("первый заход: нигде — начало", 0, StepGuide.advance(l, 0, 5000, 5000, 0, l.size()));
	}

	@Test
	public void строкиЭтапа_текущийСчётчикДальшеИНазад()
	{
		StepGuide.StageView sv = new StepGuide.StageView(1, 1, manor(), 2, false);
		java.util.ArrayList<GuideList.Row> rows = new java.util.ArrayList<>();
		GuideList.stageRows(rows, sv, FM, FM, 220);
		String all = text(rows);
		assertTrue(all, all.contains("▶ C"));
		assertTrue("счётчик справа: шаг 3 из 6", all.contains("3/6"));
		assertTrue("одна строка «Дальше» вместо двух серых пунктов: " + all, all.contains("Дальше: D"));
		assertTrue("сколько ещё после него", all.contains("+2"));
		assertFalse("дальше одного не показываем: " + all, all.contains("C-again") || all.contains("• "));
		assertFalse("«сделано шагов» и отсылка к панели убраны: " + all, all.contains("сделано шагов") || all.contains("в панели"));
		assertTrue("шаг не первый — есть «Назад»: " + all, all.contains("◀ Назад: B"));
		assertEquals("текущий шаг — кнопка «сделано»", GuideList.Action.NEXT, rows.get(0).getAction());
		assertEquals("назад — кнопка", GuideList.Action.PREV, rows.get(rows.size() - 1).getAction());
	}

	@Test
	public void строкиЭтапа_первыйШагБезНазад_последнийБезДальше()
	{
		java.util.ArrayList<GuideList.Row> first = new java.util.ArrayList<>();
		GuideList.stageRows(first, new StepGuide.StageView(1, 1, manor(), 0, false), FM, FM, 220);
		assertFalse(text(first), text(first).contains("Назад"));
		java.util.ArrayList<GuideList.Row> last = new java.util.ArrayList<>();
		GuideList.stageRows(last, new StepGuide.StageView(1, 1, manor(), 5, false), FM, FM, 220);
		assertFalse(text(last), text(last).contains("Дальше"));
		assertTrue(text(last), text(last).contains("6/6"));
	}

	@Test
	public void строкиЭтапа_короткийТекстВСпискеИПолныйВПодсказке()
	{
		List<ActiveTarget.StageLine> l = GSON.fromJson("[{\"t\":\"Поговори с Squire во дворе замка White Knights в Falador. Диалог: «Yes».\",\"s\":\"Поговори с Squire (Falador)\"},{\"t\":\"Второй шаг. Подробно.\"}]",
			new com.google.gson.reflect.TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
		java.util.ArrayList<GuideList.Row> rows = new java.util.ArrayList<>();
		GuideList.stageRows(rows, new StepGuide.StageView(1, 1, l, 0, false), FM, FM, 220);
		assertTrue(text(rows), text(rows).contains("▶ Поговори с Squire (Falador)"));
		assertFalse("диалог в список не попадает", text(rows).contains("Диалог"));
		assertTrue("полный текст — в подсказке", rows.get(0).getHint().contains("White Knights"));
		assertTrue("шаг без короткого текста сокращается сам", text(rows).contains("Дальше: Второй шаг"));
		assertFalse(text(rows), text(rows).contains("Подробно"));
	}

	@Test
	public void предупреждениеИРучнойРежим_виднЫВСписке()
	{
		StepGuide.StageView sv = new StepGuide.StageView(1, 1, manor(), 2, false, "Blurite ore ещё в сумке — сначала: Верни Thurgo", true);
		java.util.ArrayList<GuideList.Row> rows = new java.util.ArrayList<>();
		GuideList.stageRows(rows, sv, FM, FM, 220);
		assertTrue("предупреждение — первой строкой: " + text(rows.subList(0, 1)), text(rows.subList(0, 1)).contains("⚠ Blurite ore ещё в сумке — сначала: Верни Thurgo"));
		assertTrue(text(rows), text(rows).contains("вручную"));
	}

	@Test
	public void наЭтапеВзятоеИСданноеСкрыто_осталосьТолькоНужное()
	{
		java.util.ArrayList<StepGuide.ItemLine> items = new java.util.ArrayList<>();
		items.add(new StepGuide.ItemLine("a", "", StepGuide.Have.DONE, null, -1, "Iron bar ×2", null, "готово"));
		items.add(new StepGuide.ItemLine("b", "", StepGuide.Have.BAG, null, -1, "Bronze pickaxe", null, "есть"));
		items.add(new StepGuide.ItemLine("c", "", StepGuide.Have.NONE, null, -1, "Tinderbox", null, "нет"));
		List<StepGuide.ItemLine> pending = GuideList.pending(items);
		assertEquals(1, pending.size());
		assertEquals("Tinderbox", pending.get(0).getName());
		assertTrue("всё взято — пусто", GuideList.pending(items.subList(0, 2)).isEmpty());
	}

	/** S2-07, этап 7 из 7: как в игре — руда и прутья сданы Thurgo, остался меч для Squire. */
	static ActiveTarget thurgoOre()
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-07\",\"title\":\"The Knight's Sword\",\"guide\":{\"items\":[],\"places\":["
			+ "{\"x\":3008,\"y\":3150,\"plane\":0,\"label\":\"Вход в Asgarnian Ice Dungeon\"}],"
			+ "\"stage\":{\"kind\":\"varp\",\"id\":122,\"stages\":[{\"at\":6,\"go\":0,\"items\":["
			+ "{\"name\":\"Iron bar\",\"id\":2351,\"count\":2},{\"name\":\"Bronze pickaxe\",\"id\":1265},{\"name\":\"Blurite ore\",\"id\":668}],\"steps\":["
			+ "{\"t\":\"Спустись в Asgarnian Ice Dungeon к югу от Port Sarim.\",\"s\":\"Спустись в Asgarnian Ice Dungeon\",\"x\":3008,\"y\":3150,\"plane\":0},"
			+ "{\"t\":\"Накопай Blurite ore.\",\"s\":\"Накопай Blurite ore\",\"x\":3049,\"y\":9566,\"plane\":0,\"has\":\"Blurite ore\"},"
			+ "{\"t\":\"Верни Thurgo Blurite ore и два Iron bar.\",\"s\":\"Верни Thurgo Blurite ore и 2 Iron bar\",\"x\":3000,\"y\":3145,\"plane\":0,\"need\":\"Blurite ore\"},"
			+ "{\"t\":\"Отнеси меч оруженосцу (Squire) — квест пройден.\",\"s\":\"Отнеси меч Squire\",\"x\":2978,\"y\":3341,\"plane\":0}]}]}}}", ActiveTarget.class);
		assertNull(t.prepare());
		return t;
	}

	@Test
	public void этапСдан_блокНужноСейчасНеРисуется_осталсяТолькоШаг()
	{
		ActiveTarget t = thurgoOre();
		// Прутья и руда сданы (были в сумке, теперь нет), кирка в сумке: всё нужное уже сделано.
		HashSet<String> got = new HashSet<>(java.util.Arrays.asList(ActiveTarget.nameKey("Iron bar"), ActiveTarget.nameKey("Blurite ore")));
		ItemCounts bag = new ItemCounts();
		bag.add(1265, ActiveTarget.nameKey("Bronze pickaxe"), 1);
		String all = text(GuideList.rows(StepGuide.view(t, bag, null, null, 0, 0, 0, got, 6, false, 3), false, FM, FM, 240));
		assertFalse("«Нужно сейчас» не рисуется, когда нужного нет: " + all, all.contains("Нужно сейчас"));
		assertFalse("взятое и сданное не перечисляется: " + all, all.contains("✓") || all.contains("Iron bar ×") || all.contains("Bronze pickaxe"));
		assertTrue(all, all.contains("▶ Отнеси меч Squire"));
		assertTrue(all, all.contains("4/4"));
		assertTrue("код шага вместо HUD с названием: " + all, all.contains("S2-07 · Этап 1 из 1"));
		assertTrue("можно вернуться: " + all, all.contains("◀ Назад: Верни Thurgo"));
		assertFalse("шаг сам говорит, куда идти, — точки этапа («вход в подземелье») нет: " + all, all.contains("Куда идти") || all.contains("Ice Dungeon"));
	}

	@Test
	public void этап_остаётсяТолькоЧегоНеХватает()
	{
		ActiveTarget t = thurgoOre();
		ItemCounts bag = new ItemCounts();
		bag.add(1265, ActiveTarget.nameKey("Bronze pickaxe"), 1);
		String all = text(GuideList.rows(StepGuide.view(t, bag, new ItemCounts(), null, 0, 0, 0, new HashSet<>(), 6, false, 0), false, FM, FM, 240));
		assertTrue(all, all.contains("Нужно сейчас"));
		assertTrue("руды и прутьев нет — они в списке: " + all, all.contains("Blurite ore") && all.contains("Iron bar"));
		assertFalse("кирка уже в сумке — её нет в списке: " + all, all.contains("Bronze pickaxe"));
	}

	private static ActiveTarget sword()
	{
		return GSON.fromJson("{\"stepId\":\"S2-07\",\"title\":\"The Knight's Sword\",\"guide\":{\"items\":[],\"places\":["
			+ "{\"x\":2994,\"y\":3341,\"plane\":0,\"label\":\"Лестница\"},{\"x\":3000,\"y\":3145,\"plane\":0,\"label\":\"Thurgo\"}],"
			+ "\"stage\":{\"kind\":\"varp\",\"id\":122,\"stages\":[{\"at\":0,\"steps\":["
			+ "{\"t\":\"Лестница\",\"x\":2994,\"y\":3341,\"plane\":0,\"has\":\"Portrait\"},"
			+ "{\"t\":\"Шкаф\",\"x\":2985,\"y\":3336,\"plane\":2,\"has\":\"Portrait\"},"
			+ "{\"t\":\"Отнеси Thurgo\",\"x\":3000,\"y\":3145,\"plane\":0}],\"go\":0}]}}}", ActiveTarget.class);
	}

	/** S2-07, этап «Выковать меч»: Thurgo послал за рудой, игрок стоит у него же. */
	private static List<ActiveTarget.StageLine> ore()
	{
		String json = "[{\"t\":\"Спустись в Ice Dungeon\",\"x\":3008,\"y\":3150,\"plane\":0},"
			+ "{\"t\":\"Накопай Blurite ore\",\"x\":3049,\"y\":9566,\"plane\":0},"
			+ "{\"t\":\"Верни Thurgo руду\",\"x\":3000,\"y\":3145,\"plane\":0,\"need\":\"Blurite ore\"},"
			+ "{\"t\":\"Отнеси меч Squire\",\"x\":2978,\"y\":3341,\"plane\":0}]";
		return GSON.fromJson(json, new com.google.gson.reflect.TypeToken<List<ActiveTarget.StageLine>>() { }.getType());
	}

	@Test
	public void послеThurgoСтрелкаВедётВПодземелье_неОстаётсяУThurgo()
	{
		List<ActiveTarget.StageLine> l = ore();
		ItemCounts empty = new ItemCounts();
		assertEquals("у Thurgo без руды — к входу в подземелье, а не «верни руду»", 0, StepGuide.advance(l, 0, 3000, 3145, 0, l.size(), empty));
		ItemCounts bag = new ItemCounts();
		bag.add(668, ActiveTarget.nameKey("Blurite ore"), 1);
		assertEquals("руда в сумке — «верни руду»", 2, StepGuide.advance(l, 0, 3000, 3145, 0, l.size(), bag));
		assertEquals("в пещере у руды — копать", 1, StepGuide.advance(l, 0, 3049, 9566, 0, l.size(), empty));
		assertEquals("предметы неизвестны — условие не проверяется", 2, StepGuide.advance(l, 0, 3000, 3145, 0, l.size()));
	}

	@Test
	public void этапСменилсяНаГлазах_отсчётСПервогоШага_входВНачатыйЭтап_поВсемуСписку()
	{
		List<ActiveTarget.StageLine> l = manor();
		// Игрок у шага E (последний) в момент, когда этап только что сменился: шаги этапа ещё не сделаны — начало.
		assertEquals(0, StepGuide.advance(l, 0, 3200, 3300, 0, StepGuide.freshWindow(true, l.size())));
		// Тот же игрок входит в игру посреди этапа: ищем по всему списку.
		assertEquals(5, StepGuide.advance(l, 0, 3200, 3300, 0, StepGuide.freshWindow(false, l.size())));
	}

	@Test
	public void шагДоПредметаПропускаетсяКогдаПредметУжеВСумке()
	{
		ActiveTarget t = sword();
		assertNull(t.prepare());
		List<ActiveTarget.StageLine> lines = t.getGuide().getStage().getStages().get(0).getSteps();
		assertEquals("нет портрета — остаёмся", 0, StepGuide.skipDone(lines, 0, new ItemCounts()));
		ItemCounts bag = new ItemCounts();
		bag.add(666, ActiveTarget.nameKey("Portrait"), 1);
		assertEquals("портрет в сумке — к Thurgo", 2, StepGuide.skipDone(lines, 0, bag));
		assertEquals("последний шаг не пропускается", 2, StepGuide.skipDone(lines, 2, bag));
	}

	@Test
	public void стрелкаЭтапаНеОбъездИКнопкиВернутьНет()
	{
		ActiveTarget t = sword();
		assertNull(t.prepare());
		// Стрелка стоит на клетке текущего шага (шкаф) — «Стрелку снова к шагу» не нужно.
		StepGuide.View v = StepGuide.view(t, new ItemCounts(), null, "Шкаф", 2985, 3336, 2, new HashSet<>(), 0, false, 1);
		assertNull(v.getDetour());
		// Игрок выбрал своё место — это объезд.
		StepGuide.View own = StepGuide.view(t, new ItemCounts(), null, "Банк", 3185, 3436, 0, new HashSet<>(), 0, false, 1);
		assertEquals("Банк", own.getDetour());
	}

	@Test
	public void лучшийИнструментЗасчитываетсяВместоХудшего()
	{
		ItemCounts bag = new ItemCounts();
		bag.add(1267, ActiveTarget.nameKey("Iron pickaxe"), 1);
		assertEquals("Iron вместо Bronze", 1, bag.count(1265, "Bronze pickaxe"));
		assertEquals("Iron вместо Iron", 1, bag.count(1267, "Iron pickaxe"));
		assertEquals("Steel хуже нет — Iron не заменяет Steel", 0, bag.count(1269, "Steel pickaxe"));
		assertEquals("кирка не заменяет топор", 0, bag.count(1351, "Bronze axe"));
		assertEquals("Rune platebody не инструмент", 0, bag.count(1127, "Bronze platebody"));
	}

	private static String text(List<GuideList.Row> rows)
	{
		// Строки одной записи склеены пробелом: длинный текст переносится по ширине, а проверяется целиком.
		StringBuilder sb = new StringBuilder();
		for (GuideList.Row r : rows)
		{
			sb.append('|');
			for (GuideList.Line l : r.getLines())
			{
				sb.append(l.getLeft()).append(' ');
				if (l.getRight() != null)
				{
					sb.append('~').append(l.getRight()).append(' ');
				}
			}
		}
		return sb.toString();
	}

	private static String bad(String stageJson)
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-06\",\"title\":\"Rune Mysteries\",\"guide\":{\"items\":[],\"places\":["
			+ "{\"x\":3209,\"y\":3222,\"plane\":1,\"label\":\"Horacio\"}]," + stageJson + "}}", ActiveTarget.class);
		return t.prepare();
	}
}
