package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.util.List;
import org.junit.Test;

/**
 * Melzar's Maze (S5-03) on the real data. The occasion was a live session: the red key went into a wrong red door (every coloured key crumbles
 * on the door it opens), the list stood on "go through the red door" by the nearest tile, and every red door was outlined. Quest Helper's
 * room-and-key logic tells "in the rat room without a key" from "with the key", so the list goes back to the rat.
 */
public class QhMelzarsMazeTest
{
	private static final int RED_KEY = 1543;
	private static final int ORANGE_KEY = 1544;
	private static final int BLUE_KEY = 1546;
	/** Dragon Slayer I while the map pieces are gathered (varp 176). */
	private static final int VALUE = 2;

	private static List<ActiveTarget.StageLine> lines()
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if ("S5-03".equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target.getGuide().getStage().getStages().get(0).getSteps();
			}
		}
		throw new AssertionError("no stage S5-03");
	}

	private static QhMachine machine()
	{
		QhMachine m = QhMachine.all().get("S5-03");
		assertNotNull("no machine S5-03", m);
		return m;
	}

	/** The list line (from one) that the machine chose; 0 means the machine does not decide or decided by default. */
	private static int pick(QhFakeGame game)
	{
		QhMachine.Verdict v = machine().resolve(VALUE, game, new QhMachine.Session());
		if (v.isUndecided() || !v.isStrong())
		{
			return 0;
		}
		return machine().lineFor(v, lines()) + 1;
	}

	private static int line(String k)
	{
		List<ActiveTarget.StageLine> lines = lines();
		for (int i = 0; i < lines.size(); i++)
		{
			if (k.equals(lines.get(i).getK()))
			{
				return i + 1;
			}
		}
		throw new AssertionError("no line " + k);
	}

	private static QhFakeGame at(int x, int y, int plane)
	{
		QhFakeGame g = new QhFakeGame();
		g.pos = new int[] {x, y, plane};
		return g;
	}

	@Test
	public void ratRoomWithoutTheKey_killTheRat()
	{
		assertEquals("the red key was used up on a wrong door: back to the rat", line("killRat"), pick(at(2933, 3250, 0)));
	}

	@Test
	public void ratRoomWithTheKey_theRedDoor()
	{
		assertEquals(line("openRedDoor"), pick(at(2933, 3250, 0).give(RED_KEY, 1)));
	}

	@Test
	public void behindTheRedDoor_theLadder()
	{
		assertEquals("the key crumbled on the right door: the ladder, not the rat", line("goUpRatLadder"), pick(at(2924, 3253, 0)));
	}

	@Test
	public void ghostRoom_theGhostThenTheOrangeDoor()
	{
		assertEquals(line("killGhost"), pick(at(2927, 3253, 1)));
		assertEquals(line("openOrangeDoor"), pick(at(2927, 3253, 1).give(ORANGE_KEY, 1)));
	}

	@Test
	public void basementWithTheBlueKey_theBlueDoor()
	{
		assertEquals(line("killZombie"), pick(at(2932, 9642, 0)));
		assertEquals(line("openBlueDoor"), pick(at(2932, 9642, 0).give(BLUE_KEY, 1)));
	}

	@Test
	public void ofTheSameColouredDoors_onlyTheNearestToTheLineTileCounts()
	{
		ActiveTarget.StageLine door = lines().get(line("openRedDoor") - 1);
		ActiveTarget.LineHighlight h = new ActiveTarget.LineHighlight(door.getHl(), door);
		assertEquals(0, h.distance(2926, 3253, 0));
		assertEquals(3, h.distance(2929, 3256, 0));
		assertEquals("another floor is never nearer", Integer.MAX_VALUE / 2, h.distance(2926, 3253, 1));
		assertEquals("without a tile no distance is known", 0, new ActiveTarget.LineHighlight(door.getHl()).distance(0, 0, 0));
	}
}
