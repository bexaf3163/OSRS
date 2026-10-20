package com.osrspath.bridge;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayDeque;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bounded immutable frames; the producer never writes, flushes or closes a socket. */
final class AsyncEventStream implements Runnable
{
	static final int MAX_FRAMES = 128;
	static final int MAX_BYTES = 384 * 1024;
	private final OutputStream out;
	private final Runnable closeTransport;
	private final Executor closer;
	private final ArrayDeque<byte[]> frames = new ArrayDeque<>();
	private final AtomicBoolean transportClosed = new AtomicBoolean();
	private int bytes;
	private boolean closed;
	private volatile long writingSince;

	AsyncEventStream(OutputStream out, Runnable closeTransport, Executor closer)
	{
		this.out = out;
		this.closeTransport = closeTransport;
		this.closer = closer;
	}

	boolean offer(byte[] frame)
	{
		synchronized (this)
		{
			if (closed) return false;
			if (frame.length <= MAX_BYTES && frames.size() < MAX_FRAMES && bytes + frame.length <= MAX_BYTES)
			{
				frames.addLast(frame);
				bytes += frame.length;
				notifyAll();
				return true;
			}
		}
		closeAsync();
		return false;
	}

	synchronized int queuedBytes() { return bytes; }
	synchronized boolean isClosed() { return closed; }

	void expire(long now, long timeoutNanos)
	{
		long since = writingSince;
		if (since != 0 && now - since >= timeoutNanos) closeAsync();
	}

	void closeAsync()
	{
		synchronized (this)
		{
			if (closed) return;
			closed = true;
			frames.clear();
			bytes = 0;
			notifyAll();
		}
		try { closer.execute(this::closeTransport); }
		catch (RejectedExecutionException ignored)
		{
			// Both pools are bounded. The writer's finally/server stop will close the transport;
			// never fall back to a blocking close on the game thread under saturation.
		}
	}

	private void closeTransport()
	{
		if (transportClosed.compareAndSet(false, true)) closeTransport.run();
	}

	@Override public void run()
	{
		try
		{
			for (;;)
			{
				byte[] frame;
				synchronized (this)
				{
					while (!closed && frames.isEmpty()) wait();
					if (closed) return;
					frame = frames.removeFirst();
					bytes -= frame.length;
				}
				writingSince = System.nanoTime();
				out.write(frame);
				out.flush();
				writingSince = 0;
			}
		}
		catch (IOException ignored) { /* Disconnected: the app reconnects and receives fresh state. */ }
		catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
		finally
		{
			closeAsync();
			closeTransport();
		}
	}
}
