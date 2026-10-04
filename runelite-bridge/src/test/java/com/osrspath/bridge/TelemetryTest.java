package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** The debug journal: writes JSON lines, does not let the time and kind be overridden, is limited by size, does not crash the plugin. */
public class TelemetryTest
{
	private final Gson gson = new Gson();
	private final AtomicLong now = new AtomicLong(1_000);
	private File dir;
	private Telemetry t;

	@Before
	public void setUp() throws IOException
	{
		dir = Files.createTempDirectory("osrs-telemetry-test").toFile();
		t = new Telemetry(new File(dir, "log"), gson, now::get);
	}

	@After
	public void tearDown()
	{
		t.close();
		deleteTree(dir);
	}

	private static void deleteTree(File f)
	{
		File[] kids = f.listFiles();
		if (kids != null)
		{
			for (File k : kids)
			{
				deleteTree(k);
			}
		}
		f.delete();
	}

	private List<String> lines() throws IOException
	{
		assertNotNull("the file is created", t.file());
		return Files.readAllLines(t.file().toPath(), StandardCharsets.UTF_8);
	}

	@Test
	public void anEventIsWrittenAsOneJsonLine() throws IOException
	{
		t.event("step", "stepId", "S2-07", "title", "The Knight's Sword", "skipped", null);
		List<String> l = lines();
		assertEquals(1, l.size());
		JsonObject o = new JsonParser().parse(l.get(0)).getAsJsonObject();
		assertEquals(1_000, o.get("t").getAsLong());
		assertEquals("step", o.get("kind").getAsString());
		assertEquals("S2-07", o.get("stepId").getAsString());
		assertFalse("empty fields are not written", o.has("skipped"));
	}

	@Test
	public void timeAndKindAreNotOverridden() throws IOException
	{
		t.event("click", "kind", "NEXT", "t", 5, "what", "NEXT");
		JsonObject o = new JsonParser().parse(lines().get(0)).getAsJsonObject();
		assertEquals("click", o.get("kind").getAsString());
		assertEquals(1_000, o.get("t").getAsLong());
		assertEquals("NEXT", o.get("what").getAsString());
	}

	@Test
	public void textAndLineBreaksAreKeptInOneLine() throws IOException
	{
		t.event("ui", "text", "Take the pickaxe\nand the ore ↓");
		List<String> l = lines();
		assertEquals("the line break inside the text is escaped", 1, l.size());
		assertEquals("Take the pickaxe\nand the ore ↓", new JsonParser().parse(l.get(0)).getAsJsonObject().get("text").getAsString());
	}

	@Test
	public void anAnomalyIsNotRepeatedWithinTheWindowAndIsWrittenAgainAfterIt()
	{
		assertTrue(t.anomaly("STUCK", "S2-07@1", "standing"));
		now.addAndGet(60_000);
		assertFalse("the same on the same step: not before the window", t.anomaly("STUCK", "S2-07@1", "standing"));
		assertTrue("another key is another anomaly", t.anomaly("STUCK", "S2-07@2", "standing"));
		assertTrue("another code too", t.anomaly("EMPTY", "S2-07@1", "empty"));
		now.addAndGet(Telemetry.DEDUPE_MS);
		assertTrue("the window passed: again", t.anomaly("STUCK", "S2-07@1", "standing"));
		assertEquals(4, t.anomalyCount());
		assertEquals("STUCK", t.lastAnomaly().code);
	}

	@Test
	public void anAnomalyGoesIntoTheJournalWithACodeAndAMessage() throws IOException
	{
		t.anomaly("EMPTY", "k", "The screen is empty", "step", "S2-07");
		JsonObject o = new JsonParser().parse(lines().get(0)).getAsJsonObject();
		assertEquals("anomaly", o.get("kind").getAsString());
		assertEquals("EMPTY", o.get("code").getAsString());
		assertEquals("The screen is empty", o.get("message").getAsString());
		assertEquals("S2-07", o.get("step").getAsString());
	}

	@Test
	public void sizeIsLimitedAndTheLastLineTellsAboutTheTruncation() throws IOException
	{
		String chunk = "x".repeat(5_000);
		for (int i = 0; i < 4_000; i++)
		{
			t.event("ui", "text", chunk);
		}
		long size = t.file().length();
		assertTrue("the file does not exceed the limit: " + size, size <= Telemetry.MAX_BYTES + 200);
		List<String> l = lines();
		assertTrue(l.get(l.size() - 1).contains("\"truncated\""));
		// The summary for the app keeps working and counts everything that happened.
		assertEquals(4_000, t.events());
		assertTrue((Boolean) t.summary(5).get("truncated"));
	}

	@Test
	public void theSummaryIsLimitedByTheNumberOfEventsAndBySize()
	{
		for (int i = 0; i < 500; i++)
		{
			t.event("beat", "n", i);
		}
		@SuppressWarnings("unchecked")
		List<String> recent = (List<String>) t.summary(30).get("recent");
		assertEquals(30, recent.size());
		assertTrue("the last ones are fresh", recent.get(29).contains("\"n\":499"));
		for (int i = 0; i < 100; i++)
		{
			t.event("ui", "text", "y".repeat(1_900));
		}
		@SuppressWarnings("unchecked")
		List<String> big = (List<String>) t.summary(100).get("recent");
		int chars = big.stream().mapToInt(String::length).sum();
		assertTrue("the summary fits in the bridge's answer: " + chars, chars <= Telemetry.SUMMARY_CHARS);
		assertFalse(big.isEmpty());
	}

