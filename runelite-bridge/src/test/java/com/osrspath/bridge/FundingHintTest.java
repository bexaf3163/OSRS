package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.junit.Test;

/** The running funding plan in the game (2.64.1): one HUD line for the right character, only while the app is about; nothing is acted on. */
public class FundingHintTest
{
	private static final Gson GSON = new Gson();
	private static final long NOW = 1_000_000_000L;

	private static final String JSON = "{\"player\":\"Bexqq\",\"planId\":\"earn:cows-cowhide@1792000000000\",\"version\":1,\"status\":\"ACTIVE\","
		+ "\"title\":\"Kill cows for cowhide\",\"action\":\"Kill cows and pick up the hides until the bag is full.\",\"brief\":\"Kill cows for cowhide\",\"progress\":\"12 / 28 Cowhide\","
		+ "\"stepIndex\":2,\"stepCount\":6}";

	private static FundingHint hint(String json)
	{
		return GSON.fromJson(json, FundingHint.class);
	}

	@Test
	public void theHudLineIsTheAppsSentenceAndFigure()
	{
		FundingHint h = hint(JSON);
		assertNull(h.prepare());
		assertEquals("Raising coins: Kill cows for cowhide · 12 / 28 Cowhide", h.hudLine("Bexqq", NOW, NOW));
	}

	@Test
	public void anEstimateIsSaidToBeOne()
	{
		FundingHint h = hint(JSON.replace("\"stepIndex\"", "\"estimated\":true,\"stepIndex\""));
		assertTrue(h.hudLine("Bexqq", NOW, NOW).endsWith("12 / 28 Cowhide (estimated)"));
		FundingHint none = hint(JSON.replace("\"progress\":\"12 / 28 Cowhide\",", "").replace("\"stepIndex\"", "\"estimated\":true,\"stepIndex\""));
		assertEquals("Raising coins: Kill cows for cowhide", none.hudLine("Bexqq", NOW, NOW));
		// An app that sends no brief: the sentence is shown as it is.
		FundingHint plain = hint(JSON.replace("\"brief\":\"Kill cows for cowhide\",", ""));
		assertEquals("Raising coins: Kill cows and pick up the hides until the bag is full. · 12 / 28 Cowhide", plain.hudLine("Bexqq", NOW, NOW));
	}

	@Test
	public void itIsShownOnlyForTheCharacterItWasMadeFor_andOnlyWhileTheAppIsAbout()
	{
		FundingHint h = hint(JSON);
		// Names compare the way the game spells them: a non-breaking space, an underscore, other case.
		assertNotNull(h.hudLine("bexqq", NOW, NOW));
		assertNotNull(hint(JSON.replace("Bexqq", "Bex qq")).hudLine("Bex\u00A0Qq", NOW, NOW));
		assertNull(h.hudLine("Someone", NOW, NOW));
		assertNull(h.hudLine(null, NOW, NOW));
		assertNotNull(h.hudLine("Bexqq", NOW + FundingHint.STALE_MS, NOW));
		assertNull(h.hudLine("Bexqq", NOW + FundingHint.STALE_MS + 1, NOW));
	}

	@Test
	public void badPartsAreRefusedWithAReason()
	{
		assertEquals("invalid player", hint(JSON.replace("Bexqq", "")).prepare());
		assertEquals("invalid plan id", hint(JSON.replace("earn:cows-cowhide@1792000000000", "")).prepare());
		assertEquals("invalid status", hint(JSON.replace("ACTIVE", "PAUSED")).prepare());
		assertEquals("invalid action", hint(JSON.replace("Kill cows and pick up the hides until the bag is full.", "")).prepare());
		assertEquals("invalid step count", hint(JSON.replace("\"stepIndex\":2", "\"stepIndex\":0")).prepare());
		assertEquals("invalid step count", hint(JSON.replace("\"stepCount\":6", "\"stepCount\":1")).prepare());
		assertEquals("brief too long", hint(JSON.replace("Kill cows for cowhide\",\"progress", "x".repeat(FundingHint.MAX_SHORT + 1) + "\",\"progress")).prepare());
		assertEquals("progress too long", hint(JSON.replace("12 / 28 Cowhide", "x".repeat(FundingHint.MAX_SHORT + 1))).prepare());
		assertEquals("invalid action", hint(JSON.replace("Kill cows and pick up the hides until the bag is full.", "x".repeat(FundingHint.MAX_TEXT + 1))).prepare());
	}

	@Test
	public void theAppsArrowLosesItsMarkerOnTheHud()
	{
		assertTrue(FundingHint.isArrow("Funding: Go to the cow field north of Lumbridge."));
		assertEquals("Go to the cow field north of Lumbridge.", FundingHint.arrowText("Funding: Go to the cow field north of Lumbridge."));
		assertFalse(FundingHint.isArrow("Lady Keli: use soft clay"));
		assertFalse(FundingHint.isArrow(null));
		assertEquals("Lady Keli: use soft clay", FundingHint.arrowText("Lady Keli: use soft clay"));
	}

	@Test
	public void aBadFundingPartDoesNotHinderTheOthers_andAnOlderSnapshotHasNone()
	{
		PrepEnvelope bad = GSON.fromJson("{\"v\":6,\"seq\":5,\"step\":null,\"funding\":" + JSON.replace("ACTIVE", "DONE") + "}", PrepEnvelope.class);
		assertEquals(Collections.singleton(PrepEnvelope.FUNDING), bad.prepare().keySet());
		PrepEnvelope ok = GSON.fromJson("{\"v\":6,\"seq\":6,\"funding\":" + JSON + "}", PrepEnvelope.class);
		assertTrue(ok.prepare().isEmpty());
		assertNotNull(ok.getFunding());
		PrepEnvelope old = GSON.fromJson("{\"v\":6,\"seq\":7}", PrepEnvelope.class);
		assertTrue(old.prepare().isEmpty());
		assertNull(old.getFunding());
	}

	/** The app's own output (prep-snapshots.json is written by tests/prepEnvelope.test.ts): the plugin accepts it and draws the line the app meant. */
	@Test
	public void theAppsSnapshotWithAPlanInHandIsAcceptedAndDrawn()
	{
		JsonArray rows = GSON.fromJson(new InputStreamReader(FundingHintTest.class.getResourceAsStream("/prep-snapshots.json"), StandardCharsets.UTF_8), JsonArray.class);
		int seen = 0;
		for (JsonElement r : rows)
		{
			JsonObject row = r.getAsJsonObject();
			PrepEnvelope e = GSON.fromJson(row.get("envelope"), PrepEnvelope.class);
			if (e.getFunding() == null)
			{
				continue;
			}
			seen++;
			assertTrue(row.get("name").getAsString(), e.prepare().isEmpty());
			assertEquals("Raising coins: Kill cows for cowhide · 12 / 28 Cowhide", e.getFunding().hudLine("Tester", NOW, NOW));
			assertEquals(e.getStep().getStepId(), "S4-03");
		}
		assertEquals(1, seen);
	}
}
