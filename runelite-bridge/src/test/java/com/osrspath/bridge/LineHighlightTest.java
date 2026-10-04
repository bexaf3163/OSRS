package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import org.junit.Test;

/** Подсветка шага этапа (как у Quest Helper): разбор, проверка и то, с чем плагин сравнивает NPC, объекты и предметы. */
public class LineHighlightTest
{
	private static final Gson GSON = new Gson();

	private static ActiveTarget.StageLine line(String json)
	{
		return GSON.fromJson(json, ActiveTarget.StageLine.class);
	}

	@Test
	public void подсветкаРазбираетсяИСравниваетсяПоIDИИмени()
	{
		ActiveTarget.StageLine l = line("{\"t\":\"Положи ром\",\"hl\":{\"npc\":[3647],\"obj\":[2072],\"on\":[\"Banana tree\"],\"item\":[\"Karamjan rum\"]}}");
		assertNotNull(l.getHl());
		assertNull(l.getHl().problem());
		ActiveTarget.LineHighlight h = new ActiveTarget.LineHighlight(l.getHl());
		assertTrue(h.npcIds.contains(3647));
		assertTrue(h.objectIds.contains(2072));
		assertTrue("имена сравниваются без регистра, как у остальных подсветок", h.objectNames.contains(ActiveTarget.nameKey("BANANA TREE")));
		assertTrue(h.itemNames.contains(ActiveTarget.nameKey("karamjan rum")));
		assertFalse(h.isEmpty());
	}

	@Test
	public void безПодсветки_пусто()
	{
		assertTrue(ActiveTarget.LineHighlight.NONE.isEmpty());
		assertTrue(new ActiveTarget.LineHighlight(null).isEmpty());
		assertNull(line("{\"t\":\"Поговори\"}").getHl());
	}

	@Test
	public void негоднаяПодсветкаОтвергаетсяЦеликом()
	{
		String[] bad = {"{\"npc\":[0]}", "{\"npc\":[300000]}", "{\"obj\":[-1]}", "{\"npc\":[1,2,3,4,5,6,7,8,9]}", "{\"on\":[\"\"]}", "{\"item\":[null]}",
			"{\"on\":[\"" + "x".repeat(500) + "\"]}"};
		for (String h : bad)
		{
			ActiveTarget.StageLine l = line("{\"t\":\"x\",\"hl\":" + h + "}");
			assertNotNull(h, l.getHl().problem());
		}
	}

	@Test
	public void этапСНегоднойПодсветкойШагаНеПринимается()
	{
		ActiveTarget t = GSON.fromJson("{\"stepId\":\"S2-09\",\"title\":\"x\",\"guide\":{\"items\":[],\"places\":[],\"stage\":{\"kind\":\"varp\",\"id\":71,\"stages\":["
			+ "{\"at\":0,\"steps\":[{\"t\":\"Поговори\",\"hl\":{\"npc\":[0]}}]}]}}}", ActiveTarget.class);
		assertNotNull(t.prepare());
		ActiveTarget ok = GSON.fromJson("{\"stepId\":\"S2-09\",\"title\":\"x\",\"guide\":{\"items\":[],\"places\":[],\"stage\":{\"kind\":\"varp\",\"id\":71,\"stages\":["
			+ "{\"at\":0,\"steps\":[{\"t\":\"Поговори\",\"hl\":{\"npc\":[3647]}}]}]}}}", ActiveTarget.class);
		assertNull(ok.prepare());
	}

	@Test
	public void переходСДвижениемКурсораМеняетПодсветку_вДанных()
	{
		// Строки Pirate's Treasure из данных программы: у каждой своя подсветка, а не одна на весь шаг.
		ActiveTarget.StageLine rum = line("{\"t\":\"Положи ром\",\"hl\":{\"obj\":[2072],\"item\":[\"Karamjan rum\"]}}");
		ActiveTarget.StageLine luthas = line("{\"t\":\"Скажи Luthas\",\"hl\":{\"npc\":[3647]}}");
		assertTrue(new ActiveTarget.LineHighlight(rum.getHl()).npcIds.isEmpty());
		assertEquals(1, new ActiveTarget.LineHighlight(luthas.getHl()).npcIds.size());
		assertTrue(new ActiveTarget.LineHighlight(luthas.getHl()).objectIds.isEmpty());
	}
}
