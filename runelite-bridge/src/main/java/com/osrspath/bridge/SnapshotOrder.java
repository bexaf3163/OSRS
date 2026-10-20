package com.osrspath.bridge;

/** HTTP acceptance is not ClientThread application. Tickets bind queued work to this server lifetime. */
final class SnapshotOrder
{
	static final class Ticket
	{
		final long epoch;
		final long seq;
		Ticket(long epoch, long seq) { this.epoch = epoch; this.seq = seq; }
	}

	private long epoch;
	private long accepted = -1;
	private long applied = -1;

	synchronized Ticket accept(long seq)
	{
		if (seq <= accepted) return null;
		accepted = seq;
		return new Ticket(epoch, seq);
	}

	synchronized boolean apply(Ticket ticket)
	{
		if (ticket.epoch != epoch || ticket.seq != accepted || ticket.seq <= applied) return false;
		applied = ticket.seq;
		return true;
	}

	synchronized void reset()
	{
		epoch++;
		accepted = -1;
		applied = -1;
	}
}
