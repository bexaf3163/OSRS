// Разбор журнала отладки плагина (osrs-path-telemetry/session-*.jsonl): по нему находят ошибки, не повторяя игру.
// Плагин пишет по строке JSON на событие (Telemetry.java); здесь — чтение, поиск странностей и сводка по шагам.
// Чистые функции без файлов и сети: читает файл scripts/analyze-telemetry.ts, а приложение берёт сводку моста
// (summarizeBridge) для отчёта диагностики.

export interface TelemetryEvent {
  t: number;
  kind: string;
  [key: string]: unknown;
}

export type Severity = 'bad' | 'warn' | 'info';

export interface Finding {
  severity: Severity;
  code: string;
  text: string;
  /** Метка времени события, к которому относится находка; null — ко всему сеансу. */
  at: number | null;
  step?: string;
}

export interface StepSummary {
  stepId: string;
  title: string;
  startedAt: number;
  durationMs: number;
  /** Вошли в этапов квеста. */
  stageEnters: number;
  /** Сколько раз курсор сдвинулся сам (не по клику). */
  autoMoves: number;
  /** Клики по виду: NEXT, BACK, PREV, RESUME, PLACE, TOGGLE. */
  clicks: Record<string, number>;
  /** Строки, которые игрок закрывал кнопкой «Сделано — дальше»: кандидаты на автоматическое определение. */
  manualLines: string[];
  anomalies: number;
}

export interface SessionInfo {
  plugin: string | null;
  protocol: number | null;
  java: string | null;
  os: string | null;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number;
  events: number;
  ended: boolean;
  truncated: boolean;
}

export interface SlowLine {
  stepId: string;
  cursor: number;
  size: number;
  line: string;
  durationMs: number;
}

export interface Shot {
  at: number;
  file: string;
  why: string;
}

export interface Report {
  session: SessionInfo;
  counts: Record<string, number>;
  steps: StepSummary[];
  slowLines: SlowLine[];
  shots: Shot[];
  findings: Finding[];
  /** Строки журнала, которые не удалось разобрать. */
  badLines: number;
}

/** Порог «слишком долго на одной строке, хотя игрок ходил», мс. */
export const SLOW_LINE_MS = 5 * 60_000;
/** Сколько клеток считается «ходил». */
export const WALKED_TILES = 10;
/** «Назад» столько раз на одном шаге — игрок, возможно, потерялся. */
export const BACK_CLICKS = 3;
/** Длиннее этого строка на экране уже не «коротко». */
export const MAX_UI_LINE = 90;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** JSONL → события. Битые строки (обрыв на записи) пропускаются и считаются, остальные читаются. */
export function parseLog(text: string): { events: TelemetryEvent[]; bad: number } {
  const events: TelemetryEvent[] = [];
  let bad = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const o = JSON.parse(line) as unknown;
      if (o && typeof o === 'object' && typeof (o as TelemetryEvent).t === 'number' && typeof (o as TelemetryEvent).kind === 'string') events.push(o as TelemetryEvent);
      else bad++;
    } catch {
      bad++;
    }
  }
  return { events, bad };
}

