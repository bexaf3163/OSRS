package com.osrspath.bridge;

/**
 * One short line instead of a paragraph for the game screen: the game needs "what to do now", the details stay in the app and
 * in the hover hint. The app sends a ready short text for the step (field s); this fallback is for when there is none
 * (the app is older than the plugin). The rules are the same as in the app (src/lib/shortText.ts):
 *  1) "Dialogue: ..." at the end is dropped - the game itself highlights the right answer option;
 *  2) the first sentence is taken;
 *  3) if longer than the limit, cut at " - " or a comma, otherwise at a word, with an ellipsis.
 */
final class ShortText
{
	/** This much fits in a list line. */
	static final int MAX = 64;
	private static final int MIN_CUT = 24;

	private ShortText()
	{
	}

	static String of(String text)
	{
		return of(text, MAX);
	}

	static String of(String text, int max)
	{
		if (text == null)
		{
			return "";
		}
		String t = text;
		int dialog = t.indexOf("Dialogue:");
		if (dialog >= 0)
		{
			t = t.substring(0, dialog);
		}
		t = t.trim();
		String[] sentences = t.split("(?<=[.!?])\\s+");
		if (sentences.length > 0 && sentences[0].length() >= 12)
		{
			t = sentences[0];
		}
		t = t.replaceAll("[.\\s]+$", "");
		if (t.length() <= max)
		{
			return t;
		}
		int dash = t.lastIndexOf(" — ", max);
		if (dash >= MIN_CUT)
		{
			return t.substring(0, dash);
		}
		int comma = t.lastIndexOf(", ", max);
		if (comma >= MIN_CUT)
		{
			return t.substring(0, comma);
		}
		String cut = t.substring(0, max - 1);
		return cut.substring(0, Math.max(cut.lastIndexOf(' '), MIN_CUT)) + "…";
	}
}
