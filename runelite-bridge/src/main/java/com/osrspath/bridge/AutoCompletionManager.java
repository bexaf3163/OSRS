package com.osrspath.bridge;

import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import lombok.extern.slf4j.Slf4j;

/**
 * Автоотметка текущего шага. Только условия, известные заранее и проверенные:
 * <ul>
 * <li>QUEST_COMPLETED — квест с этим названием в состоянии FINISHED (Quest.getState в RuneLite);</li>
 * <li>SKILL_LEVEL — настоящие уровни навыков (без зелий) не ниже заданных, все сразу;</li>
 * <li>ITEM_OWNED — предметы есть у игрока: в сумке, на нём, банкнотами и в банке вместе;</li>
 * <li>CHAT_MESSAGE — сообщение игры совпало с регулярным выражением шага;</li>
 * <li>VARBIT_CHANGED — varbit с этим номером принял ровно это значение.</li>
 * </ul>
 * У QUEST_COMPLETED и SKILL_LEVEL могут быть ещё и предметы: «квест выполнен и куплен Dragon scimitar»,
 * «рыбалка 20 и 50 креветок». Такие условия — состояние игры: они проверяются сразу при взводе, после
 * изменений (уровни, сумка, банк, переменные) и заодно раз в {@link #QUEST_POLL_TICKS} тиков.
 * Срабатывает один раз на цель: повторные события и сообщения ничего не шлют.
 * Все методы вызываются в потоке клиента RuneLite, поэтому синхронизация не нужна.
 */
@Slf4j
public class AutoCompletionManager
{
	/** Как часто перепроверять состояние, даже если игра не присылала изменений. */
	static final int QUEST_POLL_TICKS = 10;

	private static final Pattern TAGS = Pattern.compile("<[^>]*>");

	public interface QuestChecker
	{
		/** true — квест выполнен, false — нет, null — квест с таким названием неизвестен. */
		Boolean isFinished(String questName);
	}

	public interface LevelChecker
	{
		/** Настоящий уровень навыка по ключу приложения («attack»); null — ещё неизвестен (не в игре). */
		Integer level(String skill);
	}

	public interface ItemChecker
	{
		/** Сколько этого предмета у игрока: сумка, надетое, банкноты и банк, если его открывали в этой сессии. */
		int owned(ActiveTarget.ItemNeed need);
	}

	private final QuestChecker quests;
	private final LevelChecker levels;
	private final ItemChecker items;
	private final Consumer<String> onCompleted;

	private String stepId;
	private String type;
	private String questName;
	private List<ActiveTarget.LevelNeed> needLevels = Collections.emptyList();
	private List<ActiveTarget.ItemNeed> needItems = Collections.emptyList();
	private Pattern chatPattern;
	private int varbitId;
	private int targetValue;
	private boolean fired;
	private boolean dirty;
	private int ticks;

	public AutoCompletionManager(QuestChecker quests, LevelChecker levels, ItemChecker items, Consumer<String> onCompleted)
	{
		this.quests = quests;
		this.levels = levels;
		this.items = items;
		this.onCompleted = onCompleted;
	}

	/** Только квесты, сообщения и varbit: уровней и предметов этот менеджер не знает. */
	public AutoCompletionManager(QuestChecker quests, Consumer<String> onCompleted)
	{
		this(quests, skill -> null, need -> 0, onCompleted);
	}

	/** Новая цель (или null — снять). Условие взводится заново, даже если это тот же шаг. */
	public void setTarget(ActiveTarget target)
	{
		stepId = null;
		type = null;
		questName = null;
		needLevels = Collections.emptyList();
		needItems = Collections.emptyList();
		chatPattern = null;
		fired = false;
		ticks = 0;
		ActiveTarget.Trigger t = target == null ? null : target.getCompletionTrigger();
		if (t == null || t.getType() == null)
		{
			return;
		}
		List<ActiveTarget.LevelNeed> lv = t.getLevels() == null ? Collections.emptyList() : t.getLevels();
		List<ActiveTarget.ItemNeed> it = t.getItems() == null ? Collections.emptyList() : t.getItems();
		switch (t.getType())
		{
			case "QUEST_COMPLETED":
				if (t.getQuestName() == null || t.getQuestName().isEmpty())
				{
					return;
				}
				questName = t.getQuestName();
				needLevels = lv;
				needItems = it;
				break;
			case "SKILL_LEVEL":
				if (lv.isEmpty())
				{
					return;
				}
				needLevels = lv;
				needItems = it;
				break;
			case "ITEM_OWNED":
				if (it.isEmpty())
				{
					return;
				}
				needItems = it;
				break;
			case "CHAT_MESSAGE":
				try
				{
					chatPattern = Pattern.compile(t.getChatPattern());
				}
				catch (PatternSyntaxException | NullPointerException e)
				{
					log.warn("Шаг {}: неверный chatPattern — автоотметка выключена", target.getStepId());
					return;
				}
				break;
			case "VARBIT_CHANGED":
				if (t.getVarbitId() == null || t.getTargetValue() == null)
				{
					return;
				}
				varbitId = t.getVarbitId();
				targetValue = t.getTargetValue();
				break;
			default:
				log.warn("Шаг {}: неизвестный тип автоотметки {}", target.getStepId(), t.getType());
				return;
		}
		type = t.getType();
		stepId = target.getStepId();
		// Сразу проверить: квест, уровни или предметы могли быть готовы ещё до того, как шаг показали в игре.
		dirty = true;
	}

