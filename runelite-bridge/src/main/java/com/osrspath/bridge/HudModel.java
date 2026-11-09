package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import lombok.Value;
import com.osrspath.bridge.HudActivity.Activity;
import com.osrspath.bridge.HudBlocks.Block;

import static com.osrspath.bridge.HudActivity.activity;
import static com.osrspath.bridge.HudActivity.activityAsNext;
import static com.osrspath.bridge.HudAdvice.adviceLines;
import static com.osrspath.bridge.HudAdvice.prepareLines;
import static com.osrspath.bridge.HudBlocks.block;
import static com.osrspath.bridge.HudWarnings.warning;
import static com.osrspath.bridge.HudWarnings.warnings;

/**
 * The one in-game HUD (2.74.0): what to do now, how far it has gone and the one warning that matters, with the details behind a click on its header.
 *
 * It is built from one snapshot of the plugin's state, taken when that state changes ({@code updateHud}): the live guide view (bag, worn, bank as the game
 * reports them now, the quest stage, the app's preparation plan), the per-tick {@link Hud.State} (distance, danger, health, food, pace) and the training
 * pace. Every figure on the card comes from that one moment, so the headline, the quantities and the advice cannot disagree. Pure: tests build it without
 * a client; {@link OsrsPathGuideOverlay} only draws it.
 *
 * What goes first, highest first:
 *  1. safety: critical health before a general danger zone, food gone mid-fight, an item a fight ahead needs (the one warning on the collapsed card);
 *  2. preparation that stops the activity: a required item that is not with you, by the app's plan and the live counts (the headline, "Then:" names the activity);
 *  3. the current action of the selected plan (training, the quest's stage line, the step) and the way there;
 *  4. optional improvements (a stop on the way, gear advice, weight, cleanup): under "More advice", never on the collapsed card.
 *
 * States are said as they are: with you, worn, in the bank, missing, not checked. A bank that was not seen is not "none", a bank copy from the last session
 * is "last seen", and an item in the bank is not ready.
 */
final class HudModel
{
	/** The tone of a line: its colour on the card. A tone is never the only sign: the words or the icon say the same. */
	enum Tone
	{
		TEXT, MUTED, LINK, GOOD, CAUTION, DANGER
	}

	/** The small vector icons of the card, drawn by the overlay (no emoji: one icon style, independent of the font). */
	enum Icon
	{
		NONE, QUEST, TRAIN, PREPARE, GO, CHECK, MISSING, BANK, UNKNOWN, WARN, DANGER, NEXT, BACK, DOT
	}

	/** One line of the card: its icon, its text (wrapped by the overlay), a short figure on the right, its tone, a click and the hover hint. */
	@Value
	static class Line
	{
		Icon icon;
		String text;
		/** A short figure on the right ("0 / 21"); null for none. */
		String right;
		Tone tone;
		/** Secondary: the smaller font. */
		boolean small;
		GuideList.Action action;
		/** The full text and what a click does, beside the card while the mouse is over the line; null for none. */
		String hint;

		static Line of(Icon icon, String text, Tone tone)
		{
			return new Line(icon, text, null, tone, false, GuideList.Action.NONE, null);
		}

		static Line small(Icon icon, String text, Tone tone)
		{
			return new Line(icon, text, null, tone, true, GuideList.Action.NONE, null);
		}

		Line withRight(String r)
		{
			return new Line(icon, text, r, tone, small, action, hint);
		}

		Line withAction(GuideList.Action a, String h)
		{
			return new Line(icon, text, right, tone, small, a, h);
		}

		Line withHint(String h)
		{
			return new Line(icon, text, right, tone, small, action, h);
		}
	}

	/** The card: the collapsed part (always drawn) and what the expanded card adds. */
	@Value
	static class Card
	{
		Icon icon;
		Tone tone;
		String headline;
		/** One compact status or progress line under the headline; null for none. */
		String status;
		/** 0 to 1 under the status; null for none. */
		Double progress;
		/** The quest's stages as segments of the strip; 0 for a plain bar. */
		int segments;
		/** The one warning of the collapsed card; null for none. */
		Line warning;
		/** "Then: train Attack to 40" when preparation or a stop on the way comes before the activity; null otherwise. */
		String then;
		/** The route step in full, at the top of the expanded card: "S4-03 · Attack to 40 and bank 50 Big bones". */
		String step;
		/** Expanded: how to do what the headline says. */
		List<Line> now;
		/** Expanded: the other preparation, then one line of what is ready. */
		List<Line> prepare;
		/** Expanded: what comes after the headline, and the stage's own buttons. */
		List<Line> next;
		/** Expanded on request: the optional recommendations, counted on the "More advice" control. */
		List<Line> advice;

