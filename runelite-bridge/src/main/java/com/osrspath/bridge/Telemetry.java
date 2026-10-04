package com.osrspath.bridge;

import com.google.gson.Gson;
import java.io.BufferedWriter;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;
import lombok.extern.slf4j.Slf4j;

/**
 * The debug log: what the plugin's engine did while you played. One JSON line per event into the file
 * {@code osrs-path-telemetry/session-DATE.jsonl} next to the RuneLite settings: step and stage changes, where the cursor moved
 * and why (position, item, hand-in, return), clicks, bag changes, death and teleport, the app snapshots accepted, what
 * the player saw on screen (plate text), and "anomalies": states that should not exist (the cursor does not move although
 * you walk; the screen is empty; the quest is done but the list is not). A person or the script {@code npm run telemetry} reads the file: it
 * lets you find the bug without replaying the game.
 *
 * Local only: nothing is sent anywhere. The size is limited ({@link #MAX_BYTES} per session, {@link #KEEP_FILES} files).
 * The log has no character name and nothing outside the plugin's game; screenshots are separate (Screenshots).
 */
@Slf4j
final class Telemetry
{
	static final int KEEP_FILES = 8;
	static final long MAX_BYTES = 6L * 1024 * 1024;
	static final int RECENT = 200;
	/** A longer string is not written into an event field: the log is for analysis, not for storing whole texts. */
	static final int MAX_FIELD = 2_000;
	static final int ANOMALIES = 40;
	/** How many characters of the latest events to give in the summary for the app. */
	static final int SUMMARY_CHARS = 20_000;
	/** The same anomaly goes to the log and the screen no more often than this time, ms. */
	static final long DEDUPE_MS = 120_000;

	/** An anomaly: a state that should not exist. */
	static final class Anomaly
	{
		final long at;
		final String code;
		final String message;

		Anomaly(long at, String code, String message)
		{
			this.at = at;
			this.code = code;
			this.message = message;
		}
	}

	private final File dir;
	private final Gson gson;
	private final LongSupplier clock;
	private BufferedWriter out;
	private File file;
	private long bytes;
	private int events;
	private int anomalyCount;
	private boolean truncated;
	private boolean closed;
	private final Deque<String> recent = new ArrayDeque<>();
	private final Deque<Anomaly> anomalies = new ArrayDeque<>();
	private final Map<String, Long> lastAnomaly = new HashMap<>();
	private final Map<String, Integer> kinds = new LinkedHashMap<>();

	Telemetry(File dir, Gson gson, LongSupplier clock)
	{
		this.dir = dir;
		this.gson = gson;
		this.clock = clock;
	}

	/** The session file; null until something is written or the folder could not be created. */
	synchronized File file()
	{
		return file;
	}

	File dir()
	{
		return dir;
	}

	/**
	 * Write an event: kind is the type ("stage", "click", "ui"...), then "field, value" pairs. Thread-safe; write errors
	 * do not crash the plugin: after the first one the log turns itself off.
	 */
	synchronized void event(String kind, Object... pairs)
	{
		if (closed)
		{
			return;
		}
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("t", clock.getAsLong());
		m.put("kind", kind);
		for (int i = 0; i + 1 < pairs.length; i += 2)
		{
			String key = String.valueOf(pairs[i]);
			// The time and kind of the event are set by the log itself: a field with such a name does not replace them.
			if (pairs[i + 1] != null && !key.equals("t") && !key.equals("kind"))
			{
				Object v = pairs[i + 1];
				if (v instanceof String && ((String) v).length() > MAX_FIELD)
				{
					v = ((String) v).substring(0, MAX_FIELD) + "…";
				}
				m.put(key, v);
			}
		}
		write(kind, gson.toJson(m));
	}

	/**
	 * An anomaly. A repeat of the same one (code + key) within {@link #DEDUPE_MS} is not written. true means a new one: a screenshot
	 * can be taken and it can be shown on screen.
	 */
	synchronized boolean anomaly(String code, String key, String message, Object... pairs)
	{
		long now = clock.getAsLong();
		String id = code + "|" + key;
		Long prev = lastAnomaly.get(id);
		if (prev != null && now - prev < DEDUPE_MS)
		{
			return false;
		}
		lastAnomaly.put(id, now);
		anomalyCount++;
		anomalies.addLast(new Anomaly(now, code, message));
		while (anomalies.size() > ANOMALIES)
		{
			anomalies.removeFirst();
		}
		Object[] all = Arrays.copyOf(pairs, pairs.length + 4);
		all[pairs.length] = "code";
		all[pairs.length + 1] = code;
		all[pairs.length + 2] = "message";
		all[pairs.length + 3] = message;
		event("anomaly", all);
		return true;
	}

