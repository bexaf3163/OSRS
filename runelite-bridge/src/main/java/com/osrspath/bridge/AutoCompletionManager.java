package com.osrspath.bridge;

import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import lombok.extern.slf4j.Slf4j;

/**
 * Автоотметка текущего шага. Только условия, известные заранее и проверенные:
 * <ul>
 * <li>QUEST_COMPLETED — квест с этим названием в состоянии FINISHED (Quest.getState в RuneLite);</li>
 * <li>CHAT_MESSAGE — сообщение игры совпало с регулярным выражением шага;</li>
 * <li>VARBIT_CHANGED — varbit с этим номером принял ровно это значение.</li>
 * </ul>
 * Срабатывает один раз на цель: повторные события и сообщения ничего не шлют.
 * Все методы вызываются в потоке клиента RuneLite, поэтому синхронизация не нужна.
 */
@Slf4j
public class AutoCompletionManager
{
	/** Как часто перепроверять квест, даже если игра не присылала изменений переменных. */
	static final int QUEST_POLL_TICKS = 10;

	private static final Pattern TAGS = Pattern.compile("<[^>]*>");

	public interface QuestChecker
	{
		/** true — квест выполнен, false — нет, null — квест с таким названием неизвестен. */
		Boolean isFinished(String questName);
	}

	private final QuestChecker quests;
	private final Consumer<String> onCompleted;

	private String stepId;
	private String type;
	private String questName;
	private Pattern chatPattern;
	private int varbitId;
	private int targetValue;
	private boolean fired;
	private boolean questDirty;
	private int ticks;

	public AutoCompletionManager(QuestChecker quests, Consumer<String> onCompleted)
	{
		this.quests = quests;
		this.onCompleted = onCompleted;
	}

	/** Новая цель (или null — снять). Условие взводится заново, даже если это тот же шаг. */
	public void setTarget(ActiveTarget target)
	{
		stepId = null;
		type = null;
		questName = null;
		chatPattern = null;
		fired = false;
		ticks = 0;
		ActiveTarget.Trigger t = target == null ? null : target.getCompletionTrigger();
		if (t == null || t.getType() == null)
		{
			return;
		}
		switch (t.getType())
		{
			case "QUEST_COMPLETED":
				if (t.getQuestName() == null || t.getQuestName().isEmpty())
				{
					return;
				}
				questName = t.getQuestName();
				// Сразу проверить: квест мог быть выполнен ещё до того, как шаг показали в игре.
				questDirty = true;
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
	}

	public boolean isArmed()
	{
		return type != null && !fired;
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
		questDirty = true;
		if (isArmed() && "VARBIT_CHANGED".equals(type) && changedVarbitId == varbitId && value == targetValue)
		{
			fire();
		}
	}

	/** Раз в тик игры: квест проверяется, когда менялись переменные, и заодно раз в {@link #QUEST_POLL_TICKS} тиков. */
	public void onGameTick()
	{
		if (!isArmed() || !"QUEST_COMPLETED".equals(type))
		{
			return;
		}
		ticks++;
		if (!questDirty && ticks % QUEST_POLL_TICKS != 0)
		{
			return;
		}
		questDirty = false;
		Boolean finished = quests.isFinished(questName);
		if (finished == null)
		{
			log.warn("Квест «{}» не найден в RuneLite — автоотметка шага {} выключена", questName, stepId);
			type = null;
			return;
		}
		if (finished)
		{
			fire();
		}
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
