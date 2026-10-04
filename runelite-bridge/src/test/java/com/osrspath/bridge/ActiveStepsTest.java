package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

/**
 * The step targets exactly as the app sends them on /active-step (active-steps.json is written by the app test
 * tests/activeSteps.fixture.test.ts): the plugin accepts each one, and the "What you need" list in the game has buttons where an
 * item has a place. Before, the plugin tests retold the route themselves and could drift from the app.
 */
public class ActiveStepsTest
{
	private static final Gson GSON = new Gson();

	/** The step target and a label for messages: "S2-03" or "S2-05 / varrock-teleport". */
	static final class Sent
	{
		final String name;
		final ActiveTarget target;

		Sent(String name, ActiveTarget target)
		{
			this.name = name;
			this.target = target;
		}
	}

	static List<Sent> all()
	{
		JsonArray rows = GSON.fromJson(new InputStreamReader(ActiveStepsTest.class.getResourceAsStream("/active-steps.json"), StandardCharsets.UTF_8), JsonArray.class);
		List<Sent> out = new ArrayList<>();
		for (JsonElement e : rows)
		{
			JsonObject row = e.getAsJsonObject();
			String name = row.get("step").getAsString() + (row.get("branch").isJsonNull() ? "" : " / " + row.get("branch").getAsString());
			out.add(new Sent(name, GSON.fromJson(row.get("target"), ActiveTarget.class)));
		}
		return out;
	}

	@Test
	public void pluginAcceptsEveryStepOfTheApp()
	{
		List<Sent> sent = all();
		assertTrue("too few targets: " + sent.size(), sent.size() > 60);
		List<String> bad = new ArrayList<>();
		for (Sent s : sent)
		{
			String problem = s.target.prepare();
			if (problem != null)
			{
				bad.add(s.name + ": " + problem);
			}
			if (s.target.getGuide() == null)
			{
				bad.add(s.name + ": no 'what you need' list - the plugin would ask to update the app");
			}
		}
		assertTrue(String.join("\n", bad), bad.isEmpty());
	}

	@Test
	public void anItemWithAPlaceInTheListHasAButton()
	{
		int buttons = 0;
		int npcRows = 0;
		java.awt.FontMetrics fm = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_ARGB).createGraphics()
			.getFontMetrics(OverlayText.font(net.runelite.client.ui.FontManager.getRunescapeFont(), 1f));
		for (Sent s : all())
		{
			assertTrue(s.name, s.target.prepare() == null);
			// Nothing in the bag, the bank was opened: everything not 'along the way' is 'none', and where to get it is a button if the place is known.
			StepGuide.View v = StepGuide.view(s.target, new ItemCounts(), new ItemCounts(), null, 0, 0, 0);
			for (StepGuide.ItemLine i : v.getItems())
			{
				if (i.getPlace() >= 0)
				{
					GuideList.Row r = GuideList.item(i, v.getPlaces(), fm, fm, OverlayText.inner(OsrsPathGuideOverlay.WIDTH));
					assertEquals(s.name + " " + i.getName(), GuideList.Action.place(i.getPlace()), r.getAction());
					buttons++;
				}
			}
			for (GuideList.Row r : GuideList.rows(v, false, fm, fm, OsrsPathGuideOverlay.WIDTH))
			{
				if (r.getAction().getKind() == GuideList.Kind.PLACE && r.getLines().get(0).getLeft().startsWith("►"))
				{
					npcRows++;
					NavTarget n = StepGuide.navTo(s.target, r.getAction().getPlace());
					assertNotNull(s.name + ": place without a target " + r.getLines().get(0).getLeft(), n);
				}
			}
		}
		// Where items come from (from) and quest NPCs: dozens of steps, not only S2-03.
		assertTrue("buttons at items: " + buttons, buttons >= 40);
		assertTrue("places in 'Where to go': " + npcRows, npcRows >= 60);
	}
}