		/** The real recommendations under "More advice": a label ("Inventory cleanup (advice only):") and "and N more" are not counted. */
		int adviceCount()
		{
			return (int) advice.stream().filter(l -> l.getIcon() != Icon.NONE).count();
		}

		/**
		 * The open card's "Next" starts with the activity "Then:" names, so the open card says it once, under "Next" (both repeated the same line in the
		 * 2.74.14 session).
		 */
		boolean thenInNext()
		{
			return then != null && !next.isEmpty() && then.equals(thenOf(next.get(0).getText()));
		}

		/** What the player reads, for the debug log and tests: the collapsed card, then (expanded) the sections. */
		String plain(boolean expanded, boolean adviceOpen)
		{
			List<String> out = new ArrayList<>();
			out.add(headline);
			add(out, status);
			if (!expanded || !thenInNext())
			{
				add(out, then);
			}
			if (warning != null)
			{
				out.add("! " + warning.getText());
			}
			if (!expanded)
			{
				return String.join("\n", out);
			}
			add(out, step);
			lines(out, now, null);
			lines(out, prepare, "Prepare");
			lines(out, next, "Next");
			if (!advice.isEmpty())
			{
				out.add("More advice · " + adviceCount());
				if (adviceOpen)
				{
					lines(out, advice, null);
				}
			}
			return String.join("\n", out);
		}

		private static void add(List<String> out, String s)
		{
			if (s != null && !s.isEmpty())
			{
				out.add(s);
			}
		}

		private static void lines(List<String> out, List<Line> lines, String label)
		{
			if (lines.isEmpty())
			{
				return;
			}
			if (label != null)
			{
				out.add(label);
			}
			for (Line l : lines)
			{
				out.add(l.getText() + (l.getRight() == null ? "" : " ~" + l.getRight()));
			}
		}
	}

	/** The training pace as the HUD needs it: the skill to train now, its level and goal, the style, what is left and the time. */
	@Value
	static class Pace
	{
		/** As the game's skills tab names it ("Attack"). */
		String skill;
		/** Its real level; 0 when not known yet. */
		int level;
		int target;
		/** The melee style that trains it ("Accurate"); null for a skill that has none. */
		String style;
		/** The skill to train is not the one that was growing: the attack style has to be switched. */
		boolean switchStyle;
		int actionsLeft;
		/** The action word for that count ("cows"). */
		String actions;
		/** "~93 min" or null while unknown. */
		String eta;
		/** The time is the player's own pace, not the step's first estimate. */
		boolean measured;
		double progress;
		/** Every skill of the step has reached its goal. */
		boolean done;
		/** "Attack 40" or "Attack 40, Strength 40": the goals, said when everything is reached. */
		String goals;
	}

	/** The funding plan the player started in the app: what to do and how far it has gone. */
	@Value
	static class Funding
	{
		String action;
		String progress;
		boolean estimated;
	}

	/** One snapshot of everything the card is built from. */
	@Value
	static class Input
	{
		StepGuide.View view;
		Hud.State state;
		/** The pace of a training step; null for a step without one. */
		Pace pace;
		/** The heading of a temporary target over the step ("Buy Iron scimitar from Zeke", "Go to: Varrock West Bank"); null when the arrow follows the step. */
		String detour;
		/** That target is a purchase: preparation in itself, so it leads the card. */
		boolean detourBuys;
		/** The running funding plan; null for none. */
		Funding funding;
		/** "Use Raw rat meat on Fireplace": the step's first use action whose item is with you; null otherwise. */
		String use;
		/** The pre-entry guard holds the arrow: the item a fight or a stage line ahead needs. */
		Preflight.Block preflight;
		boolean bankOpen;
		/** The step's activity is under way (its skill grew since the step was shown): food is a supply in use, not one still to take. */
		boolean started;
		/** The bank figures are the copy saved at the end of the last session, not read in this one. */
		boolean bankStale;
		/** Right after log-in the saved bank is still being looked for: "not checked" may only be "not read yet". */
		boolean bankLoading;
		/** The planner's action when it has no route step ("Read Below Ice Mountain in the quest journal"); null otherwise. */
		String plannerAction;
	}

