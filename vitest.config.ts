// Unit tests share loaded modules between files (much faster); a file that mocks modules or replaces globals runs isolated, found by its source.
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vite.config.ts';

const MOCKS = /vi\.(mock|doMock|stubGlobal|stubEnv)\(|(globalThis|window)\.\w+ *=[^=]|Object\.defineProperty\((globalThis|window)/;
const ISOLATED = ['tests', 'src'].flatMap((d) => readdirSync(d, { recursive: true }).map((f) => `${d}/${String(f).replace(/\\/g, '/')}`))
  .filter((f) => /\.test\.tsx?$/.test(f) && MOCKS.test(readFileSync(f, 'utf8')));

export default mergeConfig(base, defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'shared', include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'], exclude: ISOLATED, isolate: false } },
      { extends: true, test: { name: 'isolated', include: ISOLATED, isolate: true } },
      // Slow whole-route gates (npm run gate:f2p), not part of npm test.
      { extends: true, test: { name: 'gate', include: ['tests/gates/*.gate.ts'] } },
    ],
  },
}));
