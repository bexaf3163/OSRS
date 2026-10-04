package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

/**
 * Переходы на настоящих данных программы: лодка, лестница, дверь. Игрок побывал у точки шага-перехода и оказался далеко от неё
 * (поплыл, телепортировался, спустился) — шаг сделан, стрелка ведёт к следующему. Поводом стал S2-09 из живой игры: после
 * «Seaman на пристани: плыви на Musa Point» курсор оставался на «плыви», стрелка вела обратно в Port Sarim, и игрок плавал туда-сюда.
 * Тесты на выдуманных строках («Войди…») это пропустили: в настоящих данных перед глаголом стоит название места.
 */
public class StageTravelTest
{
	private static List<ActiveTarget.StageLine> stage(String stepId, int idx)
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (stepId.equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target.getGuide().getStage().getStages().get(idx).getSteps();
			}
		}
		throw new AssertionError("нет этапа " + stepId + "#" + idx);
	}

	private static int at(StageTracker t, String id, int idx, List<ActiveTarget.StageLine> lines, int x, int y)
	{
		return t.update(id, idx, lines, x, y, 0, new ItemCounts());
	}

	@Test
	public void s209_приплылНаMusaPoint_курсорНаЗембо_аНеНазадНаПричал()
	{
		List<ActiveTarget.StageLine> lines = stage("S2-09", 1);
		assertTrue("шаг «плыви» — переход: " + lines.get(0).shown(), StageTracker.isMove(lines.get(0)));
		StageTracker t = new StageTracker();
		assertEquals("далеко от причала — первый шаг", 0, at(t, "S2-09", 1, lines, 3040, 3235));
		assertEquals("на причале, поговорил с моряком — первый шаг", 0, at(t, "S2-09", 1, lines, 3028, 3220));
		// Лодка: за один тик — на Karamja, к Musa Point (там же точка шага «Вернись в Port Sarim» — до неё курсор не доходит).
		assertEquals("приплыл — «купи ром у Zembo»", 1, at(t, "S2-09", 1, lines, 2956, 3146));
		assertTrue(t.reason(), t.reason().startsWith("LEFT"));
		for (int i = 0; i < 100; i++)
		{
			assertEquals("на берегу курсор не возвращается к лодке", 1, at(t, "S2-09", 1, lines, 2954 + i % 3, 3150));
		}
	}

	/** Живая игра: пробегая в семи клетках от Zembo и в восьми от Luthas, игрок «побывал» у обоих, и курсор прыгнул на «положи ром в ящик». */
	@Test
	public void s209_пробежалМимоZemboИLuthas_шагиНеПерепрыгнуты()
	{
		List<ActiveTarget.StageLine> lines = stage("S2-09", 1);
		StageTracker t = new StageTracker();
		at(t, "S2-09", 1, lines, 3040, 3235);
		at(t, "S2-09", 1, lines, 3028, 3220);
		assertEquals("приплыл — «купи ром»", 1, at(t, "S2-09", 1, lines, 2956, 3146));
		assertEquals("в 13 клетках от Zembo — ещё «купи ром»", 1, at(t, "S2-09", 1, lines, 2942, 3146));
		assertEquals("в семи от Zembo, мимо — ром не куплен, курсор на нём", 1, at(t, "S2-09", 1, lines, 2936, 3146));
		assertTrue(t.reason(), t.reason().startsWith("BLOCK"));
		assertEquals("зашёл к Zembo — шаг на месте, ждёт покупки", 1, at(t, "S2-09", 1, lines, 2930, 3145));
		assertEquals("ром не куплен, к Luthas — курсор остаётся на «купи ром»", 1, at(t, "S2-09", 1, lines, 2938, 3154));
		ItemCounts rum = new ItemCounts();
		rum.add(431, ActiveTarget.nameKey("Karamjan rum"), 1);
		assertEquals("ром куплен — «нарви бананы, поговори с Luthas»", 2, t.update("S2-09", 1, lines, 2938, 3154, 0, rum));
		// Положил ром в ящик (ром ушёл из сумки у ящика) — шаг сдан сам, кнопка «сделано» не нужна.
		assertEquals("у ящика с ромом в сумке — «положи ром в ящик»", 3, t.update("S2-09", 1, lines, 2939, 3149, 0, rum));
		assertEquals("ром лежит в ящике — «заполни ящик»", 4, t.update("S2-09", 1, lines, 2939, 3149, 0, new ItemCounts()));
	}

	@Test
	public void s208_подготовилсяИВошёлВДом_стрелкаНаПодвалСразу()
	{
		List<ActiveTarget.StageLine> lines = stage("S2-08", 2);
		ActiveTarget.StageLine door = lines.get(2);
		assertTrue("«Подготовься к бою и войди…» — переход: " + door.shown(), StageTracker.isMove(door));
		// Начинаем с этого шага: до него игрок уже сходил в бар и отдал пиво.
		List<ActiveTarget.StageLine> from = lines.subList(2, lines.size());
		StageTracker t = new StageTracker();
		assertEquals(0, at(t, "S2-08", 2, from, 3110, 3329));
		assertEquals(0, at(t, "S2-08", 2, from, door.getX(), door.getY() - 1));
		assertEquals("в доме, до подвала далеко — шаг «войди» сделан", 1, at(t, "S2-08", 2, from, door.getX() - 6, door.getY() + 7));
	}

	/** Для каждого шага-перехода настоящих данных: побывал у точки, оказался у следующей (но чуть в стороне) — курсор ушёл вперёд. */
	@Test
	public void всякийПереходЗакрываетсяКогдаИгрокОказалсяУСледующегоШага()
	{
		int checked = 0;
		List<String> bad = new ArrayList<>();
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			ActiveTarget.Stage st = s.target.getGuide() == null ? null : s.target.getGuide().getStage();
			if (st == null)
			{
				continue;
			}
			for (int idx = 0; idx < st.getStages().size(); idx++)
			{
				List<ActiveTarget.StageLine> lines = st.getStages().get(idx).getSteps();
				for (int i = 0; i < lines.size() - 1; i++)
				{
					ActiveTarget.StageLine cur = lines.get(i);
					ActiveTarget.StageLine nx = lines.get(i + 1);
					if (!StageTracker.isMove(cur) || !cur.hasPoint() || !nx.hasPoint() || cur.getPlane() != nx.getPlane() || cur.hasNeed() || cur.hasHas())
					{
						continue;
					}
					int d = Math.max(Math.abs(cur.getX() - nx.getX()), Math.abs(cur.getY() - nx.getY()));
					if (d < 40)
					{
						continue;
					}
					checked++;
					List<ActiveTarget.StageLine> from = lines.subList(i, lines.size());
					StageTracker t = new StageTracker();
					String id = s.target.getStepId();
					t.update(id, idx, from, cur.getX() + 60, cur.getY() + 60, cur.getPlane(), new ItemCounts());
					t.update(id, idx, from, cur.getX(), cur.getY(), cur.getPlane(), new ItemCounts());
					int c = t.update(id, idx, from, nx.getX() + 12, nx.getY(), nx.getPlane(), new ItemCounts());
					if (c < 1)
					{
						bad.add(id + " этап " + (idx + 1) + " шаг " + (i + 1) + " «" + cur.shown() + "» → «" + nx.shown() + "»: курсор " + (c + 1));
					}
				}
			}
		}
		assertTrue("мало переходов проверено: " + checked, checked >= 20);
		assertFalse("переходы, которые не закрылись (" + bad.size() + "):\n" + String.join("\n", bad), !bad.isEmpty());
	}
}
