package com.osrspath.bridge;

import java.util.List;

/**
 * The food line of the training plate (2.57.0): while fighting on a combat step, the bag's food and about how many kills it lasts, from the
 * app's estimate of the health a kill costs (pacing.foodHpPerKill). Nearly out, it becomes a red alert: running dry mid-fight is the danger,
 * not a missing item at the bank. Without RuneLite: a pure calculation, checked by an ordinary test.
 */
final class TrainingFood
{
	/** This many pieces or fewer: the line turns into an alert. */
	static final int LOW = 2;

	private TrainingFood()
	{
	}

	/** The step's food: the first checklist row with healing; null — the step asks for no food. */
	static Checklist.Row foodRow(List<Checklist.Row> rows)
	{
		for (Checklist.Row r : rows)
		{
			if (r.getHeals() != null && r.getHeals() > 0)
			{
				return r;
			}
		}
		return null;
	}

	/** "Food: 8 Salmon · ~24 kills"; without an estimate "Food: 8 Salmon"; none left "No Salmon left - bank now". */
	static String line(String name, int pieces, Integer heals, Double hpPerKill)
	{
		if (pieces <= 0)
		{
			return "No " + name + " left - bank now";
		}
		String kills = heals != null && hpPerKill != null && hpPerKill > 0
			? " · ~" + (int) Math.floor(pieces * heals / hpPerKill) + " kills"
			: "";
		return "Food: " + pieces + " " + name + kills + (low(pieces) ? " - bank soon" : "");
	}

	static boolean low(int pieces)
	{
		return pieces <= LOW;
	}
}
