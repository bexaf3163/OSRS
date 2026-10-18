package com.osrspath.bridge;

import java.util.Collections;
import java.util.List;
import lombok.Value;

/**
 * The distance and direction to the target for the micro HUD, and the step's waypoints.
 * This is the straight-line distance between coordinates, not the number of steps along the road: the real path is drawn by
 * Shortest Path or the waypoints. Pure logic, checked by an ordinary test.
 */
final class Navigation
{
	/** Closer than this is "Nearby". Leaving "Nearby" is a little farther, so the label does not flicker at the boundary. */
	static final int NEAR = 5;
	static final int NEAR_EXIT = 7;
	/** A waypoint counts if it is no more than this many tiles away on either axis. */
	static final int WAYPOINT_REACH = 3;
	/**
	 * Back out of the area the route ends in (the Stronghold, a dungeon), the arrow returns to the way in only when the player is this far from it:
	 * standing at the entrance to climb down must not flip the route back and forth.
	 */
	static final int REWIND_BEYOND = 8;
	/** Dungeons in the game lie 6400 tiles north of the surface (like src/lib/map.ts isUnderground). */
	static final int UNDERGROUND_Y = 6400;
	/**
	 * The surface of the world map ends here; between it and the dungeons lie the separate areas: the Stronghold of Security floors, instances
	 * (like src/lib/instances.ts OVERWORLD_MAX_Y). A straight line from one of them to the surface is not a distance.
	 */
	static final int OVERWORLD_MAX_Y = 4200;

	private static final String[] ARROWS = {"→", "↗", "↑", "↖", "←", "↙", "↓", "↘"};

	/**
	 * The template region of the Misthalin Mystery manor (like src/lib/instances.ts): the game shows an instance at coordinates that are not a place
	 * on the world map, so a point there is not sent to Shortest Path and not marked on the world map. The arrow and highlights still work inside.
	 */
	static boolean isInstanced(int x, int y)
	{
		return x >= 1600 && x <= 1700 && y >= 4800 && y <= 4880;
	}

	private Navigation()
	{
	}

	@Value
	static class Readout
	{
		String text;
		boolean near;
		/** The straight-line distance in tiles on this plane; -1 means not counted (another plane or underground). */
		int tiles;

		Readout(String text, boolean near)
		{
			this(text, near, -1);
		}

		Readout(String text, boolean near, int tiles)
		{
			this.text = text;
			this.near = near;
			this.tiles = tiles;
		}
	}

	static int distance(int x1, int y1, int x2, int y2)
	{
		return (int) Math.round(Math.hypot(x2 - x1, y2 - y1));
	}

	/** An arrow by compass direction: y in the game grows to the north. Empty if the target is on the same tile. */
	static String arrow(int dx, int dy)
	{
		if (dx == 0 && dy == 0)
		{
			return "";
		}
		double angle = Math.toDegrees(Math.atan2(dy, dx));
		int sector = (int) Math.round(angle / 45.0);
		return ARROWS[Math.floorMod(sector, 8)];
	}

	/**
	 * An arrow as it looks on the screen: the offset is turned by the camera like the big arrow and the minimap, so "↑" is ahead of the camera, not
	 * north. A compass glyph showed ↘ for a target the big arrow pointed up-right to (the owner, 2026-10-18).
	 */
	static String arrow(int dx, int dy, int cameraYaw)
	{
		if (dx == 0 && dy == 0)
		{
			return "";
		}
		// screenAngle: 0 right, pi/2 down; the glyph table runs counter-clockwise from the right, so the angle is negated.
		double angle = Math.toDegrees(-ArrowGeometry.screenAngle(dx, dy, cameraYaw));
		return ARROWS[Math.floorMod((int) Math.round(angle / 45.0), 8)];
	}

	static boolean underground(int y)
	{
		return y > UNDERGROUND_Y;
	}

	/** 0 the surface, 1 a separate area (the Stronghold of Security, an instance), 2 a dungeon. */
	static int layer(int y)
	{
		return underground(y) ? 2 : y >= OVERWORLD_MAX_Y ? 1 : 0;
	}

	/** "tile / tiles". */
	static String tiles(int n)
	{
		return n == 1 ? n + " tile" : n + " tiles";
	}

	/** The distance line for the HUD. wasNear is whether it was "Nearby" on the previous tick. */
	static Readout readout(int px, int py, int pPlane, int tx, int ty, int tPlane, boolean wasNear)
	{
		return readout(px, py, pPlane, tx, ty, tPlane, wasNear, null);
	}

