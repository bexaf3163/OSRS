package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

/**
 * The Quest Helper machine on the real S2-09 data (Pirate's Treasure): the player goes through the rum smuggling, and messages, dialogues and items
 * arrive as the plugin sees them. The occasion was a live session: the player put the rum in, filled the crate with bananas and talked to Luthas
 * ("Luthas hands you 30 coins."), and the list stayed on "Tell Luthas the crate is full": by place and items that cannot be seen,
 * while Quest Helper sees it by the chat line.
 */
public class QhScenarioTest
{
	private static final int RUM = 431;
	private static final int WHITE_APRON = 1005;

	private static List<ActiveTarget.StageLine> lines()
	{
		for (ActiveStepsTest.Sent s : ActiveStepsTest.all())
		{
			if ("S2-09".equals(s.target.getStepId()) && s.target.getGuide() != null && s.target.getGuide().getStage() != null)
			{
				return s.target.getGuide().getStage().getStages().get(1).getSteps();
			}
		}
		throw new AssertionError("no stage S2-09#1");
	}

	private static QhMachine machine()
	{
		QhMachine m = QhMachine.all().get("S2-09");
		assertNotNull("no machine S2-09", m);
		return m;
	}

	/** The list line (from one) that the machine chose; 0 means the machine does not decide or decided 'by default'. */
	private static int pick(QhMachine.Session session, QhFakeGame game)
	{
		QhMachine m = machine();
		QhMachine.Verdict v = m.resolve(1, game, session);
		if (v.isUndecided() || !v.isStrong())
		{
			return 0;
		}
		return m.lineFor(v, lines()) + 1;
	}

	@Test
	public void allStageLinesHaveAQuestHelperStepKey()
	{
		List<ActiveTarget.StageLine> lines = lines();
		assertEquals(10, lines.size());
		String[] keys = {"smuggleRum.goToKaramja", "smuggleRum.talkToZambo", "smuggleRum.talkToLuthas", "smuggleRum.addRumToCrate",
			"smuggleRum.addBananasToCrate", "smuggleRum.talkToLuthasAgain", "smuggleRum.talkToCustomsOfficer", "smuggleRum.getWhiteApron",
			"smuggleRum.getRumFromCrate", "smuggleRum.bringRumToRedbeard"};
		for (int i = 0; i < keys.length; i++)
		{
			assertEquals("key of line " + (i + 1) + " '" + lines.get(i).shown() + "'", keys[i], lines.get(i).getK());
		}
	}

