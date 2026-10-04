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
	/** Dungeons in the game lie 6400 tiles north of the surface (like src/lib/map.ts isUnderground). */
	static final int UNDERGROUND_Y = 6400;

	private static final String[] ARROWS = {"→", "↗", "↑", "↖", "←", "↙", "↓", "↘"};

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

	static boolean underground(int y)
	{
		return y > UNDERGROUND_Y;
	}

	/** "tile / tiles". */
	static String tiles(int n)
	{
		return n == 1 ? n + " tile" : n + " tiles";
	}

	/** The distance line for the HUD. wasNear is whether it was "Nearby" on the previous tick. */
	static Readout readout(int px, int py, int pPlane, int tx, int ty, int tPlane, boolean wasNear)
	{
		boolean pUnder = underground(py);
		boolean tUnder = underground(ty);
		if (pUnder != tUnder)
		{
			return new Readout(tUnder ? "Target is underground - find the way down" : "Target is on the surface - get back up", false);
		}
		int d = distance(px, py, tx, ty);
		if (pPlane != tPlane)
		{
			String floor = tPlane > pPlane ? "a floor up" : "a floor down";
			return d < NEAR
				? new Readout("Target is " + floor, false)
				: new Readout("~" + tiles(d) + " " + arrow(tx - px, ty - py) + ", " + floor, false);
		}
		if (d < NEAR || (wasNear && d < NEAR_EXIT))
		{
			return new Readout("✓ Nearby", true, d);
		}
		return new Readout("~" + tiles(d) + " " + arrow(tx - px, ty - py), false, d);
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

		/** The player's position changed. true means the current point changed. */
		boolean update(int x, int y, int plane)
		{
			for (int i = index; i < points.size(); i++)
			{
				ActiveTarget.WorldPointDto p = points.get(i);
				if (p.getPlane() == plane && Math.abs(p.getX() - x) <= WAYPOINT_REACH && Math.abs(p.getY() - y) <= WAYPOINT_REACH)
				{
					index = i + 1;
					return true;
				}
			}
			return false;
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
