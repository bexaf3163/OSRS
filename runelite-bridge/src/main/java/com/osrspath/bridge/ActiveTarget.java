package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.Data;

/**
 * Текущий шаг, присланный приложением: то же, что InGameTarget в src/types/index.ts, плюс код и название шага.
 * Поля заполняет Gson; наборы для быстрого сравнения строит {@link #prepare()}.
 */
@Data
public class ActiveTarget
{
	/** Ограничения на размер: запрос приходит по сети, пусть и локальной. */
	static final int MAX_LIST = 64;
	static final int MAX_TEXT = 200;

	private static final Pattern TAGS = Pattern.compile("<[^>]*>");
	private static final Pattern SPACES = Pattern.compile("\\s+");
	private static final Pattern TRAILING_PUNCT = Pattern.compile("[.!?…]+$");

	private String stepId;
	private String title;
	private WorldPointDto worldPoint;
	private List<GroundTile> groundTiles;
	private List<String> npcNames;
	private List<Integer> npcIds;
	private List<String> objectNames;
	private List<Integer> objectIds;
	private List<String> dialogChoices;
	private List<String> highlightItems;
	private Trigger completionTrigger;

	private transient Set<String> npcNameSet = Collections.emptySet();
	private transient Set<Integer> npcIdSet = Collections.emptySet();
	private transient Set<String> objectNameSet = Collections.emptySet();
	private transient Set<Integer> objectIdSet = Collections.emptySet();
	private transient Set<String> dialogSet = Collections.emptySet();
	private transient Set<String> itemNameSet = Collections.emptySet();

	@Data
	public static class WorldPointDto
	{
		private int x;
		private int y;
		private int plane;
		private String label;
	}

	@Data
	public static class GroundTile
	{
		private int x;
		private int y;
		private int plane;
		private String label;
		private String color;
	}

	@Data
	public static class Trigger
	{
		private String type;
		private String questName;
		private String chatPattern;
		private Integer varbitId;
		private Integer targetValue;
	}

	/**
	 * Проверка и подготовка после разбора JSON. Возвращает текст ошибки или null, если всё в порядке.
	 * Имена сравниваются без учёта регистра и тегов цвета, как их показывает игра.
	 */
	String prepare()
	{
		if (stepId == null || !stepId.matches("S\\d-\\d{2}"))
		{
			return "stepId должен быть вида S1-03";
		}
		if (tooLong(title) || (worldPoint != null && tooLong(worldPoint.label)))
		{
			return "слишком длинный текст";
		}
		for (List<?> list : new List<?>[]{groundTiles, npcNames, npcIds, objectNames, objectIds, dialogChoices, highlightItems})
		{
			if (list != null && list.size() > MAX_LIST)
			{
				return "слишком длинный список";
			}
		}
		if (groundTiles != null)
		{
			for (GroundTile t : groundTiles)
			{
				if (t == null || tooLong(t.label))
				{
					return "неверная клетка";
				}
			}
		}
		for (List<String> list : List.of(nonNull(npcNames), nonNull(objectNames), nonNull(dialogChoices), nonNull(highlightItems)))
		{
			for (String s : list)
			{
				if (s == null || tooLong(s))
				{
					return "неверное имя";
				}
			}
		}
		npcNameSet = names(npcNames);
		objectNameSet = names(objectNames);
		itemNameSet = names(highlightItems);
		dialogSet = new HashSet<>();
		for (String d : nonNull(dialogChoices))
		{
			dialogSet.add(dialogKey(d));
		}
		npcIdSet = npcIds == null ? Collections.emptySet() : new HashSet<>(npcIds);
		objectIdSet = objectIds == null ? Collections.emptySet() : new HashSet<>(objectIds);
		return null;
	}

	/** Имя как ключ сравнения: без тегов, без неразрывных пробелов, в нижнем регистре. */
	static String nameKey(String s)
	{
		if (s == null)
		{
			return "";
		}
		String t = TAGS.matcher(s).replaceAll("").replace(' ', ' ');
		return SPACES.matcher(t).replaceAll(" ").trim().toLowerCase(Locale.ROOT);
	}

	/** Вариант диалога как ключ: ещё и без точки или восклицательного знака в конце — их вики пишет по-разному. */
	static String dialogKey(String s)
	{
		String t = nameKey(s).replace('’', '\'');
		return TRAILING_PUNCT.matcher(t).replaceAll("").trim();
	}

	private static Set<String> names(List<String> list)
	{
		Set<String> out = new HashSet<>();
		for (String s : nonNull(list))
		{
			out.add(nameKey(s));
		}
		return out;
	}

	private static <T> List<T> nonNull(List<T> list)
	{
		return list == null ? Collections.emptyList() : list;
	}

	private static boolean tooLong(String s)
	{
		return s != null && s.length() > MAX_TEXT;
	}
}
