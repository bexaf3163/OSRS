package com.osrspath.bridge;

/**
 * Одна короткая строка вместо абзаца для экрана игры: игре нужно «что сделать сейчас», подробности остаются в программе и
 * в подсказке при наведении. Программа присылает готовый короткий текст шага (поле s); эта запись — на случай, когда его
 * нет (программа старше плагина). Правила те же, что в программе (src/lib/shortText.ts):
 *  1) «Диалог: …» в конце отбрасывается — нужный вариант ответа подсвечивает сама игра;
 *  2) берётся первое предложение;
 *  3) длиннее предела — режется по « — » или запятой, иначе по слову, с многоточием.
 */
final class ShortText
{
	/** Столько помещается в строку списка. */
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
		int dialog = t.indexOf("Диалог:");
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
