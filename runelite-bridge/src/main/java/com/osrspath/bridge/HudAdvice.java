package com.osrspath.bridge;

import com.osrspath.bridge.HudBlocks.Block;
import com.osrspath.bridge.HudModel.Icon;
import com.osrspath.bridge.HudModel.Input;
import com.osrspath.bridge.HudModel.Line;
import com.osrspath.bridge.HudModel.Tone;
import java.util.ArrayList;
import java.util.List;

import static com.osrspath.bridge.HudBlocks.scope;
import static com.osrspath.bridge.HudBlocks.whereWord;
import static com.osrspath.bridge.HudModel.ADVICE_SHOWN;
import static com.osrspath.bridge.HudModel.CLEANUP_SHOWN;
import static com.osrspath.bridge.HudModel.PREPARE_SHOWN;
import static com.osrspath.bridge.HudModel.clean;

/** Preparation and advice for the expanded card. Part of {@link HudModel}. */
final class HudAdvice
{
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
			PrepPlan.Line required = prep == null ? null : prep.line(i.getName());
			boolean needsWear = required != null && Boolean.TRUE.equals(required.getEquip()) && i.getWorn() == 0;
			if (h == StepGuide.Have.BAG && !needsWear)
			{
				ready++;
				readyNames.add(PrepPlan.rawName(i.getName()) + (i.getWorn() > 0 ? " (worn)" : ""));
				worn += i.getWorn() > 0 ? 1 : 0;
				continue;
			}
			// Handed in or used up during the step: done, neither with you nor to get.
			if (h == StepGuide.Have.DONE || block != null && block.covers(key))
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
			String text = PrepPlan.rawName(i.getName()) + " · " + (needsWear && h == StepGuide.Have.BAG ? "equip it" : whereWord(i, in));
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
}
