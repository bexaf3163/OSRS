package com.osrspath.bridge;

import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

/**
 * Каждый этап каждого квеста — на настоящих данных программы (active-steps.json) — проходится «живым игроком»: приходит
 * к шагу, берёт предмет шага, сдаёт предмет шага. Курсор обязан дойти до последнего шага без единого пропуска и без
 * тупика: либо шаг определяется по игре (место, предмет), либо у него есть кнопка «сделано». Когда вперёд по клику
 * закрыли для всех, кроме шагов подряд на одном месте, именно этот тест следит, что ни один этап не застрянет.
 */
public class QuestStageWalkTest
{
	private static ItemCounts bagOf(java.util.Map<String, Integer> items)
	{
		ItemCounts b = new ItemCounts();
		int id = 1;
		for (java.util.Map.Entry<String, Integer> e : items.entrySet())
		{
			b.add(id++, e.getKey(), e.getValue());
		}
		return b;
	}

	/** Игрок идёт по шагам: у шага с has берёт предмет, у шага с need приносит его и отдаёт. Возвращает, где застрял, или null. */
	static String walk(String name, int stage, List<ActiveTarget.StageLine> lines)
	{
		StageTracker t = new StageTracker();
		java.util.Map<String, Integer> items = new java.util.HashMap<>();
		ItemCounts bag = bagOf(items);
		int x = 3200;
		int y = 3200;
		int plane = 0;
		t.update(name, stage, lines, x, y, plane, bag);
		for (int i = 0; i < lines.size(); i++)
		{
			ActiveTarget.StageLine l = lines.get(i);
			if (l.hasPoint())
			{
				x = l.getX();
				y = l.getY();
				plane = l.getPlane();
			}
			if (l.hasHas())
			{
				items.put(ActiveTarget.nameKey(l.getHas()), 1);
			}
			if (l.hasNeed())
			{
				items.put(ActiveTarget.nameKey(l.getNeed()), 1);
			}
			bag = bagOf(items);
			t.update(name, stage, lines, x, y, plane, bag);
			// Что игра сама не показывает — по кнопке «сделано», пока курсор не дойдёт до этого шага.
			int guard = 0;
			while (t.cursor() < i && guard++ < lines.size())
			{
				if (!t.forward(lines))
				{
					return "тупик перед шагом " + (i + 1) + "/" + lines.size() + " «" + l.shown() + "»: курсор на " + (t.cursor() + 1)
						+ " «" + lines.get(t.cursor()).shown() + "», кнопки «сделано» нет";
				}
				t.update(name, stage, lines, x, y, plane, bag);
			}
			if (t.cursor() < i)
			{
				return "курсор не дошёл до шага " + (i + 1) + " «" + l.shown() + "»";
			}
			if (l.hasNeed())
			{
				// Сдал: предмет ушёл рядом с точкой шага.
				items.remove(ActiveTarget.nameKey(l.getNeed()));
				bag = bagOf(items);
				t.update(name, stage, lines, x, y, plane, bag);
				if (i < lines.size() - 1 && t.cursor() <= i && l.hasPoint())
				{
					return "после сдачи «" + l.getNeed() + "» курсор остался на шаге " + (i + 1) + " «" + l.shown() + "»";
				}
			}
		}
		return null;
	}

	@Test
	public void вКаждомЭтапеКурсорДоходитДоКонцаБезТупиков()
	{
		List<String> bad = new ArrayList<>();
		int stages = 0;
		int manual = 0;
		int lines = 0;
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			ActiveTarget.Stage st = s.target.getGuide() == null ? null : s.target.getGuide().getStage();
			if (st == null)
			{
				continue;
			}
			for (int idx = 0; idx < st.getStages().size(); idx++)
			{
				List<ActiveTarget.StageLine> l = st.getStages().get(idx).getSteps();
				stages++;
				lines += l.size();
				for (int i = 0; i < l.size(); i++)
				{
					if (StageTracker.needsManualStep(l, i))
					{
						manual++;
					}
				}
				String problem = walk(s.target.getStepId(), idx, l);
				if (problem != null)
				{
					bad.add(s.target.getStepId() + " этап " + (idx + 1) + ": " + problem);
				}
			}
		}
		assertTrue("этапов мало: " + stages, stages > 100);
		System.out.println("Этапов " + stages + ", шагов " + lines + ", из них только вручную (подряд на одном месте): " + manual);
		assertTrue("этапы с тупиком (" + bad.size() + "):\n" + String.join("\n", bad.subList(0, Math.min(25, bad.size()))), bad.isEmpty());
	}
}
