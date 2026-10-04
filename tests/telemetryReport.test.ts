import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyze, formatDuration, formatReport, parseLog, summarizeBridge, SLOW_LINE_MS,
  type TelemetryEvent,
} from '../src/lib/telemetryReport';
import { getTelemetry, BRIDGE_PATHS, type BridgeTransport } from '../src/services/runeliteBridge';

const T0 = 1_700_000_000_000;
const ev = (dt: number, kind: string, rest: Record<string, unknown> = {}): TelemetryEvent => ({ t: T0 + dt, ...rest, kind });
const jsonl = (events: TelemetryEvent[]) => events.map((e) => JSON.stringify(e)).join('\n') + '\n';

const header = [
  ev(0, 'session', { plugin: '2.23.0', protocol: 6, java: '17', os: 'Windows 11' }),
  ev(100, 'step', { stepId: 'S2-07', title: 'The Knight\'s Sword', stage: true }),
  ev(200, 'snapshot', { seq: 1, step: 'S2-07', plan: true, percent: 80 }),
  ev(300, 'stage', { event: 'enter', key: 'S2-07#3', stage: 3, of: 9, cursor: 1, size: 5, line: 'Возьми кирку', reason: 'POSITION', pos: [3000, 3000, 0] }),
];

describe('parseLog', () => {
  it('читает строки и считает битые (обрыв записи в конце не роняет разбор)', () => {
    const text = jsonl(header) + '{"t":1,"kind":"beat"\n[1,2]\n{"kind":"x"}\n';
    const r = parseLog(text);
    expect(r.events).toHaveLength(header.length);
    expect(r.bad).toBe(3);
  });

  it('пустой журнал — ни событий, ни ошибок', () => {
    expect(parseLog('')).toEqual({ events: [], bad: 0 });
    expect(analyze([]).findings).toEqual([]);
  });
});

describe('analyze: сеанс и шаги', () => {
  it('собирает сведения о сеансе, шагах и кликах', () => {
    const r = analyze([
      ...header,
      ev(5000, 'stage', { event: 'cursor', key: 'S2-07#3', from: 1, to: 2, size: 5, line: 'Добудь руду', reason: 'POSITION: дошёл', pos: [3001, 3000, 0] }),
      ev(9000, 'click', { what: 'NEXT', cursor: 2, step: 'S2-07' }),
      ev(9100, 'stage', { event: 'cursor', key: 'S2-07#3', from: 2, to: 3, size: 5, line: 'Отнеси', reason: 'MANUAL: «сделано» на шаге 2', pos: [3001, 3000, 0] }),
      ev(20000, 'end'),
    ]);
    expect(r.session).toMatchObject({ plugin: '2.23.0', protocol: 6, ended: true, durationMs: 20000, events: 8 });
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]).toMatchObject({ stepId: 'S2-07', stageEnters: 1, autoMoves: 1, clicks: { NEXT: 1 } });
    expect(r.steps[0].manualLines).toEqual(['2/5 Добудь руду']);
    // Закрытое вручную — не ошибка, а подсказка, что у строки нет автоопределения.
    expect(r.findings.filter((f) => f.severity !== 'info')).toEqual([]);
    expect(r.findings.find((f) => f.code === 'MANUAL_LINES')?.text).toContain('Добудь руду');
  });

  it('странности плагина попадают в отчёт как ошибки со своим кодом и шагом', () => {
    const r = analyze([...header, ev(180_000, 'anomaly', { code: 'STUCK', message: 'Шаг 2/5 не меняется', step: 'S2-07' }), ev(181_000, 'end')]);
    expect(r.findings[0]).toMatchObject({ severity: 'bad', code: 'STUCK', step: 'S2-07' });
    expect(r.steps[0].anomalies).toBe(1);
    expect(formatReport(r)).toContain('[STUCK]');
  });

  it('снимок с отклонённой частью — предупреждение с причиной; без снимков вообще — отдельное', () => {
    const r1 = analyze([...header.slice(0, 2), ev(200, 'snapshot', { seq: 2, rejected: { plan: 'выключено в настройках' } }), ev(300, 'end')]);
    expect(r1.findings.find((f) => f.code === 'SNAPSHOT_PART')?.text).toContain('выключено в настройках');
    const r2 = analyze([header[0], header[1], ev(300, 'end')]);
    expect(r2.findings.map((f) => f.code)).toContain('NO_SNAPSHOT');
    // Старый протокол снимков не знает — это не поломка.
    const old = analyze([ev(0, 'session', { protocol: 5 }), header[1], ev(300, 'end')]);
    expect(old.findings.map((f) => f.code)).not.toContain('NO_SNAPSHOT');
  });
});

