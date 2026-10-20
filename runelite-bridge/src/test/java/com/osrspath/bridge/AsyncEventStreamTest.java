package com.osrspath.bridge;

import static org.junit.Assert.*;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class AsyncEventStreamTest
{
	@Test public void byteLimitRejectsOverflowWithoutClosingOnTheProducer()
	{
		BlockingQueue<Runnable> closing = new LinkedBlockingQueue<>();
		AtomicInteger closed = new AtomicInteger();
		AsyncEventStream stream = new AsyncEventStream(new ByteArrayOutputStream(), closed::incrementAndGet, closing::add);
		assertTrue(stream.offer(new byte[AsyncEventStream.MAX_BYTES]));
		assertEquals(AsyncEventStream.MAX_BYTES, stream.queuedBytes());
		assertFalse(stream.offer(new byte[1]));
		assertTrue(stream.isClosed());
		assertEquals(0, stream.queuedBytes());
		assertEquals(0, closed.get());
		closing.remove().run();
		assertEquals(1, closed.get());
	}

	@Test public void frameCountIsBoundedAndOversizedFramesAreRejected()
	{
		AsyncEventStream stream = new AsyncEventStream(new ByteArrayOutputStream(), () -> {}, ignored -> {});
		for (int i = 0; i < AsyncEventStream.MAX_FRAMES; i++) assertTrue(stream.offer(new byte[1]));
		assertFalse(stream.offer(new byte[1]));
		assertEquals(0, stream.queuedBytes());
		AsyncEventStream huge = new AsyncEventStream(new ByteArrayOutputStream(), () -> {}, ignored -> {});
		assertFalse(huge.offer(new byte[AsyncEventStream.MAX_BYTES + 1]));
	}

	@Test public void stalledWriteExpiresWithoutBlockingTheProducer() throws Exception
	{
		CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
		BlockingQueue<Runnable> closing = new LinkedBlockingQueue<>();
		OutputStream blocked = new OutputStream() {
			@Override public void write(int b) { throw new AssertionError("Use immutable frames"); }
			@Override public void write(byte[] b) throws java.io.IOException {
				entered.countDown();
				try { release.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new java.io.IOException(e); }
			}
		};
		AsyncEventStream stream = new AsyncEventStream(blocked, release::countDown, closing::add);
		ExecutorService writer = Executors.newSingleThreadExecutor();
		try
		{
			assertTrue(stream.offer(new byte[100]));
			Future<?> task = writer.submit(stream);
			assertTrue(entered.await(2, TimeUnit.SECONDS));
			assertTrue(stream.offer(new byte[100]));
			stream.expire(System.nanoTime() + TimeUnit.SECONDS.toNanos(11), TimeUnit.SECONDS.toNanos(10));
			assertTrue(stream.isClosed());
			assertEquals(0, stream.queuedBytes());
			assertEquals(1, release.getCount());
			closing.remove().run();
			task.get(2, TimeUnit.SECONDS);
		}
		finally { release.countDown(); writer.shutdownNow(); }
	}

	@Test public void framesIncludingCompletionKeepTheirOrder() throws Exception
	{
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		CountDownLatch written = new CountDownLatch(3);
		OutputStream output = new OutputStream() {
			@Override public void write(int b) { bytes.write(b); }
			@Override public void write(byte[] b) { bytes.write(b, 0, b.length); written.countDown(); }
		};
		AsyncEventStream stream = new AsyncEventStream(output, () -> {}, ignored -> {});
		ExecutorService writer = Executors.newSingleThreadExecutor();
		try
		{
			stream.offer("STATUS\n".getBytes(StandardCharsets.UTF_8));
			stream.offer("STEP_AUTO_COMPLETED\n".getBytes(StandardCharsets.UTF_8));
			stream.offer("GEAR\n".getBytes(StandardCharsets.UTF_8));
			Future<?> task = writer.submit(stream);
			assertTrue(written.await(2, TimeUnit.SECONDS));
			stream.closeAsync();
			task.get(2, TimeUnit.SECONDS);
			assertEquals("STATUS\nSTEP_AUTO_COMPLETED\nGEAR\n", bytes.toString(StandardCharsets.UTF_8));
		}
		finally { stream.closeAsync(); writer.shutdownNow(); }
	}
}
