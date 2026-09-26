import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * Service worker без workbox: при сборке кладёт в dist/sw.js список всех файлов
 * и версию из их содержимого. Новая сборка → новая версия → старый кэш удаляется.
 */
function serviceWorker(): Plugin {
  return {
    name: 'osrs-put-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      const files = new Set<string>(['./']);
      for (const [name, item] of Object.entries(bundle)) {
        if (name.endsWith('.map')) continue;
        files.add(name);
        hash.update(name);
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const name of readdirSync('public')) {
        files.add(name);
        hash.update(name);
        hash.update(readFileSync(`public/${name}`));
      }
      const version = hash.digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, [...files].sort()) });
    },
  };
}

function swSource(version: string, files: string[]): string {
  return `// Создаётся при сборке (vite.config.ts). Не править руками.
const CACHE = 'osrs-put-${version}';
const FILES = ${JSON.stringify(files)};
const url = (f) => new URL(f, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map(url))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('osrs-put-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const index = await cache.match(url('./index.html'));
      if (index) return index;
    }
    return fetch(req);
  })());
});
`;
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), serviceWorker()],
  // Большая часть сборки — база предметов (~190 досье с магазинами и дропом). Она нужна офлайн и
  // кэшируется service worker целиком, поэтому дробить её на куски смысла нет.
  build: { chunkSizeWarningLimit: 900 },
});
