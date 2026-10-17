package com.osrspath.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.Value;

/**
 * Where to go right now when Quest Helper's current step is not our line's own step. Quest Helper often picks a step that only moves the player
 * ("go down to Tess": the hole on the beach) or one our list has no line for (Prince Ali Rescue's "talk to Aggie"); our line then names the next
 * thing to do (Chief Tess, in a cave in another layer) and the arrow used to point at it: "Target is underground - find the way down" with nothing to
 * follow. Now the arrow, the HUD and the highlight follow Quest Helper's step: its tile and its NPC or object, from its own sources (QhSteps).
 *
 * Pure logic, checked by QhViaTest.
 */
final class QhVia
{
	/** A via is not worth showing when Quest Helper's tile is this close to our line's tile on the same floor: the line already leads there. */
	static final int SAME_PLACE = 2;

	@Value
	static class Via
	{
		/** Quest Helper's step name (goDownToTess). */
		String leaf;
		/** What the HUD says: "Go down to Tess (Hole)". */
		String label;
		int x;
		int y;
		int plane;
		int npcId;
		int objectId;

		ActiveTarget.Highlight highlight()
		{
			ActiveTarget.Highlight h = new ActiveTarget.Highlight();
			if (npcId > 0)
			{
				h.setNpc(Collections.singletonList(npcId));
			}
			if (objectId > 0)
			{
				h.setObj(Collections.singletonList(objectId));
			}
			return h;
		}
	}

	private QhVia()
	{
	}

	/**
	 * The via for Quest Helper's current step, or null when our line already leads there: the step is the line's own (its k), or its tile is the
	 * line's tile. name is the NPC's or object's name from the game (null when unknown); proper are the capitalised words of the quest's lines
	 * (names keep their capital in the label).
	 */
	static Via of(String leaf, QhSteps.Tile tile, ActiveTarget.StageLine line, String name, Set<String> proper)
	{
		if (leaf == null || tile == null)
		{
			return null;
		}
		if (line != null && leaf.equals(line.getK()))
		{
			return null;
		}
		if (line != null && line.hasPoint() && line.getPlane() == tile.getPlane()
			&& Math.max(Math.abs(line.getX() - tile.getX()), Math.abs(line.getY() - tile.getY())) <= SAME_PLACE)
		{
			return null;
		}
		String words = humanize(leaf, proper);
		String shown = name == null || name.isEmpty() || "null".equalsIgnoreCase(name) ? words : words + " (" + name + ")";
		if (shown.length() > 60)
		{
			shown = shown.substring(0, 59) + "…";
		}
		return new Via(leaf, shown, tile.getX(), tile.getY(), tile.getPlane(), tile.isNpc() ? tile.getId() : 0, tile.isObject() ? tile.getId() : 0);
	}

	/**
	 * "goDownToTess" gives "Go down to Tess" (Tess is a name in the quest's lines), "smuggleRum.talkToZambo" gives "Talk to Zambo", "goUpToColin2"
	 * gives "Go up to Colin": a step number at the end is dropped.
	 */
	static String humanize(String leaf, Set<String> proper)
	{
		String s = leaf.substring(leaf.lastIndexOf('.') + 1);
		// A step number at the end goes (goUpToColin2); a digit inside stays with its letter (F1).
		String bare = s.replaceAll("[0-9]+$", "");
		if (!bare.isEmpty())
		{
			s = bare;
		}
		List<String> words = new ArrayList<>();
		StringBuilder cur = new StringBuilder();
		for (int i = 0; i < s.length(); i++)
		{
			char c = s.charAt(i);
			boolean boundary = cur.length() > 0 && Character.isUpperCase(c);
			if (boundary)
			{
				words.add(cur.toString());
				cur.setLength(0);
			}
			cur.append(c);
		}
		if (cur.length() > 0)
		{
			words.add(cur.toString());
		}
		StringBuilder out = new StringBuilder();
		for (int i = 0; i < words.size(); i++)
		{
			String w = words.get(i);
			String lower = w.toLowerCase(Locale.ROOT);
			String shown;
			if (i == 0)
			{
				shown = Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
			}
			else if (proper != null && proper.contains(lower))
			{
				shown = Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
			}
			else
			{
				shown = lower;
			}
			if (out.length() > 0)
			{
				out.append(' ');
			}
			out.append(shown);
		}
		return out.toString();
	}

	/** The words that start with a capital inside the quest's line texts (not at a sentence start): names, places. Lower-cased. */
	static void properWords(String text, Set<String> into)
	{
		if (text == null)
		{
			return;
		}
		String[] tokens = text.split("[^A-Za-z']+");
		boolean sentenceStart = true;
		int at = 0;
		for (String t : tokens)
		{
			if (t.isEmpty())
			{
				continue;
			}
			int idx = text.indexOf(t, at);
			if (idx >= 0)
			{
				// A sentence starts after ". ", "! ", "? ", ": " or at the beginning.
				String before = text.substring(Math.max(0, at), idx).trim();
				sentenceStart = at == 0 && before.isEmpty() || before.endsWith(".") || before.endsWith("!") || before.endsWith("?") || before.endsWith(":")
					|| before.endsWith("“") || before.endsWith("\"");
				at = idx + t.length();
			}
			if (!sentenceStart && Character.isUpperCase(t.charAt(0)) && t.length() > 1)
			{
				into.add(t.toLowerCase(Locale.ROOT).replace("'s", ""));
			}
		}
	}
}
