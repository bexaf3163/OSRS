package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.Data;

/**
 * The stage's items for soft highlighting in the bank (POST /bank-tags): everything needed in the stage is visible
 * right in the main bank window, without a separate Bank Tags plugin tab and an import string.
 * An empty list clears the highlight.
 */
@Data
public class BankTags
{
	static final int MAX_ITEMS = 256;

	private String stageId;
	private List<Integer> itemIds;

	private transient Set<Integer> idSet = Collections.emptySet();

	String prepare()
	{
		if (stageId == null || stageId.isEmpty() || stageId.length() > 64)
		{
			return "stageId required";
		}
		if (itemIds == null)
		{
			return "itemIds list required";
		}
		if (itemIds.size() > MAX_ITEMS)
		{
			return "list too long";
		}
		Set<Integer> ids = new HashSet<>();
		for (Integer id : itemIds)
		{
			if (id == null || id <= 0 || id >= NavTarget.MAX_ITEM_ID)
			{
				return "invalid item ID";
			}
			ids.add(id);
		}
		idSet = ids;
		return null;
	}
}
