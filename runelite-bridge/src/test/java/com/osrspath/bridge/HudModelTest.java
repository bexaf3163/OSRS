package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/**
 * What the one in-game HUD says (2.74.0): the selected plan's current subtask as the headline, preparation that stops it first, one warning, nothing
 * optional on the closed card, and states said as they are (with you, worn, in the bank, missing, not checked, last seen). The cases are the owner's
 * brief for the HUD and the screenshots of 2.72.1 (S4-03 on cows).
 */
public class HudModelTest
{
	private static final Gson GSON = new Gson();
	private static final String S403 = "[S4-03] Attack to 40 and bank 50 Big bones";

	// ---------- Builders ----------

	/** An item with its live figures: name, state, with you, needed, in the bank (-1 not seen), worn, healing (food), substitutes. */
	static StepGuide.ItemLine item(String name, StepGuide.Have have, int count, int need, int bank, int worn, Integer heals, boolean substitutes)
	{
		String shown = need > 1 ? name + " ×" + need : name;
		return new StepGuide.ItemLine(shown, "", have, "Buy on the Grand Exchange.", -1, shown, have == StepGuide.Have.BAG ? "have" : "", count, need, bank, worn,
			heals, false, substitutes);
	}

	static StepGuide.ItemLine salmon(StepGuide.Have have, int count, int bank)
	{
		return item("Salmon", have, count, 21, bank, 0, 9, true);
	}

	static StepGuide.View view(String title, PrepPlan prep, StepGuide.ItemLine... items)
	{
		StepGuide.View v = new StepGuide.View(title, null, Arrays.asList(items),
			Collections.singletonList(new StepGuide.PlaceLine("The cow field east of Lumbridge", 0, false, null, false)), null, null, null, null);
		return prep == null ? v : v.withPrep(prep);
	}

	static Hud.State state(String distance, int tiles)
	{
		return new Hud.State(null, null, distance, distance != null && distance.startsWith("✓"), null, false, null, false, null, false, null, null, false, null,
			tiles, null, null, false, null, false);
	}

	static Hud.State quiet()
	{
		return state(null, -1);
	}

	static HudModel.Pace attack(int level)
	{
		return new HudModel.Pace("Attack", level, 40, "Accurate", false, 733, "cows", "~93 min", false, 0.4, false, "Attack 40");
	}

	static HudModel.Input input(StepGuide.View v, Hud.State s, HudModel.Pace pace)
	{
		return new HudModel.Input(v, s, pace, null, null, null, false, null, null, null, false, false, false, false);
	}

	static HudModel.Input with(HudModel.Input in, String field, Object value)
	{
		return new HudModel.Input(
			field.equals("view") ? (StepGuide.View) value : in.getView(),
			field.equals("state") ? (Hud.State) value : in.getState(),
			field.equals("pace") ? (HudModel.Pace) value : in.getPace(),
			field.equals("planNow") ? (String) value : in.getPlanNow(),
			field.equals("planNext") ? (String) value : in.getPlanNext(),
			field.equals("detour") ? (String) value : in.getDetour(),
			field.equals("detourBuys") ? (Boolean) value : in.isDetourBuys(),
			field.equals("funding") ? (HudModel.Funding) value : in.getFunding(),
			field.equals("use") ? (String) value : in.getUse(),
			field.equals("preflight") ? (Preflight.Block) value : in.getPreflight(),
			field.equals("bankOpen") ? (Boolean) value : in.isBankOpen(),
			field.equals("started") ? (Boolean) value : in.isStarted(),
			field.equals("bankStale") ? (Boolean) value : in.isBankStale(),
			field.equals("bankLoading") ? (Boolean) value : in.isBankLoading());
	}

	/** The app's plan for the step: one line per item (name, where, priority, timing, supply). */
	static PrepPlan plan(String... lines)
	{
		StringBuilder sb = new StringBuilder("{\"stepId\":\"S4-03\",\"lines\":[");
		for (int i = 0; i < lines.length; i++)
		{
			sb.append(i == 0 ? "" : ",").append(lines[i]);
		}
		PrepPlan p = GSON.fromJson(sb.append("],\"later\":[]}").toString(), PrepPlan.class);
		assertNull(p.prepare());
		return p;
	}

	static String line(String name, int need, String where, String priority, String timing, String supply, String action)
	{
		return "{\"name\":\"" + name + "\",\"need\":" + need + ",\"where\":\"" + where + "\",\"priority\":\"" + priority + "\",\"timing\":\"" + timing + "\""
			+ (supply == null ? "" : ",\"supply\":\"" + supply + "\"") + (action == null ? "" : ",\"action\":\"" + action + "\"") + "}";
	}

