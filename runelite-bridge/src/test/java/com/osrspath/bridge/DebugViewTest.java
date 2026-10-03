package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import net.runelite.client.ui.FontManager;
import org.junit.Test;

/** Плашка разработчика: строки состояния движка, зелёное — в порядке, красное — не так. */
public class DebugViewTest
{
	private static DebugView.State state(String step, List<String> conditions, List<String> trigger, String warning, boolean peeking, boolean manual)
	{
		return new DebugView.State(step, step == null ? null : "3/9", step == null ? null : 5, 1, 5, "Добудь руду", manual, peeking, warning, conditions, trigger, 1,
			"seq 12, 3 с назад", 80, "POSITION: дошёл", "12/28", "3200,3200,0", 4242, true, true, true, "session-1.jsonl", 17, 0, Collections.emptyList(), null);
	}

	private static List<DebugView.Row> rows(DebugView.State s)
	{
		return DebugView.rows(s);
	}

	@Test
	public void первыйРядСодержитШагЭтапКурсорИРежим()
	{
		String head = rows(state("S2-05", Collections.emptyList(), Collections.emptyList(), null, false, false)).get(0).getText();
		assertTrue(head, head.startsWith("ActiveStep: S2-05 | Stage: 3/9 (var=5) | Cursor: 2/5 [auto]"));
		assertTrue(rows(state("S2-05", Collections.emptyList(), Collections.emptyList(), null, false, true)).get(0).getText().endsWith("[manual-only]"));
		assertTrue(rows(state("S2-05", Collections.emptyList(), Collections.emptyList(), null, true, false)).get(0).getText().endsWith("[peek]"));
	}

	@Test
	public void шагаНетКрасным()
	{
		DebugView.Row head = rows(state(null, Collections.emptyList(), Collections.emptyList(), null, false, false)).get(0);
		assertEquals("ActiveStep: —", head.getText());
		assertEquals(DebugView.Level.BAD, head.getLevel());
	}

	@Test
	public void условиеFALSEКрасное_TRUEЗелёное()
	{
		List<DebugView.Row> r = rows(state("S2-07", Arrays.asList("has Iron ore = FALSE", "need Bronze bar (сдан) = TRUE"), Collections.singletonList("Item(1535) = FALSE"), null, false, false));
		DebugView.Row has = r.stream().filter(x -> x.getText().contains("has Iron ore")).findFirst().get();
		DebugView.Row need = r.stream().filter(x -> x.getText().contains("need Bronze bar")).findFirst().get();
		assertEquals(DebugView.Level.BAD, has.getLevel());
		assertEquals(DebugView.Level.GOOD, need.getLevel());
		DebugView.Row trig = r.stream().filter(x -> x.getText().startsWith("Trigger:")).findFirst().get();
		assertEquals("Trigger: Item(1535) = FALSE | QueueDepth: 1", trig.getText());
		assertEquals(DebugView.Level.BAD, trig.getLevel());
	}

	@Test
	public void триггерВыполненЗелёный_нетТриггераСерый()
	{
		DebugView.Row ok = rows(state("S1", Collections.emptyList(), Collections.singletonList("Quest(Cook's Assistant) = TRUE"), null, false, false)).stream()
			.filter(x -> x.getText().startsWith("Trigger:")).findFirst().get();
		assertEquals(DebugView.Level.GOOD, ok.getLevel());
		DebugView.Row none = rows(state("S1", Collections.emptyList(), Collections.emptyList(), null, false, false)).stream()
			.filter(x -> x.getText().startsWith("Trigger:")).findFirst().get();
		assertEquals("Trigger: — | QueueDepth: 1", none.getText());
		assertEquals(DebugView.Level.INFO, none.getLevel());
	}

	@Test
	public void предупреждениеКрасит_шапкуИДобавляетСтроку()
	{
		List<DebugView.Row> r = rows(state("S2-08", Collections.emptyList(), Collections.emptyList(), "Bronze bar ещё в сумке", false, false));
		assertEquals(DebugView.Level.BAD, r.get(0).getLevel());
		assertTrue(r.stream().anyMatch(x -> x.getText().equals("Warning: Bronze bar ещё в сумке") && x.getLevel() == DebugView.Level.BAD));
	}

	@Test
	public void пустойЭкранПриШагеКрасный_иСтранностиВидны()
	{
		DebugView.State s = new DebugView.State("S2-07", "1/3", 1, 0, 3, "x", false, false, null, Collections.emptyList(), Collections.emptyList(), -1, null, null, "", "0/28", "1,1,0", 1,
			false, false, false, null, 0, 2, Arrays.asList("EMPTY: на экране пусто", "STUCK: стоит"), "shot-1.png");
		List<DebugView.Row> r = rows(s);
		DebugView.Row screen = r.stream().filter(x -> x.getText().startsWith("Screen:")).findFirst().get();
		assertEquals("Screen: HUD НЕТ, list НЕТ", screen.getText());
		assertEquals(DebugView.Level.BAD, screen.getLevel());
		assertEquals(2, r.stream().filter(x -> x.getText().startsWith("⚠ ")).count());
		assertTrue(r.stream().anyMatch(x -> x.getText().startsWith("Log: выключен")));
		assertTrue(r.stream().anyMatch(x -> x.getText().equals("Shot: shot-1.png")));
		assertTrue(r.stream().anyMatch(x -> x.getText().equals("Snapshot: нет") && x.getLevel() == DebugView.Level.WARN));
	}

	@Test
	public void безСнимкаСкриншотаНетСтроки()
	{
		assertFalse(rows(state("S1", Collections.emptyList(), Collections.emptyList(), null, false, false)).stream().anyMatch(x -> x.getText().startsWith("Shot:")));
	}

	@Test
	public void текстДляЖурналаИСкриншотаСобираетсяПостроково()
	{
		String plain = DebugView.plain(rows(state("S2-05", Collections.singletonList("has Iron ore = FALSE"), Collections.singletonList("Item(1535) = FALSE"), null, false, false)));
		assertTrue(plain.startsWith("ActiveStep: S2-05"));
		assertTrue(plain.contains("\n  has Iron ore = FALSE\n"));
		assertTrue(plain.contains("Trigger: Item(1535) = FALSE | QueueDepth: 1"));
	}

	@Test
	public void всеЗнакиПлашкиРисуютсяШрифтомRuneLite()
	{
		// «⚠» берётся из системного шрифта, как и в списке; остальное — латиница и кириллица.
		Font f = FontManager.getRunescapeFont();
		List<String> texts = new ArrayList<>();
		for (DebugView.Row r : rows(state("S2-05", Arrays.asList("has A = TRUE"), Arrays.asList("Item(1) = FALSE"), "w", false, false)))
		{
			texts.add(r.getText().replace("⚠", ""));
		}
		for (String t : texts)
		{
			assertEquals("«" + t + "» целиком рисуется", -1, f.canDisplayUpTo(t));
		}
	}

	@Test
	public void плашкаПереноситсяПоШиринеБезОбрезки()
	{
		FontMetrics fm = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics().getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), 0.9f));
		String longest = "Why: " + "ITEM: шаги 2–4 сделаны по предметам, дальше «Принеси рыцарю меч»".repeat(3);
		for (String line : OverlayText.wrap(longest, fm, OsrsPathDebugOverlay.WIDTH - 12))
		{
			assertTrue("«" + line + "» " + fm.stringWidth(line), fm.stringWidth(line) <= OsrsPathDebugOverlay.WIDTH - 12);
		}
	}
}
