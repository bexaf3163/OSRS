package com.osrspath.bridge;

/**
 * The "smart reveal" of the overlays: what to show in the game now. The game is the operational level: where to click, how many tiles
 * are left, whether they are hitting. Everything else (what to buy in bulk, where to get it, formulas) stays in the app window.
 *
 *  - while travelling (the target is farther than {@link #TRAVEL_TILES} tiles): the arrow and the guide closed to its headline;
 *  - at the bank (the bank window is open): the guide as the player left it and the departure check;
 *  - at the exchange (GE offers are open): the bulk list; the guide closed;
 *  - near the step or with no target: the guide as the player left it.
 * The critical things, a danger zone the player is already in and health below one hit, are always visible: the guide's one warning shows when closed.
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

	/**
	 * The crowded moment, whatever the smart reveal setting says: at the exchange the one card is the exchange card, so the "What you need" list
	 * stays away and the HUD is one line (four windows at once, the owner's screenshot of 2026-10-15). A danger the player is in and health below
	 * one hit stay.
	 */
	static boolean exchangeFocus(Context c)
	{
		return c == Context.EXCHANGE;
	}


	/** The guide stays closed while travelling and at the exchange (with the smart reveal; at the exchange always). */
	static boolean compactHud(Context c)
	{
		return c == Context.TRAVEL || c == Context.EXCHANGE;
	}

	/**
	 * The training view (2.55.1): on a paced step while its skills are growing, the guide card is hidden and the HUD carries the step, the kills left
	 * and the progress. Not at the open bank (restocking needs the list) and not while a temporary target leads the arrow (a shop, a detour).
	 */
	static boolean training(boolean gaining, boolean bankOpen, boolean temporaryTarget)
	{
		return gaining && !bankOpen && !temporaryTarget;
	}

	/** The radar warning in the HUD: the smart view only when the player is already in the zone; the usual one also on the approach. */
	static boolean dangerVisible(boolean smart, DangerRadar.Level level)
	{
		return smart ? level == DangerRadar.Level.INSIDE : level == DangerRadar.Level.WARNING || level == DangerRadar.Level.INSIDE;
	}

}
