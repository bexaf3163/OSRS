import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/**
 * Content-Security-Policy in the built page: only own scripts (plus the hash of the small theme script in
 * index.html), the network — only the wiki, prices and the map. Inserted at build time: in development Vite itself adds
 * inline scripts and a web socket, and the meta tag would block them. The Electron window opens the page from disk
 * (file://), headers do not arrive there — hence a meta tag, not a header.
 */
function csp(): Plugin {
  const WIKI = 'https://oldschool.runescape.wiki';
  return {
    name: 'osrs-put-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // The browser reads CR and CRLF in the page as LF before it hashes the script, so we hash the same text:
        // a checkout with Windows line endings must not change the hash and block the script.
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64')}'`);
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
  // The desktop app opens the build from disk (file://) — only relative paths.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), csp()],
  // Most of the build is the item database (~190 dossiers with shops and drops) and gear. The app
  // reads it from disk, so splitting into chunks makes little sense; the limit is there to notice unexpected growth.
  build: { chunkSizeWarningLimit: 900 },
  // The built exe files write data next to themselves (release/OSRS-Put-data): their files are busy, and the watcher
  // fell with EBUSY while the portable app was open. There is no reason to watch there and in the plugin build.
  server: { watch: { ignored: ['**/release/**', '**/runelite-bridge/**'] } },
});
