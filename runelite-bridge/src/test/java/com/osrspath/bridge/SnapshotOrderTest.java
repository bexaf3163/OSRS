package com.osrspath.bridge;

import static org.junit.Assert.*;
import org.junit.Test;

public class SnapshotOrderTest
{
	@Test public void reorderedCallbacksCannotApplyAnOlderSnapshot()
	{
		SnapshotOrder order = new SnapshotOrder();
		SnapshotOrder.Ticket first = order.accept(1);
		SnapshotOrder.Ticket second = order.accept(2);
		assertTrue(order.apply(second));
		assertFalse(order.apply(first));
		assertFalse(order.apply(second));
		assertNull(order.accept(1));
	}

	@Test public void aNewerPendingCompleteSnapshotSupersedesTheOlderCallback()
	{
		SnapshotOrder order = new SnapshotOrder();
		SnapshotOrder.Ticket first = order.accept(10);
		SnapshotOrder.Ticket second = order.accept(11);
		assertFalse(order.apply(first));
		assertTrue(order.apply(second));
	}

	@Test public void stoppedServerWorkCannotApplyAfterRestartEvenWithTheSameSequence()
	{
		SnapshotOrder order = new SnapshotOrder();
		SnapshotOrder.Ticket old = order.accept(50);
		order.reset();
		SnapshotOrder.Ticket fresh = order.accept(50);
		assertFalse(order.apply(old));
		assertTrue(order.apply(fresh));
		assertTrue(order.apply(order.accept(51)));
	}
}
