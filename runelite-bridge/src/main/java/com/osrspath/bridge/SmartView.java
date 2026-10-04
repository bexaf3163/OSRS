package com.osrspath.bridge;

/**
 * The "smart reveal" of the overlays: what to show in the game now. The game is the operational level: where to click, how many tiles
 * are left, whether they are hitting. Everything else (what to buy in bulk, where to get it, formulas) stays in the app window.
 *
 *  - while travelling (the target is farther than {@link #TRAVEL_TILES} tiles): the arrow and one HUD line, the action and the distance;
 *  - at the bank (the bank window is open): the "What you need" list and the departure check;
 *  - at the exchange (GE offers are open): the bulk list; the HUD is one line;
 *  - near the step or with no target: the usual HUD and the "What you need" list.
 * The critical things, a danger zone the player is already in and health below one hit, are always visible.
 *
 * Only the decision is here: pure logic for tests; the overlays and the plugin draw and read the game windows.
 */
final class SmartView
{
	/** Farther than this distance to the target the player is "travelling": the step list is not needed now. */
	static final int TRAVEL_TILES = 25;

	enum Context
	{
		/** Running to the target: the arrow and one line. */
		TRAVEL,
		/** Near the step or there is no target: the usual view. */
		STEP,
		/** The bank is open. */
		BANK,
		/** The Grand Exchange offers are open. */
		EXCHANGE
	}

	private SmartView()
	{
	}

	/** tiles is the distance to the target in tiles; -1 means unknown (no target, another plane, underground). */
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

	/** The "What you need" list at the bank and near the step; while travelling and at the exchange it would block the view. */
	static boolean showsGuide(Context c)
	{
		return c == Context.BANK || c == Context.STEP;
	}

	/** The HUD in one line while travelling and at the exchange. */
	static boolean compactHud(Context c)
	{
		return c == Context.TRAVEL || c == Context.EXCHANGE;
	}

	/** The radar warning in the HUD: the smart view only when the player is already in the zone; the usual one also on the approach. */
	static boolean dangerVisible(boolean smart, DangerRadar.Level level)
	{
		return smart ? level == DangerRadar.Level.INSIDE : level == DangerRadar.Level.WARNING || level == DangerRadar.Level.INSIDE;
	}

	/**
	 * The HUD in one line: "action · distance". Only the critical lines remain: a danger zone the player is already
	 * standing in, and health below one hit.
	 */
	static OsrsPathHudOverlay.State compact(OsrsPathHudOverlay.State s)
	{
		String title = s.getTitle();
		String distance = s.getDistance();
		String line = title == null || title.isEmpty() ? distance : distance == null ? title : title + " · " + distance;
		boolean critical = s.isHealthCritical();
		return new OsrsPathHudOverlay.State(line == null ? "OSRS Path" : line, null, null, s.isNear(), null, false,
			s.isDangerInside() ? s.getDanger() : null, s.isDangerInside(), null, false, null,
			critical ? s.getHealth() : null, critical, null, s.getTiles());
	}
}
