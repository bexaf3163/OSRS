package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import lombok.Data;
import net.runelite.api.Skill;

/**
 * The skill the player tracks (the app's Skills → "Track Skill Path"): the whole path as level brackets, in the order to train them. While it is in the snapshot the
 * plugin leads that skill instead of the quest step: the arrow to the step's place, the object or NPC highlighted, and a HUD chip. The cursor is never stored: it is
 * the first step whose target level is above the real level, so StatChanged only has to ask {@link #indexFor(int)} and everything stays true after a restart.
 */
@Data
public class SkillPath
{
	static final int MAX_STEPS = 24;
	/** The ids of the skill targets: route steps are S1-01 and up, so S0-NN cannot clash with one. */
	static final String ID_PREFIX = "S0-";

	/** The skill as the game names it, lower case ("mining"). */
	private String skill;
	/** fast, afk or f2p: which filter the app built the path with. */
	private String mode;
	private List<Step> steps;

	@Data
	public static class Step
	{
		private String id;
		private String title;
		/** What to do here, short. */
		private String action;
		private String methodType;
		private int fromLevel;
		private int targetLevel;
		private Location location;

		String problem()
		{
			if (id == null || id.isEmpty() || ActiveTarget.tooLong(id) || title == null || title.trim().isEmpty() || ActiveTarget.tooLong(title) || ActiveTarget.tooLong(action))
			{
				return "invalid skill step";
			}
			if (methodType == null || !methodType.matches("QUEST|GATHER|CRAFT|COMBAT|MINIGAME"))
			{
				return "invalid skill step type";
			}
			if (fromLevel < 1 || targetLevel > 99 || fromLevel >= targetLevel)
			{
				return "invalid skill level range";
			}
			return location == null ? "skill step without a place" : location.problem();
		}
	}

	@Data
	public static class Location
	{
		private String name;
		private int x;
		private int y;
		private int plane;
		/** The object or NPC to highlight: an id when the app knows one, otherwise the name (a tree or a rock has many ids). */
		private Integer objectId;
		private Integer npcId;
		private String objectName;
		private String npcName;

		String problem()
		{
			if (name == null || name.trim().isEmpty() || ActiveTarget.tooLong(name) || ActiveTarget.tooLong(objectName) || ActiveTarget.tooLong(npcName))
			{
				return "invalid skill place";
			}
			if (x <= 0 || y <= 0 || x >= NavTarget.MAX_COORD || y >= NavTarget.MAX_COORD || plane < 0 || plane > 3)
			{
				return "invalid skill tile";
			}
			if ((objectId != null && (objectId < 1 || objectId > 1_000_000)) || (npcId != null && (npcId < 1 || npcId > 1_000_000)))
			{
				return "invalid skill object or NPC id";
			}
			return null;
		}
	}

	String prepare()
	{
		if (skill == null || skillEnum() == null)
		{
			return "unknown skill";
		}
		if (steps == null || steps.isEmpty() || steps.size() > MAX_STEPS)
		{
			return "invalid skill path";
		}
		int previous = 0;
		for (Step s : steps)
		{
			if (s == null)
			{
				return "invalid skill step";
			}
			String bad = s.problem();
			if (bad != null)
			{
				return bad;
			}
			// The brackets follow each other: a path that goes back would make the cursor jump.
			if (s.targetLevel <= previous)
			{
				return "skill steps out of order";
			}
			previous = s.targetLevel;
		}
		return null;
	}

	/** The game's skill, or null for a name the game does not have. */
	Skill skillEnum()
	{
		if (skill == null)
		{
			return null;
		}
		try
		{
			return Skill.valueOf(skill.toUpperCase(Locale.ROOT));
		}
		catch (IllegalArgumentException e)
		{
			return null;
		}
	}

	/** The step the player is on: the first whose target level is above the real level; steps.size() when the whole path is done. */
	int indexFor(int level)
	{
		for (int i = 0; i < steps.size(); i++)
		{
			if (steps.get(i).getTargetLevel() > level)
			{
				return i;
			}
		}
		return steps.size();
	}

	/** The HUD chip: "🎯 Iron ore (powermining) (Lvl 15 → 45)". */
	static String chip(Step s)
	{
		return "🎯 " + s.getTitle().replaceAll("\\s*\\(XP skip\\)\\s*$", "") + " (Lvl " + s.getFromLevel() + " → " + s.getTargetLevel() + ")";
	}

	/** The target the plugin applies for step i: the same thing the app sends for a route step, so the arrow, highlights, list and HUD need nothing new. */
	ActiveTarget targetFor(int i)
	{
		if (steps == null || i < 0 || i >= steps.size())
		{
			return null;
		}
		Step s = steps.get(i);
		Location l = s.getLocation();
		ActiveTarget t = new ActiveTarget();
		t.setStepId(String.format(Locale.ROOT, "%s%02d", ID_PREFIX, i + 1));
		t.setTitle(s.getTitle());
		t.setGoal(chip(s));
		ActiveTarget.WorldPointDto p = new ActiveTarget.WorldPointDto();
		p.setX(l.getX());
		p.setY(l.getY());
		p.setPlane(l.getPlane());
		p.setLabel(l.getName());
		t.setWorldPoint(p);
		t.setNpcNames(l.getNpcName() == null ? Collections.emptyList() : Collections.singletonList(l.getNpcName()));
		t.setNpcIds(l.getNpcId() == null ? Collections.emptyList() : Collections.singletonList(l.getNpcId()));
		t.setObjectNames(l.getObjectName() == null ? Collections.emptyList() : Collections.singletonList(l.getObjectName()));
		t.setObjectIds(l.getObjectId() == null ? Collections.emptyList() : Collections.singletonList(l.getObjectId()));
		ActiveTarget.Guide g = new ActiveTarget.Guide();
		ActiveTarget.GuidePlace gp = new ActiveTarget.GuidePlace();
		gp.setX(l.getX());
		gp.setY(l.getY());
		gp.setPlane(l.getPlane());
		gp.setLabel(l.getName());
		gp.setNpc(l.getNpcName());
		g.setPlaces(Collections.singletonList(gp));
		g.setItems(new ArrayList<>());
		g.setSteps(s.getAction() == null || s.getAction().isEmpty() ? Collections.emptyList() : Collections.singletonList(s.getAction()));
		t.setGuide(g);
		return t;
	}
}
