package com.osrspath.bridge;

import java.util.Collections;
import java.util.List;
import lombok.Value;

/**
 * Расстояние и направление до цели для микро-HUD и путевые точки шага.
 * Это расстояние по прямой между координатами, а не число шагов по дороге: реальный путь рисует
 * Shortest Path или путевые точки. Чистая логика — проверяется обычным тестом.
 */
final class Navigation
{
	/** Ближе — «Рядом». Выход из «Рядом» чуть дальше, чтобы надпись не мигала на границе. */
	static final int NEAR = 5;
	static final int NEAR_EXIT = 7;
	/** Путевая точка засчитана, если до неё не больше стольких клеток по любой оси. */
	static final int WAYPOINT_REACH = 3;
	/** Подземелья в игре лежат на 6400 клеток севернее поверхности (как src/lib/map.ts isUnderground). */
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
	}

	static int distance(int x1, int y1, int x2, int y2)
	{
		return (int) Math.round(Math.hypot(x2 - x1, y2 - y1));
	}

	/** Стрелка по сторонам света: y в игре растёт на север. Пусто, если цель в той же клетке. */
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

	/** «клетка / клетки / клеток». */
	static String tiles(int n)
	{
		int mod100 = n % 100;
		int mod10 = n % 10;
		if (mod100 >= 11 && mod100 <= 14)
		{
			return n + " клеток";
		}
		if (mod10 == 1)
		{
			return n + " клетка";
		}
		if (mod10 >= 2 && mod10 <= 4)
		{
			return n + " клетки";
		}
		return n + " клеток";
	}

	/** Строка расстояния для HUD. wasNear — было ли «Рядом» на прошлом тике. */
	static Readout readout(int px, int py, int pPlane, int tx, int ty, int tPlane, boolean wasNear)
	{
		boolean pUnder = underground(py);
		boolean tUnder = underground(ty);
		if (pUnder != tUnder)
		{
			return new Readout(tUnder ? "Цель под землёй — найди спуск" : "Цель на поверхности — выбирайся наверх", false);
		}
		int d = distance(px, py, tx, ty);
		if (pPlane != tPlane)
		{
			String floor = tPlane > pPlane ? "этажом выше" : "этажом ниже";
			return d < NEAR
				? new Readout("Цель " + floor, false)
				: new Readout("~" + tiles(d) + " " + arrow(tx - px, ty - py) + ", " + floor, false);
		}
		if (d < NEAR || (wasNear && d < NEAR_EXIT))
		{
			return new Readout("✓ Рядом", true);
		}
		return new Readout("~" + tiles(d) + " " + arrow(tx - px, ty - py), false);
	}

	/**
	 * Путевые точки шага: калитка → мост → лестница → NPC. Текущая — первая незасчитанная.
	 * Если игрок дошёл до более дальней точки, пропущенные засчитываются. Берётся ближайшая по порядку
	 * подходящая точка, а не самая дальняя: маршрут может пройти одно место дважды (туда и обратно).
	 */
	static final class Breadcrumbs
	{
		private final List<ActiveTarget.WorldPointDto> points;
		private int index;

		Breadcrumbs(List<ActiveTarget.WorldPointDto> points)
		{
			this.points = points == null ? Collections.emptyList() : points;
		}

		/** Позиция игрока изменилась. true — текущая точка сменилась. */
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

		/** Текущая точка или null, если маршрут пройден. */
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
