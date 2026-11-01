package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import lombok.Data;
import net.runelite.api.Skill;

import static com.osrspath.bridge.ActiveTarget.MAX_LIST;
import static com.osrspath.bridge.ActiveTarget.nonNull;
import static com.osrspath.bridge.ActiveTarget.tooLong;

/** Pacing, auto-tick triggers and the levels and items a step needs, as the app sends them. Part of {@link ActiveTarget}. */
final class TargetNeeds
{
	// Pacing, auto-tick triggers and the levels and items a step needs, as the app sends them.
	/** The same as StepPacing in src/types/index.ts. */
	@Data
	public static class Pacing
	{
		/** Melee skills: their action is a defeated enemy, and XP comes for each hit. */
		static final Set<String> COMBAT = Set.of("attack", "strength", "defence");
		static final Set<String> SKILLS = Set.of("fishing", "woodcutting", "cooking", "mining", "attack", "strength", "defence");

		private String skill;
		/** More skills with the same goal, combat only: Strength and Defence after Attack. The one that is growing is shown. */
		private List<String> also;
		private int targetLevel;
		private int targetExp;
		/** The action name in forms for 1 and 2+: "shrimp|shrimps". A single form works too. */
		private String actionName;
		private double expPerAction;
		/** Seconds per action: a first estimate until there are own measurements. */
		private Double secondsPerAction;
		/**
		 * Combat skills with a goal of their own (S3-08: Strength 20, then Attack 30); a skill not named here has targetLevel / targetExp.
		 * Absent from an app before 2.55.1: every skill has the one goal.
		 */
		private Map<String, Goal> goals;
		/**
		 * Health a kill costs net of regeneration, from the app's food plan (2.57.0): the training plate turns the food in the bag into kills.
		 * Absent from an older app or without an estimate: the plate counts the food only.
		 */
		private Double foodHpPerKill;

		@Data
		public static class Goal
		{
			private int level;
			private int exp;
		}

		/** The level the skill is trained to on this step. */
		int targetLevelOf(String s)
		{
			Goal g = goals == null ? null : goals.get(s);
			return g == null ? targetLevel : g.getLevel();
		}

		/** The XP of that level. */
		int targetExpOf(String s)
		{
			Goal g = goals == null ? null : goals.get(s);
			return g == null ? targetExp : g.getExp();
		}

		/** Every skill of the step has the same goal (the usual case: Attack, Strength, Defence to 30). */
		boolean oneGoal()
		{
			for (String s : skills())
			{
				if (targetLevelOf(s) != targetLevel)
				{
					return false;
				}
			}
			return true;
		}

		/** The step's skill followed by the skills from also, in the order the step recommends training them. */
		List<String> skills()
		{
			List<String> out = new ArrayList<>();
			out.add(skill);
			for (String s : nonNull(also))
			{
				if (!out.contains(s))
				{
					out.add(s);
				}
			}
			return out;
		}

		String problem()
		{
			if (skill == null || !SKILLS.contains(skill))
			{
				return "unknown pacing skill";
			}
			if (also != null)
			{
				// Several skills with one goal happen only in combat: they are trained in turn, changing the attack style.
				if (also.size() > 2 || !COMBAT.contains(skill))
				{
					return "invalid pacing skill list";
				}
				for (String s : also)
				{
					if (s == null || !COMBAT.contains(s) || s.equals(skill))
					{
						return "invalid pacing skill list";
					}
				}
			}
			if (targetLevel < 2 || targetLevel > 99 || targetExp < 1 || targetExp > 13_034_431)
			{
				return "invalid pacing target";
			}
			if (goals != null)
			{
				if (goals.size() > 3)
				{
					return "invalid pacing target";
				}
				for (Map.Entry<String, Goal> e : goals.entrySet())
				{
					Goal g = e.getValue();
					if (!skills().contains(e.getKey()) || g == null || g.getLevel() < 2 || g.getLevel() > 99 || g.getExp() < 1 || g.getExp() > 13_034_431)
					{
						return "invalid pacing target";
					}
				}
			}
			if (!(expPerAction > 0 && expPerAction <= 10_000) || actionName == null || actionName.isEmpty() || tooLong(actionName))
			{
				return "invalid pacing action";
			}
			if (foodHpPerKill != null && !(foodHpPerKill > 0 && foodHpPerKill <= 500))
			{
				return "invalid food per kill";
			}
			if (secondsPerAction != null && !(secondsPerAction > 0 && secondsPerAction <= 600))
			{
				return "invalid action time";
			}
			return null;
		}
	}

