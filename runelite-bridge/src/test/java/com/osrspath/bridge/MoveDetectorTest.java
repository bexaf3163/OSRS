package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** What counts as a jump: a teleport and a respawn do; walking, running and going down a ladder do not. */
public class MoveDetectorTest
{
	@Test
	public void walkingAndRunning_notAJump()
	{
		assertFalse(MoveDetector.isJump(3200, 3200, 3201, 3200));
		assertFalse(MoveDetector.isJump(3200, 3200, 3202, 3202));
		assertFalse("a ladder in the castle: the floor changes, the tile is nearby", MoveDetector.isJump(3205, 3209, 3205, 3209));
	}

	@Test
	public void teleport_andRespawn_isAJump()
	{
		// From Varrock to Lumbridge: Home Teleport or a respawn after death.
		assertTrue(MoveDetector.isJump(3213, 3428, 3222, 3218));
		assertTrue(MoveDetector.isJump(3000, 3200, 3222, 3218));
		assertTrue("exactly the threshold", MoveDetector.isJump(3200, 3200, 3200 + MoveDetector.JUMP, 3200));
		assertFalse("a tile below the threshold", MoveDetector.isJump(3200, 3200, 3200 + MoveDetector.JUMP - 1, 3200));
	}

	@Test
	public void goingDownALadder_underground_notAJump()
	{
		// The ladder near Port Sarim leads to the Ice Dungeon: the same x, y shifted by 6400.
		assertFalse(MoveDetector.isJump(3008, 3150, 3008, 3150 + MoveDetector.UNDERGROUND));
		assertFalse(MoveDetector.isJump(3008, 3150 + MoveDetector.UNDERGROUND, 3008, 3150));
		// And a death in a dungeon with a respawn in Lumbridge is a jump.
		assertTrue(MoveDetector.isJump(3049, 9566, 3222, 3218));
	}

	@Test
	public void undergroundY_isBroughtToSurface()
	{
		assertEquals(3150, MoveDetector.surfaceY(9550));
		assertEquals(3150, MoveDetector.surfaceY(3150));
		assertEquals(0, MoveDetector.distance(3008, 3150, 3008, 9550));
	}
}