function pos(v: unknown): [number, number, number] | null {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number') ? [v[0] as number, v[1] as number, v[2] as number] : null;
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  return a[2] !== b[2] ? 1000 : Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} мин ${s % 60} с` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

/** Все правила поиска ошибок и странностей по журналу сеанса. */
export function analyze(events: TelemetryEvent[], badLines = 0): Report {
  const counts: Record<string, number> = {};
  const findings: Finding[] = [];
  const steps: StepSummary[] = [];
  const shots: Shot[] = [];
  const slowLines: SlowLine[] = [];
  const session: SessionInfo = { plugin: null, protocol: null, java: null, os: null, startedAt: null, endedAt: null, durationMs: 0, events: events.length, ended: false, truncated: false };
  const add = (f: Finding) => findings.push(f);

  let cur: StepSummary | null = null;
  let snapshots = 0;
  let stale = 0;
  // Строка, на которой сейчас курсор: с неё считается «сколько стоим» и что закрыл игрок кнопкой.
  let line: { stepId: string; cursor: number; size: number; text: string; since: number; start: [number, number, number] | null; farthest: number } | null = null;
  let lastClickAt = -Infinity;
  let emptyBeats = 0;

  const closeLine = (until: number) => {
    if (!line) return;
    const d = until - line.since;
    if (d >= 60_000) slowLines.push({ stepId: line.stepId, cursor: line.cursor, size: line.size, line: line.text, durationMs: d });
    if (d >= SLOW_LINE_MS && line.farthest >= WALKED_TILES) {
      add({
        severity: 'warn', code: 'SLOW_LINE', at: line.since, step: line.stepId,
        text: `Строка ${line.cursor}/${line.size} шага ${line.stepId} («${line.text}») держалась ${formatDuration(d)}, хотя игрок прошёл ~${line.farthest} клеток — курсор мог не заметить действие`,
      });
    }
    line = null;
  };

  for (const e of events) {
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    if (session.startedAt === null) session.startedAt = e.t;
    session.endedAt = e.t;
    const stepId = cur?.stepId;
    switch (e.kind) {
      case 'session':
        session.plugin = str(e.plugin);
        session.protocol = num(e.protocol);
        session.java = str(e.java);
        session.os = str(e.os);
        break;
      case 'end':
        session.ended = true;
        break;
      case 'truncated':
        session.truncated = true;
        add({ severity: 'warn', code: 'TRUNCATED', at: e.t, text: 'Журнал дошёл до предела размера и дальше не писался — конец сеанса не виден' });
        break;
      case 'step': {
        closeLine(e.t);
        if (cur) cur.durationMs = e.t - cur.startedAt;
        cur = { stepId: str(e.stepId) ?? '—', title: str(e.title) ?? '', startedAt: e.t, durationMs: 0, stageEnters: 0, autoMoves: 0, clicks: {}, manualLines: [], anomalies: 0 };
        steps.push(cur);
        break;
      }
      case 'snapshot':
        snapshots++;
        if (e.stale === true) stale++;
        if (e.rejected && typeof e.rejected === 'object') {
          for (const [part, why] of Object.entries(e.rejected as Record<string, unknown>)) {
            add({ severity: 'warn', code: 'SNAPSHOT_PART', at: e.t, text: `Часть снимка «${part}» не применена: ${String(why)}` });
          }
        }
        break;
      case 'stage': {
        const ev = str(e.event);
        if (ev === 'enter') {
          closeLine(e.t);
          if (cur) cur.stageEnters++;
        } else if (ev === 'cursor') {
          closeLine(e.t);
          const from = num(e.from);
          const to = num(e.to);
          const reason = str(e.reason) ?? '';
          const byClick = e.t - lastClickAt <= 2500;
          if (cur && !byClick) cur.autoMoves++;
          // Назад без клика «Назад» — возврат из-за предмета, который ещё не сдан; такое надо видеть, но это не ошибка.
          if (from !== null && to !== null && to < from && !byClick && !/^(CLAMP|BACK|RESET|RESUME)/.test(reason)) {
            add({ severity: 'warn', code: 'CURSOR_BACK', at: e.t, step: stepId, text: `Курсор вернулся с ${from} на ${to} без клика и без понятной причины («${reason || 'нет'}») на шаге ${stepId ?? '—'}` });
          }
          if (reason.startsWith('MANUAL') && from !== null && to !== null && to !== from + 1) {
            add({ severity: 'warn', code: 'NEXT_JUMP', at: e.t, step: stepId, text: `«Сделано — дальше» перепрыгнуло с ${from} на ${to}: пропущено ${to - from - 1} строк` });
          }
        } else {
          break;
        }
        line = {
          stepId: stepId ?? '—', cursor: num(e.cursor) ?? num(e.to) ?? 0, size: num(e.size) ?? 0, text: str(e.line) ?? '', since: e.t,
          start: pos(e.pos), farthest: 0,
        };
        break;
      }
      case 'beat': {
        const p = pos(e.pos);
        if (line && line.start && p) line.farthest = Math.max(line.farthest, dist(line.start, p));
        // Первый пульс после входа в шаг приходит раньше, чем плашки успели нарисоваться (так было в живом сеансе):
        // пусто считается только на втором пульсе подряд.
        if (e.hud === false && e.guide === false && str(e.step)) emptyBeats++;
        else emptyBeats = 0;
        if (emptyBeats === 2) {
          add({ severity: 'bad', code: 'BEAT_EMPTY', at: e.t, step: str(e.step) ?? undefined, text: `Шаг ${str(e.step)} выбран, а ни плашка, ни список не показаны (пульс сеанса)` });
        }
        break;
      }
      case 'click': {
        const kind = str(e.what) ?? '?';
        lastClickAt = e.t;
        if (cur) {
          cur.clicks[kind] = (cur.clicks[kind] ?? 0) + 1;
          if (kind === 'NEXT' && line) cur.manualLines.push(`${line.cursor}/${line.size} ${line.text}`);
        }
        break;
      }
      case 'ui': {
        const text = str(e.text) ?? '';
        for (const l of text.split('\n')) {
          if (l.length > MAX_UI_LINE) {
            add({ severity: 'warn', code: 'UI_LONG', at: e.t, step: stepId, text: `Длинная строка на экране (${l.length} знаков) — «${l.slice(0, 60)}…»` });
            break;
          }
        }
        if (/�|\?\?\?/.test(text)) add({ severity: 'bad', code: 'UI_GLYPH', at: e.t, step: stepId, text: `На экране битые знаки: «${text.slice(0, 80)}»` });
        break;
      }
      case 'anomaly':
        if (cur) cur.anomalies++;
        add({ severity: 'bad', code: str(e.code) ?? 'ANOMALY', at: e.t, step: str(e.step) ?? stepId, text: str(e.message) ?? 'странность без описания' });
        break;
      case 'shot':
        shots.push({ at: e.t, file: str(e.file) ?? '?', why: str(e.why) ?? '' });
        break;
      default:
        break;
    }
  }
  closeLine(session.endedAt ?? 0);
  if (cur) cur.durationMs = Math.max(0, (session.endedAt ?? cur.startedAt) - cur.startedAt);
  session.durationMs = session.startedAt === null || session.endedAt === null ? 0 : session.endedAt - session.startedAt;

  if (steps.length > 0 && snapshots === 0 && (session.protocol ?? 0) >= 6) {
    add({ severity: 'warn', code: 'NO_SNAPSHOT', at: null, text: 'Шаги были, а снимка от программы не пришло ни разу — план в игре не показывался (программа закрыта или старая)' });
  }
  if (stale >= 5) add({ severity: 'info', code: 'STALE_SNAPSHOTS', at: null, text: `Запоздавших снимков: ${stale} — программа шлёт их не по порядку` });
  for (const s of steps) {
    const back = (s.clicks.BACK ?? 0) + (s.clicks.PREV ?? 0);
    if (back >= BACK_CLICKS) add({ severity: 'warn', code: 'BACK_OFTEN', at: s.startedAt, step: s.stepId, text: `На шаге ${s.stepId} «Назад» нажато ${back} раз — игрок, возможно, терялся` });
    if (s.manualLines.length > 0) {
      add({ severity: 'info', code: 'MANUAL_LINES', at: s.startedAt, step: s.stepId, text: `Шаг ${s.stepId}: игрок закрыл вручную — ${s.manualLines.join('; ')}. Кандидаты на автоопределение (has/need)` });
    }
  }
  if (!session.ended && events.length > 0) {
    add({ severity: 'info', code: 'NOT_ENDED', at: null, text: 'Конец сеанса не записан: игра шла в момент чтения или RuneLite закрылся аварийно' });
  }
  if (badLines > 0) add({ severity: 'info', code: 'BAD_LINES', at: null, text: `Не разобрано строк журнала: ${badLines} (обрыв записи)` });

  slowLines.sort((a, b) => b.durationMs - a.durationMs);
  slowLines.length = Math.min(slowLines.length, 8);
  const order: Record<Severity, number> = { bad: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.at ?? 0) - (b.at ?? 0));
  return { session, counts, steps, slowLines, shots, findings, badLines };
}

const MARK: Record<Severity, string> = { bad: '✗', warn: '⚠', info: '·' };

/** Отчёт для чтения человеком: что за сеанс, что странного, где курсор стоял долго, какие скриншоты есть. */
export function formatReport(r: Report): string {
  const out: string[] = [];
  const s = r.session;
  out.push(`Сеанс: плагин ${s.plugin ?? '?'} (протокол ${s.protocol ?? '?'}), Java ${s.java ?? '?'}, ${s.os ?? '?'}`);
  out.push(`Длился ${formatDuration(s.durationMs)}, событий ${s.events}${s.ended ? '' : ' (конец не записан)'}${s.truncated ? ', журнал обрезан' : ''}`);
  const kinds = Object.entries(r.counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ');
  out.push(`События: ${kinds || '—'}`);
  const bad = r.findings.filter((f) => f.severity === 'bad').length;
  const warn = r.findings.filter((f) => f.severity === 'warn').length;
  out.push('');
  out.push(bad + warn === 0 ? 'Ошибок и странностей не найдено.' : `Найдено: ошибок ${bad}, предупреждений ${warn}.`);
  for (const f of r.findings) out.push(`  ${MARK[f.severity]} [${f.code}] ${f.text}`);
  if (r.steps.length > 0) {
    out.push('');
    out.push('Шаги:');
    for (const st of r.steps) {
      const clicks = Object.entries(st.clicks).map(([k, n]) => `${k}×${n}`).join(' ');
      out.push(`  ${st.stepId} ${st.title ? `«${st.title}» ` : ''}— ${formatDuration(st.durationMs)}, этапов ${st.stageEnters}, сам сдвинулся ${st.autoMoves}${clicks ? `, клики ${clicks}` : ''}${st.anomalies ? `, странностей ${st.anomalies}` : ''}`);
    }
  }
  if (r.slowLines.length > 0) {
    out.push('');
    out.push('Дольше всего на строке:');
    for (const l of r.slowLines) out.push(`  ${formatDuration(l.durationMs)} — ${l.stepId} ${l.cursor}/${l.size} «${l.line}»`);
  }
  if (r.shots.length > 0) {
    out.push('');
    out.push('Скриншоты (папка shots рядом с журналом):');
    for (const sh of r.shots) out.push(`  ${sh.file} — ${sh.why}`);
  }
  return out.join('\n');
}

// ---------- Сводка из моста (GET /telemetry) ----------

export interface BridgeTelemetry {
  enabled: boolean;
  /** Только имя файла: путь содержит имя пользователя Windows, в отчёт диагностики его не несём. */
  file: string | null;
  events: number;
  anomalies: number;
  truncated: boolean;
  lastShot: string | null;
  recentAnomalies: { code: string; message: string }[];
}

/** Ответ моста → проверенная сводка. Мусор и выключенный журнал → null / enabled:false. */
export function summarizeBridge(raw: unknown): BridgeTelemetry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.enabled !== true) return { enabled: false, file: null, events: 0, anomalies: 0, truncated: false, lastShot: null, recentAnomalies: [] };
  const file = typeof o.file === 'string' ? o.file.split(/[\\/]/).pop() ?? null : null;
  const rec = Array.isArray(o.recentAnomalies) ? o.recentAnomalies : [];
  return {
    enabled: true,
    file: file && file.length <= 80 ? file : null,
    events: num(o.events) ?? 0,
    anomalies: num(o.anomalies) ?? 0,
    truncated: o.truncated === true,
    lastShot: typeof o.lastShot === 'string' && o.lastShot.length <= 120 ? o.lastShot : null,
    recentAnomalies: rec
      .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
      .slice(-5)
      .map((a) => ({ code: String(a.code ?? '').slice(0, 30), message: String(a.message ?? '').slice(0, 300) })),
  };
}