	static String collapsed(HudModel.Card c)
	{
		return c.plain(false, false);
	}

	static String expanded(HudModel.Card c)
	{
		return c.plain(true, true);
	}

	// ---------- The headline is the selected plan's current subtask ----------

	@Test
	public void trainingOnCows_theHeadlineIsTheTraining_notTheRouteStepTitle()
	{
		HudModel.Card c = HudModel.build(input(view(S403, null, salmon(StepGuide.Have.BAG, 21, 30)), quiet(), attack(30)));
		assertEquals("Train Attack to 40", c.getHeadline());
		assertEquals("Attack 30 → 40 · Accurate", c.getStatus());
		assertEquals(0.4, c.getProgress(), 1e-9);
		assertEquals(HudModel.Icon.TRAIN, c.getIcon());
		assertNull("nothing comes first", c.getThen());
		assertNull("no warning", c.getWarning());
		String closed = collapsed(c);
		for (String gone : new String[] {"S4-03", "Current step", "bank 50 Big bones", "733", "Salmon", "~93 min"})
		{
			assertFalse(gone + " is not on the closed card: " + closed, closed.contains(gone));
		}
		String open = expanded(c);
		assertTrue("the route step in full when open: " + open, open.contains("S4-03 · Attack to 40 and bank 50 Big bones"));
		assertTrue("the kills and the time, with their scope, when open: " + open, open.contains("733 cows left on Accurate · ~93 min (estimate, fighting only)"));
	}

	@Test
	public void aMeasuredPaceIsShortEnoughForTheStatusLine_anEstimateWaitsInTheDetails()
	{
		HudModel.Pace measured = new HudModel.Pace("Attack", 31, 40, "Accurate", false, 650, "cows", "~71 min", true, 0.45, false, "Attack 40");
		HudModel.Card c = HudModel.build(input(view(S403, null), quiet(), measured));
		assertEquals("Attack 31 → 40 · Accurate · ~71 min", c.getStatus());
		assertTrue(expanded(c), expanded(c).contains("650 cows left on Accurate · ~71 min at your pace"));
	}

	@Test
	public void theNextSkillOfTheStepAsksToSwitchTheStyle()
	{
		HudModel.Pace next = new HudModel.Pace("Strength", 18, 20, "Aggressive", true, 40, "minotaurs", null, false, 0.9, false, "Strength 20, Attack 30");
		HudModel.Card c = HudModel.build(input(view("[S3-08] Strength to 20 and Attack to 30", null), quiet(), next));
		assertEquals("Train Strength to 20", c.getHeadline());
		assertEquals("Switch to Aggressive · Strength 18 → 20", c.getStatus());
	}

	@Test
	public void farFromTheTrainingSpot_theStatusSaysHowFar_notTheStyle()
	{
		HudModel.Card c = HudModel.build(input(view(S403, null), state("~229 tiles ↘", 229), attack(30)));
		assertEquals("Attack 30 → 40 · ~229 tiles ↘", c.getStatus());
		HudModel.Card near = HudModel.build(input(view(S403, null), state("✓ Nearby", 2), attack(30)));
		assertEquals("Attack 30 → 40 · Accurate", near.getStatus());
	}

	@Test
	public void theGoalReached_thePlansNextPhaseLeads()
	{
		HudModel.Pace done = new HudModel.Pace("Attack", 40, 40, "Accurate", false, 0, "cows", null, false, 1, true, "Attack 40");
		HudModel.Input in = with(input(view(S403, null), quiet(), done), "planNext", "Fight the Hill Giants until 50 Big bones are in the bank: Edgeville Dungeon.");
		HudModel.Card c = HudModel.build(in);
		assertEquals("Fight the Hill Giants until 50 Big bones are in the bank: Edgeville Dungeon.", c.getHeadline());
		assertEquals("Attack 40 reached", c.getStatus());
		assertEquals(HudModel.Icon.CHECK, c.getIcon());
	}

	@Test
	public void thePlansNextPhaseIsInTheDetails()
	{
		HudModel.Input in = with(input(view(S403, null), quiet(), attack(30)), "planNext", "Fight the Hill Giants until 50 Big bones are in the bank.");
		String open = expanded(HudModel.build(in));
		assertTrue(open, open.contains("Next\nFight the Hill Giants until 50 Big bones are in the bank."));
	}

