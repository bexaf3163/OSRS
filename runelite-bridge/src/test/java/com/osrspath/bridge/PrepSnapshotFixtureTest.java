package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * Снимки ровно такими, какими их шлёт программа на /prep-plan (prep-snapshots.json пишет тест программы
 * tests/prepEnvelope.test.ts): плагин принимает каждую часть, а список «Что нужно» рисует план без падений. Пересказать
 * формат здесь вручную значит рано или поздно разойтись с программой — поэтому берём её собственный вывод.
 */
public class PrepSnapshotFixtureTest
{
	private static final Gson GSON = new Gson();
	private static final java.awt.FontMetrics FM = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_ARGB).createGraphics()
		.getFontMetrics(OverlayText.font(net.runelite.client.ui.FontManager.getRunescapeFont(), 1f));

	private static List<JsonObject> rows()
	{
		JsonArray rows = GSON.fromJson(new InputStreamReader(PrepSnapshotFixtureTest.class.getResourceAsStream("/prep-snapshots.json"), StandardCharsets.UTF_8), JsonArray.class);
		List<JsonObject> out = new ArrayList<>();
		for (JsonElement e : rows)
		{
			out.add(e.getAsJsonObject());
		}
		return out;
	}

	@Test
	public void плагинПринимаетКаждыйСнимокПрограммы()
	{
		List<JsonObject> rows = rows();
		assertTrue("снимков мало: " + rows.size(), rows.size() >= 4);
		for (JsonObject row : rows)
		{
			String name = row.get("name").getAsString();
			PrepEnvelope e = GSON.fromJson(row.get("envelope"), PrepEnvelope.class);
			assertNull(name, e.versionProblem());
			Map<String, String> bad = e.prepare();
			assertTrue(name + ": части отклонены — " + bad, bad.isEmpty());
			assertTrue(name, e.getSeq() > 0);
		}
	}

	@Test
	public void планПривязанКШагуСнимка_ИРисуетсяВСписке()
	{
		for (JsonObject row : rows())
		{
			PrepEnvelope e = GSON.fromJson(row.get("envelope"), PrepEnvelope.class);
			e.prepare();
			if (e.getStep() == null)
			{
				assertNull(row.get("name").getAsString() + ": без шага плана нет", e.getPlan());
				continue;
			}
			assertNotNull(e.getPlan());
			assertEquals(e.getStep().getStepId(), e.getPlan().getStepId());
			StepGuide.View v = StepGuide.view(e.getStep(), new ItemCounts(), null, null, 0, 0, 0, new HashSet<>());
			StepGuide.View withPlan = StepGuide.withPlanFor(v, e.getPlan(), e.getStep());
			assertNotNull(withPlan.getPrep());
			List<GuideList.Row> rows = GuideList.rows(withPlan, false, FM, FM, OsrsPathGuideOverlay.WIDTH);
			assertTrue(row.get("name").getAsString(), rows.size() >= 1);
		}
	}

	@Test
	public void режимВосстановленияИзПрограммыРисуетсяСверху()
	{
		for (JsonObject row : rows())
		{
			if (!row.get("name").getAsString().contains("смерти"))
			{
				continue;
			}
			PrepEnvelope e = GSON.fromJson(row.get("envelope"), PrepEnvelope.class);
			assertNull(e.prepare().get("plan"));
			assertTrue(e.getPlan().hasRecovery());
			StepGuide.View v = StepGuide.withPlanFor(StepGuide.view(e.getStep(), new ItemCounts(), null, null, 0, 0, 0, new HashSet<>()), e.getPlan(), e.getStep());
			List<GuideList.Row> rows = GuideList.rows(v, false, FM, FM, OsrsPathGuideOverlay.WIDTH);
			StringBuilder sb = new StringBuilder();
			for (GuideList.Row r : rows)
			{
				for (GuideList.Line l : r.getLines())
				{
					sb.append(l.getLeft()).append(' ');
				}
			}
			assertTrue(sb.toString(), sb.toString().contains("Ты умер"));
			return;
		}
		throw new AssertionError("в копии снимков нет случая со смертью");
	}

	@Test
	public void самыйБольшойШагСПланомВлезаетВОграничениеСнимка()
	{
		List<ActiveStepsTest.Sent> sent = ActiveStepsTest.all();
		int biggest = 0;
		String where = "";
		for (ActiveStepsTest.Sent s : sent)
		{
			int size = GSON.toJson(s.target).getBytes(StandardCharsets.UTF_8).length;
			if (size > biggest)
			{
				biggest = size;
				where = s.name;
			}
		}
		// Шаг + закупки + план + совет: запас вдвое от самого большого шага.
		assertTrue("шаг " + where + " весит " + biggest + " байт", biggest * 2 < BridgeServer.MAX_SNAPSHOT);
	}
}
