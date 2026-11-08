package com.osrspath.bridge;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** Immutable quest observation transaction. A reconnect is not a login and must not rotate its session. */
final class QuestObservations
{
	private String session = UUID.randomUUID().toString();
	private long revision;
	private String owner;
	private volatile Map<String, Object> snapshot;

	void reset()
	{
		session = UUID.randomUUID().toString();
		revision = 0;
		owner = null;
		snapshot = null;
	}

	void identity(String player)
	{
		if (player != null && !Objects.equals(owner, player))
		{
			reset();
			owner = player;
		}
		snapshot = null;
	}

	void invalidate()
	{
		snapshot = null;
	}

	boolean update(String player, Map<String, String> states, Integer questPoints)
	{
		if (player == null || player.trim().isEmpty() || states == null) return false;
		if (!Objects.equals(owner, player)) identity(player);
		Map<String, Object> before = snapshot;
		if (before != null && Objects.equals(before.get("player"), player) && Objects.equals(before.get("states"), states)
			&& Objects.equals(before.get("questPoints"), questPoints)) return false;
		Map<String, Object> next = new LinkedHashMap<>();
		next.put("player", player);
		next.put("sessionId", session);
		next.put("revision", ++revision);
		next.put("states", Collections.unmodifiableMap(new LinkedHashMap<>(states)));
		next.put("questPoints", questPoints);
		snapshot = Collections.unmodifiableMap(next);
		return true;
	}

	Map<String, Object> snapshot()
	{
		return snapshot;
	}
}
