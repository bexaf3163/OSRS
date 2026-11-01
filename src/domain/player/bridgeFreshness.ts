// A status request is older than events received while it was pending. Track each fact independently:
// new gear must not discard a still-useful quest-point reply, and a session boundary invalidates everything.
export interface StatusTicket { epoch: number; revisions: ReadonlyMap<string, number> }

export class BridgeFreshness {
  private epoch = 0;
  private revisions = new Map<string, number>();

  capture(): StatusTicket { return { epoch: this.epoch, revisions: new Map(this.revisions) }; }
  reset(): void { this.epoch++; this.revisions.clear(); }
  event(field: string): void { this.revisions.set(field, (this.revisions.get(field) ?? 0) + 1); }
  accepts(ticket: StatusTicket, field?: string): boolean {
    return ticket.epoch === this.epoch && (field === undefined || (ticket.revisions.get(field) ?? 0) === (this.revisions.get(field) ?? 0));
  }
  unchanged(ticket: StatusTicket): boolean {
    return this.accepts(ticket) && [...this.revisions].every(([field, rev]) => rev === (ticket.revisions.get(field) ?? 0));
  }
}