describe('analyze: правила', () => {
  it('курсор назад без клика и без причины — предупреждение; CLAMP, BACK, RESET — нет', () => {
    const back = (reason: string, at: number) => ev(at, 'stage', { event: 'cursor', key: 'k', from: 3, to: 2, size: 5, line: 'x', reason });
    const bad = analyze([...header, back('какая-то', 10_000), ev(11_000, 'end')]);
    expect(bad.findings.map((f) => f.code)).toContain('CURSOR_BACK');
    for (const reason of ['CLAMP: Bronze bar ещё в сумке', 'BACK: просмотр шага 2', 'RESET', 'RESUME']) {
      const ok = analyze([...header, back(reason, 10_000), ev(11_000, 'end')]);
      expect(ok.findings.map((f) => f.code), reason).not.toContain('CURSOR_BACK');
    }
    // Клик за секунду до этого тоже объясняет сдвиг назад.
    const byClick = analyze([...header, ev(9_000, 'click', { what: 'BACK' }), back('что-то', 10_000), ev(11_000, 'end')]);
    expect(byClick.findings.map((f) => f.code)).not.toContain('CURSOR_BACK');
  });

  it('«Сделано — дальше» должно двигать ровно на одну строку', () => {
    const jump = analyze([...header, ev(9_000, 'click', { what: 'NEXT' }),
      ev(9_100, 'stage', { event: 'cursor', key: 'k', from: 1, to: 3, size: 5, line: 'x', reason: 'MANUAL: «сделано»' }), ev(10_000, 'end')]);
    expect(jump.findings.map((f) => f.code)).toContain('NEXT_JUMP');
    const one = analyze([...header, ev(9_000, 'click', { what: 'NEXT' }),
      ev(9_100, 'stage', { event: 'cursor', key: 'k', from: 1, to: 2, size: 5, line: 'x', reason: 'MANUAL: «сделано»' }), ev(10_000, 'end')]);
    expect(one.findings.map((f) => f.code)).not.toContain('NEXT_JUMP');
  });

  it('частые «Назад» — игрок терялся', () => {
    const clicks = [1, 2, 3].map((i) => ev(1000 * i, 'click', { what: 'BACK' }));
    const r = analyze([...header, ...clicks, ev(9000, 'end')]);
    expect(r.findings.find((f) => f.code === 'BACK_OFTEN')?.text).toContain('3 раз');
    expect(analyze([...header, clicks[0], ev(9000, 'end')]).findings.map((f) => f.code)).not.toContain('BACK_OFTEN');
  });

  it('долго на строке при ходьбе — предупреждение; на месте (AFK) — только в списке медленных', () => {
    const walking = analyze([
      ...header,
      ev(60_000, 'beat', { pos: [3010, 3005, 0], step: 'S2-07', hud: true, guide: true }),
      ev(SLOW_LINE_MS + 1000, 'end'),
    ]);
    expect(walking.findings.map((f) => f.code)).toContain('SLOW_LINE');
    expect(walking.slowLines[0]).toMatchObject({ stepId: 'S2-07', cursor: 1 });
    const still = analyze([
      ...header,
      ev(60_000, 'beat', { pos: [3000, 3000, 0], step: 'S2-07', hud: true, guide: true }),
      ev(SLOW_LINE_MS + 1000, 'end'),
    ]);
    expect(still.findings.map((f) => f.code)).not.toContain('SLOW_LINE');
    expect(still.slowLines).toHaveLength(1);
  });

  it('пульс с пустым экраном — ошибка; текст экрана с мусором и слишком длинные строки замечаются', () => {
    const r = analyze([
      ...header,
      ev(30_000, 'beat', { step: 'S2-07', hud: false, guide: false, pos: [3000, 3000, 0] }),
      ev(60_000, 'beat', { step: 'S2-07', hud: false, guide: false, pos: [3000, 3000, 0] }),
      ev(31_000, 'ui', { view: 'guide', text: 'Нормально\n' + 'x'.repeat(120) }),
      ev(32_000, 'ui', { view: 'hud', text: 'Копать ??? руду' }),
      ev(33_000, 'end'),
    ]);
    const codes = r.findings.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['BEAT_EMPTY', 'UI_LONG', 'UI_GLYPH']));
    expect(r.findings[0].severity).toBe('bad');
  });

  it('один пустой пульс сразу после входа в шаг — не ошибка (плашки ещё не нарисованы)', () => {
    const r = analyze([...header, ev(30_000, 'beat', { step: 'S2-07', hud: false, guide: false, pos: [3000, 3000, 0] }),
      ev(60_000, 'beat', { step: 'S2-07', hud: false, guide: true, pos: [3000, 3000, 0] }), ev(61_000, 'end')]);
    expect(r.findings.map((f) => f.code)).not.toContain('BEAT_EMPTY');
  });

  it('скриншоты перечисляются; обрезанный и неоконченный журнал отмечены', () => {
    const r = analyze([...header, ev(5000, 'shot', { file: 'shot-1.png', why: 'anomaly_STUCK' }), ev(6000, 'truncated', { reason: 'size' })]);
    expect(r.shots).toEqual([{ at: T0 + 5000, file: 'shot-1.png', why: 'anomaly_STUCK' }]);
    expect(r.session.truncated).toBe(true);
    expect(r.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['TRUNCATED', 'NOT_ENDED']));
    expect(formatReport(r)).toContain('shot-1.png');
  });

  it('находки идут по тяжести: сначала ошибки', () => {
    const r = analyze([...header, ev(1000, 'anomaly', { code: 'EMPTY', message: 'пусто' }), ev(2000, 'snapshot', { rejected: { gearHint: 'нет' } }), ev(3000, 'end')]);
    const order = r.findings.map((f) => f.severity);
    expect(order).toEqual([...order].sort((a, b) => ['bad', 'warn', 'info'].indexOf(a) - ['bad', 'warn', 'info'].indexOf(b)));
  });
});

