package com.osrspath.bridge;

/**
 * What our overlays cost the client per frame, for the session log: the heartbeat writes the average and the worst frame since the previous
 * one next to the client's FPS. A measurement only; nothing is throttled by it.
 */
final class RenderCost
{
	private static long nanos;
	private static long worst;
	private static long frames;
	/** The frame being drawn: the guide card opens it, the other overlays add to it. */
	private static long frame;

	private RenderCost()
	{
	}

	/** One overlay's drawing time; the guide card's call also counts a frame. */
	static synchronized void add(long spent, boolean newFrame)
	{
		if (newFrame)
		{
			closeFrame();
			frames++;
		}
		frame += spent;
		nanos += spent;
	}

	private static void closeFrame()
	{
		worst = Math.max(worst, frame);
		frame = 0;
	}

	/** {average microseconds per frame, worst frame in microseconds, frames}, then start over. */
	static synchronized long[] take()
	{
		closeFrame();
		long[] out = {frames == 0 ? 0 : nanos / frames / 1000, worst / 1000, frames};
		nanos = 0;
		worst = 0;
		frames = 0;
		return out;
	}
}
