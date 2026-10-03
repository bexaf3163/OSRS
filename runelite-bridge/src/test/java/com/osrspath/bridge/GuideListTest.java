package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.awt.Canvas;
import java.awt.FontMetrics;
import java.awt.Rectangle;
import java.awt.event.InputEvent;
import java.awt.event.MouseEvent;
import java.awt.image.BufferedImage;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import net.runelite.api.Client;
import net.runelite.api.Menu;
import net.runelite.api.MenuEntry;
import net.runelite.api.widgets.Widget;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/**
 * Список «Что нужно» на экране игры: какие строки, какие из них кнопки, что пишет подсказка, как сворачивается,
 * и что делает клик: попадает ли он в игру.
 */
public class GuideListTest
{
	private static final FontMetrics FM = metrics(1f);
	private static final FontMetrics SMALL = metrics(OsrsPathGuideOverlay.SMALL);

	private static FontMetrics metrics(float scale)
	{
		return new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
			.getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), scale));
	}

	/** Текст строки целиком, без переносов: «левое | правое» — как будто ширина бесконечная. */
	private static String text(GuideList.Row r)
	{
		String left = r.getLines().stream().map(GuideList.Line::getLeft).filter(s -> !s.isEmpty())
			.map(String::trim).collect(Collectors.joining(" "));
		String right = r.getLines().stream().map(GuideList.Line::getRight).filter(s -> s != null)
			.collect(Collectors.joining(" "));
		return left + (right.isEmpty() ? "" : " | " + right);
	}

	private static List<GuideList.Row> rows(StepGuide.View v, boolean collapsed)
	{
		return GuideList.rows(v, collapsed, FM, SMALL, OsrsPathGuideOverlay.WIDTH);
	}

	/** S2-03: лук в сумке, глаз тритона — по ходу шага у Betty, омаров нет (банк открывали, пусто). */
	private static StepGuide.View witchsPotion(String navLabel, int x, int y)
	{
		return StepGuide.view(StepGuideTest.witchsPotion(), StepGuideTest.counts(1957, "Onion", 1), StepGuideTest.counts(),
			navLabel, x, y, 0);
	}

	@Test
	public void предметыСоСтатусомИГдеВзять_местоКнопка()
	{
		List<GuideList.Row> rows = rows(witchsPotion(null, 0, 0), false);
		assertEquals(GuideList.Kind.TOGGLE, rows.get(0).getAction().getKind());
		assertEquals("Что нужно | ▲", text(rows.get(0)));

		// Чего не хватает — сверху, лук уже в сумке — вниз.
		GuideList.Row onion = rows.get(3);
		assertEquals("в сумке — одна строка, не кнопка", "✓ Onion | есть", text(onion));
		assertFalse(onion.getAction().isClickable());

		GuideList.Row newt = rows.get(1);
		assertEquals("название и статус — одной строкой", "• Eye of newt | по ходу", newt.getLines().get(0).getLeft() + " | " + newt.getLines().get(0).getRight());
		assertTrue("где взять — под названием", text(newt).contains("Купи у Betty в Port Sarim за 3 gp."));
		assertEquals("где взять — цветом ссылки", GuideList.LINK, newt.getLines().get(1).getLeftColor());
		assertTrue("где взять — мелким шрифтом", newt.getLines().get(1).isSmall());
		assertEquals(GuideList.Action.place(2), newt.getAction());
		assertTrue(newt.getHint(), newt.getHint().contains("Глаз тритона") && newt.getHint().contains("Клик — стрелка и путь: Eye of newt — Betty, Port Sarim"));

		GuideList.Row lobster = rows.get(2);
		assertEquals("✗ Lobster ×5 | нет", lobster.getLines().get(0).getLeft() + " | " + lobster.getLines().get(0).getRight());
		assertEquals("места нет — не кнопка", GuideList.Action.NONE, lobster.getAction());
		assertEquals(GuideList.MUTED, lobster.getLines().get(1).getLeftColor());
		assertTrue("подсказка без обещания пути", !lobster.getHint().contains("Клик"));

		// Куда идти — только к кому не ведут строки предметов: грядка лука и Betty уже кнопки выше.
		assertEquals("Куда идти", text(rows.get(4)));
		assertEquals("► Hetty — дом в Rimmington", text(rows.get(5)));
		assertEquals(GuideList.Action.place(0), rows.get(5).getAction());
		assertTrue(rows.get(5).getHint().contains("Hetty подсветится"));
		assertEquals(6, rows.size());
		assertTrue(newt.getHint(), newt.getHint().contains("Betty подсветится"));
	}

	@Test
	public void стрелкаВедётКТочке_онаОтмеченаИНеКнопка_естьВозвратКШагу()
	{
		List<GuideList.Row> rows = rows(witchsPotion("Eye of newt — Betty, Port Sarim", 3014, 3259), false);
		GuideList.Row back = rows.get(1);
		assertEquals("← Стрелку — снова к шагу", text(back));
		assertEquals(GuideList.Action.BACK, back.getAction());
		GuideList.Row newt = rows.get(2);
		assertTrue(text(newt), text(newt).contains("● стрелка ведёт туда"));
		assertFalse("уже ведёт — не кнопка", newt.getAction().isClickable());
		assertEquals("► Hetty — дом в Rimmington", text(rows.get(rows.size() - 1)));

		// Стрелка ведёт к месту, где предметов не берут, — оно в «Куда идти» с «●» и не кнопка.
		List<GuideList.Row> toHetty = rows(witchsPotion("Hetty — дом в Rimmington", 2968, 3204), false);
		GuideList.Row hetty = toHetty.get(toHetty.size() - 1);
		assertEquals("● Hetty — дом в Rimmington", text(hetty));
		assertFalse(hetty.getAction().isClickable());
	}

	@Test
	public void свёрнутый_однаСтрокаСИтогом()
	{
		List<GuideList.Row> rows = rows(witchsPotion(null, 0, 0), true);
		assertEquals(1, rows.size());
		assertEquals("Что нужно: нет 1 · по ходу 1 | ▼", text(rows.get(0)));
		assertEquals(GuideList.Action.TOGGLE, rows.get(0).getAction());
		StepGuide.View allIn = StepGuide.view(StepGuideTest.witchsPotion(),
			StepGuideTest.counts(1957, "Onion", 1, 221, "Eye of newt", 1, 379, "Lobster", 5), null, null, 0, 0, 0);
		assertEquals("Что нужно: всё с собой | ▼", text(rows(allIn, true).get(0)));
	}

	@Test
	public void когдаПоказывать()
	{
		assertFalse(GuideList.worthShowing(null));
		assertFalse("шаг не выбран", GuideList.worthShowing(StepGuide.EMPTY));
		ActiveTarget onePlace = new com.google.gson.Gson().fromJson("{\"stepId\":\"S1-07\",\"title\":\"X\",\"guide\":{\"items\":[],"
			+ "\"places\":[{\"x\":3236,\"y\":3155,\"plane\":0,\"label\":\"Abigale\"}]}}", ActiveTarget.class);
		assertNull(onePlace.prepare());
		assertFalse("одна точка без предметов — хватит HUD и стрелки",
			GuideList.worthShowing(StepGuide.view(onePlace, StepGuideTest.counts(), null, null, 0, 0, 0)));
		assertTrue("временная цель — нужен возврат к шагу",
			GuideList.worthShowing(StepGuide.view(onePlace, StepGuideTest.counts(), null, "Bob", 3230, 3203, 0)));
		assertTrue(GuideList.worthShowing(witchsPotion(null, 0, 0)));
	}

	@Test
	public void длинноеГдеВзять_двеСтрокиИМноготочие()
	{
		String where = "Raw rat meat с гигантской крысы у часовни Port Sarim (или Raw beef) — используй на камине Hetty дважды, пока не сгорит.";
		int width = OverlayText.inner(OsrsPathGuideOverlay.WIDTH);
		List<GuideList.Line> lines = GuideList.clip("   ", where, GuideList.MUTED, SMALL, width, 2, true);
		assertEquals(2, lines.size());
		assertTrue(lines.get(1).getLeft(), lines.get(1).getLeft().endsWith("…"));
		for (GuideList.Line l : lines)
		{
			assertTrue(l.getLeft(), SMALL.stringWidth(l.getLeft()) <= width);
		}
		assertEquals("короткое — как есть", 1, GuideList.clip("   ", "Купи у Ned.", GuideList.MUTED, SMALL, width, 2, true).size());
	}

	@Test
	public void шагБезПредметов_заголовокКудаИдти()
	{
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-05\",\"title\":\"Romeo & Juliet\",\"guide\":{\"items\":[],\"places\":["
			+ "{\"x\":3211,\"y\":3422,\"plane\":0,\"label\":\"Romeo на площади Varrock\",\"npc\":\"Romeo\"},"
			+ "{\"x\":3159,\"y\":3426,\"plane\":1,\"label\":\"Juliet — особняк\",\"npc\":\"Juliet\"}]}}", ActiveTarget.class);
		assertNull(t.prepare());
		List<GuideList.Row> rows = rows(StepGuide.view(t, StepGuideTest.counts(), null, null, 0, 0, 0), false);
		assertEquals("Куда идти | ▲", text(rows.get(0)));
		assertEquals("без второго заголовка", 3, rows.size());
		assertEquals("► Juliet — особняк", text(rows.get(2)));
		assertEquals("Куда идти: 2 места | ▼", text(rows(StepGuide.view(t, StepGuideTest.counts(), null, null, 0, 0, 0), true).get(0)));
	}

	@Test
	public void местоСNpcГдеВсёВзято_сноваВКудаИдти()
	{
		// NPC выдаёт предмет, и к нему же идти дальше по квесту: пока предмета нет — к нему ведёт строка предмета,
		// взял — NPC снова в «Куда идти». Грядка без NPC, где всё уже с собой, — не нужна.
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-06\",\"title\":\"Rune Mysteries\",\"guide\":{"
			+ "\"items\":[{\"name\":\"Research package\"},{\"name\":\"Onion\"}],\"places\":["
			+ "{\"x\":3210,\"y\":3221,\"plane\":1,\"label\":\"Duke Horacio\",\"npc\":\"Duke Horacio\"},"
			+ "{\"x\":3103,\"y\":9571,\"plane\":0,\"label\":\"Archmage Sedridor — подвал Wizards' Tower\",\"npc\":\"Archmage Sedridor\",\"items\":[\"Research package\"]},"
			+ "{\"x\":2950,\"y\":3251,\"plane\":0,\"label\":\"Лук — грядка\",\"items\":[\"Onion\"]}]}}", ActiveTarget.class);
		assertNull(t.prepare());
		List<String> before = rows(StepGuide.view(t, StepGuideTest.counts(), StepGuideTest.counts(), null, 0, 0, 0), false).stream()
			.map(GuideListTest::text).collect(Collectors.toList());
		assertFalse(before.toString(), before.stream().anyMatch(r -> r.startsWith("► Archmage Sedridor")));
		List<String> after = rows(StepGuide.view(t, StepGuideTest.counts(-1, "Research package", 1, -1, "Onion", 1), null, null, 0, 0, 0), false)
			.stream().map(GuideListTest::text).collect(Collectors.toList());
		assertTrue(after.toString(), after.stream().anyMatch(r -> r.startsWith("► Archmage Sedridor")));
		assertFalse(after.toString(), after.stream().anyMatch(r -> r.startsWith("► Лук")));
	}

	/** S2-03 как её присылает программа 2.12: четыре предмета «по ходу», места Betty и крысы, финал — «Отдай всё Hetty». */
	private static ActiveTarget hetty()
	{
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-03\",\"title\":\"Witch's Potion\",\"guide\":{"
			+ "\"items\":[{\"name\":\"Onion\",\"inStep\":true},{\"name\":\"Eye of newt\",\"inStep\":true},{\"name\":\"Rat's tail\",\"inStep\":true}],"
			+ "\"places\":["
			+ "{\"x\":2968,\"y\":3204,\"plane\":0,\"label\":\"Hetty — дом в Rimmington\",\"npc\":\"Hetty\"},"
			+ "{\"x\":2957,\"y\":3204,\"plane\":0,\"label\":\"Крыса — Brian's Archery Supplies\",\"npc\":\"Rat\",\"items\":[\"Rat's tail\"]},"
			+ "{\"x\":3014,\"y\":3259,\"plane\":0,\"label\":\"Eye of newt — Betty, Port Sarim\",\"npc\":\"Betty\",\"items\":[\"Eye of newt\"]},"
			+ "{\"x\":2950,\"y\":3251,\"plane\":0,\"label\":\"Лук — грядка\",\"items\":[\"Onion\"]}],"
			+ "\"steps\":[\"Поговори с Hetty.\",\"Сорви лук.\",\"Отдай всё Hetty и выпей из котла (Drink From).\"]}}", ActiveTarget.class);
		assertNull(t.prepare());
		return t;
	}

	private static List<String> shown(StepGuide.View v)
	{
		return rows(v, false).stream().map(GuideListTest::text).collect(Collectors.toList());
	}

	@Test
	public void всёСобрано_местаСобранногоУходят_ПоказаноЧтоДелатьДальше()
	{
		ActiveTarget t = hetty();
		java.util.Set<String> got = new java.util.HashSet<>();
		StepGuide.View partial = StepGuide.view(t, StepGuideTest.counts(1957, "Onion", 1), StepGuideTest.counts(), null, 0, 0, 0, got);
		List<String> before = shown(partial);
		assertNull(partial.getNext());
		assertTrue(before.toString(), before.stream().noneMatch(r -> r.startsWith("▶")));
		assertTrue("Betty ещё нужна: Eye of newt нет — ведёт строка предмета", before.stream().anyMatch(r -> r.contains("Eye of newt")));

		StepGuide.View all = StepGuide.view(t, StepGuideTest.counts(1957, "Onion", 1, 221, "Eye of newt", 1, 300, "Rat's tail", 1),
			StepGuideTest.counts(), null, 0, 0, 0, got);
		List<String> after = shown(all);
		assertTrue(after.toString(), after.stream().anyMatch(r -> r.startsWith("▶ Дальше: Отдай всё Hetty")));
		assertTrue("Hetty — главная точка остаётся", after.stream().anyMatch(r -> r.startsWith("► Hetty")));
		assertTrue("Betty и крыса уже не нужны: " + after, after.stream().noneMatch(r -> r.startsWith("► Eye of newt") || r.startsWith("► Крыса")));
	}

	@Test
	public void отдалиПредметы_списокНеПроситИхСнова()
	{
		ActiveTarget t = hetty();
		java.util.Set<String> got = new java.util.HashSet<>();
		StepGuide.view(t, StepGuideTest.counts(1957, "Onion", 1, 221, "Eye of newt", 1, 300, "Rat's tail", 1), StepGuideTest.counts(), null, 0, 0, 0, got);
		// Отдали Hetty: сумка пуста, банк открывали — раньше список снова писал «нет».
		StepGuide.View handed = StepGuide.view(t, StepGuideTest.counts(), StepGuideTest.counts(), null, 0, 0, 0, got);
		for (StepGuide.ItemLine i : handed.getItems())
		{
			assertEquals(i.getName(), StepGuide.Have.DONE, i.getHave());
			assertEquals("готово", i.getTag());
		}
		assertNotNull("и подсказка «что дальше» остаётся", handed.getNext());
		// Без памяти (старое поведение) — как раньше.
		assertEquals(StepGuide.Have.IN_STEP, StepGuide.view(t, StepGuideTest.counts(), StepGuideTest.counts(), null, 0, 0, 0).getItems().get(0).getHave());
	}

	@Test
	public void NpcМестаУПоследнегоШага_остаётся()
	{
		// «Отдай Brian…» — NPC места упомянут в финале: место не прячем, даже когда всё оттуда взято.
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-06\",\"title\":\"T\",\"guide\":{\"items\":[{\"name\":\"Package\"}],\"places\":["
			+ "{\"x\":3210,\"y\":3221,\"plane\":1,\"label\":\"Duke\",\"npc\":\"Duke\"},"
			+ "{\"x\":3103,\"y\":9571,\"plane\":0,\"label\":\"Sedridor — подвал\",\"npc\":\"Sedridor\",\"items\":[\"Package\"]}],"
			+ "\"steps\":[\"Отнеси Package к Sedridor.\"]}}", ActiveTarget.class);
		assertNull(t.prepare());
		List<String> r = shown(StepGuide.view(t, StepGuideTest.counts(-1, "Package", 1), null, null, 0, 0, 0, new java.util.HashSet<>()));
		assertTrue(r.toString(), r.stream().anyMatch(x -> x.startsWith("► Sedridor")));
	}

	@Test
	public void длинныйСписок_вОднуСтрокуИНедостающееСверху()
	{
		StringBuilder items = new StringBuilder();
		for (int i = 0; i < 12; i++)
		{
			items.append(i == 0 ? "" : ",").append("{\"name\":\"Item").append(i).append("\",\"where\":\"Очень длинный текст о том, где взять этот предмет, на три строки и больше, чтобы проверить сжатие.\"}");
		}
		StringBuilder places = new StringBuilder();
		for (int i = 0; i < 8; i++)
		{
			places.append(i == 0 ? "" : ",").append("{\"x\":").append(3200 + i).append(",\"y\":3200,\"plane\":0,\"label\":\"NPC").append(i)
				.append(" — очень длинная подпись места, которая не влезает в одну строку\",\"npc\":\"Npc").append(i).append("\"}");
		}
		ActiveTarget t = new com.google.gson.Gson().fromJson("{\"stepId\":\"S2-10\",\"title\":\"Prince Ali Rescue\",\"guide\":{\"items\":["
			+ items + "],\"places\":[" + places + "]}}", ActiveTarget.class);
		assertNull(t.prepare());
		StepGuide.View v = StepGuide.view(t, StepGuideTest.counts(-1, "Item5", 1), StepGuideTest.counts(), null, 0, 0, 0);
		List<GuideList.Row> rows = rows(v, false);
		// Предметов не больше восьми, у каждого «где взять» одной строкой; Item5 уже в сумке — не в первых строках.
		List<GuideList.Row> itemRows = rows.subList(1, 1 + GuideList.MAX_ITEMS);
		for (GuideList.Row r : itemRows)
		{
			assertTrue(text(r), r.getLines().size() <= 2);
			assertFalse(text(r), text(r).startsWith("✓"));
		}
		assertTrue(text(rows.get(1 + GuideList.MAX_ITEMS)), text(rows.get(1 + GuideList.MAX_ITEMS)).startsWith("… ещё 4"));
		GuideList.Row firstPlace = rows.get(3 + GuideList.MAX_ITEMS);
		assertEquals("место — одной строкой с многоточием", 1, firstPlace.getLines().size());
		assertTrue(firstPlace.getLines().get(0).getLeft().endsWith("…"));
		assertTrue("целиком — в подсказке", firstPlace.getHint().contains("не влезает в одну строку"));
	}

	@Test
	public void местоБезNpcВПодписи_npcВпереди()
	{
		GuideList.Row r = GuideList.place(new StepGuide.PlaceLine("Кухня замка Lumbridge", 0, false, "Cook", false), FM,
			OverlayText.inner(OsrsPathGuideOverlay.WIDTH));
		assertTrue(text(r), text(r).startsWith("► Cook — Кухня замка"));
		GuideList.Row same = GuideList.place(new StepGuide.PlaceLine("Hetty — дом в Rimmington", 0, false, "Hetty", false), FM,
			OverlayText.inner(OsrsPathGuideOverlay.WIDTH));
		assertEquals("► Hetty — дом в Rimmington", text(same));
	}

	// ---------- Клики ----------

	private static Widget widget()
	{
		return (Widget) Proxy.newProxyInstance(Widget.class.getClassLoader(), new Class<?>[]{Widget.class}, (p, m, a) -> null);
	}

	private static MenuEntry entry(Widget w)
	{
		return (MenuEntry) Proxy.newProxyInstance(MenuEntry.class.getClassLoader(), new Class<?>[]{MenuEntry.class},
			(p, m, a) -> "getWidget".equals(m.getName()) ? w : null);
	}

	/** Клиент: открыто ли меню, выбрано ли заклинание, что в меню под мышью (последний пункт — левый клик). */
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

	/** Список на холсте в (10, 50): заголовок, строка-предмет без места, строка-место. */
	private static OsrsPathGuideOverlay overlay(Client c, long renderedAt)
	{
		OsrsPathGuideOverlay o = new OsrsPathGuideOverlay(c, null, null);
		o.setHits(new OsrsPathGuideOverlay.Hits(new Rectangle(10, 50, 220, 100),
			Arrays.asList(new Rectangle(14, 54, 212, 16), new Rectangle(14, 70, 212, 30), new Rectangle(14, 100, 212, 16)),
			Arrays.asList(GuideList.Action.TOGGLE, GuideList.Action.NONE, GuideList.Action.place(3)), renderedAt));
		return o;
	}

	@Test
	public void кликПоМесту_действиеИКликНеУходитВИгру()
	{
		Client c = client(false, false, entry(null));
		List<GuideList.Action> done = new ArrayList<>();
		GuideMouse mouse = new GuideMouse(c, overlay(c, System.nanoTime()), done::add);
		MouseEvent e = mouse.mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK));
		assertTrue("игра не получит клик — персонаж не пойдёт под плашку", e.isConsumed());
		assertEquals(Collections.singletonList(GuideList.Action.place(3)), done);
		MouseEvent up = new MouseEvent(new Canvas(), MouseEvent.MOUSE_RELEASED, 0, 0, 50, 105, 1, false, MouseEvent.BUTTON1);
		assertTrue(mouse.mouseReleased(up).isConsumed());

		// Строка без места — клик тоже не уходит в игру, но ничего не делает.
		done.clear();
		assertTrue(mouse.mousePressed(press(50, 80, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertTrue(done.isEmpty());
		// Заголовок — свернуть.
		mouse.mousePressed(press(50, 58, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK));
		assertEquals(Collections.singletonList(GuideList.Action.TOGGLE), done);
	}

	@Test
	public void кликУходитИгре_внеСписка_правой_сAlt_меню_банкНадСписком_списокНеНарисован()
	{
		List<GuideList.Action> done = new ArrayList<>();
		Client world = client(false, false, entry(null));
		GuideMouse mouse = new GuideMouse(world, overlay(world, System.nanoTime()), done::add);
		assertFalse("мимо списка", mouse.mousePressed(press(400, 300, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertFalse("правая кнопка — меню игры", mouse.mousePressed(press(50, 105, MouseEvent.BUTTON3, InputEvent.BUTTON3_DOWN_MASK)).isConsumed());
		assertFalse("Alt — RuneLite двигает плашку",
			mouse.mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK | InputEvent.ALT_DOWN_MASK)).isConsumed());
		MouseEvent up = new MouseEvent(new Canvas(), MouseEvent.MOUSE_RELEASED, 0, 0, 400, 300, 1, false, MouseEvent.BUTTON1);
		assertFalse("отпускание чужого нажатия — игре", mouse.mouseReleased(up).isConsumed());

		Client menuOpen = client(true, false, entry(null));
		assertFalse("открыто меню игры — выбирают его пункт",
			new GuideMouse(menuOpen, overlay(menuOpen, System.nanoTime()), done::add).mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		Client spell = client(false, true, entry(null));
		assertFalse("выбрано заклинание или «Use»",
			new GuideMouse(spell, overlay(spell, System.nanoTime()), done::add).mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		Client bank = client(false, false, entry(null), entry(widget()));
		assertFalse("над списком банк: «Withdraw-1» важнее",
			new GuideMouse(bank, overlay(bank, System.nanoTime()), done::add).mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertFalse("список давно не рисовался (вышел из игры, скрыт) — клики игре",
			new GuideMouse(world, overlay(world, System.nanoTime() - 2_000_000_000L), done::add).mousePressed(press(50, 105, MouseEvent.BUTTON1, InputEvent.BUTTON1_DOWN_MASK)).isConsumed());
		assertTrue(done.isEmpty());
	}

	@Test
	public void окноИгрыПодМышью_поВерхнемуПунктуМеню()
	{
		assertFalse(GuideMouse.windowUnderMouse(null));
		assertFalse(GuideMouse.windowUnderMouse(new MenuEntry[0]));
		assertFalse("Walk here — мир", GuideMouse.windowUnderMouse(new MenuEntry[]{entry(null), entry(null)}));
		assertTrue("Withdraw-1 — окно банка", GuideMouse.windowUnderMouse(new MenuEntry[]{entry(null), entry(widget())}));
		assertSame(GuideList.Action.NONE, GuideList.Action.NONE);
	}

	/** Пункт меню над списком — латиницей (шрифт игры без кириллицы) и по действию строки. */
	@Test
	public void menuOptionOverListIsLatin()
	{
		assertEquals("Arrow to", GuideMouse.menuOption(GuideList.Action.place(0)));
		assertEquals("Arrow back to step", GuideMouse.menuOption(GuideList.Action.BACK));
		assertEquals("Collapse / expand", GuideMouse.menuOption(GuideList.Action.TOGGLE));
		assertEquals("List", GuideMouse.menuOption(GuideList.Action.NONE));
	}

	/** Открытая карта мира над списком: клик по её метке — карте, а не строке под ней. */
	@Test
	public void картаМираНадСписком_кликУходитКарте()
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
		assertFalse("карта закрыта", GuideMouse.mapCovers(null, new java.awt.Point(50, 105)));
	}
}
