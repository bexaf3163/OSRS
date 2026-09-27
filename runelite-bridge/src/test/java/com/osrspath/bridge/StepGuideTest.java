package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

/**
 * Боковая панель «OSRS Путь»: что нужно на шаг (есть, в банке, нет, по ходу шага), где взять, «Путь сюда» к точке,
 * и строка HUD, которая называет недостающее, а не «не хватает 1 из 1».
 */
public class StepGuideTest
{
	private static final Gson GSON = new Gson();

	/** S2-03 Witch's Potion — как его присылает программа 2.10 (stepGuide в runeliteBridge.ts). */
	private static ActiveTarget witchsPotion()
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-03\",\"title\":\"Witch's Potion\",\"goal\":\"Дом ведьмы Hetty\","
			+ "\"guide\":{\"items\":["
			+ "{\"name\":\"Onion\",\"nameRu\":\"Лук\",\"id\":1957,\"count\":1,\"where\":\"Сорви на грядке к северу от Rimmington.\",\"inStep\":true},"
			+ "{\"name\":\"Eye of newt\",\"nameRu\":\"Глаз тритона\",\"id\":221,\"count\":1,\"where\":\"Купи у Betty в Port Sarim за 3 gp.\",\"inStep\":true},"
			+ "{\"name\":\"Lobster\",\"id\":379,\"count\":5,\"where\":\"Купи на бирже.\"}],"
			+ "\"places\":["
			+ "{\"x\":2968,\"y\":3204,\"plane\":0,\"label\":\"Hetty — дом в Rimmington\",\"npc\":\"Hetty\"},"
			+ "{\"x\":2950,\"y\":3251,\"plane\":0,\"label\":\"Лук — грядка к северу от Rimmington\",\"items\":[\"Onion\"]},"
			+ "{\"x\":3014,\"y\":3259,\"plane\":0,\"label\":\"Eye of newt — Betty, Port Sarim\",\"npc\":\"Betty\",\"items\":[\"Eye of newt\"]}]}}",
			ActiveTarget.class);
		assertNull(t.prepare());
		return t;
	}

	private static ItemCounts counts(Object... idNameQty)
	{
		ItemCounts c = new ItemCounts();
		for (int i = 0; i < idNameQty.length; i += 3)
		{
			c.add((Integer) idNameQty[i], ActiveTarget.nameKey((String) idNameQty[i + 1]), (Integer) idNameQty[i + 2]);
		}
		return c;
	}

	@Test
	public void чтоНужноИГдеВзять()
	{
		StepGuide.View v = StepGuide.view(witchsPotion(), counts(1957, "Onion", 1), counts(379, "Lobster", 2), null, 0, 0, 0);
		assertEquals("[S2-03] Witch's Potion", v.getTitle());
		StepGuide.ItemLine onion = v.getItems().get(0);
		assertEquals(StepGuide.Have.BAG, onion.getHave());
		assertEquals("Onion (Лук)", onion.getTitle());
		StepGuide.ItemLine newt = v.getItems().get(1);
		assertEquals(StepGuide.Have.IN_STEP, newt.getHave());
		assertEquals("Купи у Betty в Port Sarim за 3 gp.", newt.getWhere());
		assertEquals("точка, где берут глаз тритона", 2, newt.getPlace());
		StepGuide.ItemLine lobster = v.getItems().get(2);
		assertEquals(StepGuide.Have.NONE, lobster.getHave());
		assertEquals("Lobster ×5", lobster.getTitle());
		assertEquals("нет — есть 2 из 5", lobster.getStatus());
		assertEquals(-1, lobster.getPlace());
	}

	@Test
	public void банкНеОткрывали_неизвестно_аВБанкеХватает_возьми()
	{
		ActiveTarget t = witchsPotion();
		assertEquals(StepGuide.Have.UNKNOWN, StepGuide.view(t, counts(), null, null, 0, 0, 0).getItems().get(2).getHave());
		StepGuide.ItemLine inBank = StepGuide.view(t, counts(379, "Lobster", 1), counts(379, "Lobster", 9), null, 0, 0, 0).getItems().get(2);
		assertEquals(StepGuide.Have.BANK, inBank.getHave());
		assertEquals("в банке — возьми (1+9/5)", inBank.getStatus());
	}

	@Test
	public void путьСюда_цельКТочкеСNpc_иАктивнаяТочкаОтмечена()
	{
		ActiveTarget t = witchsPotion();
		NavTarget n = StepGuide.navTo(t, 2);
		assertNotNull(n);
		assertEquals("Eye of newt — Betty, Port Sarim", n.getLabel());
		assertEquals(3014, n.getX());
		assertEquals(Collections.singletonList("Betty"), n.getNpcNames());
		assertTrue("NPC точки подсветится", n.getNpcNameSet().contains("betty"));
		assertEquals("S2-03", n.getStepId());
		// Не покупка: цель снимется, когда игрок придёт, и стрелка вернётся к шагу.
		assertEquals(false, n.isPurchase());
		assertNull(StepGuide.navTo(t, 9));
		assertNull(StepGuide.navTo(null, 0));

		StepGuide.View v = StepGuide.view(t, counts(), null, n.getLabel(), 3014, 3259, 0);
		assertEquals("Eye of newt — Betty, Port Sarim", v.getDetour());
		assertTrue(v.getPlaces().get(2).isActive());
		assertEquals(false, v.getPlaces().get(0).isActive());
	}

	@Test
	public void безШагаИОтСтаройПрограммы_понятноеСообщение()
	{
		assertEquals(StepGuide.EMPTY, StepGuide.view(null, counts(), null, null, 0, 0, 0));
		ActiveTarget old = GSON.fromJson("{\"stepId\":\"S1-03\",\"title\":\"Cook's Assistant\"}", ActiveTarget.class);
		assertNull(old.prepare());
		assertTrue(StepGuide.view(old, counts(), null, null, 0, 0, 0).getNote().contains("Обнови программу"));
	}

	@Test
	public void неверныйСписокПанелиОтклоняется()
	{
		ActiveTarget bad = GSON.fromJson("{\"stepId\":\"S2-03\",\"guide\":{\"places\":[{\"x\":-5,\"y\":3204,\"plane\":0,\"label\":\"x\"}]}}", ActiveTarget.class);
		assertEquals("неверная точка панели", bad.prepare());
		ActiveTarget noName = GSON.fromJson("{\"stepId\":\"S2-03\",\"guide\":{\"items\":[{\"name\":\"\"}]}}", ActiveTarget.class);
		assertEquals("неверный предмет панели", noName.prepare());
	}

	@Test
	public void строкаHudНазываетНедостающее()
	{
		ActiveTarget.ChecklistItem meat = new ActiveTarget.ChecklistItem();
		meat.setName("Burnt meat");
		meat.setCount(1);
		ActiveTarget.ChecklistItem lobster = new ActiveTarget.ChecklistItem();
		lobster.setName("Lobster");
		lobster.setCount(20);
		ActiveTarget.ChecklistItem rope = new ActiveTarget.ChecklistItem();
		rope.setName("Rope");
		rope.setCount(1);

		assertEquals("Сумка: нет Burnt meat",
			Checklist.hudLine(Checklist.evaluate(Collections.singletonList(meat), counts(), counts())));
		assertEquals("Сумка: Burnt meat — возьми из банка",
			Checklist.hudLine(Checklist.evaluate(Collections.singletonList(meat), counts(), counts(2146, "Burnt meat", 1))));
		assertEquals("Сумка: нет Burnt meat, Lobster 13/20",
			Checklist.hudLine(Checklist.evaluate(Arrays.asList(meat, lobster), counts(379, "Lobster", 13), counts())));
		assertEquals("Сумка: нет Burnt meat, Lobster 0/20 и ещё 1",
			Checklist.hudLine(Checklist.evaluate(Arrays.asList(meat, lobster, rope), counts(), counts())));
	}

	@Test
	public void значокПанелиРисуется()
	{
		assertEquals(16, OsrsPathPanel.icon().getWidth());
	}
}
