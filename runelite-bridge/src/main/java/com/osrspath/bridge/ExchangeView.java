package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * One card at the Grand Exchange. The bulk list from the app ({@link GrandExchangeHelperOverlay}) and the step's "what to buy"
 * ({@link OsrsPathShopOverlay}) used to draw side by side, with the HUD and the "What you need" list: four windows for one question
 * (the owner's screenshot, 2026-10-15). Now exactly one of the two draws:
 *
 *  - the bulk list when it still has something to buy (the step's purchases that are not in it follow as "Also for S3-08");
 *  - otherwise the step's card when it has something to buy;
 *  - otherwise the bulk list's "have everything" (the good news, once);
 *  - otherwise the step's card ("Nothing to buy here"), or nothing at all.
 *
 * Pure logic: checked by an ordinary test.
 */
final class ExchangeView
{
	enum Card
	{
		NONE, BULK, STEP
	}

	private ExchangeView()
	{
	}

	/** Which card draws at the exchange. bulk is empty when the bulk helper is off or no list was sent; step is null when there is no step window. */
	static Card choose(List<ShoppingPlan.Row> bulk, ShopWindow.Result step)
	{
		boolean bulkOpen = bulk.stream().anyMatch(r -> r.getState() != ShoppingPlan.RowState.HAVE);
		boolean stepOpen = step != null && step.getTodo() > 0;
		if (bulkOpen)
		{
			return Card.BULK;
		}
		if (stepOpen)
		{
			return Card.STEP;
		}
		if (!bulk.isEmpty())
		{
			return Card.BULK;
		}
		return step != null ? Card.STEP : Card.NONE;
	}

	/**
	 * The step's purchases the bulk list does not hold, as the step card words them ("Salmon ×20 - Dropped by Ogress Shaman"): the bulk card adds
	 * them under its own rows so nothing the step needs is lost when the second card is gone.
	 */
	static List<String> extras(List<ShoppingPlan.Row> bulk, ShopWindow.Result step)
	{
		List<String> out = new ArrayList<>();
		if (step == null)
		{
			return out;
		}
		Set<String> listed = new HashSet<>();
		for (ShoppingPlan.Row r : bulk)
		{
			listed.add(ActiveTarget.nameKey(r.getName()));
		}
		for (ShopWindow.Row row : step.getRows())
		{
			if (row.getMark() != ShopWindow.Mark.TODO || !row.getText().startsWith("Buy: "))
			{
				continue;
			}
			String label = row.getText().substring("Buy: ".length());
			if (!listed.contains(ActiveTarget.nameKey(itemName(label))))
			{
				out.add(label);
			}
		}
		return out;
	}

	/** "Salmon ×20 — Dropped by Ogress Shaman" gives "Salmon". */
	static String itemName(String label)
	{
		String name = label;
		int dash = name.indexOf(" — ");
		if (dash >= 0)
		{
			name = name.substring(0, dash);
		}
		int times = name.indexOf(" ×");
		if (times >= 0)
		{
			name = name.substring(0, times);
		}
		return name.trim();
	}
}
