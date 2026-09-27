import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  // Программа для ПК открывает сборку с диска (file://) — пути только относительные.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  // Большая часть сборки — база предметов (~190 досье с магазинами и дропом) и снаряжения. Программа
  // читает её с диска, поэтому дробить на куски смысла мало; порог — чтобы заметить неожиданный рост.
  build: { chunkSizeWarningLimit: 900 },
  // Собранные exe пишут данные рядом с собой (release/OSRS-Put-data): их файлы заняты, и наблюдатель
  // за изменениями падал с EBUSY, пока открыта переносная программа. Туда и в сборку плагина смотреть незачем.
  server: { watch: { ignored: ['**/release/**', '**/runelite-bridge/**'] } },
});