	@Test
	public void aStepWithoutAStageOrPace_saysItsUseAction_orWhatIsLeft_orItsTitle()
	{
		StepGuide.View v = new StepGuide.View("[S2-03] Witch's Potion", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null);
		assertEquals("Witch's Potion", HudModel.build(input(v, quiet(), null)).getHeadline());
		assertEquals("Use Raw rat meat on Fireplace", HudModel.build(with(input(v, quiet(), null), "use", "Use Raw rat meat on Fireplace")).getHeadline());
		StepGuide.View all = new StepGuide.View("[S2-03] Witch's Potion", null, Collections.emptyList(), Collections.emptyList(), null, null,
			"Give everything to Hetty and drink from the cauldron (Drink From).", null);
		HudModel.Card c = HudModel.build(input(all, quiet(), null));
		assertEquals("Give everything to Hetty and drink from the cauldron (Drink From)", c.getHeadline());
	}

	// ---------- Preparation that stops the activity leads ----------

	@Test
	public void foodInTheBank_isThePrimaryInstruction_thenTheTraining()
	{
		PrepPlan p = plan(line("Salmon", 21, "BANK", "CRITICAL", "NOW", "CRITICAL", "Take from the bank ×21"));
		HudModel.Card c = HudModel.build(input(view(S403, p, salmon(StepGuide.Have.BANK, 0, 30)), quiet(), attack(30)));
		assertEquals("Withdraw food", c.getHeadline());
		assertEquals("Salmon or similar: 0 / 21 · in the bank", c.getStatus());
		assertEquals("Then: train Attack to 40", c.getThen());
		assertNull("no progress strip under a preparation", c.getProgress());
		assertEquals(HudModel.Icon.PREPARE, c.getIcon());
		String open = expanded(c);
		assertTrue(open, open.contains("Take from the bank ×21"));
		assertTrue("the training is what comes next: " + open, open.contains("Next\nTrain Attack to 40"));
	}

	@Test
	public void foodMissingEverywhere_saysGet_andWhereToGetIt()
	{
		PrepPlan p = plan(line("Salmon", 21, "MISSING", "CRITICAL", "NOW", "CRITICAL", "Buy: the Grand Exchange, 34 gp each"));
		HudModel.Card c = HudModel.build(input(view(S403, p, salmon(StepGuide.Have.NONE, 0, 0)), quiet(), attack(30)));
		assertEquals("Get food", c.getHeadline());
		assertEquals("Salmon or similar: 0 / 21 · not in the bank", c.getStatus());
		assertTrue(expanded(c), expanded(c).contains("Buy: the Grand Exchange, 34 gp each"));
	}

	@Test
	public void foodWithYou_noPreparation_theTrainingLeads()
	{
		PrepPlan p = plan(line("Salmon", 21, "INVENTORY", "CRITICAL", "NOW", null, null));
		HudModel.Card c = HudModel.build(input(view(S403, p, salmon(StepGuide.Have.BAG, 21, 9)), quiet(), attack(30)));
		assertEquals("Train Attack to 40", c.getHeadline());
		assertTrue(expanded(c), expanded(c).contains("The item is with you"));
	}

	@Test
	public void notesAreAnUnnoteActionRatherThanEdibleFoodOrANewPurchase()
	{
		PrepPlan p = plan(line("Salmon", 21, "BANK", "CRITICAL", "NOW", "CRITICAL", "Unnote Salmon (21) at a bank"));
		p.line("Salmon").setUnnote(21);
		HudModel.Card c = HudModel.build(input(view(S403, p, salmon(StepGuide.Have.NONE, 0, 0)), quiet(), attack(30)));
		assertEquals("Unnote food", c.getHeadline());
		assertTrue(c.getStatus(), c.getStatus().contains("banknotes in your bag"));
		assertTrue(expanded(c), expanded(c).contains("Unnote Salmon (21) at a bank"));
	}

	@Test
	public void acceptedSubstitutesCount_noBankingBecauseOneNamedFishIsAbsent()
	{
		// The app lists Trout and Tuna beside Salmon: 21 Trout in the bag are the step's food (the shared count with alternatives).
		ActiveTarget.GuideItem food = GSON.fromJson("{\"name\":\"Salmon\",\"id\":329,\"count\":21,\"alt\":[\"Trout\",\"Tuna\"]}", ActiveTarget.GuideItem.class);
		StepGuide.ItemLine l = StepGuide.item(food, Collections.emptyList(), StepGuideTest.counts(333, "Trout", 21), StepGuideTest.counts());
		assertEquals(StepGuide.Have.BAG, l.getHave());
		assertEquals(21, l.getCount());
		assertTrue(l.isSubstitutes());
		assertEquals(Integer.valueOf(9), l.getHeals());
		HudModel.Card c = HudModel.build(input(view(S403, null, l), quiet(), attack(30)));
		assertEquals("Train Attack to 40", c.getHeadline());
		// No Salmon and no other food: then it is the preparation, said with the substitutes.
		StepGuide.ItemLine none = StepGuide.item(food, Collections.emptyList(), StepGuideTest.counts(), StepGuideTest.counts());
		HudModel.Card get = HudModel.build(input(view(S403, null, none), quiet(), attack(30)));
		assertEquals("Get food", get.getHeadline());
		assertTrue(get.getStatus(), get.getStatus().startsWith("Salmon or similar: 0 / 21"));
	}

