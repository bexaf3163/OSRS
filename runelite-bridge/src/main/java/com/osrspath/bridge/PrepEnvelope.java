package com.osrspath.bridge;

import lombok.Data;

/**
 * The state snapshot from the app: protocol 6, POST /prep-plan. One request instead of five (/active-step, /shopping-plan,
 * /bank-tags, /gear-hint, the preparation plan): the plugin applies everything in one pass of the client thread, so the screen
 * never has intermediate states ("the arrow to the new step but the list of the old one"), and after a RuneLite restart
 * it is enough to send the snapshot once again.
 *
 * The snapshot is complete: what is not in it (null) is cleared. The seq number grows with every snapshot: the plugin discards a late, older
 * snapshot. Each part is validated separately: a bad one does not hinder the others, and the response names it.
 * The old addresses remain, for an app with protocol 5 and below.
 */
@Data
public class PrepEnvelope
{
	static final String STEP = "step";
	static final String SHOPPING = "shopping";
	static final String BANK_TAGS = "bankTags";
	static final String GEAR_HINT = "gearHint";
	static final String PLAN = "plan";
	static final String SKILL_PATH = "skillPath";
	static final String CLEANUP = "cleanup";
	static final String FUNDING = "funding";
	static final String DECISION = "decision";

	/** The snapshot version; 6. */
	private int v;
	private long seq;
	private ActiveTarget step;
	private ShoppingPlan shopping;
	private BankTags bankTags;
	private GearHint gearHint;
	private PrepPlan plan;
	/** The tracked skill's path: while it is there the plugin leads that skill instead of the quest step. Absent means no skill is tracked. */
	private SkillPath skillPath;
	/** The inventory cleanup advice for the bag (since 2.61.0). Absent means none. */
	private CleanupHint cleanup;
	/** The running funding plan for the HUD (since 2.64.1). Absent means none. */
	private FundingHint funding;
	/** The committed Decision this snapshot carries out (app v14): its action and objective. Absent from an older app. */
	private DecisionRef decision;

	@Data
	public static class DecisionRef
	{
		private String id;
		private String objectiveId;
		/** Items every unfinished quest needs: the plugin counts them so the planner never reads an uncounted item as none. */
		private java.util.List<String> watch;

		String prepare()
		{
			if (id == null || id.isEmpty() || ActiveTarget.tooLong(id) || objectiveId == null || objectiveId.isEmpty() || ActiveTarget.tooLong(objectiveId))
			{
				return "invalid decision";
			}
			if (watch != null && (watch.size() > ShoppingPlan.MAX_ITEMS || watch.stream().anyMatch(n -> n == null || n.isEmpty() || ActiveTarget.tooLong(n))))
			{
				return "invalid watch list";
			}
			return null;
		}
	}

	/** The step as it came (JSON): if it did not change, the plugin does not restart the target and arrow. Set by the server. */
	private transient String stepKey;

	/** Bad parts: name -> reason. A part that passed validation can be applied. */
	java.util.Map<String, String> prepare()
	{
		java.util.Map<String, String> bad = new java.util.LinkedHashMap<>();
		check(bad, STEP, step == null ? null : step.prepare());
		check(bad, SHOPPING, shopping == null ? null : shopping.prepare());
		check(bad, BANK_TAGS, bankTags == null ? null : bankTags.prepare());
		check(bad, GEAR_HINT, gearHint == null ? null : gearHint.prepare());
		check(bad, PLAN, plan == null ? null : plan.prepare());
		check(bad, SKILL_PATH, skillPath == null ? null : skillPath.prepare());
		check(bad, CLEANUP, cleanup == null ? null : cleanup.prepare());
		check(bad, FUNDING, funding == null ? null : funding.prepare());
		check(bad, DECISION, decision == null ? null : decision.prepare());
		return bad;
	}

	private static void check(java.util.Map<String, String> bad, String part, String problem)
	{
		if (problem != null)
		{
			bad.put(part, problem);
		}
	}

	/** A version other than 6: the snapshot was built for another protocol, we do not apply it. */
	String versionProblem()
	{
		return v == 6 ? null : "snapshot version 6 expected";
	}
}
