package com.osrspath.bridge;

import java.util.Locale;
import java.util.Set;
import lombok.Data;

/**
 * The app's running funding plan (snapshot part "funding", since 2.64.1): the detour that raises the coins a route step is short of. The plugin only shows
 * one line of it on the HUD (what to do now, how far it has gone) and the arrow the app sets for it; it recomputes nothing, buys, sells and takes nothing,
 * and never touches the route step.
 *
 * The line belongs to one character and to a plan the app is running: it shows only while that character is logged in and while the app has not been gone
 * longer than {@link #STALE_MS} (after that the plan can no longer be followed, so its "now" may be out of date).
 */
@Data
public class FundingHint
{
	/** The text the app puts in front of the label of the arrow it sets for a funding plan (src/fundingContext.tsx FUNDING_ARROW). */
	static final String ARROW_PREFIX = "Funding: ";
	static final int MAX_TEXT = 120;
	static final int MAX_SHORT = 80;
	/** How long the line stays after the app was last connected. */
	static final long STALE_MS = 10 * 60_000L;
	private static final Set<String> STATUSES = Set.of("ACTIVE");

	/** The character the plan belongs to. */
	private String player;
	private String planId;
	private int version;
	/** ACTIVE: a paused plan is not sent. */
	private String status;
	private String title;
	/** What to do now, one short sentence. */
	private String action;
	/** The same in a few words for the narrow HUD plate; absent means the sentence is used as it is. */
	private String brief;
	/** "12 / 27 Cowhide", "425 gp to go"; null when there is nothing to count. */
	private String progress;
	/** The progress is an estimate (loot that is not sold yet). */
	private boolean estimated;
	private int stepIndex;
	private int stepCount;
	private boolean needsConfirm;

	String prepare()
	{
		if (player == null || player.trim().isEmpty() || ActiveTarget.tooLong(player))
		{
			return "invalid player";
		}
		if (planId == null || planId.trim().isEmpty() || planId.length() > MAX_TEXT)
		{
			return "invalid plan id";
		}
		if (status == null || !STATUSES.contains(status))
		{
			return "invalid status";
		}
		if (action == null || action.trim().isEmpty() || action.length() > MAX_TEXT)
		{
			return "invalid action";
		}
		if (brief != null && brief.length() > MAX_SHORT)
		{
			return "brief too long";
		}
		if (title != null && title.length() > MAX_SHORT)
		{
			return "title too long";
		}
		if (progress != null && progress.length() > MAX_SHORT)
		{
			return "progress too long";
		}
		if (stepIndex < 1 || stepCount < stepIndex || stepCount > 20)
		{
			return "invalid step count";
		}
		return null;
	}

	/**
	 * The HUD line, or null: another character is logged in, or the app has been gone too long. "Raising coins: Kill cows · 12 / 27 Cowhide (estimated)".
	 * The words are the app's (its brief, or the sentence); the plugin adds only the heading and the figure.
	 */
	String hudLine(String me, long now, long appSeenAt)
	{
		if (!samePlayer(player, me) || now - appSeenAt > STALE_MS)
		{
			return null;
		}
		String say = brief != null && !brief.trim().isEmpty() ? brief : action;
		StringBuilder sb = new StringBuilder("Raising coins: ").append(say.trim());
		if (progress != null && !progress.trim().isEmpty())
		{
			sb.append(" · ").append(progress.trim());
			if (estimated)
			{
				sb.append(" (estimated)");
			}
		}
		return sb.toString();
	}

	/** Whether a temporary target's label is the arrow a funding plan set. */
	static boolean isArrow(String label)
	{
		return label != null && label.startsWith(ARROW_PREFIX);
	}

	/** The arrow's label as the HUD heading: the app's sentence without the marker ("Funding: Go to the cow field" -> "Go to the cow field"). */
	static String arrowText(String label)
	{
		return isArrow(label) ? label.substring(ARROW_PREFIX.length()).trim() : label;
	}

	static boolean samePlayer(String a, String b)
	{
		return a != null && b != null && norm(a).equals(norm(b));
	}

	private static String norm(String s)
	{
		return s.replace(' ', ' ').replace('_', ' ').replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
	}
}
