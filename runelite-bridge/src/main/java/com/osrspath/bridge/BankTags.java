package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.Data;

/**
 * Предметы этапа для мягкой подсветки в банке (POST /bank-tags) — та же выборка, что и строка Bank Tags
 * в приложении, но без отдельной вкладки: нужное видно прямо в основном окне банка.
 * Пустой список снимает подсветку.
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
			return "нужен stageId";
		}
		if (itemIds == null)
		{
			return "нужен список itemIds";
		}
		if (itemIds.size() > MAX_ITEMS)
		{
			return "слишком длинный список";
		}
		Set<Integer> ids = new HashSet<>();
		for (Integer id : itemIds)
		{
			if (id == null || id <= 0 || id >= NavTarget.MAX_ITEM_ID)
			{
				return "неверный ID предмета";
			}
			ids.add(id);
		}
		idSet = ids;
		return null;
	}
}
