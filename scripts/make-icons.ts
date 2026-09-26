// Рисует иконки приложения (PNG для iPhone и манифеста, SVG для вкладки) без библиотек.
// Запуск: npm run icons. Результат лежит в public/ и хранится в репозитории.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x1c, 0x1a, 0x16];
const GOLD = [0xc9, 0x9a, 0x3e];
/** Тропа из трёх отрезков: путь вверх к цели. Координаты в долях стороны. */
const PATH: [number, number][] = [[0.25, 0.7], [0.42, 0.5], [0.56, 0.61], [0.75, 0.35]];
const STROKE = 0.075;
const START_DOT = 0.07;
const END_DOT = 0.1;

function distToSegment(px: number, py: number, [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function inside(x: number, y: number): boolean {
  for (let i = 0; i + 1 < PATH.length; i++) if (distToSegment(x, y, PATH[i], PATH[i + 1]) <= STROKE / 2) return true;
  const [sx, sy] = PATH[0];
  const [ex, ey] = PATH[PATH.length - 1];
  return Math.hypot(x - sx, y - sy) <= START_DOT || Math.hypot(x - ex, y - ey) <= END_DOT;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number): Buffer {
  const SS = 4; // сглаживание: 4×4 пробы на пиксель
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (inside((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - a) + GOLD[c] * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const pts = PATH.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');
const [sx, sy] = PATH[0];
const [ex, ey] = PATH[PATH.length - 1];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="${hex(BG)}"/>
<polyline points="${pts}" fill="none" stroke="${hex(GOLD)}" stroke-width="${STROKE * 100}" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${sx * 100}" cy="${sy * 100}" r="${START_DOT * 100}" fill="${hex(GOLD)}"/>
<circle cx="${ex * 100}" cy="${ey * 100}" r="${END_DOT * 100}" fill="${hex(GOLD)}"/>
</svg>
`;

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192));
writeFileSync(new URL('icon-512.png', out), png(512));
writeFileSync(new URL('apple-touch-icon.png', out), png(180));
writeFileSync(new URL('icon.svg', out), svg);
console.log('Иконки записаны в public/');
