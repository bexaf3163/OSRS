package com.osrspath.bridge;

import com.osrspath.bridge.HudModel.Icon;
import com.osrspath.bridge.HudModel.Input;
import com.osrspath.bridge.HudModel.Line;
import com.osrspath.bridge.HudModel.Tone;
import java.util.ArrayList;
import java.util.List;

/** Preparation that stops the activity. Part of {@link HudModel}. */
final class HudBlocks
{
	static final class Block
	{
		String headline;
		String status;
		boolean danger;
		/** The item's name key, so the preparation list does not say it twice. */
		String key;
		/** The other items bought on the same trip (a shopping card), by name key. */
		final List<String> alsoKeys = new ArrayList<>();
		final List<Line> now = new ArrayList<>();

		boolean covers(String k)
		{
			return k.equals(key) || alsoKeys.contains(k);
		}
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
			String verb = unnote ? "Unnote" : pb.getVia() == Preflight.Via.CHECK_BANK ? "Check bank for" : pb.getVia() == Preflight.Via.BANK ? "Withdraw" : pb.getVia() == Preflight.Via.SOURCE ? "Get" : "Buy";
			b.headline = verb + " " + (food ? "food" : pb.getItem());
			b.status = pb.getItem() + (food ? " or similar" : "") + ": " + pb.getHave() + " / " + pb.getNeed() + " · "
				+ (unnote ? "banknotes in your bag" : pb.getVia() == Preflight.Via.CHECK_BANK ? "bank not checked" : pb.getVia() == Preflight.Via.BANK ? "in the bank" : pb.getVia() == Preflight.Via.SOURCE ? "the arrow leads where to get it" : "at the Grand Exchange");
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
			if (plan != null && Boolean.TRUE.equals(plan.getEquip()) && i.getWorn() == 0 && i.getHave() == StepGuide.Have.BAG)
			{
				b.headline = "Equip " + noun;
				b.status = "In your bag · not worn";
			}
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
			if (i.getHave() == StepGuide.Have.NONE)
			{
				shopping(b, i, v, prep, in);
			}
			return b;
		}
		return null;
	}

	/**
	 * Every other item the step still needs to buy (missing, not in the bank) joins the first one on one card, so the player
	 * shops once instead of item by item: the headline counts them, the status names them, a line each says where.
	 */
	private static void shopping(Block b, StepGuide.ItemLine first, StepGuide.View v, PrepPlan prep, Input in)
	{
		List<StepGuide.ItemLine> buys = new ArrayList<>();
		buys.add(first);
		for (StepGuide.ItemLine i : scope(v))
		{
			PrepPlan.Line plan = prep == null ? null : prep.line(i.getName());
			if (i != first && i.getHave() == StepGuide.Have.NONE && (plan == null || "CRITICAL".equals(plan.getPriority())))
			{
				buys.add(i);
			}
		}
		if (buys.size() < 2)
		{
			return;
		}
		List<String> names = new ArrayList<>();
		for (StepGuide.ItemLine i : buys)
		{
			String name = PrepPlan.rawName(i.getName());
			int left = i.getCount() < 0 ? i.getNeed() : i.getNeed() - i.getCount();
			names.add(left > 1 ? left + " " + name : name);
			if (i != first)
			{
				b.alsoKeys.add(ActiveTarget.nameKey(name));
				GuideList.Action action = i.getPlace() >= 0 ? GuideList.Action.place(i.getPlace()) : GuideList.Action.NONE;
				String where = i.getWhere() == null || i.getWhere().isEmpty() ? whereWord(i, in) : i.getWhere();
				b.now.add(new Line(Icon.MISSING, name + " · " + where, figure(i), Tone.CAUTION, true, action,
					name + ": " + where + (action.isClickable() ? " Click for the arrow and path there." : "")));
			}
		}
		b.headline = "Buy " + buys.size() + " items";
		b.status = String.join(", ", names);
	}

	/** Whether a required item stops the activity now. */
	static boolean blocks(StepGuide.ItemLine i, PrepPlan prep, Input in)
	{
		StepGuide.Have h = i.getHave();
		PrepPlan.Line required = prep == null ? null : prep.line(i.getName());
		if (required != null && Boolean.TRUE.equals(required.getEquip()) && "CRITICAL".equals(required.getPriority()) && "NOW".equals(required.getTiming()) && h == StepGuide.Have.BAG)
		{
			return i.getWorn() == 0;
		}
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
}