	@Test
	public void theUnknownBankIsNotZero_andNotYetReadIsNotAsked()
	{
		StepGuide.ItemLine unknown = salmon(StepGuide.Have.UNKNOWN, 0, -1);
		HudModel.Card c = HudModel.build(input(view(S403, null, unknown), quiet(), attack(30)));
		assertEquals("Get food", c.getHeadline());
		assertEquals("Salmon or similar: 0 / 21 · bank not checked", c.getStatus());
		assertFalse(collapsed(c), collapsed(c).contains("not in the bank") || collapsed(c).contains("missing"));
		// Right after log-in the saved bank is still being read: nobody is sent for food that may be in it.
		HudModel.Card loading = HudModel.build(with(input(view(S403, null, unknown), quiet(), attack(30)), "bankLoading", true));
		assertEquals("Train Attack to 40", loading.getHeadline());
		assertTrue(expanded(loading), expanded(loading).contains("Reading the bank saved from your last session"));
	}

	@Test
	public void aBankCopyFromTheLastSessionIsSaidAsLastSeen()
	{
		HudModel.Input in = with(input(view(S403, null, salmon(StepGuide.Have.BANK, 0, 30)), quiet(), attack(30)), "bankStale", true);
		assertEquals("Salmon or similar: 0 / 21 · in the bank (last seen)", HudModel.build(in).getStatus());
	}

	@Test
	public void bankIsNotReady_wornIsSaidApart()
	{
		StepGuide.ItemLine scimitarBank = item("Adamant scimitar", StepGuide.Have.BANK, 0, 1, 1, 0, null, false);
		HudModel.Card c = HudModel.build(input(view(S403, null, scimitarBank), quiet(), attack(30)));
		assertEquals("Withdraw Adamant scimitar", c.getHeadline());
		assertEquals("Adamant scimitar: 0 / 1 · in the bank", c.getStatus());
		StepGuide.ItemLine scimitarWorn = item("Adamant scimitar", StepGuide.Have.BAG, 1, 1, 0, 1, null, false);
		HudModel.Card worn = HudModel.build(input(view(S403, null, scimitarWorn, salmon(StepGuide.Have.BAG, 21, 0)), quiet(), attack(30)));
		assertEquals("Train Attack to 40", worn.getHeadline());
		assertTrue(expanded(worn), expanded(worn).contains("All 2 items are with you (1 worn)"));
	}

	@Test
	public void optionalGear_neverCompetesWithAMissingRequiredSupply()
	{
		PrepPlan p = plan(line("Salmon", 21, "BANK", "CRITICAL", "NOW", "CRITICAL", "Take from the bank ×21"),
			line("Iron chainbody", 1, "BANK", "OPTIMIZATION", "NOW", null, "Take from the bank"));
		Hud.State s = new Hud.State(null, null, null, false, null, false, null, false, null, false, "Wear Iron chainbody - it is in the bank", null, false, null,
			-1, null, null, false, null, false);
		StepGuide.ItemLine chain = item("Iron chainbody", StepGuide.Have.BANK, 0, 1, 1, 0, null, false);
		HudModel.Card c = HudModel.build(input(view(S403, p, salmon(StepGuide.Have.BANK, 0, 30), chain), s, attack(30)));
		assertEquals("Withdraw food", c.getHeadline());
		String closed = collapsed(c);
		assertFalse("the optional chainbody is not on the closed card: " + closed, closed.contains("chainbody"));
		assertNull(c.getWarning());
		assertTrue("it waits under More advice", c.getAdvice().stream().anyMatch(l -> l.getText().contains("Iron chainbody")));
		assertTrue("and is not listed as preparation", c.getPrepare().stream().noneMatch(l -> l.getText().contains("chainbody")));
	}

	@Test
	public void withAMissingRequiredItem_nothingClaimsEverythingIsWithYou()
	{
		PrepPlan p = plan(line("Salmon", 21, "BANK", "CRITICAL", "NOW", "CRITICAL", null));
		StepGuide.ItemLine sword = item("Adamant scimitar", StepGuide.Have.BAG, 1, 1, 0, 1, null, false);
		HudModel.Card c = HudModel.build(input(view(S403, p, sword, salmon(StepGuide.Have.BANK, 0, 30)), quiet(), attack(30)));
		String open = expanded(c);
		assertFalse(open, open.contains("All ") || open.contains("The item is with you"));
		assertTrue(open, open.contains("1 item with you (1 worn)"));
	}

