package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

public class QhViaTest
{
	private static ActiveTarget.StageLine line(String k, int x, int y, int plane)
	{
		ActiveTarget.StageLine l = new ActiveTarget.StageLine();
		l.setT(k);
		l.setK(k);
		l.setX(x);
		l.setY(y);
		l.setPlane(plane);
		return l;
	}

	@Test
	public void theCorsairCurseGoesDownTheHoleNotStraightToTess()
	{
		QhSteps.Tile hole = QhSteps.tile("S4-01", "goDownToTess");
		assertNotNull("Quest Helper's step tile is shipped with the plugin", hole);
		Set<String> proper = new HashSet<>();
		QhVia.properWords("Talk to Chief Tess (Corsair Cove Dungeon), return the relic", proper);
		QhVia.Via via = QhVia.of("goDownToTess", hole, line("talkToTess", 2012, 9006, 1), "Hole", proper);
		assertNotNull(via);
		assertEquals("Go down to Tess (Hole)", via.getLabel());
		assertEquals(2523, via.getX());
		assertEquals(2861, via.getY());
		assertEquals(31791, via.getObjectId());
		assertEquals(Collections.singletonList(31791), via.highlight().getObj());
	}

	@Test
	public void theLinesOwnStepNeedsNoVia()
	{
		QhSteps.Tile tess = QhSteps.tile("S4-01", "talkToTess");
		assertNull(QhVia.of("talkToTess", tess, line("talkToTess", 2012, 9006, 1), "Chief Tess", Collections.emptySet()));
	}

	@Test
	public void aStepAtTheLinesPlaceNeedsNoVia()
	{
		QhSteps.Tile t = new QhSteps.Tile("NpcStep", 3000, 3000, 0, 5);
		assertNull(QhVia.of("someSubStep", t, line("talkToX", 3001, 3002, 0), null, Collections.emptySet()));
		assertNotNull("another floor is another place", QhVia.of("someSubStep", t, line("talkToX", 3001, 3002, 1), null, Collections.emptySet()));
	}

	@Test
	public void anNpcStepHighlightsTheNpc()
	{
		QhVia.Via v = QhVia.of("talkToAggie", new QhSteps.Tile("NpcStep", 3086, 3258, 0, 4284), line("talkToJoe", 3128, 3245, 0), "Aggie", Collections.emptySet());
		assertEquals(Collections.singletonList(4284), v.highlight().getNpc());
		assertNull(v.highlight().getObj());
		assertEquals("Talk to aggie (Aggie)", v.getLabel());
	}

	@Test
	public void namesKeepTheirCapitalAndStepNumbersGo()
	{
		Set<String> proper = new HashSet<>();
		QhVia.properWords("Talk to Colin in the central hut. Talk to Zambo on Karamja.", proper);
		assertTrue(proper.contains("colin"));
		assertTrue(proper.contains("zambo"));
		assertTrue(proper.contains("karamja"));
		assertTrue("a sentence start is not a name", !proper.contains("talk"));
		assertEquals("Go up to Colin", QhVia.humanize("goUpToColin2", proper));
		assertEquals("Talk to Zambo", QhVia.humanize("smuggleRum.talkToZambo", proper));
		assertEquals("Go f1 to f0 lumbridge castle", QhVia.humanize("goF1ToF0LumbridgeCastle", Collections.emptySet()));
	}

	@Test
	public void aLongLabelIsCut()
	{
		QhVia.Via v = QhVia.of("goDownTheVeryLongNamedStaircaseToTheBasementOfTheWizardsTower", new QhSteps.Tile("ObjectStep", 1, 1, 0, 0), null,
			"Staircase with a very long name indeed", Collections.emptySet());
		assertTrue(v.getLabel().length() <= 60);
	}

	/**
	 * The owner's screenshot, 2026-10-17: "~14 tiles, a floor up" to Arsen, and Shortest Path drew its "no route" colour: the Corsair Cove hut ladders are not in
	 * its table. Quest Helper's own step knows the ladder.
	 */
	@Test
	public void arsenAFloorUpIsReachedByTheHutLadderFromQuestHelpersStep()
	{
		QhSteps.Tile ladder = QhSteps.tile("S4-01", "goUpToArsen");
		assertNotNull(ladder);
		QhVia.Via v = QhVia.of("goUpToArsen", ladder, line("talkToArsen", 2554, 2859, 1), "Ladder", Collections.emptySet());
		assertNotNull(v);
		assertEquals(0, v.getPlane());
		assertEquals(31733, v.getObjectId());
	}
}
