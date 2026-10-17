package com.osrspath.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.Value;
import lombok.extern.slf4j.Slf4j;

/**
 * The ways between the surface, the separate areas and the dungeons (src/data/portals.json, built from the Shortest Path plugin's transport table).
 * A target in another layer than the player used to give only "Target is underground - find the way down" (The Corsair Curse, 2026-10-17): the cave
 * of Chief Tess is entered by a hole on the beach, nowhere near the cave's own coordinates. Now the arrow points at the way in or out.
 *
 * The same rules as src/lib/portals.ts (pickPortal), checked by PortalsTest on the real file.
 */
@Slf4j
final class Portals
{
	/** How far from a way's far end a target may be and still be "this way's area". */
	static final int AREA_REACH = 400;
	/** How far a way out may be from a player inside: the same dungeon. */
	static final int EXIT_REACH = 250;
	/** How far from the target a staircase or ladder may come out and still be the way up to its floor: the same building. */
	static final int FLOOR_REACH = 20;
	/** How far from the player a way down may be: the building the player is in. */
	static final int FLOOR_NEAR = 40;

	@Value
	static class Portal
	{
		int x;
		int y;
		int plane;
		int toX;
		int toY;
		int toPlane;
		/** The object (ladder, hole); 0 when the table names none. */
		int id;
		/** The game's menu words: "Climb-down Ladder", "Enter Hole". */
		String action;
		/** A requirement as the table says it; empty when none. */
		String req;

		/** "Way down: Enter Hole" — what the HUD shows. */
		String label()
		{
			int from = Navigation.layer(y);
			int to = Navigation.layer(toY);
			String way = from == to ? (toPlane > plane ? "Way up" : "Way down")
				: from == 0 && to == 2 ? "Way down" : from == 2 && to == 0 ? "Way up" : from == 0 ? "Way in" : to == 0 ? "Way out" : "Way through";
			return action == null || action.isEmpty() ? way : way + ": " + action;
		}
	}

	private static volatile List<Portal> loaded;
	private static volatile List<Portal> loadedFloors;

	private Portals()
	{
	}

	static List<Portal> all()
	{
		List<Portal> l = loaded;
		if (l == null)
		{
			l = parse(Portals.class.getResourceAsStream("portals.json"), "portals");
			loaded = l;
		}
		return l;
	}

	/** Staircases and ladders within a layer (another floor). */
	static List<Portal> floors()
	{
		List<Portal> l = loadedFloors;
		if (l == null)
		{
			l = parse(Portals.class.getResourceAsStream("portals.json"), "floors");
			loadedFloors = l;
		}
		return l;
	}

	static List<Portal> parse(InputStream in)
	{
		return parse(in, "portals");
	}

	static List<Portal> parse(InputStream in, String key)
	{
		List<Portal> out = new ArrayList<>();
		if (in == null)
		{
			return out;
		}
		try (InputStreamReader r = new InputStreamReader(in, StandardCharsets.UTF_8))
		{
			JsonObject root = new JsonParser().parse(r).getAsJsonObject();
			if (!root.has(key))
			{
				return out;
			}
			for (JsonElement e : root.getAsJsonArray(key))
			{
				JsonArray a = e.getAsJsonArray();
				out.add(new Portal(a.get(0).getAsInt(), a.get(1).getAsInt(), a.get(2).getAsInt(), a.get(3).getAsInt(), a.get(4).getAsInt(),
					a.get(5).getAsInt(), a.get(6).getAsInt(), a.get(7).getAsString(), a.get(8).getAsString()));
			}
		}
		catch (Exception ex)
		{
			// No ways is the old behaviour ("find the way down"), never a broken plugin.
			log.warn("portals.json not read: {}", ex.toString());
			return Collections.emptyList();
		}
		return out;
	}

	/**
	 * The way to take from the player's tile toward a target in another layer, or null (same layer, or nothing fits). Into an area: the way whose
	 * far end is nearest the target. Out of one: a way near the player whose far end is nearest the target. A way with a requirement only when no free
	 * one fits.
	 */
	static Portal pick(List<Portal> portals, int px, int py, int tx, int ty)
	{
		int from = Navigation.layer(py);
		int to = Navigation.layer(ty);
		if (from == to)
		{
			return null;
		}
		for (boolean withReq : new boolean[] {false, true})
		{
			Portal best = null;
			double bestScore = Double.MAX_VALUE;
			for (Portal p : portals)
			{
				if (Navigation.layer(p.getY()) != from || Navigation.layer(p.getToY()) != to || p.getReq().isEmpty() == withReq)
				{
					continue;
				}
				double score;
				if (to != 0)
				{
					double d = Math.hypot(p.getToX() - tx, p.getToY() - ty);
					if (d > AREA_REACH)
					{
						continue;
					}
					score = d + Math.hypot(p.getX() - px, p.getY() - py) / 1000;
				}
				else
				{
					double near = Math.hypot(p.getX() - px, p.getY() - py);
					if (near > EXIT_REACH)
					{
						continue;
					}
					score = Math.hypot(p.getToX() - tx, p.getToY() - ty) + near / 10;
				}
				if (score < bestScore)
				{
					best = p;
					bestScore = score;
				}
			}
			if (best != null)
			{
				return best;
			}
		}
		return null;
	}

	static Portal pick(int px, int py, int tx, int ty)
	{
		return pick(all(), px, py, tx, ty);
	}

	/**
	 * The staircase or ladder toward a target on another floor of the same layer (Arsen in the central hut, a floor up), or null. Only the first flight.
	 * Up: the one that comes out nearest the target (its building). Down: the one nearest the player (out of the player's building). As pickFloor in
	 * src/lib/portals.ts.
	 */
	static Portal pickFloor(List<Portal> floors, int px, int py, int pplane, int tx, int ty, int tplane)
	{
		if (Navigation.layer(py) != Navigation.layer(ty) || pplane == tplane)
		{
			return null;
		}
		boolean up = tplane > pplane;
		for (boolean withReq : new boolean[] {false, true})
		{
			Portal best = null;
			double bestScore = Double.MAX_VALUE;
			for (Portal p : floors)
			{
				if (p.getReq().isEmpty() == withReq || p.getPlane() != pplane || (p.getToPlane() > p.getPlane()) != up)
				{
					continue;
				}
				double toTarget = Math.hypot(p.getToX() - tx, p.getToY() - ty);
				double toPlayer = Math.hypot(p.getX() - px, p.getY() - py);
				if (up ? toTarget > FLOOR_REACH : toPlayer > FLOOR_NEAR)
				{
					continue;
				}
				double score = up ? toTarget + toPlayer / 10 : toPlayer + toTarget / 100;
				if (score < bestScore)
				{
					best = p;
					bestScore = score;
				}
			}
			if (best != null)
			{
				return best;
			}
		}
		return null;
	}

	static Portal pickFloor(int px, int py, int pplane, int tx, int ty, int tplane)
	{
		return pickFloor(floors(), px, py, pplane, tx, ty, tplane);
	}
}
