package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.Data;

/**
 * A temporary target over the step: a place from the app's map ("📍 Port Sarim") or a shop for an upgrade
 * ("Buy a Steel axe from Bob"). The arrow, Shortest Path and the HUD lead to it; the step does not go away and
 * returns by itself when the player reached the place or got the item. {"clear": true} clears it earlier.
 */
@Data
public class NavTarget
{
	static final int MAX_NPCS = 8;
	/** RuneLite world coordinates: the surface world and dungeons (y up to ~13,000) are all below 16,384. */
	static final int MAX_COORD = 16_384;
	static final int MAX_ITEM_ID = 100_000;

	private boolean clear;
	private String label;
	private int x;
	private int y;
	private int plane;
	/** The seller or NPC at the place: the world overlay highlights it. */
	private List<String> npcNames;
	/** The item being sought: with it the target is cleared when it appears in the bag or is worn. */
	private String itemName;
	private Integer itemId;
	/** The step the target belongs to (for the app; the plugin does not need it). */
	private String stepId;

	private transient Set<String> npcNameSet = Collections.emptySet();

	String prepare()
	{
		if (clear)
		{
			return null;
		}
		if (label == null || label.trim().isEmpty() || ActiveTarget.tooLong(label))
		{
			return "place label required";
		}
		if (x <= 0 || y <= 0 || x >= MAX_COORD || y >= MAX_COORD || plane < 0 || plane > 3)
		{
			return "invalid coordinates";
		}
		if (npcNames != null && npcNames.size() > MAX_NPCS)
		{
			return "too many NPCs";
		}
		Set<String> names = new HashSet<>();
		if (npcNames != null)
		{
			for (String n : npcNames)
			{
				if (n == null || n.isEmpty() || ActiveTarget.tooLong(n))
				{
					return "invalid NPC name";
				}
				names.add(ActiveTarget.nameKey(n));
			}
		}
		if (itemName != null && (itemName.isEmpty() || ActiveTarget.tooLong(itemName)))
		{
			return "invalid item";
		}
		if (itemId != null && (itemId <= 0 || itemId >= MAX_ITEM_ID))
		{
			return "invalid item ID";
		}
		if (stepId != null && !stepId.matches("S\\d-\\d{2}"))
		{
			return "stepId must look like S1-03";
		}
		npcNameSet = names;
		return null;
	}

	/** The target is buying or getting an item, not just a place. */
	boolean isPurchase()
	{
		return itemName != null || itemId != null;
	}
}
