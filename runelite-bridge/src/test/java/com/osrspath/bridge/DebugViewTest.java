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

/** The developer badge: the engine status lines, green is fine, red is wrong. */
public class DebugViewTest
{
	private static DebugView.State state(String step, List<String> conditions, List<String> trigger, String warning, boolean peeking, boolean manual)
	{
		return new DebugView.State(step, step == null ? null : "3/9", step == null ? null : 5, 1, 5, "Get the ore", manual, peeking, warning, conditions, trigger, 1,
			"seq 12, 3 s ago", 80, "POSITION: arrived", "12/28", "3200,3200,0", 4242, true, true, true, "session-1.jsonl", 17, 0, Collections.emptyList(), null);
	}

	private static List<DebugView.Row> rows(DebugView.State s)
	{
		return DebugView.rows(s);
	}

	@Test
	public void firstRowHasStepStageCursorAndMode()
	{
		String head = rows(state("S2-05", Collections.emptyList(), Collections.emptyList(), null, false, false)).get(0).getText();
		assertTrue(head, head.startsWith("ActiveStep: S2-05 | Stage: 3/9 (var=5) | Cursor: 2/5 [auto]"));
		assertTrue(rows(state("S2-05", Collections.emptyList(), Collections.emptyList(), null, false, true)).get(0).getText().endsWith("[manual-only]"));
		assertTrue(rows(state("S2-05", Collections.emptyList(), Collections.emptyList(), null, true, false)).get(0).getText().endsWith("[peek]"));
	}

	@Test
	public void noStepIsRed()
	{
		DebugView.Row head = rows(state(null, Collections.emptyList(), Collections.emptyList(), null, false, false)).get(0);
		assertEquals("ActiveStep: —", head.getText());
		assertEquals(DebugView.Level.BAD, head.getLevel());
	}

	@Test
	public void conditionFALSEIsRed_TRUEIsGreen()
	{
		List<DebugView.Row> r = rows(state("S2-07", Arrays.asList("has Iron ore = FALSE", "need Bronze bar (handed in) = TRUE"), Collections.singletonList("Item(1535) = FALSE"), null, false, false));
		DebugView.Row has = r.stream().filter(x -> x.getText().contains("has Iron ore")).findFirst().get();
		DebugView.Row need = r.stream().filter(x -> x.getText().contains("need Bronze bar")).findFirst().get();
		assertEquals(DebugView.Level.BAD, has.getLevel());
		assertEquals(DebugView.Level.GOOD, need.getLevel());
		DebugView.Row trig = r.stream().filter(x -> x.getText().startsWith("Trigger:")).findFirst().get();
		assertEquals("Trigger: Item(1535) = FALSE | QueueDepth: 1", trig.getText());
		assertEquals(DebugView.Level.BAD, trig.getLevel());
	}

	@Test
	public void triggerFulfilledIsGreen_noTriggerIsGrey()
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
	public void aWarningColoursTheHeaderAndAddsALine()
	{
		List<DebugView.Row> r = rows(state("S2-08", Collections.emptyList(), Collections.emptyList(), "Bronze bar is still in the bag", false, false));
		assertEquals(DebugView.Level.BAD, r.get(0).getLevel());
		assertTrue(r.stream().anyMatch(x -> x.getText().equals("Warning: Bronze bar is still in the bag") && x.getLevel() == DebugView.Level.BAD));
	}

	@Test
	public void anEmptyScreenWithAStepIsRed_andOdditiesAreVisible()
	{
		DebugView.State s = new DebugView.State("S2-07", "1/3", 1, 0, 3, "x", false, false, null, Collections.emptyList(), Collections.emptyList(), -1, null, null, "", "0/28", "1,1,0", 1,
			false, false, false, null, 0, 2, Arrays.asList("EMPTY: nothing on screen", "STUCK: standing still"), "shot-1.png");
		List<DebugView.Row> r = rows(s);
		DebugView.Row screen = r.stream().filter(x -> x.getText().startsWith("Screen:")).findFirst().get();
		assertEquals("Screen: HUD NO, list NO", screen.getText());
		assertEquals(DebugView.Level.BAD, screen.getLevel());
		assertEquals(2, r.stream().filter(x -> x.getText().startsWith("⚠ ")).count());
		assertTrue(r.stream().anyMatch(x -> x.getText().startsWith("Log: off")));
		assertTrue(r.stream().anyMatch(x -> x.getText().equals("Shot: shot-1.png")));
		assertTrue(r.stream().anyMatch(x -> x.getText().equals("Snapshot: none") && x.getLevel() == DebugView.Level.WARN));
	}

	@Test
	public void withoutAScreenshotThereIsNoLine()
	{
		assertFalse(rows(state("S1", Collections.emptyList(), Collections.emptyList(), null, false, false)).stream().anyMatch(x -> x.getText().startsWith("Shot:")));
	}

	@Test
	public void theTextForTheLogAndScreenshotIsAssembledLineByLine()
	{
		String plain = DebugView.plain(rows(state("S2-05", Collections.singletonList("has Iron ore = FALSE"), Collections.singletonList("Item(1535) = FALSE"), null, false, false)));
		assertTrue(plain.startsWith("ActiveStep: S2-05"));
		assertTrue(plain.contains("\n  has Iron ore = FALSE\n"));
		assertTrue(plain.contains("Trigger: Item(1535) = FALSE | QueueDepth: 1"));
	}

	@Test
	public void allBadgeSymbolsAreDrawnWithTheRuneLiteFont()
	{
		// The "⚠" comes from the system font, as in the list; the rest is Latin.
		Font f = FontManager.getRunescapeFont();
		List<String> texts = new ArrayList<>();
		for (DebugView.Row r : rows(state("S2-05", Arrays.asList("has A = TRUE"), Arrays.asList("Item(1) = FALSE"), "w", false, false)))
		{
			texts.add(r.getText().replace("⚠", ""));
		}
		for (String t : texts)
		{
			assertEquals("'" + t + "' is drawn in full", -1, f.canDisplayUpTo(t));
		}
	}

	@Test
	public void theBadgeWrapsByWidthWithoutCutting()
	{
		FontMetrics fm = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics().getFontMetrics(OverlayText.font(FontManager.getRunescapeFont(), 0.9f));
		String longest = "Why: " + "ITEM: steps 2–4 done by items, then 'Bring the knight the sword'".repeat(3);
		for (String line : OverlayText.wrap(longest, fm, OsrsPathDebugOverlay.WIDTH - 12))
		{
			assertTrue("«" + line + "» " + fm.stringWidth(line), fm.stringWidth(line) <= OsrsPathDebugOverlay.WIDTH - 12);
		}
	}
}
