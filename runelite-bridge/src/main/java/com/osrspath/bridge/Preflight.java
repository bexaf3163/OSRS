package com.osrspath.bridge;

import java.util.Collections;
import java.util.List;
import lombok.Value;

/**
 * The item pre-flight guard for a quest stage step (the app's copy is src/lib/preflight.ts). While an item the step uses is not in the bag or worn, the
 * arrow does not lead to the step: it leads where the item is, the nearest bank if the bank snapshot holds it, else the place named in the data, else the
 * Grand Exchange. Unknown is not missing: no bag read yet blocks nothing, and the bank counts only when it has been seen.
 */
final class Preflight
{
	/** How close to the step's tile the red "Turn back!" chip shows: the player is about to use the item. */
	static final int CHIP_RADIUS = 40;
	static final int EXCHANGE_X = 3165;
	static final int EXCHANGE_Y = 3490;

	enum Via
	{
		BANK, SOURCE, EXCHANGE
	}

	@Value
	static class Block
	{
		String item;
		int need;
		int have;
		Via via;
		/** Where the arrow turns; null if the target could not be built (the chip still shows). */
		NavTarget target;
		/** The tile of the step that is blocked: the chip shows only near it. */
		Integer stepX;
		Integer stepY;
		Integer stepPlane;

		String chip()
		{
			return chipText(item);
		}

		/** A short key of what is missing: the stage line key must change with it, so the arrow is recomputed when the bag changes. */
		String key()
		{
			return item + ":" + via;
		}

		/** The player is near the blocked step (or the step has no tile): the chip is for this moment. */
		boolean near(int x, int y, int plane)
		{
			return stepX == null || (plane == stepPlane && DangerRadar.distanceSq(x, y, stepX, stepY) <= CHIP_RADIUS * CHIP_RADIUS);
		}
	}

	private Preflight()
	{
	}

	static String chipText(String item)
	{
		return "⚠ Missing Item: " + item + " - Turn back!";
	}

	/** How many of the item the container holds: exactly by ID with one, else by name. */
	static int count(ItemCounts items, ActiveTarget.Pre p)
	{
		return items.exact(p.getId(), p.getItem());
	}

	/**
	 * The first missing item of the line and where to get it; null means the line may go on. bagKnown is false before the inventory was read,
	 * bank is null while the bank was never seen.
	 */
	static Block check(String stepId, ActiveTarget.StageLine line, boolean bagKnown, ItemCounts carried, ItemCounts bank, int px, int py, int plane,
		List<ActiveTarget.Spot> banks)
	{
		if (line == null || line.getPre() == null || line.getPre().isEmpty() || !bagKnown || carried == null)
		{
			return null;
		}
		for (ActiveTarget.Pre p : line.getPre())
		{
			int have = count(carried, p);
			if (have >= p.need())
			{
				continue;
			}
			Integer sx = line.hasPoint() ? line.getX() : null;
			Integer sy = line.hasPoint() ? line.getY() : null;
			Integer sp = line.hasPoint() ? line.getPlane() : null;
			if (bank != null && count(bank, p) >= p.need() - have)
			{
				ActiveTarget.Spot b = nearest(banks, px, py);
				if (b != null)
				{
					return new Block(p.getItem(), p.need(), have, Via.BANK,
						target(stepId, "Take " + p.getItem() + " from the bank", b.getX(), b.getY(), b.getPlane(), null, null), sx, sy, sp);
				}
			}
			if (p.hasPlace())
			{
				String label = p.getT() == null || p.getT().isEmpty() ? "Get " + p.getItem() : p.getT();
				return new Block(p.getItem(), p.need(), have, Via.SOURCE,
					target(stepId, label, p.getAt().get(0), p.getAt().get(1), p.getAt().get(2), p.getOn(), p.getNpc()), sx, sy, sp);
			}
			return new Block(p.getItem(), p.need(), have, Via.EXCHANGE,
				target(stepId, "Buy " + p.getItem() + " on the Grand Exchange", EXCHANGE_X, EXCHANGE_Y, 0, null, null), sx, sy, sp);
		}
		return null;
	}

	private static ActiveTarget.Spot nearest(List<ActiveTarget.Spot> banks, int px, int py)
	{
		ActiveTarget.Spot best = null;
		long bestD = Long.MAX_VALUE;
		for (ActiveTarget.Spot b : banks == null ? Collections.<ActiveTarget.Spot>emptyList() : banks)
		{
			long d = DangerRadar.distanceSq(px, py, b.getX(), b.getY());
			if (d < bestD)
			{
				best = b;
				bestD = d;
			}
		}
		return best;
	}

	private static NavTarget target(String stepId, String label, int x, int y, int plane, List<String> objects, String npc)
	{
		String text = label.length() > 60 ? label.substring(0, 59) + "…" : label;
		NavTarget n = new NavTarget();
		n.setLabel(text);
		n.setX(x);
		n.setY(y);
		n.setPlane(plane);
		if (objects != null && !objects.isEmpty())
		{
			n.setObjectNames(objects);
		}
		if (npc != null && !npc.isEmpty())
		{
			n.setNpcNames(Collections.singletonList(npc));
		}
		n.setStepId(stepId);
		return n.prepare() == null ? n : null;
	}
}