	/** As above; with a camera yaw the direction is as seen on the screen, without it the compass direction (north is up). */
	static Readout readout(int px, int py, int pPlane, int tx, int ty, int tPlane, boolean wasNear, Integer cameraYaw)
	{
		int pLayer = layer(py);
		int tLayer = layer(ty);
		if (pLayer != tLayer)
		{
			// Inside the Stronghold of Security the surface entrance was "~2180 tiles" away (2.55.0, S3-08): a number that meant nothing.
			if (tLayer == 2)
			{
				return new Readout("Target is underground - find the way down", false);
			}
			if (tLayer == 1)
			{
				return new Readout("Target is in a separate area - find the way in", false);
			}
			return new Readout(pLayer == 2 ? "Target is on the surface - get back up" : "Target is outside this area - find the way out", false);
		}
		int d = distance(px, py, tx, ty);
		if (pPlane != tPlane)
		{
			String floor = tPlane > pPlane ? "a floor up" : "a floor down";
			return d < NEAR
				? new Readout("Target is " + floor, false)
				: new Readout("~" + tiles(d) + " " + direction(tx - px, ty - py, cameraYaw) + ", " + floor, false);
		}
		if (d < NEAR || (wasNear && d < NEAR_EXIT))
		{
			return new Readout("✓ Nearby", true, d);
		}
		return new Readout("~" + tiles(d) + " " + direction(tx - px, ty - py, cameraYaw), false, d);
	}

	private static String direction(int dx, int dy, Integer cameraYaw)
	{
		return cameraYaw == null ? arrow(dx, dy) : arrow(dx, dy, cameraYaw);
	}

	/**
	 * The step's waypoints: gate -> bridge -> ladder -> NPC. The current one is the first not counted.
	 * If the player reached a farther waypoint, the skipped ones are counted. The nearest one in order that fits
	 * is taken, not the farthest: a route may pass the same place twice (there and back).
	 */
	static final class Breadcrumbs
	{
		private final List<ActiveTarget.WorldPointDto> points;
		private int index;

		Breadcrumbs(List<ActiveTarget.WorldPointDto> points)
		{
			this.points = points == null ? Collections.emptyList() : points;
		}

		/**
		 * The player's position changed. true means the current point changed.
		 *
		 * A player already inside the area the route ends in (the Stronghold of Security, S3-08's minotaurs) is past the waypoints that lead in
		 * from another layer (the entrance on the surface): only when the rest of the route, from its first waypoint in the player's layer, stays
		 * in that layer, and never on the surface.
		 *
		 * A player back out of that area (out of the cave for food, or after the last point) is led to the way in again: the nearest earlier
		 * waypoint in the player's own layer. Before, the point stayed inside the cave and the game arrow pointed at coordinates that are not on the
		 * player's map at all: nothing to follow (the owner, 2026-10-15). The way in is only chosen once the player has walked
		 * {@link #REWIND_BEYOND} tiles from it.
		 */
		boolean update(int x, int y, int plane)
		{
			if (points.isEmpty())
			{
				return false;
			}
			for (int i = index; i < points.size(); i++)
			{
				ActiveTarget.WorldPointDto p = points.get(i);
				if (p.getPlane() == plane && Math.abs(p.getX() - x) <= WAYPOINT_REACH && Math.abs(p.getY() - y) <= WAYPOINT_REACH)
				{
					index = i + 1;
					return true;
				}
			}
			int here = layer(y);
			// The point that leads now; after the last one, the last.
			int cur = finished() ? points.size() - 1 : index;
			if (layer(points.get(cur).getY()) == here)
			{
				return false;
			}
			if (here != 0 && !finished() && skipToArea(here))
			{
				return true;
			}
			for (int j = cur - 1; j >= 0; j--)
			{
				ActiveTarget.WorldPointDto p = points.get(j);
				if (layer(p.getY()) == here)
				{
					if (Math.max(Math.abs(p.getX() - x), Math.abs(p.getY() - y)) <= REWIND_BEYOND)
					{
						return false;
					}
					index = j;
					return true;
				}
			}
			return false;
		}

		/** The route from its first waypoint in the player's layer stays in that layer: the waypoints before it lead in and are behind. */
		private boolean skipToArea(int here)
		{
			int first = index;
			while (first < points.size() && layer(points.get(first).getY()) != here)
			{
				first++;
			}
			if (first == points.size())
			{
				return false;
			}
			for (int i = first; i < points.size(); i++)
			{
				if (layer(points.get(i).getY()) != here)
				{
					return false;
				}
			}
			index = first;
			return true;
		}

		/** The current point or null if the route is done. */
		ActiveTarget.WorldPointDto current()
		{
			return finished() ? null : points.get(index);
		}

		boolean finished()
		{
			return index >= points.size();
		}

		int index()
		{
			return index;
		}

		int size()
		{
			return points.size();
		}

		List<ActiveTarget.WorldPointDto> points()
		{
			return points;
		}
	}
}