	/** The arrow's distance readout in the status line only when the target is farther than this (tiles): nearby it says nothing new. */
	static final int FAR = SmartView.TRAVEL_TILES;
	/** Lines of preparation listed before "and N more". */
	static final int PREPARE_SHOWN = 4;
	static final int ADVICE_SHOWN = 8;
	static final int CLEANUP_SHOWN = 4;
	/** The recovery steps after a death named in the warning's hint; the app has the rest. */
	static final int RECOVERY_SHOWN = 3;

	private HudModel()
	{
	}

	/** The card, or null when there is nothing to guide by (no step, no plan, no temporary target). */
	static Card build(Input in)
	{
		StepGuide.View v = in.getView();
		if (v == null || v.getTitle() == null)
		{
			return withoutStep(in);
		}
		Activity act = activity(in);
		Block block = block(in);
		List<Line> warnings = warnings(in, block);
		Hud.State s = in.getState();
		String distance = far(s) ? s.getDistance() : null;
		Icon icon;
		Tone tone = Tone.TEXT;
		String headline;
		String status;
		Double progress = null;
		int segments = 0;
		String then = null;
		List<Line> now = new ArrayList<>();
		List<Line> next = new ArrayList<>();
		Funding f = in.getFunding();
		if (f != null)
		{
			// A plan the player started in the app (Money): the coins come before the step that needs them.
			icon = Icon.GO;
			headline = clean(f.getAction());
			status = f.getProgress() == null ? distance : f.getProgress() + (f.isEstimated() ? " (estimated)" : "");
			then = thenOf(act.headline);
			now.add(Line.small(Icon.DOT, "Raising coins for this step's purchases: the app's funding plan. Nothing is bought or sold for you.", Tone.MUTED));
			next.addAll(activityAsNext(act));
		}
		else if (block != null)
		{
			icon = Icon.PREPARE;
			tone = block.danger ? Tone.DANGER : Tone.CAUTION;
			headline = block.headline;
			status = block.status;
			then = thenOf(act.headline);
			now.addAll(block.now);
			next.addAll(activityAsNext(act));
		}
		else if (in.getDetour() != null)
		{
			icon = Icon.GO;
			headline = clean(in.getDetour());
			status = s == null ? null : s.getDistance();
			then = thenOf(act.headline);
			next.addAll(activityAsNext(act));
		}
		else
		{
			icon = act.icon;
			headline = act.headline;
			status = act.status;
			progress = act.progress;
			segments = act.segments;
			now.addAll(act.now);
			next.addAll(act.next);
		}
		if (v.getDetour() != null && f == null)
		{
			// The arrow points at a place the player chose: one click returns it to the step.
			now.add(new Line(Icon.BACK, "Arrow back to the step", null, Tone.LINK, true, GuideList.Action.BACK,
				"The arrow now points to: " + v.getDetour() + ". Click to point the arrow and path back to the step."));
		}
		Line warning = warnings.isEmpty() ? null : warnings.get(0);
		// The other warnings, each once, open with the details.
		for (int i = 1; i < warnings.size(); i++)
		{
			now.add(warnings.get(i));
		}
		List<Line> prepare = prepareLines(in, block);
		List<Line> advice = adviceLines(in, block);
		return new Card(icon, tone, headline, status, progress, segments, warning, then, stepTitle(v),
			Collections.unmodifiableList(now), Collections.unmodifiableList(prepare), Collections.unmodifiableList(next), Collections.unmodifiableList(advice));
	}

	// ------------------------------------------------------------------------------------------------------------

	/** A temporary target or a funding plan with no route step shown: a small card for it, else nothing. */
	private static Card withoutStep(Input in)
	{
		Hud.State s = in.getState();
		Funding f = in.getFunding();
		String headline = f != null ? clean(f.getAction()) : in.getDetour() != null ? clean(in.getDetour()) : in.getPlannerAction() != null ? clean(in.getPlannerAction()) : null;
		if (headline == null)
		{
			return null;
		}
		String status = f != null && f.getProgress() != null ? f.getProgress() + (f.isEstimated() ? " (estimated)" : "") : s == null ? null : s.getDistance();
		List<Line> warnings = new ArrayList<>();
		if (s != null && s.getDanger() != null)
		{
			warnings.add(warning(s.isDangerInside() ? Tone.DANGER : Tone.CAUTION, clean(s.getDanger())));
		}
		if (s != null && s.getHealth() != null)
		{
			warnings.add(warning(s.isHealthCritical() ? Tone.DANGER : Tone.CAUTION, s.getHealth()));
		}
		return new Card(Icon.GO, Tone.TEXT, headline, status, null, 0, warnings.isEmpty() ? null : warnings.get(0), null, null,
			warnings.size() > 1 ? Collections.singletonList(warnings.get(1)) : Collections.emptyList(), Collections.emptyList(), Collections.emptyList(),
			Collections.emptyList());
	}

