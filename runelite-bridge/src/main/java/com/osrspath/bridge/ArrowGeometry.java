package com.osrspath.bridge;

import java.awt.Polygon;

/**
 * The big arrow to the target: how to turn it on the screen and what state it is in.
 *
 * The direction is computed the way RuneLite places points on the minimap (Perspective.localToMinimap in 1.12.39):
 * the offset to the target in tiles (x is east, y is north) is rotated by the camera angle
 * {@code getCameraYawTarget() & 16383} (16384 units per turn). So the arrow points the same way as
 * the minimap: a target straight ahead of the camera is up, on the right is right, behind is down. Pure logic, checked by an
 * ordinary test.
 */
final class ArrowGeometry
{
	/** Closer than this many tiles the arrow is bigger and brighter: the target is near. */
	static final int APPROACH = 20;
	/** A turn smaller than this (in radians, ~2 degrees) is not drawn: the arrow does not tremble from small shifts. */
	static final double DEAD_ZONE = Math.toRadians(2);
	/** The share of the way to the new angle per frame: a smooth turn instead of a jerk. */
	static final double EASE = 0.35;
	private static final double TURN = 2 * Math.PI;
	private static final int YAW_UNITS = 16384;

	enum State
	{
		/** The target is far. */
		DEFAULT,
		/** The target is on the approach (closer than {@link #APPROACH}). */
		APPROACHING,
		/** "✓ Nearby": the arrow is not needed. */
		VERY_CLOSE,
		/** The target is on another plane or underground: there is an arrow, but the label matters most. */
		OTHER_LEVEL,
	}

	private ArrowGeometry()
	{
	}

	/**
	 * The arrow angle on screen in radians: 0 is right, pi/2 is down (the screen's y axis points down), -pi/2 is up.
	 * dx, dy are from the player to the target in world tiles; yaw is the camera angle from the client.
	 */
	static double screenAngle(int dx, int dy, int yaw)
	{
		double a = (yaw & (YAW_UNITS - 1)) * TURN / YAW_UNITS;
		double sx = Math.cos(a) * dx + Math.sin(a) * dy;
		double sy = Math.sin(a) * dx - Math.cos(a) * dy;
		return Math.atan2(sy, sx);
	}

	/** The angle in (-pi, pi]. */
	static double wrap(double a)
	{
		double r = a % TURN;
		if (r <= -Math.PI)
		{
			r += TURN;
		}
		else if (r > Math.PI)
		{
			r -= TURN;
		}
		return r;
	}

	/**
	 * The next arrow angle: to the new one along the short arc and smoothly; small things inside the dead zone do not move it.
	 * NaN in prev means there was no arrow yet: the new angle at once.
	 */
	static double smooth(double prev, double next)
	{
		if (Double.isNaN(prev))
		{
			return next;
		}
		double d = wrap(next - prev);
		if (Math.abs(d) < DEAD_ZONE)
		{
			return prev;
		}
		// A big turn (the player turned the camera) goes at once, otherwise the arrow points the wrong way for half a second.
		return Math.abs(d) > Math.PI / 2 ? next : wrap(prev + d * EASE);
	}

	/** The state by distance: near is "Nearby" from the HUD (with protection against flicker at the boundary). */
	static State state(int distance, boolean sameLevel, boolean near)
	{
		if (!sameLevel)
		{
			return State.OTHER_LEVEL;
		}
		if (near)
		{
			return State.VERY_CLOSE;
		}
		return distance <= APPROACH ? State.APPROACHING : State.DEFAULT;
	}

	/**
	 * An arrowhead with a tail, turned by angle, in a circle of radius r around (cx, cy). The nose is at a distance of
	 * 0.9 r from the centre, the tail at 0.55 r on the other side: the whole figure is inside the circle at any angle.
	 */
	static Polygon arrow(double cx, double cy, double r, double angle)
	{
		double[][] shape = {
			{0.90, 0.00},
			{0.10, 0.62},
			{0.10, 0.24},
			{-0.55, 0.24},
			{-0.55, -0.24},
			{0.10, -0.24},
			{0.10, -0.62},
		};
		Polygon p = new Polygon();
		double cos = Math.cos(angle);
		double sin = Math.sin(angle);
		for (double[] s : shape)
		{
			double x = s[0] * r;
			double y = s[1] * r;
			p.addPoint((int) Math.round(cx + x * cos - y * sin), (int) Math.round(cy + x * sin + y * cos));
		}
		return p;
	}
}