	@Test
	public void aConsumableInUse_isCountedDownByTheFoodLine_notSentBackToTheBank()
	{
		PrepPlan p = plan(line("Salmon", 21, "INVENTORY", "CRITICAL", "NOW", "CRITICAL", null));
		StepGuide.ItemLine some = salmon(StepGuide.Have.BANK, 5, 30);
		HudModel.Input fighting = with(input(view(S403, p, some), quiet(), attack(31)), "started", true);
		assertEquals("while the training goes on, 5 Salmon are food in use", "Train Attack to 40", HudModel.build(fighting).getHeadline());
		assertEquals("at the open bank it is a restock again", "Withdraw food", HudModel.build(with(fighting, "bankOpen", true)).getHeadline());
		assertEquals("before setting off, the plan's verdict decides", "Withdraw food", HudModel.build(with(fighting, "started", false)).getHeadline());
		PrepPlan low = plan(line("Salmon", 21, "INVENTORY", "CRITICAL", "NOW", "LOW", null));
		assertEquals("a low supply is a caution, not a blocker", "Train Attack to 40",
			HudModel.build(input(view(S403, low, salmon(StepGuide.Have.BANK, 12, 30)), quiet(), attack(30))).getHeadline());
	}

	@Test
	public void forLaterOrAnImprovement_neverBlocks()
	{
		PrepPlan p = plan(line("Hammer", 1, "BANK", "IMPORTANT", "SOON", null, null));
		StepGuide.ItemLine hammer = item("Hammer", StepGuide.Have.BANK, 0, 1, 1, 0, null, false);
		HudModel.Card c = HudModel.build(input(view(S403, p, hammer), quiet(), attack(30)));
		assertEquals("Train Attack to 40", c.getHeadline());
	}

	@Test
	public void thePreEntryGuardLeads_onceAndInItsOwnWords()
	{
		Preflight.Block pb = new Preflight.Block("Cabbage", 1, 0, Preflight.Via.SOURCE, null, 2965, 3380, 0);
		Hud.State near = new Hud.State(null, null, null, false, null, false, null, false, null, false, null, null, false, null, -1, Preflight.chipText("Cabbage"),
			null, false, null, false);
		StepGuide.StageView sv = new StepGuide.StageView(2, 4, Collections.singletonList(stageLine("Give the cabbage to Sir Amik")), 0, false,
			pb.reason() + " Another note.", false);
		StepGuide.View v = new StepGuide.View("[S3-02] Black Knights' Fortress", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null, sv);
		HudModel.Card c = HudModel.build(with(input(v, near, null), "preflight", pb));
		assertEquals("Get Cabbage", c.getHeadline());
		assertEquals(HudModel.Tone.DANGER, c.getTone());
		String all = expanded(c);
		assertEquals("the chip is the headline, not a second warning: " + all, 0, all.split("Turn back", -1).length - 1);
		assertEquals("the guard's reason once: " + all, 1, all.split("missing from your bag", -1).length - 1);
		assertTrue("what the stage adds stays: " + all, all.contains("Another note."));
	}

	// ---------- One warning, safety first ----------

	@Test
	public void safetyFirst_oneWarningClosed_theRestOnceWhenOpen()
	{
		Hud.State s = new Hud.State(null, null, null, false, null, false, "Hill Giants hit up to 8", true, null, false, null, "HP 7/24 - EAT NOW! Hits up to 8", true,
			null, -1, null, null, false, null, false);
		HudModel.Card c = HudModel.build(input(view(S403, null), s, attack(30)));
		assertNotNull(c.getWarning());
		assertEquals(HudModel.Tone.DANGER, c.getWarning().getTone());
		assertEquals("HP 7/24 - EAT NOW! Hits up to 8", c.getWarning().getText());
		assertTrue(collapsed(c).contains("EAT NOW"));
		String open = expanded(c);
		assertEquals(open, 1, open.split("EAT NOW", -1).length - 1);
		assertEquals(open, 1, open.split("danger zone", -1).length - 1);
	}

