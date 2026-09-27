package com.osrspath.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonParseException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.Data;
import lombok.Value;
import lombok.extern.slf4j.Slf4j;

/**
 * Радар опасных мест: зоны из src/data/dangerZones.json (в jar кладёт Gradle) и вход/выход игрока.
 *
 * Расстояния — квадратами (dx² + dy²), без корня. Раз за тик проверяется несколько зон — это дёшево;
 * всё дорогое (перебор NPC, рисование границы) плагин делает, только пока игрок рядом с зоной.
 * Выйти из предупреждения можно, отойдя на {@link #EXIT_MARGIN} клетки дальше, чем в него вошёл:
 * иначе на самой границе предупреждение и звук мигали бы каждый шаг.
 */
@Slf4j
final class DangerRadar
{
	static final String RESOURCE = "dangerZones.json";
	/** Ближе стольких клеток к центру зоны рисуется её граница. */
	static final int DRAW_RADIUS = 20;
	static final int EXIT_MARGIN = 3;

	enum Level
	{
		NONE, NEAR, WARNING, INSIDE
	}

	@Data
	static class Point
	{
		private int x;
		private int y;
		private int plane;
	}

	@Data
	static class Zone
	{
		private String id;
		private String name;
		private Point center;
		private int radius;
		private Integer warningRadius;
		private String severity;
		private String message;
		/** Коротко для HUD; без него — message. */
		private String hud;
		private List<String> npcNames;

		private transient Set<String> npcNameSet = Collections.emptySet();
		private transient List<int[]> boundary = Collections.emptyList();

		int warn()
		{
			return warningRadius != null && warningRadius > radius ? warningRadius : radius;
		}

		boolean critical()
		{
			return "CRITICAL".equals(severity) || "HIGH".equals(severity);
		}

		String hudText()
		{
			return hud != null && !hud.isEmpty() ? hud : message;
		}

		Set<String> getNpcNameSet()
		{
			return npcNameSet;
		}

		/** Клетки по краю круга radius — их рисует оверлей. */
		List<int[]> getBoundary()
		{
			return boundary;
		}

		boolean valid()
		{
			return id != null && name != null && center != null && message != null
				&& radius > 0 && radius <= 64 && center.plane >= 0 && center.plane <= 3
				&& center.x > 0 && center.y > 0;
		}

		void prepare()
		{
			Set<String> names = new HashSet<>();
			if (npcNames != null)
			{
				for (String n : npcNames)
				{
					names.add(ActiveTarget.nameKey(n));
				}
			}
			npcNameSet = names;
			boundary = ring(center.x, center.y, radius);
		}
	}

	static class ZoneFile
	{
		List<Zone> zones;
	}

	/** Что радар думает о текущей клетке игрока. entered — только что вошёл в предупреждение (для звука). */
	@Value
	static class Reading
	{
		Zone zone;
		Level level;
		boolean entered;
	}

	static final Reading QUIET = new Reading(null, Level.NONE, false);

	private final List<Zone> zones;
	/** Зона, в предупреждении которой игрок сейчас, — чтобы не звать звук второй раз. */
	private Zone alerted;

	DangerRadar(List<Zone> zones)
	{
		this.zones = zones;
	}

	List<Zone> getZones()
	{
		return zones;
	}

	/** Зоны из ресурса плагина. Нет файла или он битый — пустой радар, а не падение плагина. */
	static DangerRadar load(Gson gson)
	{
		try (InputStream in = DangerRadar.class.getResourceAsStream(RESOURCE))
		{
			if (in == null)
			{
				log.warn("OSRS Path Bridge: нет {} — радар опасности выключен", RESOURCE);
				return new DangerRadar(Collections.emptyList());
			}
			try (Reader r = new InputStreamReader(in, StandardCharsets.UTF_8))
			{
				return new DangerRadar(parse(gson.fromJson(r, ZoneFile.class)));
			}
		}
		catch (IOException | JsonParseException e)
		{
			log.warn("OSRS Path Bridge: {} не прочитан — радар опасности выключен", RESOURCE, e);
			return new DangerRadar(Collections.emptyList());
		}
	}

	static List<Zone> parse(ZoneFile f)
	{
		List<Zone> out = new ArrayList<>();
		if (f == null || f.zones == null)
		{
			return out;
		}
		for (Zone z : f.zones)
		{
			if (z != null && z.valid())
			{
				z.prepare();
				out.add(z);
			}
		}
		return out;
	}

	static int distanceSq(int x1, int y1, int x2, int y2)
	{
		int dx = x1 - x2;
		int dy = y1 - y2;
		return dx * dx + dy * dy;
	}

	/**
	 * Новая клетка игрока. Из нескольких зон рядом выбирается та, в которую он глубже зашёл
	 * (при равенстве — более опасная). Вызывать при смене клетки, а не каждый кадр.
	 */
	Reading update(int x, int y, int plane)
	{
		Zone best = null;
		Level bestLevel = Level.NONE;
		int bestSq = Integer.MAX_VALUE;
		for (Zone z : zones)
		{
			if (z.center.plane != plane)
			{
				continue;
			}
			int d = distanceSq(x, y, z.center.x, z.center.y);
			int warn = z.warn();
			// Уже предупреждённому — выход с запасом, чтобы граница не мигала.
			int stay = z == alerted ? warn + EXIT_MARGIN : warn;
			Level level;
			if (d <= z.radius * z.radius)
			{
				level = Level.INSIDE;
			}
			else if (d <= stay * stay)
			{
				level = Level.WARNING;
			}
			else if (d <= DRAW_RADIUS * DRAW_RADIUS)
			{
				level = Level.NEAR;
			}
			else
			{
				continue;
			}
			if (best == null || level.ordinal() > bestLevel.ordinal()
				|| (level == bestLevel && (d < bestSq || (d == bestSq && z.critical() && !best.critical()))))
			{
				best = z;
				bestLevel = level;
				bestSq = d;
			}
		}
		boolean warned = bestLevel == Level.WARNING || bestLevel == Level.INSIDE;
		boolean entered = warned && best != alerted;
		alerted = warned ? best : null;
		return best == null ? QUIET : new Reading(best, bestLevel, entered);
	}

	/** Сбросить память о предупреждении — после входа в игру или смены персонажа. */
	void reset()
	{
		alerted = null;
	}

	/** Клетки на краю круга: внутри радиуса, но с соседом снаружи. */
	static List<int[]> ring(int cx, int cy, int r)
	{
		List<int[]> out = new ArrayList<>();
		int r2 = r * r;
		for (int dx = -r; dx <= r; dx++)
		{
			for (int dy = -r; dy <= r; dy++)
			{
				int d = dx * dx + dy * dy;
				if (d > r2)
				{
					continue;
				}
				boolean edge = (dx + 1) * (dx + 1) + dy * dy > r2 || (dx - 1) * (dx - 1) + dy * dy > r2
					|| dx * dx + (dy + 1) * (dy + 1) > r2 || dx * dx + (dy - 1) * (dy - 1) > r2;
				if (edge)
				{
					out.add(new int[]{cx + dx, cy + dy});
				}
			}
		}
		return out;
	}
}