	/**
	 * A sample journal as the plugin writes it: the app test (tests/telemetryReport.test.ts) reads it,
	 * so the line format is checked by the parsing on both sides. A new sample: UPDATE_FIXTURES=1 gradlew test.
	 */
	@Test
	public void theSampleJournalMatchesTheFileForTheApp() throws IOException
	{
		AtomicLong clock = new AtomicLong(1_700_000_000_000L);
		File d = new File(dir, "sample");
		Telemetry s = new Telemetry(d, gson, clock::get);
		s.event("session", "plugin", "2.23.0", "protocol", 6, "java", "17", "os", "Windows 11", "config", java.util.Collections.singletonMap("hudLean", true));
		clock.addAndGet(100);
		s.event("step", "stepId", "S2-07", "title", "The Knight's Sword", "goal", "Mine the ore", "stage", true);
		clock.addAndGet(100);
		s.event("snapshot", "seq", 1L, "step", "S2-07", "plan", true, "percent", 80, "shopping", false);
		s.event("stage", "event", "enter", "key", "S2-07#3", "stage", 3, "of", 9, "cursor", 1, "size", 5, "line", "Take the pickaxe ↓", "reason", "POSITION: arrived", "pos", new int[] {3000, 3000, 0});
		clock.addAndGet(5_000);
		s.event("stage", "event", "cursor", "key", "S2-07#3", "from", 1, "to", 2, "size", 5, "line", "Mine the ore", "reason", "ITEM: step 1 done", "pos", new int[] {3001, 3000, 0}, "manual", false);
		clock.addAndGet(4_000);
		s.event("click", "what", "NEXT", "cursor", 2, "step", "S2-07");
		s.event("stage", "event", "cursor", "key", "S2-07#3", "from", 2, "to", 3, "size", 5, "line", "Hand it in", "reason", "MANUAL: 'done' on step 2", "pos", new int[] {3001, 3000, 0}, "manual", true);
		s.event("bag", "delta", java.util.Collections.singletonMap("Iron ore", 1), "step", "S2-07");
		s.event("ui", "view", "guide", "text", "S2-07 · Stage 3 of 9\n▶ Hand it in");
		clock.addAndGet(180_000);
		s.anomaly("STUCK", "S2-07#3@2", "Step 3/5 of stage S2-07#3 has not changed for 180 s", "step", "S2-07");
		s.event("shot", "file", "shot-20240101-000000-anomaly_STUCK.png", "why", "anomaly_STUCK");
		s.event("end");
		s.close();
		String actual = new String(Files.readAllBytes(s.file().toPath()), StandardCharsets.UTF_8);
		assertTrue("line breaks are LF only", actual.indexOf(13) < 0);
		File fixture = new File("src/test/resources/telemetry-session.jsonl");
		if ("1".equals(System.getenv("UPDATE_FIXTURES")))
		{
			Files.write(fixture.toPath(), actual.getBytes(StandardCharsets.UTF_8));
		}
		assertEquals(new String(Files.readAllBytes(fixture.toPath()), StandardCharsets.UTF_8), actual);
	}

	@Test
	public void aLongFieldIsTruncated() throws IOException
	{
		t.event("ui", "text", "z".repeat(10_000));
		String text = new JsonParser().parse(lines().get(0)).getAsJsonObject().get("text").getAsString();
		assertEquals(Telemetry.MAX_FIELD + 1, text.length());
		assertTrue(text.endsWith("…"));
	}

	@Test
	public void theSummaryContainsCountersAndAnomalies()
	{
		t.event("step", "stepId", "S1");
		t.event("step", "stepId", "S2");
		t.anomaly("STUCK", "k", "m");
		Map<String, Object> s = t.summary(10);
		assertEquals(3, s.get("events"));
		assertEquals(1, s.get("anomalies"));
		@SuppressWarnings("unchecked")
		Map<String, Integer> kinds = (Map<String, Integer>) s.get("kinds");
		assertEquals(Integer.valueOf(2), kinds.get("step"));
		assertEquals(Integer.valueOf(1), kinds.get("anomaly"));
	}

	@Test
	public void atMostTheAllowedNumberOfJournalsRemainInTheFolder() throws IOException
	{
		File d = new File(dir, "old");
		assertTrue(d.mkdirs());
		for (int i = 0; i < 12; i++)
		{
			assertTrue(new File(d, String.format("session-20240101-0000%02d.jsonl", i)).createNewFile());
		}
		assertTrue(new File(d, "keep.txt").createNewFile());
		Telemetry.prune(d, Telemetry.KEEP_FILES - 1);
		File[] left = d.listFiles((x, n) -> n.startsWith("session-"));
		assertEquals(Telemetry.KEEP_FILES - 1, left.length);
		assertTrue("the freshest remain", new File(d, "session-20240101-000011.jsonl").exists());
		assertFalse(new File(d, "session-20240101-000000.jsonl").exists());
		assertTrue("we do not touch foreign files", new File(d, "keep.txt").exists());
	}

	@Test
	public void aWriteErrorTurnsTheJournalOffQuietlyAndDoesNotCrash() throws IOException
	{
		// The folder is occupied by a file: it cannot be created.
		File blocker = new File(dir, "blocked");
		assertTrue(blocker.createNewFile());
		Telemetry bad = new Telemetry(new File(blocker, "sub"), gson, now::get);
		bad.event("step", "stepId", "S1");
		bad.event("step", "stepId", "S2");
		assertNull("there is no file", bad.file());
		// The in-memory summary works, the plugin did not crash.
		assertTrue(bad.events() >= 1);
	}

	@Test
	public void nothingIsWrittenAfterClosing() throws IOException
	{
		t.event("step", "stepId", "S1");
		t.close();
		t.event("step", "stepId", "S2");
		assertEquals(1, lines().size());
	}
}
