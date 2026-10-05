package com.osrspath.bridge;

/**
 * Delrith's incantation in Demon Slayer: the five words are the same for everyone, the ORDER is random per account and lives in five varbits
 * (values 0..4 = the word). Like Quest Helper, the first two varbits both at 0 mean the player has not been told yet.
 */
final class Incantation
{
	/** The varbits that hold the order: DELRITH_INCANTATION_1..5. */
	static final int[] VARBITS = {2562, 2563, 2564, 2565, 2566};
	private static final String[] WORDS = {"Carlem", "Aber", "Camerinthum", "Purchai", "Gabindo"};

	private Incantation()
	{
	}

	/** "Carlem, Aber, ..." in the order to say them, or null while the order is not known (or a value is out of range). */
	static String order(int[] values)
	{
		if (values == null || values.length != VARBITS.length || (values[0] == 0 && values[1] == 0))
		{
			return null;
		}
		StringBuilder sb = new StringBuilder();
		for (int v : values)
		{
			if (v < 0 || v >= WORDS.length)
			{
				return null;
			}
			sb.append(sb.length() == 0 ? "" : ", ").append(WORDS[v]);
		}
		return sb.toString();
	}
}
