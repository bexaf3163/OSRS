package com.osrspath.bridge;

import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import lombok.extern.slf4j.Slf4j;

/**
 * Auto-tick of the current step. Only conditions that are known in advance and tested:
 * <ul>
 * <li>QUEST_COMPLETED: a quest with this name is in the FINISHED state (Quest.getState in RuneLite);</li>
 * <li>SKILL_LEVEL: real skill levels (without potions) are at least the given ones, all at once;</li>
 * <li>ITEM_OWNED: the player has the items: in the bag, worn, as notes and in the bank together;</li>
 * <li>CHAT_MESSAGE: a game message matched the step's regular expression;</li>
 * <li>VARBIT_CHANGED: the varbit with this number took exactly this value.</li>
 * </ul>
 * QUEST_COMPLETED and SKILL_LEVEL may also have items: "quest complete and a Dragon scimitar bought",
 * "Fishing 20 and 50 shrimps". Such conditions are the game state: they are checked at once on arming, after
 * changes (levels, bag, bank, variables) and also every {@link #QUEST_POLL_TICKS} ticks.
 * Fires once per target: repeated events and messages send nothing.
 * All methods are called on the RuneLite client thread, so no synchronisation is needed.
 */
@Slf4j
public class AutoCompletionManager
{
	/** How often to recheck the state even if the game sent no changes. */
	static final int QUEST_POLL_TICKS = 10;

	private static final Pattern TAGS = Pattern.compile("<[^>]*>");

	public interface QuestChecker
	{
		/** true means the quest is complete, false means not, null means a quest with this name is unknown. */
		Boolean isFinished(String questName);
	}

	public interface LevelChecker
	{
		/** The real skill level by the app's key ("attack"); null means not known yet (not in the game). */
		Integer level(String skill);
	}

	public interface ItemChecker
	{
		/** How much of this item the player has: bag, worn, notes and the bank if it was opened in this session. */
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

	/** Only quests, messages and varbit: this manager knows no levels or items. */
	public AutoCompletionManager(QuestChecker quests, Consumer<String> onCompleted)
	{
		this(quests, skill -> null, need -> 0, onCompleted);
	}

	/** A new target (or null to clear). The condition is armed again, even if it is the same step. */
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
					log.warn("Step {}: invalid chatPattern - auto-tick turned off", target.getStepId());
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
				log.warn("Step {}: unknown auto-tick type {}", target.getStepId(), t.getType());
				return;
		}
		type = t.getType();
		stepId = target.getStepId();
		// Check at once: the quest, levels or items may have been ready before the step was shown in the game.
		dirty = true;
	}

	public boolean isArmed()
	{
		return type != null && !fired;
	}

	/**
	 * The step's auto-tick condition, for the developer badge and the log: lines like "Item(Lobster ×5) = 3/5 FALSE". Empty means
	 * the step has no condition. Only reads: onGameTick checks readiness.
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
			out.add(type + " fired");
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
			out.add("Chat(" + chatPattern.pattern() + ") = waiting for a message");
		}
		if ("VARBIT_CHANGED".equals(type))
		{
			out.add("Varbit(" + varbitId + ") == " + targetValue + " = waiting");
		}
		return out;
	}

	/** The condition is a game state (quest, levels, items), not an event. */
	private boolean stateful()
	{
		return "QUEST_COMPLETED".equals(type) || "SKILL_LEVEL".equals(type) || "ITEM_OWNED".equals(type);
	}

	/** A game message (GAMEMESSAGE, SPAM). Colour tags are removed before comparing. */
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
		// Any variable change may mean the quest moved on.
		dirty = true;
		if (isArmed() && "VARBIT_CHANGED".equals(type) && changedVarbitId == varbitId && value == targetValue)
		{
			fire();
		}
	}

	/** Levels, bag, worn items or the bank changed: check the condition on the next tick. */
	public void onStateChanged()
	{
		dirty = true;
	}

	/** Once per game tick: the condition is checked after changes and also every {@link #QUEST_POLL_TICKS} ticks. */
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
				log.warn("Quest '{}' not found in RuneLite - auto-tick of step {} turned off", questName, stepId);
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
