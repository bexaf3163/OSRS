package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

/**
 * Машина Quest Helper на настоящих данных S2-09 (Pirate's Treasure): игрок проходит контрабанду рома, а сообщения, диалоги и предметы
 * приходят так, как их видит плагин. Поводом стал живой сеанс: игрок положил ром, наполнил ящик бананами и поговорил с Luthas
 * («Luthas hands you 30 coins.»), а список остался на «Скажи Luthas, что ящик заполнен»: по месту и предметам этого не увидеть,
 * Quest Helper же видит это по строке чата.
 */
public class QhScenarioTest
{
	private static final int RUM = 431;
	private static final int WHITE_APRON = 1005;

	private static List<ActiveTarget.StageLine> lines()
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if ("S2-09".equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target.getGuide().getStage().getStages().get(1).getSteps();
			}
		}
		throw new AssertionError("нет этапа S2-09#1");
	}

	private static QhMachine machine()
	{
		QhMachine m = QhMachine.all().get("S2-09");
		assertNotNull("нет машины S2-09", m);
		return m;
	}

	/** Строка списка (с единицы), которую выбрала машина; 0 — машина не решает или решила «по умолчанию». */
	private static int pick(QhMachine.Session session, QhFakeGame game)
	{
		QhMachine m = machine();
		QhMachine.Verdict v = m.resolve(1, game, session);
		if (v.isUndecided() || !v.isStrong())
		{
			return 0;
		}
		return m.lineFor(v, lines()) + 1;
	}

	@Test
	public void всеСтрокиЭтапаИмеютКлючШагаQuestHelper()
	{
		List<ActiveTarget.StageLine> lines = lines();
		assertEquals(10, lines.size());
		String[] keys = {"smuggleRum.goToKaramja", "smuggleRum.talkToZambo", "smuggleRum.talkToLuthas", "smuggleRum.addRumToCrate",
			"smuggleRum.addBananasToCrate", "smuggleRum.talkToLuthasAgain", "smuggleRum.talkToCustomsOfficer", "smuggleRum.getWhiteApron",
			"smuggleRum.getRumFromCrate", "smuggleRum.bringRumToRedbeard"};
		for (int i = 0; i < keys.length; i++)
		{
			assertEquals("ключ строки " + (i + 1) + " «" + lines.get(i).shown() + "»", keys[i], lines.get(i).getK());
		}
	}

	@Test
	public void контрабандаРома_отПричалаДоДоставки_каждаяСтрокаВоВремя()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame();
		// Поговорил с Redbeard Frank: «Ok, I will bring you some rum.» Стоит на причале Port Sarim.
		g.say("Redbeard Frank", "Ok, I will bring you some rum.");
		assertEquals("к лодке — первая строка", 1, pick(s, g));
		// Приплыл на Karamja: с ромом ещё нет, к Zembo.
		g.at(2955, 3146);
		assertEquals("на Karamja без рома — «купи ром у Zembo»", 2, pick(s, g));
		// Купил ром.
		g.give(RUM, 1);
		assertEquals("ром куплен — «нарви бананы, поговори с Luthas»", 3, pick(s, g));
		// Luthas взял на работу и предложил наполнить ящик.
		g.at(2938, 3154).say("Luthas", "If you could fill it up with bananas, I'll pay you 30 gold.");
		assertEquals("взят на работу, ром с собой — «положи ром в ящик»", 4, pick(s, g));
		// Положил ром в ящик: ром ушёл из сумки, игра написала в окне сообщения.
		g.take(RUM).mes("You stash the rum in the crate.");
		assertEquals("ром в ящике — «заполни ящик бананами»", 5, pick(s, g));
		// Наполнил ящик.
		g.mes("You fill the crate with bananas.");
		assertEquals("ящик полон — «скажи Luthas»", 6, pick(s, g));
		// Сказал Luthas — вот случай из живой игры: список обязан сдвинуться сразу, а не когда игрок дойдёт до Customs officer.
		g.chat("Luthas hands you 30 coins.");
		assertEquals("Luthas заплатил — «вернись в Port Sarim, заплати Customs officer»", 7, pick(s, g));
		// Вернулся в Port Sarim.
		g.at(3020, 3230);
		assertEquals("в Port Sarim — «возьми White apron»", 8, pick(s, g));
		g.give(WHITE_APRON, 1);
		assertEquals("фартук взят — «ром в ящике подсобки Wydin»", 9, pick(s, g));
		g.give(RUM, 1);
		assertEquals("ром достали из ящика — «отнеси Redbeard Frank»", 10, pick(s, g));
	}

	@Test
	public void сообщениеЗабытоПослеВыходаВИгру_шагВозвращаетсяПоДневнику()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame().at(2938, 3154).give(RUM, 1);
		// Плагин только что запустили: ни одного сообщения, защёлки пусты — машина не может ничего утверждать.
		assertEquals("нет доказательств — решает прежняя логика", 0, pick(s, g));
		// Игрок открыл дневник квеста: Quest Helper сверяет шаг именно по нему.
		g.journal("Pirate's Treasure", "I have taken employment on Luthas's banana plantation.");
		assertEquals("дневник: «I have taken employment» + ром с собой — «положи ром в ящик»", 4, pick(s, g));
		// Дневник закрыли: защёлка осталась, шаг держится.
		g.closeJournal();
		assertEquals("дневник закрыт — шаг держится по защёлке", 4, pick(s, g));
	}

	@Test
	public void защёлкиЖивутДоСбросаСеанса()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame().at(2955, 3146);
		g.say("Redbeard Frank", "Ok, I will bring you some rum.");
		assertEquals(2, pick(s, g));
		g.events.clear();
		assertEquals("сообщение забыто, защёлка помнит", 2, pick(s, g));
		s.reset();
		assertEquals("после сброса (другой квест, выход из игры) — доказательств нет", 0, pick(s, g));
	}

	@Test
	public void чужаяСтрокаВЧатеШагНеДвигает()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame().at(2955, 3146);
		g.say("Redbeard Frank", "Ok, I will bring you some rum.");
		g.chat("You eat the banana.").chat("Luthas hands you 30 coins");
		assertEquals("без точки в конце и без ящика — это не то сообщение", 2, pick(s, g));
	}

	@Test
	public void цветныеТегиВСообщенииНеМешают()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame().at(2938, 3154);
		g.say("Redbeard Frank", "Ok, I will bring you some rum.");
		g.mes("<col=0000ff>You stash the rum in the crate.</col>");
		g.mes("You fill the crate with bananas.");
		g.chat("<col=ff0000>Luthas hands you 30 coins.</col>");
		assertEquals(7, pick(s, g));
	}

	@Test
	public void этапБезУсловий_нетСильногоВыбора()
	{
		// var 0: единственный шаг «поговори с Redbeard» без условий — выбор по умолчанию, значит решает прежняя логика.
		QhMachine m = machine();
		QhMachine.Verdict v = m.resolve(0, new QhFakeGame(), new QhMachine.Session());
		assertFalse(v.isUndecided());
		assertFalse("шаг без условия — не доказательство", v.isStrong());
		assertEquals("speakToRedbeard", v.getLeaf());
	}

	@Test
	public void неизвестноеУсловие_машинаНеРешает()
	{
		// var 3: первое условие — стрелка на NPC (Quest Helper читает её у клиента), у плагина этого нет: «не знаю» ≠ «нет».
		QhMachine.Verdict v = machine().resolve(3, new QhFakeGame(), new QhMachine.Session());
		assertTrue("условие «NpcHintArrow» плагин проверить не может", v.isUndecided());
	}

	@Test
	public void значенияБезШагаУQuestHelper_неРешаются()
	{
		assertFalse(machine().hasStage(7));
		assertTrue(machine().resolve(7, new QhFakeGame(), new QhMachine.Session()).isUndecided());
	}
}
