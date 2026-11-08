package com.osrspath.bridge;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public class QuestObservationsTest
{
	@Test public void questPointsBelongToTheSameObservationRevision()
	{
		QuestObservations facts = new QuestObservations();
		Map<String, String> states = java.util.Collections.singletonMap("Fixture quest", "COMPLETED");
		assertTrue(facts.update("Fixture", states, 3));
		Map<String, Object> first = facts.snapshot();
		assertEquals(3, first.get("questPoints"));
		assertTrue(facts.update("Fixture", states, 4));
		assertEquals(2L, facts.snapshot().get("revision"));
		assertEquals(4, facts.snapshot().get("questPoints"));
		assertEquals(3, first.get("questPoints"));
		assertTrue(facts.update("Fixture", states, null));
		assertNull(facts.snapshot().get("questPoints"));
	}
	@Test public void observationsAreImmutableVersionedAndLoginBound()
	{
		QuestObservations facts = new QuestObservations();
		Map<String, String> states = new LinkedHashMap<>();
		states.put("Fixture quest", "IN_PROGRESS");
		assertTrue(facts.update("Fixture", states, 0));
		Map<String, Object> first = facts.snapshot();
		assertEquals(1L, first.get("revision"));
		assertFalse(facts.update("Fixture", states, 0));
		assertSame(first, facts.snapshot());
		states.put("Fixture quest", "COMPLETED");
		assertTrue(facts.update("Fixture", states, 0));
		assertEquals(2L, facts.snapshot().get("revision"));
		assertEquals(first.get("sessionId"), facts.snapshot().get("sessionId"));
		assertEquals("IN_PROGRESS", ((Map<?, ?>) first.get("states")).get("Fixture quest"));
		facts.reset();
		assertNull(facts.snapshot());
		assertTrue(facts.update("Fixture", states, 0));
		assertNotEquals(first.get("sessionId"), facts.snapshot().get("sessionId"));
		assertEquals(1L, facts.snapshot().get("revision"));
	}

	@Test public void statusPreservesLegacyCompletedListAndClearsFullStateOnIdentityChange()
	{
		BridgeServer bridge = new BridgeServer(0, new com.google.gson.Gson(), new BridgeServer.Listener()
		{
			public void onActiveTarget(ActiveTarget target) { }
			public void onClear() { }
		});
		bridge.setInGame(true);
		bridge.setPlayer("Fixture");
		bridge.setProgressTotals(7, 100);
		Map<String, String> states = new LinkedHashMap<>();
		states.put("Finished", "COMPLETED");
		states.put("Started", "IN_PROGRESS");
		states.put("Unread", "UNKNOWN");
		bridge.reports.setQuestStates(states);
		assertEquals(java.util.Collections.singletonList("Finished"), bridge.questsDone);
		assertNotNull(bridge.reports.statusReport().get("questStates"));
		assertEquals(7, ((Map<?, ?>) bridge.reports.statusReport().get("questStates")).get("questPoints"));
		Object session = ((Map<?, ?>) bridge.reports.statusReport().get("questStates")).get("sessionId");
		bridge.setInGame(false); // World hop / temporary disconnect: not a new login.
		assertNull(bridge.reports.statusReport().get("questStates"));
		bridge.setInGame(true);
		assertEquals(session, ((Map<?, ?>) bridge.reports.statusReport().get("questStates")).get("sessionId"));
		bridge.setPlayer(null); // Sharing temporarily off: do not invent another login for the same character.
		bridge.setPlayer("Fixture");
		bridge.reports.setQuestStates(states);
		assertEquals(session, ((Map<?, ?>) bridge.reports.statusReport().get("questStates")).get("sessionId"));
		bridge.reports.endQuestSession();
		assertNull(bridge.questsDone);
		bridge.reports.setQuestStates(states);
		assertNotEquals(session, ((Map<?, ?>) bridge.reports.statusReport().get("questStates")).get("sessionId"));
		bridge.setPlayer("Another");
		assertNull(bridge.questsDone);
		assertNull(bridge.reports.statusReport().get("questStates"));
		assertFalse(bridge.reports.statusReport().containsKey("questPoints"));
		bridge.setInGame(false);
		bridge.reports.setQuestStates(states);
		assertNull(bridge.reports.statusReport().get("questStates"));
	}
}