	@Data
	public static class Trigger
	{
		private String type;
		private String questName;
		/** SKILL_LEVEL: these real levels (without potions), all at once. */
		private List<LevelNeed> levels;
		/** ITEM_OWNED: the items themselves; QUEST_COMPLETED and SKILL_LEVEL have one more condition on top. */
		private List<ItemNeed> items;
		/** ITEM_OWNED only: any one of the items is enough (2,500 coins, or 25 ore, or the scimitar itself), not all of them. */
		private boolean anyOf;
		private String chatPattern;
		private Integer varbitId;
		/** VARBIT_CHANGED with atLeast: a varp instead of a varbit (a quest variable such as Dragon Slayer's 176). Exactly one of varbitId and varpId. */
		private Integer varpId;
		/**
		 * VARBIT_CHANGED: only these bits of the variable count, and they must equal targetValue, read as a state (Dragon Slayer clears bits 11-15
		 * of varp 177 as each of the Guildmaster's five questions is asked). null means the whole value.
		 */
		private Integer bitMask;
		private Integer targetValue;
		/** VARBIT_CHANGED: the milestone counts from this value upwards (and is also read when the step is shown), not only at exactly the value. */
		private boolean atLeast;

		String problem()
		{
			if (levels != null)
			{
				if (levels.size() > MAX_LIST)
				{
					return "list too long";
				}
				for (LevelNeed l : levels)
				{
					if (l == null || skillOf(l.skill) == null || l.level < 1 || l.level > 99)
					{
						return "invalid auto-tick level";
					}
				}
			}
			if (items != null)
			{
				if (items.size() > MAX_LIST)
				{
					return "list too long";
				}
				for (ItemNeed i : items)
				{
					if (i == null || i.problem() != null)
					{
						return "invalid auto-tick item";
					}
				}
			}
			return null;
		}
	}

	/** A skill level for auto-tick: the key as in the app ("attack", "fishing") and the level. */
	@Data
	public static class LevelNeed
	{
		private String skill;
		private int level;
	}

	/**
	 * An item for auto-tick: how many of it the player must have, in the bag, worn, as notes and in the bank together.
	 * Several names are counted together ("Shrimps" and "Anchovies"). The ID is for when different items share one
	 * name (the Dragon Slayer I map pieces): then only the ID is counted.
	 */
	@Data
	public static class ItemNeed
	{
		private List<String> names;
		private Integer id;
		private int count;

		String problem()
		{
			if (names == null || names.isEmpty() || names.size() > MAX_LIST)
			{
				return "names required";
			}
			for (String n : names)
			{
				if (n == null || n.trim().isEmpty() || tooLong(n))
				{
					return "invalid name";
				}
			}
			if (id != null && (id <= 0 || id >= NavTarget.MAX_ITEM_ID))
			{
				return "invalid ID";
			}
			if (count < 1 || count > ShoppingPlan.MAX_COUNT)
			{
				return "invalid count";
			}
			return null;
		}
	}

	/** A skill by the app's key ("attack", "fishing"), the same as OsrsPathBridgePlugin.skillKey. null means there is no such skill. */
	static Skill skillOf(String key)
	{
		if (key == null)
		{
			return null;
		}
		for (Skill s : Skill.values())
		{
			if (!"OVERALL".equals(s.name()) && s.getName().toLowerCase(Locale.ROOT).equals(key))
			{
				return s;
			}
		}
		return null;
	}
}