describe('formatDuration / formatReport', () => {
  it('читаемые промежутки', () => {
    expect(formatDuration(0)).toBe('0 с');
    expect(formatDuration(59_000)).toBe('59 с');
    expect(formatDuration(125_000)).toBe('2 мин 5 с');
    expect(formatDuration(3_900_000)).toBe('1 ч 5 мин');
  });

  it('чистый сеанс — так и написано', () => {
    const r = analyze([...header, ev(9000, 'end')]);
    expect(formatReport(r)).toContain('Ошибок и странностей не найдено');
  });
});

describe('сводка моста', () => {
  it('выключенный журнал и мусор', () => {
    expect(summarizeBridge(undefined)).toBeNull();
    expect(summarizeBridge('x')).toBeNull();
    expect(summarizeBridge({ enabled: false })).toMatchObject({ enabled: false, events: 0 });
  });

  it('путь файла урезается до имени: в отчёт не попадает имя пользователя Windows', () => {
    const s = summarizeBridge({
      enabled: true, file: 'C:\\Users\\Mark\\.runelite\\osrs-path-telemetry\\session-1.jsonl', events: 12, anomalies: 1,
      lastShot: 'shot-1.png', recentAnomalies: [{ code: 'STUCK', message: 'm', t: 1 }, 7, null],
    });
    expect(s).toMatchObject({ enabled: true, file: 'session-1.jsonl', events: 12, anomalies: 1, lastShot: 'shot-1.png' });
    expect(JSON.stringify(s)).not.toContain('Mark');
    expect(s?.recentAnomalies).toEqual([{ code: 'STUCK', message: 'm' }]);
  });

  it('getTelemetry: ответ плагина читается, старый плагин (404) и офлайн — null', async () => {
    expect(BRIDGE_PATHS).toContain('/telemetry');
    const t = (res: { ok: boolean; status: number; data?: unknown }): BridgeTransport => ({
      request: async (method, path) => {
        expect(method).toBe('GET');
        expect(path).toBe('/telemetry');
        return res;
      },
      openEvents: () => () => undefined,
    });
    expect(await getTelemetry(t({ ok: true, status: 200, data: { enabled: true, events: 3, anomalies: 0 } }))).toMatchObject({ enabled: true, events: 3 });
    expect(await getTelemetry(t({ ok: false, status: 404 }))).toBeNull();
    expect(await getTelemetry(t({ ok: false, status: 0 }))).toBeNull();
  });
});

describe('образец журнала из плагина', () => {
  // Файл пишет Java-тест TelemetryTest (формат строк, кодировка, экранирование); здесь его читает разбор программы.
  const text = readFileSync(new URL('../runelite-bridge/src/test/resources/telemetry-session.jsonl', import.meta.url), 'utf8');

  it('читается целиком, ни одной битой строки', () => {
    const { events, bad } = parseLog(text);
    expect(bad).toBe(0);
    expect(events).toHaveLength(12);
    expect(events[1]).toMatchObject({ kind: 'step', title: "The Knight's Sword", goal: 'Mine the ore' });
    expect(events[8].text).toBe('S2-07 · Stage 3 of 9\n▶ Hand it in');
  });

  it('разбор находит то, что в образце заложено', () => {
    const { events, bad } = parseLog(text);
    const r = analyze(events, bad);
    expect(r.session).toMatchObject({ plugin: '2.23.0', protocol: 6, ended: true });
    expect(r.steps[0]).toMatchObject({ stepId: 'S2-07', stageEnters: 1, autoMoves: 1, clicks: { NEXT: 1 } });
    expect(r.steps[0].manualLines).toEqual(['2/5 Mine the ore']);
    expect(r.findings.map((f) => f.code)).toEqual(['STUCK', 'MANUAL_LINES']);
    expect(r.shots).toHaveLength(1);
    expect(formatReport(r)).toContain('Найдено: ошибок 1, предупреждений 0.');
  });
});
