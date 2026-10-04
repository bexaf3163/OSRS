package com.osrspath.bridge;

/**
 * An abrupt jump of the character: a teleport, a respawn after death. A step on the ground is at most two tiles per tick, so
 * a jump of {@link #JUMP} tiles or more is not walking. Going down a ladder also "jumps" (underground the coordinates are shifted by
 * {@link #UNDERGROUND}), so underground coordinates are brought to surface ones: going down right under the same place is not a jump.
 * Pure logic: the plugin calls it on every tile change, the app receives a MOVED event.
 */
final class MoveDetector
{
	/** How many tiles per tick is no longer walking. */
	static final int JUMP = 20;
	/** Underground (dungeons, basements) the y coordinates are shifted by this much relative to the place on the map above them. */
	static final int UNDERGROUND = 6400;

	private MoveDetector()
	{
	}

	/** The y coordinate as on the world map above ground. */
	static int surfaceY(int y)
	{
		return y >= UNDERGROUND + 1000 ? y - UNDERGROUND : y;
	}

	/** The distance between tiles (by the larger of the axes), a dungeon as the place above it; the plane is not counted. */
	static int distance(int x1, int y1, int x2, int y2)
	{
		return Math.max(Math.abs(x1 - x2), Math.abs(surfaceY(y1) - surfaceY(y2)));
	}

	static boolean isJump(int x1, int y1, int x2, int y2)
	{
		return distance(x1, y1, x2, y2) >= JUMP;
	}
}