	public boolean isArmed()
	{
		return type != null && !fired;
	}

	/**
	 * Условие автоотметки шага — для плашки разработчика и журнала: строки вида «Item(Lobster ×5) = 3/5 FALSE». Пусто —
	 * у шага нет условия. Только читает: готовность проверяет onGameTick.
	 */
	public List<String> describe()
	{
		List<String> out = new java.util.ArrayList<>();
		if (type == null)
		{
			return out;
		}
		if (fired)
		{
			out.add(type + " сработало");
			return out;
		}
		if (questName != null)
		{
			Boolean finished = quests.isFinished(questName);
			out.add("Quest(" + questName + ") = " + (finished == null ? "?" : String.valueOf(finished).toUpperCase()));
		}
		for (ActiveTarget.LevelNeed l : needLevels)
		{
			Integer level = levels.level(l.getSkill());
			out.add("Skill(" + l.getSkill() + " ≥ " + l.getLevel() + ") = " + (level == null ? "?" : level >= l.getLevel() ? "TRUE" : "FALSE (" + level + ")"));
		}
		for (ActiveTarget.ItemNeed i : needItems)
		{
			int have = items.owned(i);
			out.add("Item(" + (i.getNames() != null && !i.getNames().isEmpty() ? String.join("/", i.getNames()) : String.valueOf(i.getId())) + " ×" + i.getCount() + ") = " + (have >= i.getCount() ? "TRUE" : "FALSE") + " " + have + "/" + i.getCount());
		}
		if (chatPattern != null)
		{
			out.add("Chat(" + chatPattern.pattern() + ") = ждём сообщение");
		}
		if ("VARBIT_CHANGED".equals(type))
		{
			out.add("Varbit(" + varbitId + ") == " + targetValue + " = ждём");
		}
		return out;
	}

	/** Условие — состояние игры (квест, уровни, предметы), а не событие. */
	private boolean stateful()
	{
		return "QUEST_COMPLETED".equals(type) || "SKILL_LEVEL".equals(type) || "ITEM_OWNED".equals(type);
	}

	/** Сообщение игры (GAMEMESSAGE, SPAM). Теги цвета убираются перед сравнением. */
	public void onChatMessage(String message)
	{
		if (!isArmed() || !"CHAT_MESSAGE".equals(type) || message == null)
		{
			return;
		}
		Matcher m = chatPattern.matcher(TAGS.matcher(message).replaceAll(""));
		if (m.find())
		{
			fire();
		}
	}

	public void onVarbitChanged(int changedVarbitId, int value)
	{
		// Любая смена переменной может значить, что квест продвинулся.
		dirty = true;
		if (isArmed() && "VARBIT_CHANGED".equals(type) && changedVarbitId == varbitId && value == targetValue)
		{
			fire();
		}
	}

	/** Изменились уровни, сумка, надетое или банк — проверить условие на ближайшем тике. */
	public void onStateChanged()
	{
		dirty = true;
	}

	/** Раз в тик игры: условие проверяется после изменений и заодно раз в {@link #QUEST_POLL_TICKS} тиков. */
	public void onGameTick()
	{
		if (!isArmed() || !stateful())
		{
			return;
		}
		ticks++;
		if (!dirty && ticks % QUEST_POLL_TICKS != 0)
		{
			return;
		}
		dirty = false;
		if (questName != null)
		{
			Boolean finished = quests.isFinished(questName);
			if (finished == null)
			{
				log.warn("Квест «{}» не найден в RuneLite — автоотметка шага {} выключена", questName, stepId);
				type = null;
				return;
			}
			if (!finished)
			{
				return;
			}
		}
		for (ActiveTarget.LevelNeed l : needLevels)
		{
			Integer level = levels.level(l.getSkill());
			if (level == null || level < l.getLevel())
			{
				return;
			}
		}
		for (ActiveTarget.ItemNeed i : needItems)
		{
			if (items.owned(i) < i.getCount())
			{
				return;
			}
		}
		fire();
	}

	private void fire()
	{
		if (fired)
		{
			return;
		}
		fired = true;
		onCompleted.accept(stepId);
	}
}
