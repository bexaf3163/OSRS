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