	/** The arrow's target is far enough for its distance to be worth a line. */
	static boolean far(Hud.State s)
	{
		return s != null && s.getDistance() != null && !s.isNear() && (s.getTiles() < 0 || s.getTiles() > FAR);
	}

	/** "Stage 3 of 7"; a quest stage of one with several lines counts the lines instead ("Line 4 of 4"). */
	static String stageLabel(StepGuide.StageView s)
	{
		if (s.getTotal() > 1)
		{
			return "Stage " + s.getIndex() + " of " + s.getTotal();
		}
		int lines = s.getSteps() == null ? 0 : s.getSteps().size();
		return lines > 1 ? "Line " + (Math.max(0, Math.min(s.getCursor(), lines - 1)) + 1) + " of " + lines : null;
	}

	/** "S4-03 · Attack to 40 and bank 50 Big bones" from "[S4-03] Attack to 40 and bank 50 Big bones". */
	static String stepTitle(StepGuide.View v)
	{
		String t = v.getTitle();
		if (t == null)
		{
			return null;
		}
		String code = GuideList.code(v);
		return code + withoutCode(t);
	}

	static String withoutCode(String title)
	{
		return title == null ? "" : title.replaceFirst("^\\[[^\\]]+\\]\\s*", "");
	}

	/** A route line as a headline: without its recipe (GuideList.concise) and without the closing full stop. Never cut short: the card wraps it. */
	static String headlineOf(String line)
	{
		String c = GuideList.concise(line);
		return c.endsWith(".") && !c.endsWith("..") ? c.substring(0, c.length() - 1).trim() : c;
	}

	/** "Then: train Attack to 40". */
	static String thenOf(String headline)
	{
		return headline == null || headline.isEmpty() ? null : "Then: " + lowerFirst(headline);
	}

	/** The verbs a route action starts with: "Then: train Attack to 40". Anything else (a quest name, "Lost City") keeps its capital. */
	private static final java.util.Set<String> VERBS = new java.util.HashSet<>(java.util.Arrays.asList(
		"train", "get", "buy", "withdraw", "take", "go", "talk", "speak", "ask", "bring", "give", "hand", "deliver", "show", "kill", "fight", "defeat", "slay",
		"collect", "gather", "fetch", "grab", "pick", "loot", "obtain", "use", "mine", "fish", "cook", "craft", "smith", "smelt", "chop", "cut", "fletch", "spin",
		"tan", "dye", "make", "build", "repair", "plant", "harvest", "climb", "enter", "leave", "cross", "board", "travel", "walk", "head", "return", "visit",
		"follow", "find", "search", "open", "read", "wear", "equip", "drink", "eat", "pay", "raise", "sell", "bank", "deposit", "complete", "finish", "start",
		"catch", "light", "burn", "fill", "put", "pull", "push", "wait", "check", "teleport", "keep", "bury", "pray", "cast", "say", "tell", "accept", "stand"));

	/** "Train Attack to 40" becomes "train Attack to 40" after "Then: "; a name ("Lost City", "RuneLite", "GE prices") is kept as it is. */
	static String lowerFirst(String s)
	{
		if (s == null || s.isEmpty())
		{
			return s;
		}
		int sp = s.indexOf(' ');
		String first = sp < 0 ? s : s.substring(0, sp);
		return VERBS.contains(first.toLowerCase(Locale.ROOT)) && Character.isUpperCase(first.charAt(0)) && first.substring(1).equals(first.substring(1).toLowerCase(Locale.ROOT))
			? Character.toLowerCase(s.charAt(0)) + s.substring(1) : s;
	}

	/** The text without a leading marker the app or an older line puts in front ("⚡ ", "⚠ ", "➜ "): the card draws its own icons. */
	static String clean(String s)
	{
		if (s == null)
		{
			return null;
		}
		return s.replaceFirst("^[\\s⚡⚠➜✓✗•►●▶◀→]+(?:️)?\\s*", "").trim();
	}

	static String join(String... parts)
	{
		List<String> out = new ArrayList<>();
		for (String p : parts)
		{
			if (p != null && !p.trim().isEmpty())
			{
				out.add(p.trim());
			}
		}
		return out.isEmpty() ? null : String.join(" · ", out);
	}
}
