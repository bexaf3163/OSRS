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
 * The danger radar: zones from src/data/dangerZones.json (Gradle puts it in the jar) and the player entering/leaving.
 *
 * Distances are squared (dx^2 + dy^2), without a root. Several zones are checked once per tick, which is cheap;
 * everything expensive (iterating NPCs, drawing the border) the plugin does only while the player is near a zone.
 * To leave a warning, the player must move {@link #EXIT_MARGIN} tiles farther than where they entered:
 * otherwise at the very border the warning and sound would flicker with every step.
 */
@Slf4j
final class DangerRadar
{
	static final String RESOURCE = "dangerZones.json";
	/** The zone's border is drawn closer than this many tiles to its centre. */
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
		/** Short for the HUD; without it, message. */
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

		/** The tiles along the edge of a circle of radius radius, which the overlay draws. */
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

	/** What the radar thinks about the player's current tile. entered means just entered the warning (for the sound). */
	@Value
	static class Reading
	{
		Zone zone;
		Level level;
		boolean entered;
	}

	static final Reading QUIET = new Reading(null, Level.NONE, false);

	private final List<Zone> zones;
	/** The zone whose warning the player is in now, so as not to call the sound a second time. */
	private Zone alerted;

	DangerRadar(List<Zone> zones)
	{
		this.zones = zones;
	}

	List<Zone> getZones()
	{
		return zones;
	}

	/** The zones from the plugin resource. A missing or broken file gives an empty radar, not a plugin crash. */
	static DangerRadar load(Gson gson)
	{
		try (InputStream in = DangerRadar.class.getResourceAsStream(RESOURCE))
		{
			if (in == null)
			{
				log.warn("OSRS Path Bridge: {} is missing - danger radar turned off", RESOURCE);
				return new DangerRadar(Collections.emptyList());
			}
			try (Reader r = new InputStreamReader(in, StandardCharsets.UTF_8))
			{
				return new DangerRadar(parse(gson.fromJson(r, ZoneFile.class)));
			}
		}
		catch (IOException | JsonParseException e)
		{
			log.warn("OSRS Path Bridge: {} could not be read - danger radar turned off", RESOURCE, e);
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
	 * A new player tile. Of several zones nearby the one the player is deeper in is chosen
	 * (on a tie, the more dangerous one). Call when the tile changes, not every frame.
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
			// For one already warned, leaving has a margin so the border does not flicker.
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

	/** Reset the warning memory: after login or a character change. */
	void reset()
	{
		alerted = null;
	}

	/** The tiles on the edge of a circle: inside the radius but with a neighbour outside. */
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
