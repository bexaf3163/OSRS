package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.Collections;
import java.util.Map;
import net.runelite.api.Skill;
import org.junit.Test;

/**
 * The tracked skill path (Skills -> "Track Skill Path"): the plugin takes the whole path from the snapshot and leads the step for the real level. The cursor is the
 * first step above the level, so a StatChanged only asks which step that is; the target it builds is the same kind the app sends for a route step.
 */
public class SkillPathTest
{
	private static final String PATH = "{\"skill\":\"mining\",\"mode\":\"fast\",\"steps\":["
		+ "{\"id\":\"mining-01\",\"title\":\"Doric's Quest (XP skip)\",\"action\":\"A free quest with a small Mining reward.\",\"methodType\":\"QUEST\",\"fromLevel\":1,\"targetLevel\":10,"
		+ "\"location\":{\"name\":\"Doric\",\"x\":2952,\"y\":3452,\"plane\":0,\"npcName\":\"Doric\"}},"
		+ "{\"id\":\"mining-04\",\"title\":\"Iron ore (powermining)\",\"action\":\"Mine iron at the Al Kharid mine and drop the ore.\",\"methodType\":\"GATHER\",\"fromLevel\":15,\"targetLevel\":45,"
		+ "\"location\":{\"name\":\"Al Kharid mine\",\"x\":3298,\"y\":3293,\"plane\":0,\"objectName\":\"Iron rocks\",\"objectId\":11364}},"
		+ "{\"id\":\"mining-06\",\"title\":\"Granite\",\"action\":\"Mine granite at the quarry.\",\"methodType\":\"GATHER\",\"fromLevel\":45,\"targetLevel\":99,"
		+ "\"location\":{\"name\":\"Quarry\",\"x\":3172,\"y\":2912,\"plane\":0,\"objectName\":\"Granite rocks\"}}]}";

	private static SkillPath path(String json)
	{
		return new Gson().fromJson(json, SkillPath.class);
	}

	@Test
	public void theGamesSkillIsFoundByName()
	{
		SkillPath p = path(PATH);
		assertNull(p.prepare());
		assertEquals(Skill.MINING, p.skillEnum());
		for (Skill s : new Skill[] {Skill.ATTACK, Skill.HITPOINTS, Skill.RUNECRAFT, Skill.CONSTRUCTION, Skill.HUNTER, Skill.FARMING})
		{
			SkillPath q = new SkillPath();
			q.setSkill(s.name().toLowerCase());
			assertEquals(s, q.skillEnum());
		}
	}

	@Test
	public void theCursorIsTheFirstStepAboveTheRealLevel()
	{
		SkillPath p = path(PATH);
		assertEquals(0, p.indexFor(1));
		assertEquals(0, p.indexFor(9));
		// StatChanged with level 10: the quest step is done, the next step leads.
		assertEquals(1, p.indexFor(10));
		assertEquals(1, p.indexFor(44));
		assertEquals(2, p.indexFor(45));
		assertEquals(2, p.indexFor(98));
		assertEquals("the whole path is done", 3, p.indexFor(99));
		// A jump over several levels (a lamp) lands on the right step; a lower level never goes back past what the real level says.
		assertEquals(2, p.indexFor(60));
	}

	@Test
	public void theTargetHasThePlaceTheObjectTheNpcAndTheChip()
	{
		SkillPath p = path(PATH);
		ActiveTarget iron = p.targetFor(1);
		assertNull(iron.prepare());
		assertEquals("S0-02", iron.getStepId());
		assertEquals("🎯 Iron ore (powermining) (Lvl 15 → 45)", iron.getGoal());
		assertEquals(3298, iron.getWorldPoint().getX());
		assertEquals("Al Kharid mine", iron.getWorldPoint().getLabel());
		assertTrue(iron.getObjectNameSet().contains(ActiveTarget.nameKey("Iron rocks")));
		assertTrue(iron.getObjectIdSet().contains(11364));
		ActiveTarget quest = p.targetFor(0);
		assertNull(quest.prepare());
		assertEquals("🎯 Doric's Quest (Lvl 1 → 10)", quest.getGoal());
		assertTrue(quest.getNpcNameSet().contains(ActiveTarget.nameKey("Doric")));
		assertNull(p.targetFor(3));
		assertNull(p.targetFor(-1));
	}

	@Test
	public void theListAndThePanelAcceptTheSkillTarget()
	{
		ActiveTarget t = path(PATH).targetFor(1);
		t.prepare();
		StepGuide.View v = StepGuide.view(t, ItemCounts.EMPTY, null, null, 0, 0, 0, Collections.emptySet(), null, false, 0);
		assertNotNull(v);
		assertEquals("[S0-02] Iron ore (powermining)", v.getTitle());
		assertEquals("🎯 Iron ore (powermining) (Lvl 15 → 45)", v.getGoal());
	}

	@Test
	public void aBadPathIsRefusedWholeAndTheEnvelopeNamesThePart()
	{
		assertEquals("unknown skill", path(PATH.replace("\"mining\"", "\"overall\"")).prepare());
		assertEquals("unknown skill", path(PATH.replace("\"mining\"", "\"basketweaving\"")).prepare());
		assertEquals("invalid skill tile", path(PATH.replace("\"x\":2952", "\"x\":0")).prepare());
		assertEquals("invalid skill tile", path(PATH.replace("\"plane\":0,\"npcName\"", "\"plane\":9,\"npcName\"")).prepare());
		assertEquals("invalid skill level range", path(PATH.replace("\"fromLevel\":15", "\"fromLevel\":45")).prepare());
		assertEquals("skill steps out of order", path(PATH.replace("\"targetLevel\":10", "\"targetLevel\":50")).prepare());
		assertEquals("invalid skill step type", path(PATH.replace("\"GATHER\"", "\"BOT\"")).prepare());
		assertEquals("invalid skill path", path("{\"skill\":\"mining\",\"steps\":[]}").prepare());
		PrepEnvelope e = new PrepEnvelope();
		e.setV(6);
		e.setSkillPath(path(PATH.replace("\"mining\"", "\"overall\"")));
		Map<String, String> bad = e.prepare();
		assertEquals("unknown skill", bad.get(PrepEnvelope.SKILL_PATH));
		assertFalse(bad.containsKey(PrepEnvelope.STEP));
		PrepEnvelope ok = new PrepEnvelope();
		ok.setV(6);
		ok.setSkillPath(path(PATH));
		assertTrue(ok.prepare().isEmpty());
	}

	@Test
	public void tooManyStepsAreRefused()
	{
		SkillPath p = path(PATH);
		java.util.List<SkillPath.Step> many = new java.util.ArrayList<>();
		for (int i = 0; i < SkillPath.MAX_STEPS + 1; i++)
		{
			SkillPath.Step s = new Gson().fromJson(new Gson().toJson(p.getSteps().get(0)), SkillPath.Step.class);
			s.setFromLevel(1 + i);
			s.setTargetLevel(2 + i);
			many.add(s);
		}
		p.setSteps(many);
		assertEquals("invalid skill path", p.prepare());
	}
}
