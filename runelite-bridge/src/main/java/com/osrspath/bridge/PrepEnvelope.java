package com.osrspath.bridge;

import lombok.Data;

/**
 * Снимок состояния от программы — протокол 6, POST /prep-plan. Один запрос вместо пяти (/active-step, /shopping-plan,
 * /bank-tags, /gear-hint, план подготовки): плагин применяет всё за один проход клиентского потока, поэтому на экране
 * не бывает промежуточных состояний («стрелка к новому шагу, а список старого»), а после перезапуска RuneLite
 * достаточно один раз отправить снимок снова.
 *
 * Снимок полный: чего в нём нет (null), то снято. Номер seq растёт с каждым снимком — запоздавший, более старый
 * снимок плагин отбрасывает. Каждая часть проверяется отдельно: негодная не мешает остальным, ответ называет её.
 * Старые адреса остаются — для программы с протоколом 5 и ниже.
 */
@Data
public class PrepEnvelope
{
	static final String STEP = "step";
	static final String SHOPPING = "shopping";
	static final String BANK_TAGS = "bankTags";
	static final String GEAR_HINT = "gearHint";
	static final String PLAN = "plan";

	/** Версия снимка; 6. */
	private int v;
	private long seq;
	private ActiveTarget step;
	private ShoppingPlan shopping;
	private BankTags bankTags;
	private GearHint gearHint;
	private PrepPlan plan;

	/** Шаг как пришёл (JSON): если он не изменился, плагин не перезапускает цель и стрелку. Ставит сервер. */
	private transient String stepKey;

	/** Негодные части: имя → причина. Прошедшую проверку часть применять можно. */
	java.util.Map<String, String> prepare()
	{
		java.util.Map<String, String> bad = new java.util.LinkedHashMap<>();
		check(bad, STEP, step == null ? null : step.prepare());
		check(bad, SHOPPING, shopping == null ? null : shopping.prepare());
		check(bad, BANK_TAGS, bankTags == null ? null : bankTags.prepare());
		check(bad, GEAR_HINT, gearHint == null ? null : gearHint.prepare());
		check(bad, PLAN, plan == null ? null : plan.prepare());
		return bad;
	}

	private static void check(java.util.Map<String, String> bad, String part, String problem)
	{
		if (problem != null)
		{
			bad.put(part, problem);
		}
	}

	/** Версия не 6 — снимок собран по другому протоколу, не применяем. */
	String versionProblem()
	{
		return v == 6 ? null : "ожидается снимок версии 6";
	}
}