	@Test
	public void foodRunningOutMidFight_isTheWarning()
	{
		Hud.State s = new Hud.State(null, null, null, false, null, false, null, false, "700 cows", false, null, null, false, null, -1, null, 0.4, true,
			"No Salmon left - bank now", true);
		HudModel.Card c = HudModel.build(input(view(S403, null), s, attack(31)));
		assertEquals("No Salmon left - bank now", c.getWarning().getText());
		assertEquals(HudModel.Tone.DANGER, c.getWarning().getTone());
		Hud.State low = new Hud.State(null, null, null, false, null, false, null, false, "700 cows", false, null, null, false, null, -1, null, 0.4, true,
			"Food: 2 Salmon · ~6 kills - bank soon", true);
		assertEquals(HudModel.Tone.CAUTION, HudModel.build(input(view(S403, null), low, attack(31))).getWarning().getTone());
		Hud.State fine = new Hud.State(null, null, null, false, null, false, null, false, "700 cows", false, null, null, false, null, -1, null, 0.4, true,
			"Food: 8 Salmon · ~24 kills", false);
		HudModel.Card ok = HudModel.build(input(view(S403, null), fine, attack(31)));
		assertNull(ok.getWarning());
		assertTrue(expanded(ok), expanded(ok).contains("Food: 8 Salmon · ~24 kills"));
	}

	@Test
	public void theRecoveryModeIsSaidOnce()
	{
		PrepPlan p = GSON.fromJson("{\"stepId\":\"S3-04\",\"recovery\":{\"title\":\"You died: step S3-04 is far away (~10582 tiles)\",\"steps\":["
			+ "\"Collect the things left after the death\",\"Take what is missing: 4 items\",\"Go back to step S3-04\"]}}", PrepPlan.class);
		assertNull(p.prepare());
		StepGuide.StageView sv = new StepGuide.StageView(7, 8, Collections.singletonList(stageLine("Defeat the Ancient Guardian or mine 4 pillars (Mining 10)")),
			0, false, "Keep the required supplies with you.", false);
		StepGuide.View v = new StepGuide.View("[S3-04] Below Ice Mountain", null, Collections.emptyList(), Collections.emptyList(), null, null, null, null, sv)
			.withPrep(p);
		for (boolean open : new boolean[] {false, true})
		{
			String text = HudModel.build(input(v, quiet(), null)).plain(open, true);
			assertEquals(text, 1, text.split("You died", -1).length - 1);
		}
		HudModel.Card c = HudModel.build(input(v, quiet(), null));
		assertEquals("Defeat the Ancient Guardian", c.getHeadline());
		assertTrue("the other way is said when open: " + expanded(c), expanded(c).contains("Defeat the Ancient Guardian or mine 4 pillars (Mining 10)"));
		assertEquals(1, expanded(c).split("Keep the required supplies", -1).length - 1);
	}

	// ---------- Quest stages ----------

	static ActiveTarget.StageLine stageLine(String text)
	{
		ActiveTarget.StageLine l = new ActiveTarget.StageLine();
		l.setT(text);
		l.setS(text);
		return l;
	}

	static StepGuide.View princeAli(int cursor, boolean peeking)
	{
		StepGuide.StageView sv = new StepGuide.StageView(3, 7, Arrays.asList(
			stageLine("Have Ned make a wig (3 balls of wool); buy rope too"),
			stageLine("Dye the wig yellow (Aggie: 2 onions + 5 gp)"),
			stageLine("Aggie: get skin paste (ashes, redberries, flour, water)")), cursor, false, null, peeking, true);
		List<StepGuide.ItemLine> items = Arrays.asList(item("Ball of wool", StepGuide.Have.BAG, 3, 3, 0, 0, null, false),
			item("Rope", StepGuide.Have.BAG, 1, 1, 0, 0, null, false), item("Onion", StepGuide.Have.NONE, 0, 2, 0, 0, null, false));
		return new StepGuide.View("[S2-10] Prince Ali Rescue", null, items, Collections.emptyList(), null, null, null, null, sv);
	}

	@Test
	public void aQuestStage_theLineInFewWords_theRecipeAndTheButtonsWhenOpen()
	{
		HudModel.Card c = HudModel.build(input(princeAli(1, false), quiet(), null));
		assertEquals("Get Onion", c.getHeadline());
		assertEquals("Then: dye the wig yellow (Aggie)", c.getThen());
		HudModel.Card noOnion = HudModel.build(input(new StepGuide.View("[S2-10] Prince Ali Rescue", null, Collections.emptyList(), Collections.emptyList(), null,
			null, null, null, princeAli(1, false).getStage()), quiet(), null));
		assertEquals("Dye the wig yellow (Aggie)", noOnion.getHeadline());
		assertEquals("Stage 3 of 7", noOnion.getStatus());
		assertEquals(7, noOnion.getSegments());
		String open = expanded(noOnion);
		assertTrue(open, open.contains("Dye the wig yellow (Aggie: 2 onions + 5 gp)"));
		assertTrue(open, open.contains("Aggie: get skin paste"));
		assertTrue(open, open.contains("Done - show the next line"));
		assertTrue(open, open.contains("Previous line"));
		assertTrue("the next line is a hint row, the buttons are buttons",
			noOnion.getNext().stream().filter(l -> l.getAction().isClickable()).count() == 2);
	}