	private void write(String kind, String line)
	{
		kinds.merge(kind, 1, Integer::sum);
		events++;
		recent.addLast(line);
		while (recent.size() > RECENT)
		{
			recent.removeFirst();
		}
		if (truncated)
		{
			return;
		}
		try
		{
			if (out == null)
			{
				open();
			}
			byte[] b = (line + "\n").getBytes(StandardCharsets.UTF_8);
			if (bytes + b.length > MAX_BYTES)
			{
				truncated = true;
				String note = "{\"t\":" + clock.getAsLong() + ",\"kind\":\"truncated\",\"reason\":\"size\"}\n";
				out.write(note);
				out.flush();
				return;
			}
			// Always LF, not the system line break: the size is counted in bytes, and parsing the log is the same everywhere.
			out.write(line);
			out.write('\n');
			out.flush();
			bytes += b.length;
		}
		catch (IOException | RuntimeException e)
		{
			log.warn("Debug log turned off: {}", e.toString());
			closed = true;
			closeQuietly();
		}
	}

	private void open() throws IOException
	{
		Files.createDirectories(dir.toPath());
		prune(dir, KEEP_FILES - 1);
		String name = "session-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + ".jsonl";
		file = new File(dir, name);
		out = Files.newBufferedWriter(file.toPath(), StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
	}

	/** Keep no more than keep of the freshest logs in the folder. */
	static void prune(File dir, int keep)
	{
		File[] files = dir.listFiles((d, n) -> n.startsWith("session-") && n.endsWith(".jsonl"));
		if (files == null || files.length <= keep)
		{
			return;
		}
		Arrays.sort(files, Comparator.comparing(File::getName));
		for (int i = 0; i < files.length - keep; i++)
		{
			if (!files[i].delete())
			{
				log.debug("Old log not deleted: {}", files[i]);
			}
		}
	}

	synchronized void close()
	{
		closed = true;
		closeQuietly();
	}

	private void closeQuietly()
	{
		try
		{
			if (out != null)
			{
				out.close();
			}
		}
		catch (IOException e)
		{
			log.debug("Log did not close", e);
		}
		out = null;
	}

	/** The summary for the developer badge and the /telemetry answer. */
	synchronized Map<String, Object> summary(int lastEvents)
	{
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("file", file == null ? null : file.getAbsolutePath());
		m.put("dir", dir.getAbsolutePath());
		m.put("events", events);
		m.put("anomalies", anomalyCount);
		m.put("truncated", truncated);
		m.put("kinds", new LinkedHashMap<>(kinds));
		List<Map<String, Object>> an = new ArrayList<>();
		for (Anomaly a : anomalies)
		{
			Map<String, Object> row = new LinkedHashMap<>();
			row.put("t", a.at);
			row.put("code", a.code);
			row.put("message", a.message);
			an.add(row);
		}
		m.put("recentAnomalies", an);
		List<String> tail = new ArrayList<>(recent);
		List<String> last = new ArrayList<>(tail.subList(Math.max(0, tail.size() - Math.max(0, lastEvents)), tail.size()));
		// The answer goes through the bridge with a 64 KiB ceiling, and the lines in it are escaped again: we leave a margin, the fresh ones matter more.
		int chars = 0;
		for (String l : last)
		{
			chars += l.length();
		}
		while (chars > SUMMARY_CHARS && !last.isEmpty())
		{
			chars -= last.remove(0).length();
		}
		m.put("recent", last);
		return m;
	}

	synchronized int events()
	{
		return events;
	}

	synchronized int anomalyCount()
	{
		return anomalyCount;
	}

	/** The last anomaly, for the badge; null means there was none. */
	synchronized Anomaly lastAnomaly()
	{
		return anomalies.peekLast();
	}
}
