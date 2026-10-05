package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

/**
 * Dragon Slayer I (S5-01..S5-09): Melzar's Maze is walked floor by floor (each door and key holder has its own plane and tile, the basement lies at y 9600+),
 * the three map pieces merge into the Crandor map, the planks of the hull are tracked one by one, and the underground tiles make valid arrow targets.
 */
public class DragonSlayerStageTest
{
	private static List<ActiveTarget.StageLine> lines(String stepId)
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if (stepId.equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				List<ActiveTarget.StageStep> stages = s.target.getGuide().getStage().getStages();
				return stages.get(stages.size() - 1).getSteps();
			}
		}
		throw new AssertionError("no stage for " + stepId);
	}

	private static int indexOf(List<ActiveTarget.StageLine> lines, String key)
	{
		for (int i = 0; i < lines.size(); i++)
		{
			if (key.equals(lines.get(i).getK()))
			{
				return i;
			}
		}
		throw new AssertionError(key);
	}

	private static ItemCounts bag(Object... rows)
	{
		ItemCounts b = new ItemCounts();
		for (int i = 0; i < rows.length; i += 3)
		{
			b.add((Integer) rows[i], ActiveTarget.nameKey((String) rows[i + 1]), (Integer) rows[i + 2]);
		}
		return b;
	}

	@Test
	public void melzarsMazeIsWalkedFloorByFloorWithAPlaneOnEveryLine()
	{
		List<ActiveTarget.StageLine> l = lines("S5-03");
		String[][] floors = {
			{"enterMelzarsMaze", "0"}, {"killRat", "0"}, {"openRedDoor", "0"}, {"goUpRatLadder", "0"},
			{"killGhost", "1"}, {"openOrangeDoor", "1"}, {"goUpGhostLadder", "1"},
			{"killSkeleton", "2"}, {"openYellowDoor", "2"}, {"goDownSkeletonLadder", "2"},
			{"goDownLadderRoomLadder", "1"}, {"goDownBasementEntryLadder", "0"},
			{"killZombie", "0"}, {"openBlueDoor", "0"}, {"killMelzar", "0"}, {"openMagntaDoor", "0"},
			{"killLesserDemon", "0"}, {"openGreenDoor", "0"}, {"openMelzarChest", "0"},
		};
		assertEquals(floors.length, l.size());
		for (int i = 0; i < floors.length; i++)
		{
			assertEquals(floors[i][0], l.get(i).getK());
			assertTrue(floors[i][0], l.get(i).hasPoint());
			assertEquals(floors[i][0], Integer.parseInt(floors[i][1]), l.get(i).getPlane().intValue());
		}
		// The basement is underground on plane 0: y above 9600, far from the ladder room above it.
		assertTrue(l.get(indexOf(l, "killZombie")).getY() > 9600);
		assertTrue(l.get(indexOf(l, "goDownBasementEntryLadder")).getY() < 3300);
	}

	@Test
	public void everyDoorAndKeyHolderIsHighlightedByItsOwnId()
	{
		List<ActiveTarget.StageLine> l = lines("S5-03");
		Object[][] ids = {
			{"enterMelzarsMaze", 2595}, {"openRedDoor", 2596}, {"openOrangeDoor", 2597}, {"openYellowDoor", 2598}, {"openBlueDoor", 2599},
			{"openMagntaDoor", 2600}, {"openGreenDoor", 2601}, {"openMelzarChest", 2603},
		};
		for (Object[] row : ids)
		{
			assertTrue((String) row[0], l.get(indexOf(l, (String) row[0])).getHl().getObj().contains((Integer) row[1]));
		}
		assertTrue(l.get(indexOf(l, "killRat")).getHl().getNpc().contains(3969));
		assertTrue(l.get(indexOf(l, "killGhost")).getHl().getNpc().contains(3975));
		assertTrue(l.get(indexOf(l, "killSkeleton")).getHl().getNpc().contains(3972));
		assertTrue(l.get(indexOf(l, "killZombie")).getHl().getNpc().contains(3980));
		assertTrue(l.get(indexOf(l, "killMelzar")).getHl().getNpc().contains(823));
		assertTrue(l.get(indexOf(l, "killLesserDemon")).getHl().getNpc().contains(3982));
	}

	@Test
	public void theCursorFollowsThePlayerUpTheFloorsAndDownIntoTheBasement()
	{
		List<ActiveTarget.StageLine> l = lines("S5-03");
		StageTracker t = new StageTracker();
		String id = "S5-03";
		assertEquals(indexOf(l, "enterMelzarsMaze"), t.update(id, 2, l, 2941, 3248, 0, bag()));
		// The red key is in the bag: the rat is done, the red door is next.
		assertEquals(indexOf(l, "openRedDoor"), t.update(id, 2, l, 2933, 3250, 0, bag(1543, "Key", 1)));
		// Two keys: the ghost is done, the orange door is next.
		assertEquals(indexOf(l, "openOrangeDoor"), t.update(id, 2, l, 2927, 3253, 1, bag(1543, "Key", 1, 1544, "Key", 1)));
		// Walking into the basement (plane 0 again, y 9600+) with six keys: the cursor is at the green door. The chest is two tiles behind it and the game
		// cannot see a door open, so the list waits there for "Done" instead of skipping the door silently.
		ItemCounts six = bag(1543, "Key", 6);
		assertEquals(indexOf(l, "openGreenDoor"), t.update(id, 2, l, 2935, 9657, 0, six));
		assertTrue(StageTracker.needsManualStep(l, indexOf(l, "openGreenDoor")));
	}

	@Test
	public void theUndergroundTilesMakeValidArrowTargets()
	{
		for (String id : new String[] {"S5-03", "S5-04", "S5-06", "S5-08"})
		{
			for (ActiveTarget.StageLine line : lines(id))
			{
				if (!line.hasPoint())
				{
					continue;
				}
				NavTarget n = new NavTarget();
				n.setLabel(line.shown());
				n.setX(line.getX());
				n.setY(line.getY());
				n.setPlane(line.getPlane());
				assertNull(id + " " + line.getK() + " " + line.getX() + "," + line.getY() + "," + line.getPlane(), n.prepare());
			}
		}
	}

	@Test
	public void theThreeMapPartsMergeIntoTheCrandorMap()
	{
		List<ActiveTarget.StageLine> l = lines("S5-07");
		int merge = indexOf(l, "repairMap");
		int ned = indexOf(l, "talkToNed");
		StageTracker t = new StageTracker();
		// Three parts that are not merged yet: the player still has to use them on each other.
		assertEquals(merge, t.update("S5-07", 0, l, 3047, 3205, 0, bag(1535, "Map part", 1, 1536, "Map part", 1, 1537, "Map part", 1)));
		// The merged map: on to Captain Ned.
		assertEquals(ned, new StageTracker().update("S5-07", 0, l, 3098, 3257, 0, bag(1538, "Crandor map", 1)));
		assertEquals("Crandor map", l.get(merge).getHas());
	}

	@Test
	public void eachPlankOfTheHullMovesTheListOneRepair()
	{
		List<ActiveTarget.StageLine> l = lines("S5-06");
		String id = "S5-06";
		StageTracker t = new StageTracker();
		int x = 3047;
		int y = 9639;
		assertEquals(indexOf(l, "repairShip"), t.update(id, 0, l, x, y, 1, bag(960, "Plank", 3)));
		assertEquals(indexOf(l, "repairShip2"), t.update(id, 0, l, x, y, 1, bag(960, "Plank", 2)));
		assertEquals(indexOf(l, "repairShip3"), t.update(id, 0, l, x, y, 1, bag(960, "Plank", 1)));
	}

	@Test
	public void theDragonsHeadInTheBagFinishesTheKill()
	{
		List<ActiveTarget.StageLine> l = lines("S5-08");
		int kill = indexOf(l, "killElvarg");
		assertEquals("Elvarg's head", l.get(kill).getHas());
		assertEquals(kill, new StageTracker().update("S5-08", 8, l, 2855, 9637, 0, bag()));
		assertEquals("no later line to move to: the kill is the end", l.size() - 1, kill);
	}

	@Test
	public void theElvargZoneWarnsOnlyWhileTheShieldIsOffAndOnlyOnTheStep()
	{
		DangerRadar radar = DangerRadar.load(new com.google.gson.Gson());
		DangerRadar.Zone elvarg = radar.getZones().stream().filter(z -> z.getId().equals("elvarg-lair")).findFirst().orElse(null);
		assertNotNull(elvarg);
		assertTrue(elvarg.getUnlessWorn().contains("Anti-dragon shield"));
		assertTrue(elvarg.getOnlySteps().contains("S5-08"));
		assertTrue(elvarg.hudText().contains("Anti-dragon shield"));
		// Standing at Elvarg: INSIDE the zone with no shield, quiet once the shield covers it.
		assertEquals(DangerRadar.Level.INSIDE, radar.update(2855, 9637, 0, z -> false).getLevel());
		assertEquals(DangerRadar.Level.NONE, new DangerRadar(radar.getZones()).update(2855, 9637, 0, z -> true).getLevel());
		DangerRadar.Zone boat = radar.getZones().stream().filter(z -> z.getId().equals("crandor-boarding")).findFirst().orElse(null);
		assertNotNull(boat);
		assertTrue(boat.getUnlessHeld().contains("Anti-dragon shield"));
	}
}