	@Test
	public void viewingAnEarlierLine_isSaid_andTheWayBackIsAButton()
	{
		HudModel.Card c = HudModel.build(input(new StepGuide.View("[S2-10] Prince Ali Rescue", null, Collections.emptyList(), Collections.emptyList(), null, null,
			null, null, princeAli(0, true).getStage()), quiet(), null));
		assertEquals("Have Ned make a wig", c.getHeadline());
		assertEquals("Viewing an earlier line", c.getStatus());
		assertTrue(c.getNext().stream().anyMatch(l -> l.getAction().getKind() == GuideList.Kind.RESUME));
	}

	@Test
	public void aFinishedQuest_isSaidDone()
	{
		StepGuide.StageView sv = new StepGuide.StageView(7, 7, Collections.emptyList(), 0, true);
		HudModel.Card c = HudModel.build(input(new StepGuide.View("[S2-10] Prince Ali Rescue", null, Collections.emptyList(), Collections.emptyList(), null, null,
			null, null, sv), quiet(), null));
		assertEquals("Quest complete", c.getHeadline());
		assertEquals(HudModel.Icon.CHECK, c.getIcon());
		assertEquals(1.0, c.getProgress(), 1e-9);
	}

	// ---------- Detours, funding, the way there, advice ----------

	@Test
	public void aPurchaseStop_leadsWithTheActivityAsThen()
	{
		HudModel.Input in = with(with(input(view(S403, null), state("~40 tiles ↗", 40), attack(30)), "detour", "Buy Iron scimitar from Zeke"), "detourBuys", true);
		HudModel.Card c = HudModel.build(in);
		assertEquals("Buy Iron scimitar from Zeke", c.getHeadline());
		assertEquals("~40 tiles ↗", c.getStatus());
		assertEquals("Then: train Attack to 40", c.getThen());
	}

	@Test
	public void aRunningFundingPlan_leads_withItsFigure()
	{
		HudModel.Input in = with(input(view(S403, null), quiet(), attack(30)), "funding", new HudModel.Funding("Kill cows for cowhide", "12 / 27 Cowhide", true));
		HudModel.Card c = HudModel.build(in);
		assertEquals("Kill cows for cowhide", c.getHeadline());
		assertEquals("12 / 27 Cowhide (estimated)", c.getStatus());
		assertEquals("Then: train Attack to 40", c.getThen());
	}

	@Test
	public void theStopOnTheWay_theFasterWayAndTheWithdrawals_areClickableAndInTheirPlace()
	{
		PrepPlan p = GSON.fromJson("{\"stepId\":\"S4-03\",\"lines\":[],\"later\":[\"Lobster ×20\"],\"weight\":\"Leave the logs\",\"activeDetour\":{"
			+ "\"text\":\"Bank: Withdraw Hammer at Varrock West Bank (+60 tiles, saves ~84 s)\",\"label\":\"Varrock West Bank\","
			+ "\"targetTile\":{\"x\":3185,\"y\":3436,\"plane\":0},\"costTiles\":60,\"actionType\":\"WITHDRAW\"},"
			+ "\"recommendedTransport\":{\"type\":\"Item teleport\",\"destination\":\"Falador\",\"interactionId\":0,\"item\":\"Falador teleport\","
			+ "\"tile\":{\"x\":2965,\"y\":3378,\"plane\":0},\"text\":\"Falador teleport saves ~120 tiles\"},"
			+ "\"bankWithdrawals\":[{\"itemId\":8007,\"itemName\":\"Falador teleport\",\"quantity\":2}]}", PrepPlan.class);
		assertNull(p.prepare());
		HudModel.Card c = HudModel.build(input(view(S403, p), quiet(), attack(30)));
		assertTrue("the faster way is part of how to get there", c.getNow().stream().anyMatch(l -> l.getAction().getKind() == GuideList.Kind.TRANSPORT));
		assertTrue("the optional stop is advice", c.getAdvice().stream().anyMatch(l -> l.getAction().getKind() == GuideList.Kind.DETOUR));
		assertTrue(c.getAdvice().stream().anyMatch(l -> l.getText().equals("Also take from the bank: Falador teleport ×2")));
		assertTrue(c.getAdvice().stream().anyMatch(l -> l.getText().equals("Don't take now: Lobster ×20")));
		assertFalse("none of it on the closed card: " + collapsed(c), collapsed(c).contains("Hammer") || collapsed(c).contains("Falador"));
		assertTrue("More advice counts the real lines: " + c.plain(true, false), c.plain(true, false).contains("More advice · " + c.adviceCount()));
		assertEquals("the stop, the withdrawal, don't take now, weight", 4, c.adviceCount());
	}

