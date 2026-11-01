package com.osrspath.bridge;

import com.osrspath.bridge.HudModel.Icon;
import com.osrspath.bridge.HudModel.Input;
import com.osrspath.bridge.HudModel.Line;
import com.osrspath.bridge.HudModel.Pace;
import com.osrspath.bridge.HudModel.Tone;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import static com.osrspath.bridge.HudModel.clean;
import static com.osrspath.bridge.HudModel.far;
import static com.osrspath.bridge.HudModel.headlineOf;
import static com.osrspath.bridge.HudModel.join;
import static com.osrspath.bridge.HudModel.stageLabel;
import static com.osrspath.bridge.HudModel.withoutCode;

/** The activity: what the selected plan has the player doing now. Part of {@link HudModel}. */
final class HudActivity
{
	static final class Activity
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
		// The dialogue answers are highlighted in the game's own chat box; on the card they only pushed the instruction past its line limit.
		String full = ShortText.withoutDialogue(GuideList.withoutDoneErrands(v, line.getT() == null ? line.shown() : line.getT()));
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
	static List<Line> activityAsNext(Activity a)
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
}
