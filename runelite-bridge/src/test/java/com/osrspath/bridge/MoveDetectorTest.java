package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Что считается скачком: телепорт и возрождение — да; ходьба, бег и спуск по лестнице — нет. */
public class MoveDetectorTest
{
	@Test
	public void ходьбаИбег_неСкачок()
	{
		assertFalse(MoveDetector.isJump(3200, 3200, 3201, 3200));
		assertFalse(MoveDetector.isJump(3200, 3200, 3202, 3202));
		assertFalse("лестница в замке: меняется этаж, клетка рядом", MoveDetector.isJump(3205, 3209, 3205, 3209));
	}

	@Test
	public void телепорт_иВозрождение_скачок()
	{
		// Из Varrock в Lumbridge — Home Teleport или возрождение после смерти.
		assertTrue(MoveDetector.isJump(3213, 3428, 3222, 3218));
		assertTrue(MoveDetector.isJump(3000, 3200, 3222, 3218));
		assertTrue("ровно порог", MoveDetector.isJump(3200, 3200, 3200 + MoveDetector.JUMP, 3200));
		assertFalse("на клетку меньше порога", MoveDetector.isJump(3200, 3200, 3200 + MoveDetector.JUMP - 1, 3200));
	}

	@Test
	public void спускПоЛестнице_подЗемлю_неСкачок()
	{
		// Лестница у Port Sarim ведёт в Ice Dungeon: те же x, y сдвинут на 6400.
		assertFalse(MoveDetector.isJump(3008, 3150, 3008, 3150 + MoveDetector.UNDERGROUND));
		assertFalse(MoveDetector.isJump(3008, 3150 + MoveDetector.UNDERGROUND, 3008, 3150));
		// А смерть в подземелье с возрождением в Lumbridge — скачок.
		assertTrue(MoveDetector.isJump(3049, 9566, 3222, 3218));
	}

	@Test
	public void подземныйY_приводитсяКНаземному()
	{
		assertEquals(3150, MoveDetector.surfaceY(9550));
		assertEquals(3150, MoveDetector.surfaceY(3150));
		assertEquals(0, MoveDetector.distance(3008, 3150, 3008, 9550));
	}
}