	@Test
	public void aWayThatNeedsAStopFirst_isAdviceWithItsSummary()
	{
		PrepPlan p = GSON.fromJson("{\"stepId\":\"S2-12\",\"lines\":[],\"later\":[],\"recommendedTransport\":{\"type\":\"spell_teleport\",\"destination\":\"Varrock Square\","
			+ "\"interactionId\":0,\"tile\":{\"x\":3093,\"y\":3243,\"plane\":0},\"state\":\"prepare\","
			+ "\"summary\":\"Varrock Teleport saves ~1 min: withdraw Law rune at Draynor Bank\","
			+ "\"text\":\"Varrock Teleport (saves ~200 tiles, about 1 min). Missing: Law rune. Withdraw Law rune at Draynor Bank.\"}}", PrepPlan.class);
		assertNull(p.prepare());
		HudModel.Card c = HudModel.build(input(view("[S2-12] Goblin Diplomacy", p), quiet(), null));
		HudModel.Line way = c.getAdvice().stream().filter(l -> l.getAction().getKind() == GuideList.Kind.TRANSPORT).findFirst().orElse(null);
		assertNotNull(way);
		assertTrue(way.getText(), way.getText().startsWith("Varrock Teleport saves ~1 min: withdraw Law rune"));
		assertTrue(way.getHint(), way.getHint().contains("it buys and withdraws nothing"));
		assertTrue(c.getNow().stream().noneMatch(l -> l.getAction().getKind() == GuideList.Kind.TRANSPORT));
	}

	@Test
	public void noAdvice_noControl()
	{
		HudModel.Card c = HudModel.build(input(view(S403, null), quiet(), attack(30)));
		assertTrue(c.getAdvice().isEmpty());
		assertFalse(expanded(c), expanded(c).contains("More advice"));
	}

	@Test
	public void theArrowBackToTheStep_whenTheArrowLeadsElsewhere()
	{
		StepGuide.View v = new StepGuide.View(S403, null, Collections.emptyList(), Collections.emptyList(), "Varrock West Bank", null, null, null);
		HudModel.Card c = HudModel.build(with(input(v, state("~60 tiles ↑", 60), attack(30)), "detour", "Go to Varrock West Bank"));
		assertEquals("Go to Varrock West Bank", c.getHeadline());
		assertTrue(c.getNow().stream().anyMatch(l -> l.getAction() == GuideList.Action.BACK));
	}

	@Test
	public void nothingToGuideBy_noCard()
	{
		assertNull(HudModel.build(input(null, null, null)));
		assertNull(HudModel.build(input(StepGuide.EMPTY, quiet(), null)));
		HudModel.Card buy = HudModel.build(with(input(null, state("~12 tiles ↑", 12), null), "detour", "Buy Hammer from Rommik"));
		assertEquals("Buy Hammer from Rommik", buy.getHeadline());
	}

	// ---------- Text rules ----------

	@Test
	public void markersAreTheCardsIcons_notTextInTheLine()
	{
		assertEquals("Wear Iron scimitar - it is in the bank", HudModel.clean("⚡ Wear Iron scimitar - it is in the bank"));
		assertEquals("Missing Item: Cabbage - Turn back!", HudModel.clean("⚠ Missing Item: Cabbage - Turn back!"));
		assertEquals("Use Chronicle → Champions' Guild", HudModel.clean("➜ Use Chronicle → Champions' Guild"));
		assertEquals("train Attack to 40", HudModel.lowerFirst("Train Attack to 40"));
		assertEquals("a name in capitals stays", "GE prices", HudModel.lowerFirst("GE prices"));
		assertEquals("RuneLite first", HudModel.lowerFirst("RuneLite first"));
		assertEquals("S4-03 · Attack to 40 and bank 50 Big bones", HudModel.stepTitle(view(S403, null)));
	}

	@Test
	public void theSameSnapshotGivesTheSameCard_anUpdateWithTheSameFactsChangesNothing()
	{
		PrepPlan p = plan(line("Salmon", 21, "BANK", "CRITICAL", "NOW", "CRITICAL", "Take from the bank ×21"));
		HudModel.Card a = HudModel.build(input(view(S403, p, salmon(StepGuide.Have.BANK, 0, 30)), quiet(), attack(30)));
		HudModel.Card b = HudModel.build(input(view(S403, p, salmon(StepGuide.Have.BANK, 0, 30)), quiet(), attack(30)));
		assertEquals("the overlay rebuilds its layout only when the card changes", a, b);
		List<String> seen = new ArrayList<>();
		for (HudModel.Card c : new HudModel.Card[] {a, b})
		{
			seen.add(collapsed(c));
		}
		assertEquals(seen.get(0), seen.get(1));
	}
}
