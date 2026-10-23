package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import lombok.Value;

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
		NONE, QUEST, TRAIN, PREPARE, GO, CHECK, MISSING, BANK, UNKNOWN, WARN, DANGER, NEXT, BACK, MORE, DOT
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

		/** What the player reads, for the debug log and tests: the collapsed card, then (expanded) the sections. */
		String plain(boolean expanded, boolean adviceOpen)
		{
			List<String> out = new ArrayList<>();
			out.add(headline);
			add(out, status);
			add(out, then);
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
		/** The selected plan's explicit objective ("Collect 50 Big bones from Hill Giants"), ahead of incidental XP pacing; null otherwise. */
		String planNow;
		/** The plan's next phase; null when this is the last. */
		String planNext;
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
	// The activity: what the selected plan has the player doing now.

	private static final class Activity
	{
		Icon icon = Icon.QUEST;
		String headline;
		String status;
		Double progress;
		int segments;
		final List<Line> now = new ArrayList<>();
		final List<Line> next = new ArrayList<>();
	}

	static Activity activity(Input in)
	{
		StepGuide.View v = in.getView();
		Hud.State s = in.getState();
		Activity a = new Activity();
		StepGuide.StageView stage = v.getStage();
		Pace p = in.getPace();
		if (stage != null)
		{
			stageActivity(a, v, s);
		}
		else if (in.getPlanNow() != null)
		{
			// An explicit collection objective is not completed by its incidental XP projection.
			// The app advances this phase from item evidence; XP alone must not show the next phase or collection progress.
			stepActivity(a, in, null);
		}
		else if (p != null && !p.isDone())
		{
			trainingActivity(a, in, p);
		}
		else
		{
			stepActivity(a, in, p);
		}
		if (v.getNote() != null)
		{
			// A message from the plugin or the quest helper ("Say: ...", "navigation is off"): it belongs to what to do now.
			a.now.add(Line.small(Icon.DOT, v.getNote(), Tone.MUTED));
		}
		PrepPlan prep = v.getPrep();
		if (prep != null && prep.hasTransport() && !prep.getRecommendedTransport().needsPreparation())
		{
			PrepPlan.RecommendedTransport t = prep.getRecommendedTransport();
			String full = t.getText().replaceFirst("[.\\s]+$", "");
			a.now.add(new Line(Icon.GO, clean(t.cardText()), null, Tone.LINK, true, GuideList.Action.TRANSPORT,
				full + ". Click to point the arrow" + (t.getItem() == null ? "" : " and frame " + t.getItem() + " in the bag") + ". The app only suggests it: it uses nothing."));
		}
		return a;
	}

	private static void stageActivity(Activity a, StepGuide.View v, Hud.State s)
	{
		StepGuide.StageView stage = v.getStage();
		a.icon = Icon.QUEST;
		a.segments = stage.getTotal() > 1 && stage.getTotal() <= 16 ? stage.getTotal() : 0;
		a.progress = stage.getTotal() > 1 ? (stage.isFinished() ? 1.0 : (double) stage.getIndex() / stage.getTotal()) : null;
		if (stage.isFinished())
		{
			a.icon = Icon.CHECK;
			a.headline = "Quest complete";
			a.status = "The step ticks itself once the app sees it";
			return;
		}
		List<ActiveTarget.StageLine> lines = stage.getSteps();
		if (lines == null || lines.isEmpty())
		{
			a.headline = withoutCode(v.getTitle());
			a.status = stageLabel(stage);
			return;
		}
		int cur = Math.max(0, Math.min(stage.getCursor(), lines.size() - 1));
		ActiveTarget.StageLine line = lines.get(cur);
		String shown = headlineOf(GuideList.withoutDoneErrands(v, line.shown()));
		int or = GuideList.alternativeAt(shown);
		a.headline = or > 0 ? shown.substring(0, or) : shown;
		String place = far(s) ? s.getDistance() : null;
		a.status = join(stage.isPeeking() ? "Viewing an earlier line" : stageLabel(stage), place);
		// The whole line when the headline is shorter (its recipe, the other way); otherwise the other way alone.
		String full = GuideList.withoutDoneErrands(v, line.getT() == null ? line.shown() : line.getT()).trim();
		if (!full.isEmpty() && (!GuideList.concise(full).equals(full) || full.length() > shown.length() + 12))
		{
			a.now.add(Line.small(Icon.DOT, full, Tone.MUTED).withHint(line.getT()));
		}
		else if (or > 0)
		{
			a.now.add(Line.small(Icon.DOT, "Or" + shown.substring(or + 3), Tone.MUTED));
		}
		placeLines(a.now, v, 1);
		for (int i = cur + 1; i < Math.min(lines.size(), cur + 2); i++)
		{
			int after = lines.size() - i - 1;
			a.next.add(new Line(Icon.NEXT, lines.get(i).shown(), after > 0 ? "+" + after : null, Tone.MUTED, true, GuideList.Action.NONE,
				lines.get(i).getT() + (after > 0 ? " Steps after this one: " + after + ", in the OSRS Path panel on the right." : "")));
		}
		if (stage.isManual() && cur < lines.size() - 1)
		{
			a.next.add(new Line(Icon.CHECK, "Done - show the next line", null, Tone.LINK, true, GuideList.Action.NEXT,
				"Click when this line is done. The button appears only on lines the game cannot see by itself: several in a row at one place."));
		}
		if (stage.isPeeking())
		{
			a.next.add(new Line(Icon.NEXT, "Back to the current line", null, Tone.LINK, true, GuideList.Action.RESUME,
				"Click to return to the line you are on according to the game. It returns by itself after a minute."));
		}
		else if (cur > 0)
		{
			ActiveTarget.StageLine prev = lines.get(cur - 1);
			a.next.add(new Line(Icon.BACK, "Previous line", null, Tone.LINK, true, GuideList.Action.PREV,
				"Click to read the previous line again: " + prev.getT() + " After a minute the card returns to the current line by itself."));
		}
	}

	private static void trainingActivity(Activity a, Input in, Pace p)
	{
		Hud.State s = in.getState();
		a.icon = Icon.TRAIN;
		a.headline = "Train " + p.getSkill() + " to " + p.getTarget();
		String levels = p.getSkill() + " " + (p.getLevel() > 0 ? p.getLevel() + " → " : "→ ") + p.getTarget();
		if (p.isSwitchStyle() && p.getStyle() != null)
		{
			a.status = "Switch to " + p.getStyle() + " · " + levels;
		}
		else if (far(s))
		{
			a.status = levels + " · " + s.getDistance();
		}
		else
		{
			a.status = join(levels, p.getStyle(), p.isMeasured() && p.getEta() != null ? p.getEta() : null);
		}
		a.progress = p.getProgress();
		String eta = p.getEta() == null ? "the time comes after a few kills" : p.getEta() + (p.isMeasured() ? " at your pace" : " (estimate, fighting only)");
		a.now.add(Line.small(Icon.DOT, p.getActionsLeft() + " " + p.getActions() + " left" + (p.getStyle() == null ? "" : " on " + p.getStyle()) + " · " + eta, Tone.TEXT)
			.withHint("This phase only: the kills and the fighting time to " + p.getTarget() + " " + p.getSkill()
				+ ". Walking, banking and later phases are not in it. The app's step page has the whole plan."));
		if (s != null && s.getFood() != null && !s.isFoodLow())
		{
			a.now.add(Line.small(Icon.DOT, s.getFood(), Tone.TEXT));
		}
		placeLines(a.now, in.getView(), 1);
		if (in.getPlanNext() != null)
		{
			a.next.add(new Line(Icon.NEXT, in.getPlanNext(), null, Tone.MUTED, true, GuideList.Action.NONE, in.getPlanNext()));
		}
	}

	private static void stepActivity(Activity a, Input in, Pace p)
	{
		StepGuide.View v = in.getView();
		Hud.State s = in.getState();
		if (p != null && p.isDone())
		{
			// The pace's goal is reached: the plan's next phase (or the step's last action) is what is left.
			a.icon = Icon.CHECK;
			String after = in.getPlanNext() != null ? in.getPlanNext() : in.getPlanNow() != null ? in.getPlanNow() : v.getNext();
			a.headline = after != null ? after : p.getGoals() + " reached";
			a.status = join(p.getGoals() + " reached", far(s) ? s.getDistance() : null);
			placeLines(a.now, v, 2);
			return;
		}
		if (in.getPlanNow() != null)
		{
			a.icon = Icon.TRAIN;
			a.headline = in.getPlanNow();
		}
		else if (in.getUse() != null)
		{
			a.icon = Icon.QUEST;
			a.headline = in.getUse();
		}
		else if (v.getNext() != null)
		{
			// Everything for the step is collected: its last action is what is left ("Give everything to Hetty").
			a.icon = Icon.QUEST;
			a.headline = headlineOf(v.getNext());
			if (!GuideList.concise(v.getNext()).equals(v.getNext().trim()))
			{
				a.now.add(Line.small(Icon.DOT, v.getNext(), Tone.MUTED));
			}
		}
		else
		{
			a.icon = Icon.QUEST;
			a.headline = withoutCode(v.getTitle());
		}
		a.status = far(s) ? s.getDistance() : null;
		if (s != null && s.getGoal() != null && s.getGoal().startsWith("Point "))
		{
			// The step's own route stops (gate, bridge, ladder): which one the arrow leads to.
			a.now.add(Line.small(Icon.GO, s.getGoal(), Tone.TEXT));
		}
		placeLines(a.now, v, 3);
		if (in.getPlanNext() != null)
		{
			a.next.add(new Line(Icon.NEXT, in.getPlanNext(), null, Tone.MUTED, true, GuideList.Action.NONE, in.getPlanNext()));
		}
	}

	/** The activity, when something comes before it: its headline, and the lines that say how. */
	private static List<Line> activityAsNext(Activity a)
	{
		List<Line> out = new ArrayList<>();
		out.add(new Line(a.icon == Icon.CHECK ? Icon.CHECK : Icon.NEXT, a.headline, null, Tone.TEXT, false, GuideList.Action.NONE, null));
		if (a.status != null)
		{
			out.add(Line.small(Icon.NONE, a.status, Tone.MUTED));
		}
		for (Line l : a.now)
		{
			if (l.getAction().isClickable() || l.getIcon() == Icon.DOT)
			{
				out.add(l);
			}
		}
		return out;
	}

	/**
	 * The step's places as buttons: a click points the arrow there. The place the arrow points at says so instead. Left out: a stage's point while the current
	 * line has its own (the arrow already leads there; "dungeon entrance" goes stale towards the end of the stage), and a place where an item of the list is
	 * obtained (the item's line leads there while it is missing; once it is taken there is no reason to go), except the step's main point.
	 */
	private static void placeLines(List<Line> out, StepGuide.View v, int max)
	{
		if (leadsByLine(v.getStage()))
		{
			return;
		}
		int n = 0;
		for (StepGuide.PlaceLine p : v.getPlaces())
		{
			if (n >= max)
			{
				break;
			}
			if (p.getIndex() != 0 && itemPlace(v, p))
			{
				continue;
			}
			String label = p.getLabel();
			if (p.getNpc() != null && !p.isItems() && !label.toLowerCase(Locale.ROOT).contains(p.getNpc().toLowerCase(Locale.ROOT)))
			{
				label = p.getNpc() + " — " + label;
			}
			if (p.isActive())
			{
				out.add(new Line(Icon.GO, label, null, Tone.GOOD, true, GuideList.Action.NONE, label + ". The arrow points here; once you arrive it returns to the step."));
			}
			else
			{
				out.add(new Line(Icon.GO, label, null, Tone.LINK, true, GuideList.Action.place(p.getIndex()),
					label + ". Click for the arrow and path here" + (p.getNpc() != null ? ", " + p.getNpc() + " will be highlighted" : "") + "."));
			}
			n++;
		}
	}

	/** The current line of a stage says where to go by itself: there are several lines and the current one has a tile. */
	static boolean leadsByLine(StepGuide.StageView stage)
	{
		if (stage == null || stage.isFinished() || stage.getSteps() == null || stage.getSteps().size() < 2)
		{
			return false;
		}
		return stage.getSteps().get(Math.max(0, Math.min(stage.getCursor(), stage.getSteps().size() - 1))).hasPoint();
	}

	/**
	 * Whether the place is where an item of the list is obtained, so it needs no line of its own: while an item from there is missing its line leads there,
	 * and when everything from there is taken there is no reason to go, unless the place's NPC is who the step ends with ("Give everything to Hetty").
	 * Without the step's last action nothing is guessed and the place stays.
	 */
	static boolean itemPlace(StepGuide.View v, StepGuide.PlaceLine place)
	{
		boolean linked = false;
		boolean pending = false;
		for (StepGuide.ItemLine i : v.getItems())
		{
			if (i.getPlace() != place.getIndex())
			{
				continue;
			}
			linked = true;
			pending |= !GuideList.got(i);
		}
		if (!linked || pending || place.getNpc() == null)
		{
			return linked;
		}
		String finale = v.getFinale();
		return finale != null && !finale.toLowerCase(Locale.ROOT).contains(place.getNpc().toLowerCase(Locale.ROOT));
	}

	// ------------------------------------------------------------------------------------------------------------
	// Preparation that stops the activity.

	private static final class Block
	{
		String headline;
		String status;
		boolean danger;
		/** The item's name key, so the preparation list does not say it twice. */
		String key;
		final List<Line> now = new ArrayList<>();
	}

	/**
	 * The one thing to get before the activity can go on, or null. The pre-entry guard comes first (it already holds the arrow); then the step's required items as
	 * the game counts them now, classified by the app's plan when it sent one: only lines it needs now (CRITICAL, NOW), never an improvement. A consumable
	 * (food, a potion) is judged by the plan's own supply verdict, and while the activity is under way the training plate's food line takes over from it.
	 */
	static Block block(Input in)
	{
		Preflight.Block pb = in.getPreflight();
		Hud.State s = in.getState();
		if (pb != null)
		{
			Block b = new Block();
			boolean food = Foods.heals(pb.getItem()) != null;
			PrepPlan currentPrep = in.getView() == null ? null : in.getView().getPrep();
			PrepPlan.Line currentLine = currentPrep == null ? null : currentPrep.line(pb.getItem());
			boolean unnote = currentLine != null && currentLine.getUnnote() != null && currentLine.getUnnote() > 0;
			String verb = unnote ? "Unnote" : pb.getVia() == Preflight.Via.BANK ? "Withdraw" : pb.getVia() == Preflight.Via.SOURCE ? "Get" : "Buy";
			b.headline = verb + " " + (food ? "food" : pb.getItem());
			b.status = pb.getItem() + (food ? " or similar" : "") + ": " + pb.getHave() + " / " + pb.getNeed() + " · "
				+ (unnote ? "banknotes in your bag" : pb.getVia() == Preflight.Via.BANK ? "in the bank" : pb.getVia() == Preflight.Via.SOURCE ? "the arrow leads where to get it" : "at the Grand Exchange");
			b.danger = s != null && s.getMissing() != null;
			b.key = ActiveTarget.nameKey(pb.getItem());
			b.now.add(Line.small(Icon.DOT, unnote ? currentLine.getAction() == null ? "Deposit the notes and withdraw usable items at a bank." : currentLine.getAction() : pb.reason().replaceFirst("^Guidance paused: ", "The arrow waits: "), Tone.TEXT));
			return b;
		}
		StepGuide.View v = in.getView();
		PrepPlan prep = v.getPrep();
		for (StepGuide.ItemLine i : scope(v))
		{
			if (!blocks(i, prep, in))
			{
				continue;
			}
			Block b = new Block();
			String name = PrepPlan.rawName(i.getName());
			boolean food = i.getHeals() != null;
			String noun = food ? "food" : i.isDoses() ? ItemCounts.doseBase(name) == null ? name : ItemCounts.doseBase(name) : name;
			String verb = i.getHave() == StepGuide.Have.BANK ? "Withdraw" : "Get";
			b.headline = verb + " " + noun;
			b.status = figure(i) + " · " + whereWord(i, in);
			b.key = ActiveTarget.nameKey(name);
			PrepPlan.Line plan = prep == null ? null : prep.line(i.getName());
			if (plan != null && plan.getUnnote() != null && plan.getUnnote() > 0)
			{
				b.headline = "Unnote " + noun;
				b.status = figure(i) + " · banknotes in your bag";
			}
			String how = plan != null && plan.getAction() != null && !plan.getAction().isEmpty() ? plan.getAction() : i.getWhere();
			if (how != null && !how.isEmpty())
			{
				Line l = Line.small(Icon.DOT, how, Tone.TEXT);
				// The suggested stop on the way, when it is this item's bank or shop: the arrow goes there with one click.
				if (prep != null && prep.hasDetour() && GuideList.mentions(prep.getActiveDetour().getText(), name))
				{
					l = new Line(Icon.GO, how, null, Tone.LINK, true, GuideList.Action.DETOUR,
						prep.getActiveDetour().getText() + ". Click to point the arrow there. The app only suggests it: it buys and withdraws nothing.");
				}
				else if (i.getPlace() >= 0 && i.getHave() != StepGuide.Have.BANK)
				{
					l = new Line(Icon.GO, how, null, Tone.LINK, true, GuideList.Action.place(i.getPlace()), how + ". Click for the arrow and path there.");
				}
				b.now.add(l);
			}
			if (plan != null && plan.getPrice() != null)
			{
				b.now.add(Line.small(Icon.DOT, plan.getPrice(), Tone.MUTED));
			}
			if (i.isSubstitutes())
			{
				b.now.add(Line.small(Icon.DOT, "Other items the step accepts count too.", Tone.MUTED));
			}
			return b;
		}
		return null;
	}

	/** Whether a required item stops the activity now. */
	static boolean blocks(StepGuide.ItemLine i, PrepPlan prep, Input in)
	{
		StepGuide.Have h = i.getHave();
		if (h == StepGuide.Have.BAG || h == StepGuide.Have.DONE || h == StepGuide.Have.IN_STEP)
		{
			return false;
		}
		// Not read yet right after log-in: the saved bank may still hold it. Say nothing rather than send the player for it.
		if (h == StepGuide.Have.UNKNOWN && in.isBankLoading())
		{
			return false;
		}
		PrepPlan.Line plan = prep == null ? null : prep.line(i.getName());
		if (plan != null && (!"CRITICAL".equals(plan.getPriority()) || !"NOW".equals(plan.getTiming())))
		{
			// The app's plan says it is for later or an improvement: advice, not a blocker.
			return false;
		}
		if (i.consumable() && i.getCount() > 0)
		{
			// Some food is with you: while the activity goes on the food line counts it down; before it, the plan's verdict decides (LOW is a caution).
			if (in.isStarted() && !in.isBankOpen())
			{
				return false;
			}
			return plan == null || "CRITICAL".equals(plan.getSupply());
		}
		return true;
	}

	/** The items of the current stage, or of the step, as the game counts them now: not those the step itself hands out. */
	static List<StepGuide.ItemLine> scope(StepGuide.View v)
	{
		List<StepGuide.ItemLine> out = new ArrayList<>();
		for (StepGuide.ItemLine i : v.getItems())
		{
			if (i.getHave() != StepGuide.Have.IN_STEP)
			{
				out.add(i);
			}
		}
		return out;
	}

	/** "Salmon or similar: 0 / 21", "Strength potion: 3 / 4 doses", or the line's tag when the figures were not kept. */
	static String figure(StepGuide.ItemLine i)
	{
		String name = PrepPlan.rawName(i.getName());
		if (i.isDoses())
		{
			String base = ItemCounts.doseBase(name);
			name = base == null ? name : base;
		}
		String label = name + (i.isSubstitutes() ? " or similar" : "");
		if (i.getCount() < 0)
		{
			return label + ": " + i.getTag();
		}
		return label + ": " + i.getCount() + " / " + i.getNeed() + (i.isDoses() ? " doses" : "");
	}

	/** Where the rest is, in words: in the bank (or last seen there), not in the bank, the bank not checked. */
	static String whereWord(StepGuide.ItemLine i, Input in)
	{
		switch (i.getHave())
		{
			case BANK:
				return in.isBankStale() ? "in the bank (last seen)" : "in the bank";
			case NONE:
				return i.getInBank() > 0 ? "not enough in the bank" : in.isBankStale() ? "not in the bank (last seen)" : "not in the bank";
			case UNKNOWN:
				return in.isBankLoading() ? "reading the bank" : "bank not checked";
			default:
				return i.getTag();
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// Warnings: safety first, then cautions. The first is the one the collapsed card shows.

	static List<Line> warnings(Input in, Block block)
	{
		List<Line> out = new ArrayList<>();
		Hud.State s = in.getState();
		StepGuide.View v = in.getView();
		if (s != null)
		{
			if (s.getHealth() != null && s.isHealthCritical())
			{
				out.add(warning(Tone.DANGER, s.getHealth()));
			}
			if (s.getDanger() != null && s.isDangerInside())
			{
				out.add(warning(Tone.DANGER, "You are in a danger zone: " + clean(s.getDanger())));
			}
			if (s.getFood() != null && s.isFoodLow())
			{
				out.add(warning(s.getFood().startsWith("No ") ? Tone.DANGER : Tone.CAUTION, s.getFood()));
			}
			// The pre-entry guard's chip is the headline itself when it holds the arrow (block): not a second line.
			if (s.getMissing() != null && (block == null || in.getPreflight() == null))
			{
				out.add(warning(Tone.DANGER, clean(s.getMissing())));
			}
			if (s.getDanger() != null && !s.isDangerInside())
			{
				out.add(warning(Tone.CAUTION, "Danger ahead: " + clean(s.getDanger())));
			}
			if (s.getHealth() != null && !s.isHealthCritical())
			{
				out.add(warning(Tone.CAUTION, s.getHealth()));
			}
		}
		PrepPlan prep = v == null ? null : v.getPrep();
		if (prep != null && prep.hasRecovery())
		{
			String title = prep.getRecovery().getTitle() == null || prep.getRecovery().getTitle().isEmpty() ? "Recovery mode" : prep.getRecovery().getTitle();
			List<String> steps = prep.getRecovery().getSteps();
			StringBuilder how = new StringBuilder(title).append(".");
			for (int i = 0; i < Math.min(steps.size(), RECOVERY_SHOWN); i++)
			{
				how.append(" ").append(i + 1).append(") ").append(steps.get(i));
			}
			if (steps.size() > RECOVERY_SHOWN)
			{
				how.append(" The rest is in the app.");
			}
			out.add(warning(Tone.CAUTION, title).withHint(how.toString()));
		}
		StepGuide.StageView stage = v == null ? null : v.getStage();
		String w = stage == null ? null : stage.getWarning();
		Preflight.Block pb = in.getPreflight();
		if (w != null && pb != null && w.startsWith(pb.reason()))
		{
			// The guard's reason is the headline already; what the stage adds after it stays.
			w = w.substring(pb.reason().length()).trim();
		}
		if (w != null && !w.isEmpty())
		{
			out.add(warning(Tone.CAUTION, clean(w)));
		}
		if (prep != null && prep.getBlockers() != null)
		{
			for (String b : prep.getBlockers())
			{
				out.add(warning(Tone.CAUTION, clean(b)));
			}
		}
		return out;
	}

	private static Line warning(Tone tone, String text)
	{
		return new Line(tone == Tone.DANGER ? Icon.DANGER : Icon.WARN, text, null, tone, true, GuideList.Action.NONE, text);
	}

	// ------------------------------------------------------------------------------------------------------------
	// Preparation and advice for the expanded card.

	/** What is still to get (missing and actionable first), then one line for what is ready: never a long list of ticks. */
	static List<Line> prepareLines(Input in, Block block)
	{
		StepGuide.View v = in.getView();
		PrepPlan prep = v.getPrep();
		List<Line> todo = new ArrayList<>();
		int ready = 0;
		int worn = 0;
		List<String> readyNames = new ArrayList<>();
		for (StepGuide.ItemLine i : scope(v))
		{
			String key = ActiveTarget.nameKey(PrepPlan.rawName(i.getName()));
			StepGuide.Have h = i.getHave();
			if (h == StepGuide.Have.BAG)
			{
				ready++;
				readyNames.add(PrepPlan.rawName(i.getName()) + (i.getWorn() > 0 ? " (worn)" : ""));
				worn += i.getWorn() > 0 ? 1 : 0;
				continue;
			}
			// Handed in or used up during the step: done, neither with you nor to get.
			if (h == StepGuide.Have.DONE || block != null && key.equals(block.key))
			{
				continue;
			}
			PrepPlan.Line plan = prep == null ? null : prep.line(i.getName());
			if (plan != null && !"CRITICAL".equals(plan.getPriority()))
			{
				// For later or an improvement: under More advice.
				continue;
			}
			Icon icon = h == StepGuide.Have.BANK ? Icon.BANK : h == StepGuide.Have.UNKNOWN ? Icon.UNKNOWN : Icon.MISSING;
			Tone tone = h == StepGuide.Have.NONE ? Tone.CAUTION : Tone.TEXT;
			String how = plan != null && plan.getAction() != null && !plan.getAction().isEmpty() ? plan.getAction() : i.getWhere();
			String right = i.getCount() < 0 ? i.getTag() : i.getCount() + " / " + i.getNeed();
			String text = PrepPlan.rawName(i.getName()) + " · " + whereWord(i, in);
			if (plan != null && plan.getPrice() != null)
			{
				how = (how == null ? "" : how + ". ") + plan.getPrice();
			}
			GuideList.Action action = i.getPlace() >= 0 && h != StepGuide.Have.BANK ? GuideList.Action.place(i.getPlace()) : GuideList.Action.NONE;
			todo.add(new Line(icon, text, right, tone, true, action, (how == null ? text : text + ". " + how)
				+ (action.isClickable() ? " Click for the arrow and path there." : "")));
		}
		List<Line> out = new ArrayList<>(todo.subList(0, Math.min(todo.size(), PREPARE_SHOWN)));
		if (todo.size() > PREPARE_SHOWN)
		{
			out.add(Line.small(Icon.DOT, "and " + (todo.size() - PREPARE_SHOWN) + " more in the OSRS Path panel", Tone.MUTED));
		}
		if (ready > 0)
		{
			String text = block == null && todo.isEmpty() && scope(v).stream().allMatch(i -> i.getHave() == StepGuide.Have.BAG)
				? (ready == 1 ? "The item is with you" : "All " + ready + " items are with you")
				: ready + (ready == 1 ? " item" : " items") + " with you";
			out.add(new Line(Icon.CHECK, text + (worn > 0 ? " (" + worn + " worn)" : ""), null, Tone.MUTED, true, GuideList.Action.NONE,
				"With you now: " + String.join(", ", readyNames) + "."));
		}
		if (in.isBankLoading() && scope(v).stream().anyMatch(i -> i.getHave() == StepGuide.Have.UNKNOWN))
		{
			out.add(Line.small(Icon.UNKNOWN, "Reading the bank saved from your last session…", Tone.MUTED));
		}
		return out;
	}

	/** The optional recommendations, each one line: counted on "More advice", shown only on request. */
	static List<Line> adviceLines(Input in, Block block)
	{
		StepGuide.View v = in.getView();
		Hud.State s = in.getState();
		PrepPlan prep = v.getPrep();
		List<Line> out = new ArrayList<>();
		if (s != null && s.getUpgrade() != null)
		{
			out.add(new Line(Icon.DOT, clean(s.getUpgrade()), null, Tone.TEXT, true, GuideList.Action.NONE, clean(s.getUpgrade()) + ". Optional: it speeds the step up."));
		}
		if (prep != null)
		{
			if (prep.hasDetour() && !(block != null && GuideList.mentions(prep.getActiveDetour().getText(), PrepPlan.rawName(block.key))))
			{
				out.add(new Line(Icon.GO, clean(prep.getActiveDetour().getText()), null, Tone.LINK, true, GuideList.Action.DETOUR,
					prep.getActiveDetour().getText() + ". Click to point the arrow at " + prep.getActiveDetour().getLabel() + ". The app only suggests it: it buys nothing."));
			}
			if (prep.hasTransport() && prep.getRecommendedTransport().needsPreparation())
			{
				PrepPlan.RecommendedTransport t = prep.getRecommendedTransport();
				out.add(new Line(Icon.GO, clean(t.cardText()), null, Tone.LINK, true, GuideList.Action.TRANSPORT,
					t.getText().replaceFirst("[.\\s]+$", "") + ". Click to point the arrow at the stop. The app only suggests it: it buys and withdraws nothing."));
			}
			if (prep.getLines() != null)
			{
				for (PrepPlan.Line l : prep.getLines())
				{
					if (!"OPTIMIZATION".equals(l.getPriority()) && !"OPTIONAL".equals(l.getPriority()) || "EQUIPPED".equals(l.getWhere()) || "INVENTORY".equals(l.getWhere()))
					{
						continue;
					}
					String where = "BANK".equals(l.getWhere()) ? "in the bank" : "UNKNOWN".equals(l.getWhere()) ? "bank not checked" : "to get";
					String text = "Optional: " + l.getName() + " · " + where;
					out.add(Line.small(Icon.DOT, text, Tone.TEXT).withHint(text + (l.getAction() == null ? "" : ". " + l.getAction())));
				}
			}
			if (prep.hasWithdrawals())
			{
				// What the plan takes out of the bank beyond this step's own items (the next steps, the faster way's runes): one line, framed in the open bank.
				List<String> extra = new ArrayList<>();
				for (PrepPlan.BankWithdrawal w : prep.getBankWithdrawals())
				{
					String key = ActiveTarget.nameKey(w.getItemName());
					if (scope(v).stream().noneMatch(i -> ActiveTarget.nameKey(PrepPlan.rawName(i.getName())).equals(key)))
					{
						extra.add(w.getItemName() + (w.getQuantity() > 1 ? " ×" + w.getQuantity() : ""));
					}
				}
				if (!extra.isEmpty())
				{
					String text = "Also take from the bank: " + String.join(", ", extra);
					out.add(new Line(Icon.BANK, text, null, Tone.TEXT, true, GuideList.Action.NONE, text + ". They are framed when the bank is open."));
				}
			}
			if (prep.getSlots() != null && !prep.getSlots().isEmpty())
			{
				out.add(Line.small(Icon.DOT, clean(prep.getSlots()), Tone.TEXT));
			}
			if (prep.getLater() != null && !prep.getLater().isEmpty())
			{
				String all = String.join(", ", prep.getLater());
				out.add(Line.small(Icon.DOT, "Don't take now: " + all, Tone.MUTED).withHint("You will need these later: " + all + "."));
			}
			if (prep.getWeight() != null && !prep.getWeight().isEmpty())
			{
				out.add(Line.small(Icon.DOT, "Weight: " + prep.getWeight(), Tone.MUTED));
			}
		}
		if (out.size() > ADVICE_SHOWN)
		{
			int more = out.size() - ADVICE_SHOWN;
			out = new ArrayList<>(out.subList(0, ADVICE_SHOWN));
			out.add(Line.small(Icon.NONE, "and " + more + " more in the OSRS Path panel", Tone.MUTED));
		}
		List<CleanupHint.Line> clean = v.getCleanup();
		if (!clean.isEmpty())
		{
			// What in the bag can go: advice only, the plugin does nothing with the items. The rest is on the bank card and in the app.
			out.add(Line.small(Icon.NONE, "Inventory cleanup (advice only):", Tone.MUTED)
				.withHint("What in the bag can go because nothing ahead in your route asks for it. Nothing is sold, dropped or destroyed for you."));
			for (int i = 0; i < Math.min(clean.size(), CLEANUP_SHOWN); i++)
			{
				out.add(Line.small(Icon.DOT, clean.get(i).text(), Tone.TEXT).withHint(clean.get(i).text() + ". Advice only: nothing is sold, dropped or destroyed for you."));
			}
			if (clean.size() > CLEANUP_SHOWN)
			{
				out.add(Line.small(Icon.NONE, "and " + (clean.size() - CLEANUP_SHOWN) + " more on the bank card and in the app", Tone.MUTED));
			}
		}
		return out;
	}

	// ------------------------------------------------------------------------------------------------------------

	/** A temporary target or a funding plan with no route step shown: a small card for it, else nothing. */
	private static Card withoutStep(Input in)
	{
		Hud.State s = in.getState();
		Funding f = in.getFunding();
		String headline = f != null ? clean(f.getAction()) : in.getDetour() != null ? clean(in.getDetour()) : null;
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
	private static boolean far(Hud.State s)
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

	private static String join(String... parts)
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
