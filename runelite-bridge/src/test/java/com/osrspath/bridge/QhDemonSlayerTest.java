package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

/**
 * Demon Slayer (S3-03) on the real data. The occasion was a live session: Sir Prysin handed over Silverlight ("Sir Prysin hands you a very shiny
 * sword."), the bag held it, and the list stayed on "Give Sir Prysin the three keys" for four minutes, until the player walked to the stone circle.
 * The machine ended in an unresolved step ("?") because the helper class IncantationStep wraps the kill step and the generator did not see through it.
 */
public class QhDemonSlayerTest
{
	private static final int SILVERLIGHT = 2402;
	private static final int KEY_PRYSIN = 2399;
	private static final int KEY_ROVIN = 2400;
	private static final int KEY_DRAIN = 2401;
	/** The quest variable value for "keys, then Silverlight" (varbit 2561 = 2). */
	private static final int VALUE = 2;

	private static List<ActiveTarget.StageLine> lines()
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if ("S3-03".equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target.getGuide().getStage().getStages().get(VALUE).getSteps();
			}
		}
		throw new AssertionError("no stage S3-03");
	}

	private static QhMachine machine()
	{
		QhMachine m = QhMachine.all().get("S3-03");
		assertNotNull("no machine S3-03", m);
		return m;
	}

	private static QhMachine.Verdict verdict(QhFakeGame game)
	{
		return machine().resolve(VALUE, game, new QhMachine.Session());
	}

	/** The list line (from one) that the machine chose; 0 means the machine does not decide or decided by default. */
	private static int pick(QhFakeGame game)
	{
		QhMachine.Verdict v = verdict(game);
		if (v.isUndecided() || !v.isStrong())
		{
			return 0;
		}
		return machine().lineFor(v, lines()) + 1;
	}

	private static QhFakeGame withThreeKeys()
	{
		QhFakeGame g = new QhFakeGame();
		g.varbits.put(2567, 1);
		return g.give(KEY_PRYSIN, 1).give(KEY_ROVIN, 1).give(KEY_DRAIN, 1);
	}

	@Test
	public void theKillLineIsTheSeventhAndHasTheQuestHelperKey()
	{
		List<ActiveTarget.StageLine> lines = lines();
		assertEquals(7, lines.size());
		assertEquals("returnToPrysin", lines.get(5).getK());
		assertEquals("killDelrithStep", lines.get(6).getK());
	}

	@Test
	public void threeKeysAndNoSword_theKeysAreHandedIn()
	{
		assertEquals("with the three keys the line is 'give Sir Prysin the keys'", 6, pick(withThreeKeys()));
	}

	@Test
	public void silverlightInTheBag_theListMovesToTheKill()
	{
		QhFakeGame g = withThreeKeys();
		// "Sir Prysin hands you a very shiny sword.": Silverlight arrives, the three keys leave.
		g.take(KEY_PRYSIN).take(KEY_ROVIN).take(KEY_DRAIN).give(SILVERLIGHT, 1);
		QhMachine.Verdict v = verdict(g);
		assertFalse("the machine decides", v.isUndecided());
		assertTrue("a met condition, not the default", v.isStrong());
		assertEquals("killDelrithStep", v.getLeaf());
		assertEquals("the kill line", 7, pick(g));
	}

	@Test
	public void silverlightInTheBankOnly_stillTheKill()
	{
		QhFakeGame g = withThreeKeys();
		g.take(KEY_PRYSIN).take(KEY_ROVIN).take(KEY_DRAIN);
		g.bank.put(SILVERLIGHT, 1);
		assertEquals("the sword is owned, the keys are not needed any more", 7, pick(g));
	}
}
