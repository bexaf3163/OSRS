package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Запасное сокращение строки шага, когда программа не прислала короткий текст: те же правила, что в src/lib/shortText.ts. */
public class ShortTextTest
{
	@Test
	public void диалогВКонцеОтбрасывается()
	{
		assertEquals("Поговори с Reldo в библиотеке дворца Varrock",
			ShortText.of("Поговори с Reldo в библиотеке дворца Varrock. Диалог: «What do you know about the Imcando dwarves?»."));
	}

	@Test
	public void берётсяПервоеПредложение()
	{
		assertEquals("Возьми Egg на ферме севернее Lumbridge", ShortText.of("Возьми Egg на ферме севернее Lumbridge. Яйцо лежит у курятника, их там много."));
	}

	@Test
	public void короткоеНеМеняется_точкаВКонцеУбирается()
	{
		assertEquals("Дёрни Hopper controls", ShortText.of("Дёрни Hopper controls."));
		assertEquals("Иди", ShortText.of("Иди"));
	}

	@Test
	public void длинноеРежетсяПоТиреИлиЗапятойИлиСловуСМноготочием()
	{
		String byDash = ShortText.of("Поговори с Thurgo у его дома южнее Port Sarim — он ждёт тебя там уже давно и всё расскажет подробно");
		assertEquals("Поговори с Thurgo у его дома южнее Port Sarim", byDash);
		String byComma = ShortText.of("Поднимись на второй этаж замка Falador, потом иди на запад и ищи нужный шкаф в дальней комнате");
		assertEquals("Поднимись на второй этаж замка Falador", byComma);
		String byWord = ShortText.of("Поднимисьнавторойэтажзамкаfaladorпотомидинзападищинужныйшкафвдальнейкомнате и ещё что-то");
		assertTrue(byWord, byWord.endsWith("…") && byWord.length() <= ShortText.MAX);
	}

	@Test
	public void неБольшеПредела_ипустоеБезПадения()
	{
		for (String s : new String[] {"А".repeat(300), "Слово ".repeat(80), "x"})
		{
			assertTrue(s.length() > 0 && ShortText.of(s).length() <= ShortText.MAX);
		}
		assertEquals("", ShortText.of(null));
		assertFalse(ShortText.of("   ").contains("null"));
	}

	@Test
	public void готовыйКороткийТекстШагаГлавнее_апустойПадаетНаСокращение()
	{
		ActiveTarget.StageLine l = new ActiveTarget.StageLine();
		l.setT("Отнеси меч оруженосцу (Squire) — квест пройден. Диалог: «x».");
		assertEquals("Отнеси меч оруженосцу (Squire) — квест пройден", l.shown());
		l.setS("Отнеси меч Squire");
		assertEquals("Отнеси меч Squire", l.shown());
		l.setS("  ");
		assertEquals("Отнеси меч оруженосцу (Squire) — квест пройден", l.shown());
	}
}
