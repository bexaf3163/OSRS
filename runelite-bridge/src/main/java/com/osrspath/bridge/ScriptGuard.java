package com.osrspath.bridge;

import java.util.HashMap;
import java.util.Map;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

/**
 * Reads that run a client script (Quest.getState is one) are only safe outside a script. A chat message, a varbit or a widget load can be
 * posted from inside a script, and a script started there throws "scripts are not reentrant": with RuneLite's assertions on, that killed the
 * client thread in the middle of the game's own script and the game froze (S3-08 to S4-01, 2.57.0, the Attack 30 level-up message).
 *
 * So the read really runs only while {@link #safe} is on (the game tick); everywhere else the last value is served, null before there is one.
 * If a read is attempted anyway and the game refuses it, the refusal is swallowed and the last value stands. Pure logic: checked by an ordinary test.
 */
final class ScriptGuard
{
	private final Map<String, Boolean> last = new HashMap<>();
	private boolean safe;

	/** The game is between scripts (inside onGameTick): reads may run. */
	void safe(boolean on)
	{
		safe = on;
	}

	boolean isSafe()
	{
		return safe;
	}

	void clear()
	{
		last.clear();
	}

	/** The value of read, run only when it is safe; otherwise (or when the game refuses) the last one for the key, null if none. */
	Boolean read(String key, BooleanSupplier read)
	{
		Boolean current = readCurrent(read::getAsBoolean);
		if (current != null) last.put(key, current);
		return last.get(key);
	}

	/** A fresh typed observation. On refusal return UNKNOWN, never another login's cached quest state. */
	<T> T readCurrent(Supplier<T> read)
	{
		if (safe)
		{
			try
			{
				return read.get();
			}
			catch (AssertionError e)
			{
				// "scripts are not reentrant": we are inside a script after all. The old value stands; the next tick reads again.
			}
		}
		return null;
	}
}
