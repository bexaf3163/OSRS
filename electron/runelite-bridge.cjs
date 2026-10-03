// Связь окна с плагином RuneLite «OSRS Path Bridge» (http://127.0.0.1:38282) через главный процесс.
// Окно не ходит на localhost само: так нет CORS, а выключенный RuneLite не сыплет ошибками в консоль.
// Только loopback и только адреса из списка — окно не может попросить главный процесс сходить куда-то ещё.
// Список сверяется с BRIDGE_PATHS приложения (tests/bridge.test.ts): новый адрес без него молча не работал бы в exe.

const http = require('node:http');

const HOST = '127.0.0.1';
// Порт можно подменить только для проверок (scripts/e2e-electron.ts): заглушка на свободном порту, а не живой плагин игрока.
const PORT = Number(process.env.OSRS_PUT_BRIDGE_PORT) || 38282;
const PATHS = new Set(['/status', '/active-step', '/clear', '/shopping-plan', '/nav-target', '/bank-tags', '/gear-hint', '/prep-plan', '/telemetry']);
const REQUEST_TIMEOUT_MS = 1500;
/** Плагин шлёт пинг каждые 15 секунд; тишина дольше — соединение мёртвое. */
const IDLE_TIMEOUT_MS = 45_000;
const MAX_BODY = 64 * 1024;

function request({ method, path, body }) {
  return new Promise((resolve) => {
    if ((method !== 'GET' && method !== 'POST') || !PATHS.has(path)) {
      resolve({ ok: false, status: 0 });
      return;
    }
    const data = body === undefined ? null : JSON.stringify(body);
    if (data && data.length > MAX_BODY) {
      resolve({ ok: false, status: 0 });
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
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
        if (text.length > MAX_BODY) req.destroy();
      });
      res.on('end', () => {
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

/** Разбор text/event-stream: события разделены пустой строкой, данные — в строках «data:». */
function sseParser(onData) {
  let buf = '';
  return (chunk) => {
    buf += chunk.replace(/\r\n?/g, '\n');
    let at;
    while ((at = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, at);
      buf = buf.slice(at + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
      if (data) onData(data);
    }
    if (buf.length > MAX_BODY) buf = '';
  };
}

/** Регистрирует обработчики ipc. Поток событий — один на окно; повторное открытие закрывает прежний. */
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
      res.on('data', sseParser((data) => send('bridge:event', data)));
      res.on('end', fail);
      res.on('error', fail);
    });
    state.req.setTimeout(IDLE_TIMEOUT_MS, () => state.req.destroy());
    state.req.on('error', fail);
    state.req.on('close', fail);
    streams.set(id, state);
    // Окно закрыли — поток за ним не держим. Подписка одна на окно, а не на каждое переподключение.
    if (!watched.has(id)) {
      watched.add(id);
      wc.once('destroyed', () => { watched.delete(id); closeStream(id); });
    }
  });

  ipcMain.on('bridge:events-close', (event) => closeStream(event.sender.id));
}

module.exports = { registerBridge, sseParser, PATHS };
