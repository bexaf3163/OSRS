package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.NPC;
import net.runelite.api.Player;
import net.runelite.api.Quest;
import net.runelite.api.QuestState;
import net.runelite.api.Skill;
import net.runelite.api.Tile;
import net.runelite.api.TileObject;
import net.runelite.api.WorldView;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.widgets.Widget;

/**
 * Game facts for the Quest Helper state machine: what the client sees now, and the messages since observation began.
 * Read only on the client thread.
 */
final class QhLiveFacts implements QhMachine.Facts
{
	/** We remember this many messages: enough for a whole quest, and Quest Helper does not look for old messages anyway. */
	static final int MAX_EVENTS = 300;

	private final Client client;
	private final Supplier<ItemCounts> carried;
	private final Supplier<ItemCounts> worn;
	private final Supplier<ItemCounts> bank;
	private final List<QhMachine.Event> events = new ArrayList<>();

	QhLiveFacts(Client client, Supplier<ItemCounts> carried, Supplier<ItemCounts> worn, Supplier<ItemCounts> bank)
	{
		this.client = client;
		this.carried = carried;
		this.worn = worn;
		this.bank = bank;
	}

	/** A game message: chat (GAMEMESSAGE, ENGINE, SPAM), message box (MESBOX), dialogue line (DIALOG, "Name|text"). */
	void add(String type, String text)
	{
		if (text == null)
		{
			return;
		}
		events.add(new QhMachine.Event(type, text));
		if (events.size() > MAX_EVENTS)
		{
			events.subList(0, events.size() - MAX_EVENTS).clear();
		}
	}

	void clear()
	{
		events.clear();
	}

	@Override
	public int items(int[] ids, boolean onlyWorn, boolean withBank)
	{
		// Worn items are part of "bag and worn"; "worn only" is a subset.
		int total = onlyWorn ? sum(worn.get(), ids) : sum(carried.get(), ids);
		if (withBank)
		{
			total += sum(bank.get(), ids);
		}
		return total;
	}

	private static int sum(ItemCounts c, int[] ids)
	{
		if (c == null)
		{
			return 0;
		}
		int n = 0;
		for (int id : ids)
		{
			n += c.idCount(id);
		}
		return n;
	}

	@Override
	public int[] position()
	{
		Player me = client.getLocalPlayer();
		if (me == null)
		{
			return null;
		}
		WorldPoint p = WorldPoint.fromLocalInstance(client, me.getLocalLocation());
		if (p == null)
		{
			p = me.getWorldLocation();
		}
		return p == null ? null : new int[] {p.getX(), p.getY(), p.getPlane()};
	}

	@Override
	public int varbit(int id)
	{
		try
		{
			return client.getVarbitValue(id);
		}
		catch (RuntimeException ex)
		{
			return 0;
		}
	}

	@Override
	public int varp(int id)
	{
		try
		{
			return client.getVarpValue(id);
		}
		catch (RuntimeException ex)
		{
			return 0;
		}
	}

	@Override
	public List<QhMachine.Event> events()
	{
		return events;
	}

	@Override
	public List<String> widget(int group, int child, boolean children)
	{
		Widget w = client.getWidget(group, child);
		if (w == null || w.isHidden())
		{
			return null;
		}
		List<String> texts = new ArrayList<>();
		collect(w, texts, children, 0);
		return texts;
	}

	private void collect(Widget w, List<String> out, boolean children, int depth)
	{
		String text = w.getText();
		out.add(text == null ? "" : client.macroExpand(text));
		if (!children || depth > 4 || out.size() > 400)
		{
			return;
		}
		for (Widget[] group : new Widget[][] {w.getStaticChildren(), w.getDynamicChildren(), w.getNestedChildren()})
		{
			if (group == null)
			{
				continue;
			}
			for (Widget c : group)
			{
				if (c != null && !c.isHidden())
				{
					collect(c, out, true, depth + 1);
				}
			}
		}
	}

	@Override
	public Boolean npc(int id, int[] zone)
	{
		WorldView wv = client.getTopLevelWorldView();
		if (wv == null)
		{
			return Boolean.FALSE;
		}
		for (NPC n : wv.npcs())
		{
			if (n == null || n.getId() != id)
			{
				continue;
			}
			if (zone == null)
			{
				return Boolean.TRUE;
			}
			WorldPoint p = WorldPoint.fromLocalInstance(client, n.getLocalLocation());
			if (p != null && QhMachine.inZone(zone, p.getX(), p.getY(), p.getPlane()))
			{
				return Boolean.TRUE;
			}
		}
		return Boolean.FALSE;
	}

	@Override
	public Boolean object(int[] ids, int[] zone)
	{
		WorldView wv = client.getTopLevelWorldView();
		if (client.getGameState() != GameState.LOGGED_IN || wv == null || wv.getScene() == null)
		{
			return Boolean.FALSE;
		}
		Tile[][][] tiles = wv.getScene().getTiles();
		int plane = wv.getPlane();
		if (tiles == null || plane < 0 || plane >= tiles.length)
		{
			return Boolean.FALSE;
		}
		for (Tile[] column : tiles[plane])
		{
			for (Tile t : column)
			{
				if (t == null)
				{
					continue;
				}
				if (zone != null)
				{
					WorldPoint p = WorldPoint.fromLocalInstance(client, t.getLocalLocation());
					if (p == null || !QhMachine.inZone(zone, p.getX(), p.getY(), p.getPlane()))
					{
						continue;
					}
				}
				if (hasObject(t, ids))
				{
					return Boolean.TRUE;
				}
			}
		}
		return Boolean.FALSE;
	}

	private static boolean hasObject(Tile t, int[] ids)
	{
		List<TileObject> found = new ArrayList<>();
		for (TileObject o : t.getGameObjects())
		{
			found.add(o);
		}
		found.add(t.getDecorativeObject());
		found.add(t.getGroundObject());
		found.add(t.getWallObject());
		for (TileObject o : found)
		{
			if (o == null)
			{
				continue;
			}
			for (int id : ids)
			{
				if (o.getId() == id)
				{
					return true;
				}
			}
		}
		return false;
	}

	@Override
	public int skill(String name)
	{
		try
		{
			return client.getRealSkillLevel(Skill.valueOf(name));
		}
		catch (IllegalArgumentException ex)
		{
			return 1;
		}
	}

	@Override
	public String quest(String name)
	{
		try
		{
			QuestState state = Quest.valueOf(name).getState(client);
			return state == null ? null : state.name();
		}
		catch (IllegalArgumentException ex)
		{
			return null;
		}
	}
}
