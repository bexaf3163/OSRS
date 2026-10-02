import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/**
 * Content-Security-Policy в собранной странице: скрипты только свои (плюс хэш маленького скрипта темы в
 * index.html), сеть — только вики, цены и карта. Вставляется при сборке: в разработке Vite сам добавляет
 * встроенные скрипты и веб-сокет, и мета-тег их бы заблокировал. Окно Electron открывает страницу с диска
 * (file://), заголовки там не приходят — поэтому мета-тег, а не заголовок.
 */
function csp(): Plugin {
  const WIKI = 'https://oldschool.runescape.wiki';
  return {
    name: 'osrs-put-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
        const policy = [
          "default-src 'none'",
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          "style-src 'self' 'unsafe-inline'",
          `img-src 'self' data: blob: ${WIKI} https://maps.runescape.wiki https://prices.runescape.wiki`,
          `connect-src 'self' ${WIKI} https://prices.runescape.wiki https://maps.runescape.wiki`,
          "font-src 'self' data:",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
          "frame-src 'none'",
        ].join('; ');
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
  };
}

export default defineConfig({
  // Программа для ПК открывает сборку с диска (file://) — пути только относительные.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), csp()],
  // Большая часть сборки — база предметов (~190 досье с магазинами и дропом) и снаряжения. Программа
  // читает её с диска, поэтому дробить на куски смысла мало; порог — чтобы заметить неожиданный рост.
  build: { chunkSizeWarningLimit: 900 },
  // Собранные exe пишут данные рядом с собой (release/OSRS-Put-data): их файлы заняты, и наблюдатель
  // за изменениями падал с EBUSY, пока открыта переносная программа. Туда и в сборку плагина смотреть незачем.
  server: { watch: { ignored: ['**/release/**', '**/runelite-bridge/**'] } },
});
