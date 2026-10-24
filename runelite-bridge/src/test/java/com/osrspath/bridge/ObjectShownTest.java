package com.osrspath.bridge;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.Proxy;
import java.util.List;
import net.runelite.api.TileObject;
import net.runelite.api.coords.WorldPoint;
import org.junit.Test;

/**
 * Of several tracked objects with one ID, only the nearest to the reference tile is outlined: the line's tile (Melzar's red doors), or, for a
 * line that spans several places and has no tile, the player (the common ladder 16683 in The Grand Tree's "climb to Glough's house").
 */
public class ObjectShownTest
{
	private static final int LADDER = 16683;

	private static TileObject object(int id, int x, int y, int plane)
	{
		WorldPoint w = new WorldPoint(x, y, plane);
		return (TileObject) Proxy.newProxyInstance(TileObject.class.getClassLoader(), new Class<?>[]{TileObject.class}, (p, m, a) ->
		{
			switch (m.getName())
			{
				case "getId":
					return id;
				case "getWorldLocation":
					return w;
				case "getPlane":
					return plane;
				case "equals":
					return p == a[0];
				case "hashCode":
					return System.identityHashCode(p);
				default:
					return null;
			}
		});
	}

	@Test
	public void onlyTheNearestOfOneIdIsOutlined()
	{
		TileObject glough = object(LADDER, 2476, 3463, 0);
		TileObject far = object(LADDER, 2466, 3495, 0);
		List<TileObject> tracked = List.of(glough, far);
		int[] player = {2478, 3460, 0};
		assertTrue(OsrsPathBridgePlugin.nearestOfItsId(glough, tracked, player));
		assertFalse("another ladder across the stronghold is not the line's", OsrsPathBridgePlugin.nearestOfItsId(far, tracked, player));
	}

	@Test
	public void anotherFloorIsFar()
	{
		TileObject below = object(LADDER, 2476, 3463, 0);
		TileObject here = object(LADDER, 2470, 3470, 1);
		List<TileObject> tracked = List.of(below, here);
		int[] upstairs = {2476, 3463, 1};
		assertTrue(OsrsPathBridgePlugin.nearestOfItsId(here, tracked, upstairs));
		assertFalse(OsrsPathBridgePlugin.nearestOfItsId(below, tracked, upstairs));
	}

	@Test
	public void otherIdsDoNotCompete()
	{
		TileObject ladder = object(LADDER, 2490, 3490, 0);
		TileObject cupboard = object(2434, 2477, 3462, 0);
		assertTrue(OsrsPathBridgePlugin.nearestOfItsId(ladder, List.of(ladder, cupboard), new int[] {2476, 3463, 0}));
	}
}