	@Test
	public void rumSmuggling_fromTheQuayToTheDelivery_everyLineOnTime()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame();
		// Talked to Redbeard Frank: "Ok, I will bring you some rum." Stands on the Port Sarim quay.
		g.say("Redbeard Frank", "Ok, I will bring you some rum.");
		assertEquals("to the boat: the first line", 1, pick(s, g));
		// Arrived on Karamja: no rum yet, to Zembo.
		g.at(2955, 3146);
		assertEquals("on Karamja without rum: 'buy rum from Zembo'", 2, pick(s, g));
		// Bought the rum.
		g.give(RUM, 1);
		assertEquals("rum bought: 'pick bananas, talk to Luthas'", 3, pick(s, g));
		// Luthas hired them and offered to fill the crate.
		g.at(2938, 3154).say("Luthas", "If you could fill it up with bananas, I'll pay you 30 gold.");
		assertEquals("hired, rum on hand: 'put the rum in the crate'", 4, pick(s, g));
		// Put the rum in the crate: the rum left the bag, the game wrote a message in the window.
		g.take(RUM).mes("You stash the rum in the crate.");
		assertEquals("rum in the crate: 'fill the crate with bananas'", 5, pick(s, g));
		// Filled the crate.
		g.mes("You fill the crate with bananas.");
		assertEquals("the crate is full: 'tell Luthas'", 6, pick(s, g));
		// Told Luthas - the live-game case: the list must move at once, not when the player reaches the Customs officer.
		g.chat("Luthas hands you 30 coins.");
		assertEquals("Luthas paid: 'return to Port Sarim, pay the Customs officer'", 7, pick(s, g));
		// Returned to Port Sarim.
		g.at(3020, 3230);
		assertEquals("in Port Sarim: 'take the White apron'", 8, pick(s, g));
		g.give(WHITE_APRON, 1);
		assertEquals("apron taken: 'rum in Wydin's back-room crate'", 9, pick(s, g));
		g.give(RUM, 1);
		assertEquals("rum taken out of the crate: 'bring it to Redbeard Frank'", 10, pick(s, g));
	}

	@Test
	public void messageForgottenAfterLoginToTheGame_stepReturnsByTheJournal()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame().at(2938, 3154).give(RUM, 1);
		// The plugin has just been started: no messages, the latches are empty - the machine cannot state anything.
		assertEquals("no evidence: the previous logic decides", 0, pick(s, g));
		// The player opened the quest journal: Quest Helper checks the step by it.
		g.journal("Pirate's Treasure", "I have taken employment on Luthas's banana plantation.");
		assertEquals("journal: 'I have taken employment' + rum on hand: 'put the rum in the crate'", 4, pick(s, g));
		// The journal was closed: the latch stayed, the step holds.
		g.closeJournal();
		assertEquals("journal closed: the step holds by the latch", 4, pick(s, g));
	}

	@Test
	public void latchesLiveUntilTheSessionResets()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame().at(2955, 3146);
		g.say("Redbeard Frank", "Ok, I will bring you some rum.");
		assertEquals(2, pick(s, g));
		g.events.clear();
		assertEquals("the message is forgotten, the latch remembers", 2, pick(s, g));
		s.reset();
		assertEquals("after a reset (another quest, leaving the game): no evidence", 0, pick(s, g));
	}

	@Test
	public void someoneElsesChatLineDoesNotMoveTheStep()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame().at(2955, 3146);
		g.say("Redbeard Frank", "Ok, I will bring you some rum.");
		g.chat("You eat the banana.").chat("Luthas hands you 30 coins");
		assertEquals("without the full stop and without the crate: not that message", 2, pick(s, g));
	}

	@Test
	public void colourTagsInAMessageDoNotInterfere()
	{
		QhMachine.Session s = new QhMachine.Session();
		QhFakeGame g = new QhFakeGame().at(2938, 3154);
		g.say("Redbeard Frank", "Ok, I will bring you some rum.");
		g.mes("<col=0000ff>You stash the rum in the crate.</col>");
		g.mes("You fill the crate with bananas.");
		g.chat("<col=ff0000>Luthas hands you 30 coins.</col>");
		assertEquals(7, pick(s, g));
	}

	@Test
	public void aStageWithoutConditions_noStrongChoice()
	{
		// var 0: the only step "talk to Redbeard" without conditions: the default choice, so the previous logic decides.
		QhMachine m = machine();
		QhMachine.Verdict v = m.resolve(0, new QhFakeGame(), new QhMachine.Session());
		assertFalse(v.isUndecided());
		assertFalse("a step without a condition is not evidence", v.isStrong());
		assertEquals("speakToRedbeard", v.getLeaf());
	}

	@Test
	public void unknownCondition_theMachineDoesNotDecide()
	{
		// var 3: the first condition is the arrow on an NPC (Quest Helper reads it from the client), the plugin has none: "don't know" is not "no".
		QhMachine.Verdict v = machine().resolve(3, new QhFakeGame(), new QhMachine.Session());
		assertTrue("the 'NpcHintArrow' condition cannot be checked by the plugin", v.isUndecided());
	}

	/** Any quest, any variable value, an empty game, a player "nowhere", memory stuffed with messages: the machine does not crash and answers. */
	@Test
	public void allMachines_justInCase_doNotCrash()
	{
		int resolved = 0;
		for (java.util.Map.Entry<String, QhMachine> e : QhMachine.all().entrySet())
		{
			for (int value = 0; value <= 520; value++)
			{
				QhFakeGame empty = new QhFakeGame();
				QhFakeGame nowhere = new QhFakeGame();
				nowhere.pos = null;
				QhFakeGame noisy = new QhFakeGame();
				for (int i = 0; i < 400; i++)
				{
					noisy.chat("junk " + i).mes("<col=ff0000>" + i + "</col>").say("Somebody", "line " + i);
				}
				for (QhFakeGame g : new QhFakeGame[] {empty, nowhere, noisy})
				{
					QhMachine.Verdict v = e.getValue().resolve(value, g, new QhMachine.Session());
					assertNotNull(e.getKey() + "@" + value, v);
					if (!v.isUndecided())
					{
						resolved++;
						assertNotNull(e.getKey() + "@" + value, v.getLeaf());
					}
				}
			}
		}
		assertTrue("the machines decide almost nothing: " + resolved, resolved > 1000);
	}

	@Test
	public void valuesWithoutAStepInQuestHelper_areNotDecided()
	{
		assertFalse(machine().hasStage(7));
		assertTrue(machine().resolve(7, new QhFakeGame(), new QhMachine.Session()).isUndecided());
	}
}
