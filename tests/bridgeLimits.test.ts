import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { buildEnvelope, EMPTY_PARTS } from '../src/lib/prepEnvelope';
import { toInGameTarget } from '../src/services/runeliteBridge';

type Reply = { ok: boolean; status: number; data?: unknown };
type Bridge = {
  request: (args: { method: string; path: string; body?: unknown }) => Promise<Reply>;
  sseParser: (onData: (s: string) => void, onOverflow?: () => void) => (chunk: string) => void;
  MAX_BODY: number; MAX_SNAPSHOT: number; MAX_RESPONSE: number; MAX_EVENT: number;
};
const require = createRequire(import.meta.url);
let bridge: Bridge;
let server: Server;
let requests = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    requests++;
    if (req.url === '/status') {
      res.end(JSON.stringify({ status: 'ok', bank: '食'.repeat(30_000) }));
    } else if (req.url === '/telemetry') {
      res.end(JSON.stringify({ tooBig: '食'.repeat(150_000) }));
    } else {
      let bytes = 0;
      req.on('data', (chunk: Buffer) => { bytes += chunk.length; });
      req.on('end', () => res.end(JSON.stringify({ bytes })));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const oldPort = process.env.OSRS_PUT_BRIDGE_PORT;
  const path = require.resolve('../electron/runelite-bridge.cjs');
  delete require.cache[path];
  process.env.OSRS_PUT_BRIDGE_PORT = String(address.port);
  try { bridge = require(path) as Bridge; }
  finally {
    delete require.cache[path];
    if (oldPort === undefined) delete process.env.OSRS_PUT_BRIDGE_PORT;
    else process.env.OSRS_PUT_BRIDGE_PORT = oldPort;
  }
});
afterAll(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

function bodyOfBytes(bytes: number) {
  // Includes non-ASCII and a surrogate pair: JS string length is not the wire size.
  const body = { v: 6, seq: 1, padding: '食🙂' };
  body.padding += 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify(body)));
  return body;
}

describe('desktop bridge byte limits and plugin contract', () => {
  it('matches Java admission limits without increasing small-command limits', () => {
    const java = readFileSync(new URL('../runelite-bridge/src/main/java/com/osrspath/bridge/BridgeServer.java', import.meta.url), 'utf8');
    for (const name of ['MAX_BODY', 'MAX_SNAPSHOT'] as const) {
      const kib = Number(java.match(new RegExp(`int ${name} = (\\d+) \\* 1024`))?.[1]);
      expect(bridge[name]).toBe(kib * 1024);
    }
  });

  it('forwards snapshots above 64 KiB and exactly at 384 KiB, measured in UTF-8', async () => {
    for (const size of [bridge.MAX_BODY + 1, bridge.MAX_SNAPSHOT]) {
      const r = await bridge.request({ method: 'POST', path: '/prep-plan', body: bodyOfBytes(size) });
      expect(r).toMatchObject({ ok: true, status: 200, data: { bytes: size } });
    }
  });

  it('rejects one byte above each request limit as 413 without sending or reporting offline', async () => {
    const before = requests;
    for (const [path, limit] of [['/active-step', bridge.MAX_BODY], ['/prep-plan', bridge.MAX_SNAPSHOT]] as const) {
      const r = await bridge.request({ method: 'POST', path, body: bodyOfBytes(limit + 1) });
      expect(r).toMatchObject({ ok: false, status: 413, data: { error: 'body too large', limitBytes: limit } });
    }
    expect(requests).toBe(before);
    expect(await bridge.request({ method: 'POST', path: '/active-step', body: bodyOfBytes(bridge.MAX_BODY) })).toMatchObject({ ok: true });
  });

  it('forwards each real route target in a complete snapshot', async () => {
    for (const step of allSteps) {
      const body = buildEnvelope({ ...EMPTY_PARTS, step: toInGameTarget(step) }, 100);
      const r = await bridge.request({ method: 'POST', path: '/prep-plan', body });
      expect(r.ok, step.id).toBe(true);
      expect(r.data, step.id).toEqual({ bytes: Buffer.byteLength(JSON.stringify(body)) });
    }
  });

  it('reads a bank-sized response above 64 KiB and explicitly rejects an oversized response', async () => {
    expect(await bridge.request({ method: 'GET', path: '/status' })).toMatchObject({ ok: true, data: { status: 'ok' } });
    expect(await bridge.request({ method: 'GET', path: '/telemetry' })).toMatchObject({ ok: false, status: 413, data: { error: 'response too large' } });
  });
});

describe('bounded event frames', () => {
  it('preserves a large Unicode event split across chunks and CRLF boundaries', () => {
    const data = JSON.stringify({ type: 'OWNED', bank: '食🙂'.repeat(15_000) });
    const out: string[] = [];
    const feed = bridge.sseParser((s) => out.push(s));
    feed(`data: ${data.slice(0, 50_000)}`);
    feed(`${data.slice(50_000)}\r`);
    feed('\n\r');
    feed('\ndata: next\n\n');
    expect(out).toEqual([data, 'next']);
  });

  it('applies the same UTF-8 bound to complete and incomplete frames, with no tail delivered', () => {
    for (const complete of [true, false]) {
      const out: string[] = [];
      let errors = 0;
      const feed = bridge.sseParser((s) => out.push(s), () => errors++);
      const oversized = 'data: ' + '食'.repeat(Math.ceil(bridge.MAX_EVENT / 3));
      feed(oversized + (complete ? '\n\ndata: invalid-tail\n\n' : ''));
      feed('\n\ndata: invalid-tail\n\n');
      expect(out).toEqual([]);
      expect(errors).toBe(1);
    }
  });

  it('accepts a frame exactly at the byte limit', () => {
    const out: string[] = [];
    const feed = bridge.sseParser((s) => out.push(s));
    const data = 'x'.repeat(bridge.MAX_EVENT - Buffer.byteLength('data: '));
    feed(`data: ${data}\n\n`);
    expect(out).toEqual([data]);
  });
});
