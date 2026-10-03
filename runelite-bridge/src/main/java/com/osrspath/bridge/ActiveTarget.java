package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.Data;
import net.runelite.api.Skill;

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
	/** Текущая цель одной строкой — для микро-HUD. */
	private String goal;
	/** Что должно быть в сумке перед выходом из банка (проверка вылета). */
	private List<ChecklistItem> checklist;
	/** Путевые точки по порядку: калитка → мост → лестница → NPC. */
	private List<WorldPointDto> pathWaypoints;
	/** Ещё предметы, про которые приложению нужно знать, сколько их есть (условия быстрых вариантов). */
	private List<String> watchItems;
	/** Темп прокачки навыка шага: сколько действий до цели и сколько это займёт. */
	private Pacing pacing;
	/** Для боковой панели: что нужно на шаг, где взять и куда можно повести стрелку (с протокола 3). */
	private Guide guide;

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

	/** Боковая панель «OSRS Путь»: предметы шага с подсказкой «где взять» и точки шага. */
	@Data
	public static class Guide
	{
		/** «Где взять» бывает длиннее обычной подписи — целое предложение из маршрута. */
		static final int MAX_WHERE = 500;

		private List<GuideItem> items;
		private List<GuidePlace> places;
		/** Быстрый путь шага по порядку: последний пункт показывается, когда всё собрано. */
		private List<String> steps;

		String problem()
		{
			for (List<?> list : new List<?>[]{items, places, steps})
			{
				if (list != null && list.size() > MAX_LIST)
				{
					return "слишком длинный список";
				}
			}
			for (String s : nonNull(steps))
			{
				if (s == null || s.length() > MAX_WHERE)
				{
					return "неверный пункт быстрого пути";
				}
			}
			for (GuideItem i : nonNull(items))
			{
				if (i == null || i.name == null || i.name.isEmpty() || tooLong(i.name) || tooLong(i.nameRu)
					|| (i.where != null && i.where.length() > MAX_WHERE) || (i.count != null && (i.count < 1 || i.count > ShoppingPlan.MAX_COUNT)))
				{
					return "неверный предмет панели";
				}
			}
			for (GuidePlace p : nonNull(places))
			{
				if (p == null || p.label == null || p.label.trim().isEmpty() || tooLong(p.label) || tooLong(p.npc)
					|| p.x <= 0 || p.y <= 0 || p.x >= NavTarget.MAX_COORD || p.y >= NavTarget.MAX_COORD || p.plane < 0 || p.plane > 3
					|| (p.items != null && (p.items.size() > MAX_LIST || p.items.stream().anyMatch(n -> n == null || tooLong(n)))))
				{
					return "неверная точка панели";
				}
			}
			return null;
		}
	}

	@Data
	public static class GuideItem
	{
		private String name;
		private String nameRu;
		private Integer id;
		/** null — количество в маршруте не числом («сколько есть»): хватит одного. */
		private Integer count;
		private String where;
		/** Добывается по ходу самого шага, брать заранее не нужно. */
		private boolean inStep;
	}

	@Data
	public static class GuidePlace
	{
		private int x;
		private int y;
		private int plane;
		private String label;
		/** NPC в этой точке — подсветится, когда стрелка приведёт. */
		private String npc;
		/** Какие предметы шага берут здесь (английские названия). */
		private List<String> items;
	}

	@Data
	public static class ChecklistItem
	{
		private String name;
		private Integer id;
		private int count;
		/** Сколько здоровья лечит — у еды. */
		private Integer heals;
	}

	/** То же, что StepPacing в src/types/index.ts. */
	@Data
	public static class Pacing
	{
		/** Навыки ближнего боя: у них действие — побеждённый противник, а опыт идёт за каждый удар. */
		static final Set<String> COMBAT = Set.of("attack", "strength", "defence");
		static final Set<String> SKILLS = Set.of("fishing", "woodcutting", "cooking", "mining", "attack", "strength", "defence");

		private String skill;
		/** Ещё навыки с той же целью — только бой: сила и защита вслед за атакой. Показывается тот, что растёт. */
		private List<String> also;
		private int targetLevel;
		private int targetExp;
		/** Название действия формами для 1, 2–4 и 5+: «креветка|креветки|креветок». Одна форма тоже годится. */
		private String actionName;
		private double expPerAction;
		/** Сколько секунд на действие — первая оценка, пока нет своих замеров. */
		private Double secondsPerAction;

		/** Навык шага и следом навыки из also — в том порядке, в каком их советует качать шаг. */
		List<String> skills()
		{
			List<String> out = new ArrayList<>();
			out.add(skill);
			for (String s : nonNull(also))
			{
				if (!out.contains(s))
				{
					out.add(s);
				}
			}
			return out;
		}

		String problem()
		{
			if (skill == null || !SKILLS.contains(skill))
			{
				return "неизвестный навык темпа";
			}
			if (also != null)
			{
				// Несколько навыков с одной целью бывает только в бою: их качают по очереди, меняя стиль атаки.
				if (also.size() > 2 || !COMBAT.contains(skill))
				{
					return "неверный список навыков темпа";
				}
				for (String s : also)
				{
					if (s == null || !COMBAT.contains(s) || s.equals(skill))
					{
						return "неверный список навыков темпа";
					}
				}
			}
			if (targetLevel < 2 || targetLevel > 99 || targetExp < 1 || targetExp > 13_034_431)
			{
				return "неверная цель темпа";
			}
			if (!(expPerAction > 0 && expPerAction <= 10_000) || actionName == null || actionName.isEmpty() || tooLong(actionName))
			{
				return "неверное действие темпа";
			}
			if (secondsPerAction != null && !(secondsPerAction > 0 && secondsPerAction <= 600))
			{
				return "неверное время действия";
			}
			return null;
		}
	}

	@Data
	public static class Trigger
	{
		private String type;
		private String questName;
		/** SKILL_LEVEL: эти настоящие уровни (без зелий) — все сразу. */
		private List<LevelNeed> levels;
		/** ITEM_OWNED — сами предметы; у QUEST_COMPLETED и SKILL_LEVEL — ещё одно условие вдобавок. */
		private List<ItemNeed> items;
		private String chatPattern;
		private Integer varbitId;
		private Integer targetValue;

		String problem()
		{
			if (levels != null)
			{
				if (levels.size() > MAX_LIST)
				{
					return "слишком длинный список";
				}
				for (LevelNeed l : levels)
				{
					if (l == null || skillOf(l.skill) == null || l.level < 1 || l.level > 99)
					{
						return "неверный уровень автоотметки";
					}
				}
			}
			if (items != null)
			{
				if (items.size() > MAX_LIST)
				{
					return "слишком длинный список";
				}
				for (ItemNeed i : items)
				{
					if (i == null || i.problem() != null)
					{
						return "неверный предмет автоотметки";
					}
				}
			}
			return null;
		}
	}

	/** Уровень навыка для автоотметки: ключ как в приложении («attack», «fishing») и уровень. */
	@Data
	public static class LevelNeed
	{
		private String skill;
		private int level;
	}

	/**
	 * Предмет для автоотметки: сколько его должно быть у игрока — в сумке, на нём, банкнотами и в банке вместе.
	 * Несколько названий считаются вместе («Shrimps» и «Anchovies»). ID — когда у разных предметов одно
	 * название (куски карты Dragon Slayer I): тогда считается только он.
	 */
	@Data
	public static class ItemNeed
	{
		private List<String> names;
		private Integer id;
		private int count;

		String problem()
		{
			if (names == null || names.isEmpty() || names.size() > MAX_LIST)
			{
				return "нужны названия";
			}
			for (String n : names)
			{
				if (n == null || n.trim().isEmpty() || tooLong(n))
				{
					return "неверное название";
				}
			}
			if (id != null && (id <= 0 || id >= NavTarget.MAX_ITEM_ID))
			{
				return "неверный ID";
			}
			if (count < 1 || count > ShoppingPlan.MAX_COUNT)
			{
				return "неверное количество";
			}
			return null;
		}
	}

	/** Навык по ключу приложения («attack», «fishing») — так же, как OsrsPathBridgePlugin.skillKey. null — нет такого. */
	static Skill skillOf(String key)
	{
		if (key == null)
		{
			return null;
		}
		for (Skill s : Skill.values())
		{
			if (!"OVERALL".equals(s.name()) && s.getName().toLowerCase(Locale.ROOT).equals(key))
			{
				return s;
			}
		}
		return null;
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
		if (tooLong(title) || tooLong(goal) || (worldPoint != null && tooLong(worldPoint.label)))
		{
			return "слишком длинный текст";
		}
		for (List<?> list : new List<?>[]{groundTiles, npcNames, npcIds, objectNames, objectIds, dialogChoices, highlightItems, checklist, pathWaypoints, watchItems})
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
		if (pathWaypoints != null)
		{
			for (WorldPointDto p : pathWaypoints)
			{
				if (p == null || tooLong(p.label) || p.plane < 0 || p.plane > 3)
				{
					return "неверная путевая точка";
				}
			}
		}
		if (checklist != null)
		{
			for (ChecklistItem i : checklist)
			{
				if (i == null || i.name == null || i.name.isEmpty() || tooLong(i.name) || i.count < 1 || i.count > ShoppingPlan.MAX_COUNT)
				{
					return "неверный предмет проверки";
				}
			}
		}
		if (pacing != null && pacing.problem() != null)
		{
			return pacing.problem();
		}
		if (guide != null && guide.problem() != null)
		{
			return guide.problem();
		}
		if (completionTrigger != null && completionTrigger.problem() != null)
		{
			return completionTrigger.problem();
		}
		for (List<String> list : List.of(nonNull(npcNames), nonNull(objectNames), nonNull(dialogChoices), nonNull(highlightItems), nonNull(watchItems)))
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

	static Set<String> names(List<String> list)
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

	static boolean tooLong(String s)
	{
		return s != null && s.length() > MAX_TEXT;
	}
}
