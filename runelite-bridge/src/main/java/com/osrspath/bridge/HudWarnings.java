package com.osrspath.bridge;

import com.osrspath.bridge.HudBlocks.Block;
import com.osrspath.bridge.HudModel.Icon;
import com.osrspath.bridge.HudModel.Input;
import com.osrspath.bridge.HudModel.Line;
import com.osrspath.bridge.HudModel.Tone;
import java.util.ArrayList;
import java.util.List;

import static com.osrspath.bridge.HudModel.RECOVERY_SHOWN;
import static com.osrspath.bridge.HudModel.clean;

/** Warnings: safety first, then cautions. The first is the one the collapsed card shows. Part of {@link HudModel}. */
final class HudWarnings
{
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

	static Line warning(Tone tone, String text)
	{
		return new Line(tone == Tone.DANGER ? Icon.DANGER : Icon.WARN, text, null, tone, true, GuideList.Action.NONE, text);
	}
}
