package com.osrspath.bridge;

import java.util.Objects;

/** Presentation state only: selecting a tab opens it, selecting it again closes it. */
final class GuideDisclosure
{
	private String step;
	private boolean open;
	private boolean advice;

	void forStep(String key)
	{
		if (!Objects.equals(step, key))
		{
			step = key;
			open = false;
		}
	}

	void select(boolean selectedAdvice)
	{
		open = !open || advice != selectedAdvice;
		advice = selectedAdvice;
	}

	boolean isOpen()
	{
		return open;
	}
}
