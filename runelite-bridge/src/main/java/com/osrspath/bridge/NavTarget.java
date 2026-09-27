package com.osrspath.bridge;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.Data;

/**
 * Временная цель поверх шага: место с карты приложения («📍 Port Sarim») или магазин для апгрейда
 * («Купи Steel axe у Bob»). Стрелка, Shortest Path и HUD ведут к ней; шаг никуда не девается и
 * возвращается сам, когда игрок дошёл до места или получил предмет. {"clear": true} — снять раньше.
 */
@Data
public class NavTarget
{
	static final int MAX_NPCS = 8;
	/** Мировые координаты RuneLite: наземный мир и подземелья (y до ~13 000) — всё меньше 16 384. */
	static final int MAX_COORD = 16_384;
	static final int MAX_ITEM_ID = 100_000;

	private boolean clear;
	private String label;
	private int x;
	private int y;
	private int plane;
	/** Продавец или NPC у места — его подсветит оверлей мира. */
	private List<String> npcNames;
	/** Предмет, за которым идём: с ним цель снимается, когда он появился в сумке или надет. */
	private String itemName;
	private Integer itemId;
	/** Шаг, к которому относится цель (для приложения; плагину не нужен). */
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
			return "нужна подпись места";
		}
		if (x <= 0 || y <= 0 || x >= MAX_COORD || y >= MAX_COORD || plane < 0 || plane > 3)
		{
			return "неверные координаты";
		}
		if (npcNames != null && npcNames.size() > MAX_NPCS)
		{
			return "слишком много NPC";
		}
		Set<String> names = new HashSet<>();
		if (npcNames != null)
		{
			for (String n : npcNames)
			{
				if (n == null || n.isEmpty() || ActiveTarget.tooLong(n))
				{
					return "неверное имя NPC";
				}
				names.add(ActiveTarget.nameKey(n));
			}
		}
		if (itemName != null && (itemName.isEmpty() || ActiveTarget.tooLong(itemName)))
		{
			return "неверный предмет";
		}
		if (itemId != null && (itemId <= 0 || itemId >= MAX_ITEM_ID))
		{
			return "неверный ID предмета";
		}
		if (stepId != null && !stepId.matches("S\\d-\\d{2}"))
		{
			return "stepId должен быть вида S1-03";
		}
		npcNameSet = names;
		return null;
	}

	/** Цель — покупка или получение предмета, а не просто место. */
	boolean isPurchase()
	{
		return itemName != null || itemId != null;
	}
}
