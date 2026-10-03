package com.osrspath.bridge;

/**
 * Резкий скачок персонажа: телепорт, возрождение после смерти. Шаг по земле — не больше двух клеток за тик, поэтому
 * скачок от {@link #JUMP} клеток — не ходьба. Спуск по лестнице тоже «прыгает» (под землёй координаты сдвинуты на
 * {@link #UNDERGROUND}), поэтому подземные координаты приводятся к наземным: спуск прямо под тем же местом — не скачок.
 * Чистая логика: плагин зовёт её на каждой смене клетки, программа получает событие MOVED.
 */
final class MoveDetector
{
	/** Сколько клеток за тик уже не ходьба. */
	static final int JUMP = 20;
	/** Под землёй (подземелья, подвалы) координаты y сдвинуты на столько относительно места на карте над ними. */
	static final int UNDERGROUND = 6400;

	private MoveDetector()
	{
	}

	/** Координата y как на карте мира над землёй. */
	static int surfaceY(int y)
	{
		return y >= UNDERGROUND + 1000 ? y - UNDERGROUND : y;
	}

	/** Расстояние между клетками (по большей из осей), подземелье — как место над ним; этаж не считается. */
	static int distance(int x1, int y1, int x2, int y2)
	{
		return Math.max(Math.abs(x1 - x2), Math.abs(surfaceY(y1) - surfaceY(y2)));
	}

	static boolean isJump(int x1, int y1, int x2, int y2)
	{
		return distance(x1, y1, x2, y2) >= JUMP;
	}
}
