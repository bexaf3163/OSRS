package com.osrspath.bridge;

/**
 * «Умное проявление» оверлеев: что показывать в игре сейчас. Игра — оперативный уровень: куда кликнуть, сколько клеток
 * осталось, не бьют ли. Всё остальное (что купить оптом, где взять, формулы) остаётся в окне программы.
 *
 *  — в пути (цель дальше {@link #TRAVEL_TILES} клеток): стрелка и одна строка HUD — действие и расстояние;
 *  — у банка (открыто окно банка): список «Что нужно» и проверка вылета;
 *  — на бирже (открыты предложения GE): оптовый список; HUD — одной строкой;
 *  — рядом со шагом или без цели: обычный HUD и список «Что нужно».
 * Критичное — опасная зона, в которую игрок уже вошёл, и здоровье ниже одного удара — видно всегда.
 *
 * Здесь только решение — чистая логика для тестов; рисуют и читают окна игры оверлеи и плагин.
 */
final class SmartView
{
	/** Дальше этого расстояния до цели игрок «в пути»: список шага ему сейчас не нужен. */
	static final int TRAVEL_TILES = 25;

	enum Context
	{
		/** Бежит к цели: стрелка и одна строка. */
		TRAVEL,
		/** Рядом со шагом или цели нет: обычный вид. */
		STEP,
		/** Открыт банк. */
		BANK,
		/** Открыты предложения Grand Exchange. */
		EXCHANGE
	}

	private SmartView()
	{
	}

	/** tiles — расстояние до цели в клетках; -1 — не известно (цели нет, другой этаж, под землёй). */
	static Context of(boolean bankOpen, boolean exchangeOpen, int tiles)
	{
		if (bankOpen)
		{
			return Context.BANK;
		}
		if (exchangeOpen)
		{
			return Context.EXCHANGE;
		}
		return tiles > TRAVEL_TILES ? Context.TRAVEL : Context.STEP;
	}

	/** Список «Что нужно» — у банка и рядом со шагом; в пути и на бирже он закрывал бы обзор. */
	static boolean showsGuide(Context c)
	{
		return c == Context.BANK || c == Context.STEP;
	}

	/** HUD одной строкой — в пути и на бирже. */
	static boolean compactHud(Context c)
	{
		return c == Context.TRAVEL || c == Context.EXCHANGE;
	}

	/** Предупреждение радара в HUD: умный вид — только когда игрок уже в зоне; обычный — ещё и на подходе. */
	static boolean dangerVisible(boolean smart, DangerRadar.Level level)
	{
		return smart ? level == DangerRadar.Level.INSIDE : level == DangerRadar.Level.WARNING || level == DangerRadar.Level.INSIDE;
	}

	/**
	 * HUD в одну строку: «действие · расстояние». Остаются только критичные строки: опасная зона, в которой игрок уже
	 * стоит, и здоровье ниже одного удара.
	 */
	static OsrsPathHudOverlay.State compact(OsrsPathHudOverlay.State s)
	{
		String title = s.getTitle();
		String distance = s.getDistance();
		String line = title == null || title.isEmpty() ? distance : distance == null ? title : title + " · " + distance;
		boolean critical = s.isHealthCritical();
		return new OsrsPathHudOverlay.State(line == null ? "OSRS Путь" : line, null, null, s.isNear(), null, false,
			s.isDangerInside() ? s.getDanger() : null, s.isDangerInside(), null, false, null,
			critical ? s.getHealth() : null, critical, null, s.getTiles());
	}
}
