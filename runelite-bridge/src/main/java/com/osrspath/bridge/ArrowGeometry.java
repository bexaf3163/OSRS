package com.osrspath.bridge;

import java.awt.Polygon;

/**
 * Большая стрелка к цели: куда повернуть её на экране и в каком она состоянии.
 *
 * Направление считается так же, как RuneLite кладёт точки на миникарту (Perspective.localToMinimap в 1.12.39):
 * смещение до цели в клетках (x — на восток, y — на север) поворачивается на угол камеры
 * {@code getCameraYawTarget() & 16383} (16384 единицы на оборот). Поэтому стрелка показывает туда же, куда
 * миникарта: цель прямо по ходу камеры — вверх, справа — вправо, сзади — вниз. Чистая логика — проверяется
 * обычным тестом.
 */
final class ArrowGeometry
{
	/** Ближе стольких клеток — стрелка крупнее и ярче: цель на подходе. */
	static final int APPROACH = 20;
	/** Поворот меньше этого (в радианах, ~2°) не рисуется: стрелка не дрожит от мелких сдвигов. */
	static final double DEAD_ZONE = Math.toRadians(2);
	/** Доля пути до нового угла за кадр: плавный поворот вместо рывка. */
	static final double EASE = 0.35;
	private static final double TURN = 2 * Math.PI;
	private static final int YAW_UNITS = 16384;

	enum State
	{
		/** Цель далеко. */
		DEFAULT,
		/** Цель на подходе (ближе {@link #APPROACH}). */
		APPROACHING,
		/** «✓ Рядом» — стрелка не нужна. */
		VERY_CLOSE,
		/** Цель на другом этаже или под землёй: стрелка есть, но главное — подпись. */
		OTHER_LEVEL,
	}

	private ArrowGeometry()
	{
	}

	/**
	 * Угол стрелки на экране в радианах: 0 — вправо, π/2 — вниз (ось y экрана смотрит вниз), −π/2 — вверх.
	 * dx, dy — от игрока до цели в клетках мира; yaw — угол камеры из клиента.
	 */
	static double screenAngle(int dx, int dy, int yaw)
	{
		double a = (yaw & (YAW_UNITS - 1)) * TURN / YAW_UNITS;
		double sx = Math.cos(a) * dx + Math.sin(a) * dy;
		double sy = Math.sin(a) * dx - Math.cos(a) * dy;
		return Math.atan2(sy, sx);
	}

	/** Угол в (−π, π]. */
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
	 * Следующий угол стрелки: к новому — по короткой дуге и с плавностью; мелочь внутри мёртвой зоны не двигает.
	 * NaN в prev — стрелки ещё не было: сразу новый угол.
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
		// Большой поворот (игрок развернул камеру) — сразу, иначе стрелка полсекунды смотрит не туда.
		return Math.abs(d) > Math.PI / 2 ? next : wrap(prev + d * EASE);
	}

	/** Состояние по расстоянию: near — «Рядом» из HUD (с защитой от мигания на границе). */
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
	 * Стрелка-наконечник с хвостом, повёрнутая на angle, в круге радиуса r вокруг (cx, cy). Нос — на расстоянии
	 * 0,9 r от центра, хвост — на 0,55 r с другой стороны: вся фигура внутри круга при любом угле.
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
