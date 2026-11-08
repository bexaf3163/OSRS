import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseWorldRoutes, requestWorldRoutes } from './worldRoutes';
import type { RouteRequest } from './worldRoutes';

class FakeWorker {
  static created: FakeWorker[] = [];
  messages: RouteRequest[] = [];
  onmessage: ((event: { data: { id: number; result: null } }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  constructor() { FakeWorker.created.push(this); }
  postMessage(request: RouteRequest) { this.messages.push(request); }
  terminate() { this.terminated = true; }
  reply(id: number) { this.onmessage?.({ data: { id, result: null } }); }
}
const scope = { characterId: 'fixture', mode: 'f2p' as const, gameSessionId: 'login', snapshotRevision: 1 };
const from = { x: 3200, y: 3200, plane: 0 }, to = { x: 3210, y: 3210, plane: 0 };
beforeEach(() => { FakeWorker.created = []; vi.stubGlobal('Worker', FakeWorker); vi.useFakeTimers(); });
afterEach(() => { releaseWorldRoutes(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shared off-thread routing boundary', () => {
  it('coalesces bursts to one running and one newest search before posting to the worker', async () => {
    const jobs = Array.from({ length: 20 }, (_, i) => requestWorldRoutes({ ...scope, snapshotRevision: i + 1 }, from, [to]));
    const worker = FakeWorker.created[0];
    expect(FakeWorker.created).toHaveLength(1);
    expect(worker.messages).toHaveLength(1);
    worker.reply(worker.messages[0].id);
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1].scope.snapshotRevision).toBe(20);
    worker.reply(worker.messages[1].id);
    expect((await Promise.all(jobs)).every(job => job === null)).toBe(true);
  });
  it('keeps one waiting request per lane: live travel advice never cancels the planner, and the planner goes first', async () => {
    const running = requestWorldRoutes(scope, from, [to]);
    const planner = requestWorldRoutes({ ...scope, snapshotRevision: 2 }, from, [to]);
    const travel = requestWorldRoutes({ ...scope, snapshotRevision: 3 }, to, [from], 'travel');
    const worker = FakeWorker.created[0];
    worker.reply(worker.messages[0].id);
    expect(worker.messages[1].scope.snapshotRevision).toBe(2);
    worker.reply(worker.messages[1].id);
    expect(worker.messages[2].scope.snapshotRevision).toBe(3);
    worker.reply(worker.messages[2].id);
    await Promise.all([running, planner, travel]);
    expect(worker.messages).toHaveLength(3);
  });

  it('times out unavailable work and settles the queued caller instead of leaking jobs or inventing a route', async () => {
    const first = requestWorldRoutes(scope, from, [to]), next = requestWorldRoutes({ ...scope, snapshotRevision: 2 }, from, [to]);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await first).toBeNull();
    expect(await next).toBeNull();
    expect(FakeWorker.created[0].terminated).toBe(true);
  });
  it('ignores late failure callbacks from a retired worker after a new session starts', async () => {
    const old = requestWorldRoutes(scope, from, [to]), retired = FakeWorker.created[0];
    releaseWorldRoutes();
    expect(await old).toBeNull();
    const fresh = requestWorldRoutes({ ...scope, gameSessionId: 'new-login' }, from, [to]), current = FakeWorker.created[1];
    retired.onerror?.();
    retired.reply(retired.messages[0].id);
    expect(current.terminated).toBe(false);
    current.reply(current.messages[0].id);
    expect(await fresh).toBeNull();
  });
  it('captures queued request values instead of borrowing mutable caller objects', async () => {
    const first = requestWorldRoutes(scope, from, [to]);
    const owner = { ...scope }, origin = { ...from }, target = { ...to }, targets = [target];
    const latest = requestWorldRoutes(owner, origin, targets);
    owner.gameSessionId = 'mutated';
    origin.x = 1;
    target.x = 2;
    targets.push(from);
    const worker = FakeWorker.created[0];
    worker.reply(worker.messages[0].id);
    expect(worker.messages[1]).toMatchObject({ scope, from, targets: [to] });
    worker.reply(worker.messages[1].id);
    expect(await first).toBeNull();
    expect(await latest).toBeNull();
  });
});
