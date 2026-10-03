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
 * Журнал для отладки: что делал движок плагина, пока ты играл. Одна строка JSON на событие в файл
 * {@code osrs-path-telemetry/session-ДАТА.jsonl} рядом с настройками RuneLite: смена шага и этапа, куда сдвинулся курсор
 * и почему (положение, предмет, сдача, возврат), клики, изменения сумки, смерть и телепорт, принятые снимки программы, то,
 * что игрок видел на экране (текст плашек), и «странности» — состояния, которых быть не должно (курсор не двигается, хотя
 * ты ходишь; на экране пусто; квест сдан, а список нет). Файл читает человек или скрипт {@code npm run telemetry}: по нему
 * можно найти ошибку, не повторяя игру.
 *
 * Только локально: никуда не отправляется. Размер ограничен ({@link #MAX_BYTES} на сеанс, {@link #KEEP_FILES} файлов).
 * В журнале нет имени персонажа и ничего вне игры плагина; скриншоты — отдельно (Screenshots).
 */
@Slf4j
final class Telemetry
{
	static final int KEEP_FILES = 8;
	static final long MAX_BYTES = 6L * 1024 * 1024;
	static final int RECENT = 200;
	/** Длиннее строка в поле события не пишется: журнал нужен для разбора, а не для хранения текстов целиком. */
	static final int MAX_FIELD = 2_000;
	static final int ANOMALIES = 40;
	/** Сколько знаков последних событий отдавать в сводке для программы. */
	static final int SUMMARY_CHARS = 20_000;
	/** Одна и та же странность в журнал и на экран — не чаще раза в это время, мс. */
	static final long DEDUPE_MS = 120_000;

	/** Странность: состояние, которого быть не должно. */
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

	/** Файл сеанса; null — пока ничего не записано или папку создать не удалось. */
	synchronized File file()
	{
		return file;
	}

	File dir()
	{
		return dir;
	}

	/**
	 * Записать событие: kind — вид («stage», «click», «ui»…), дальше пары «поле, значение». Поток-безопасно; ошибки записи
	 * журнал не роняют плагин — после первой журнал выключается.
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
			// Время и вид события задаёт сам журнал: поле с таким именем их не подменяет.
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
	 * Странность. Повтор той же (code + key) в ближайшие {@link #DEDUPE_MS} не пишется. true — новая: можно сделать
	 * скриншот и показать на экране.
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
			// Всегда LF, а не системный перевод строки: размер считается по байтам, и разбор журнала везде одинаков.
			out.write(line);
			out.write('\n');
			out.flush();
			bytes += b.length;
		}
		catch (IOException | RuntimeException e)
		{
			log.warn("Журнал отладки выключен: {}", e.toString());
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

	/** Оставить в папке не больше keep самых свежих журналов. */
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
				log.debug("Старый журнал не удалён: {}", files[i]);
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
			log.debug("Журнал не закрылся", e);
		}
		out = null;
	}

	/** Сводка для плашки разработчика и ответа /telemetry. */
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
		// Ответ идёт через мост с потолком 64 КиБ, а строки в нём экранируются заново — оставляем с запасом, свежие важнее.
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

	/** Последняя странность — для плашки; null — не было. */
	synchronized Anomaly lastAnomaly()
	{
		return anomalies.peekLast();
	}
}
