// The link of the window with the RuneLite plugin "OSRS Path Bridge" (http://127.0.0.1:38282) through the main process.
// The window does not go to localhost itself: this way there is no CORS, and a turned-off RuneLite does not spray errors into the console.
// Only loopback and only the addresses from the list — the window cannot ask the main process to go anywhere else.
// The list is checked against the app's BRIDGE_PATHS (tests/bridge.test.ts): a new address without it would silently not work in the exe.

const http = require('node:http');

const HOST = '127.0.0.1';
// The port can be replaced only for checks (scripts/e2e-electron.ts): a stub on a free port, not the player's live plugin.
const PORT = Number(process.env.OSRS_PUT_BRIDGE_PORT) || 38282;
const PATHS = new Set(['/status', '/active-step', '/clear', '/shopping-plan', '/nav-target', '/bank-tags', '/gear-hint', '/prep-plan', '/telemetry']);
const REQUEST_TIMEOUT_MS = 1500;
/** The plugin sends a ping every 15 seconds; silence longer than that — the connection is dead. */
const IDLE_TIMEOUT_MS = 45_000;
const MAX_BODY = 64 * 1024;
// Protocol 6 combines several parts in /prep-plan. Keep this equal to BridgeServer.MAX_SNAPSHOT.
const MAX_SNAPSHOT = 384 * 1024;
// Status/events can include the whole known bank, unlike a small command body.
const MAX_RESPONSE = 384 * 1024;
const MAX_EVENT = 384 * 1024;

function request({ method, path, body }) {
  return new Promise((resolve) => {
    if ((method !== 'GET' && method !== 'POST') || !PATHS.has(path)) {
      resolve({ ok: false, status: 0 });
      return;
    }
    const data = body === undefined ? null : JSON.stringify(body);
    const limit = path === '/prep-plan' ? MAX_SNAPSHOT : MAX_BODY;
    if (data && Buffer.byteLength(data, 'utf8') > limit) {
      resolve({ ok: false, status: 413, data: { status: 'error', error: 'body too large', limitBytes: limit } });
      return;
    }
    const req = http.request({
      host: HOST,
      port: PORT,
      method,
      path,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'X-OSRS-Path': '1', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, (res) => {
      const chunks = [];
      let bytes = 0;
      let tooLarge = false;
      res.on('data', (chunk) => {
        if (tooLarge) return;
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE) {
          tooLarge = true;
          resolve({ ok: false, status: 413, data: { status: 'error', error: 'response too large', limitBytes: MAX_RESPONSE } });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (tooLarge) return;
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json });
      });
      res.on('error', () => resolve({ ok: false, status: 0 }));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ ok: false, status: 0 }));
    if (data) req.write(data);
    req.end();
  });
}

/** Parsing text/event-stream: the events are separated by an empty line, the data is in the "data:" lines. */
function sseParser(onData, onOverflow = () => {}) {
  let buf = '';
  let failed = false;
  let pendingCR = false;
  return (chunk) => {
    if (failed) return;
    // A CRLF separator may itself be split between network chunks.
    if (pendingCR && chunk.startsWith('\n')) chunk = chunk.slice(1);
    pendingCR = chunk.endsWith('\r');
    buf += chunk.replace(/\r\n?/g, '\n');
    let at;
    while ((at = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, at);
      if (Buffer.byteLength(block, 'utf8') > MAX_EVENT) {
        failed = true;
        buf = '';
        onOverflow();
        return;
      }
      buf = buf.slice(at + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
      if (data) onData(data);
    }
    if (Buffer.byteLength(buf, 'utf8') > MAX_EVENT) {
      failed = true;
      buf = '';
      onOverflow();
    }
  };
}

/** Registers the ipc handlers. The event stream is one per window; reopening closes the previous one. */
function registerBridge(ipcMain) {
  const streams = new Map();
  const watched = new Set();

  const closeStream = (id) => {
    const s = streams.get(id);
    if (!s) return;
    streams.delete(id);
    s.closed = true;
    s.req.destroy();
  };

  ipcMain.handle('bridge:request', (_event, args) => request(args ?? {}));

  ipcMain.on('bridge:events-open', (event) => {
    const wc = event.sender;
    const id = wc.id;
    closeStream(id);
    const state = { closed: false, req: null };
    const send = (channel, payload) => {
      if (!state.closed && !wc.isDestroyed()) wc.send(channel, payload);
    };
    const fail = () => {
      if (state.closed) return;
      send('bridge:events-state', 'closed');
      closeStream(id);
    };
    state.req = http.get({ host: HOST, port: PORT, path: '/events', headers: { Accept: 'text/event-stream', 'X-OSRS-Path': '1' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        fail();
        return;
      }
      send('bridge:events-state', 'open');
      res.setEncoding('utf8');
      res.on('data', sseParser((data) => send('bridge:event', data), fail));
      res.on('end', fail);
      res.on('error', fail);
    });
    state.req.setTimeout(IDLE_TIMEOUT_MS, () => state.req.destroy());
    state.req.on('error', fail);
    state.req.on('close', fail);
    streams.set(id, state);
    // The window was closed — we do not keep a stream for it. The subscription is one per window, not per reconnection.
    if (!watched.has(id)) {
      watched.add(id);
      wc.once('destroyed', () => { watched.delete(id); closeStream(id); });
    }
  });

  ipcMain.on('bridge:events-close', (event) => closeStream(event.sender.id));
}

module.exports = { registerBridge, request, sseParser, PATHS, MAX_BODY, MAX_SNAPSHOT, MAX_RESPONSE, MAX_EVENT };
