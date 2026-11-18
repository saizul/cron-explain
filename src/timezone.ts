import { CronError } from './errors.js';

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The time zone of the machine, e.g. "Asia/Dhaka". */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      throw CronError.of(
        'INVALID_TIMEZONE',
        `unknown time zone "${timeZone}"; use an IANA name like "Asia/Dhaka"`,
      );
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** Throws a CronError when the time zone is not known to Intl. */
export function assertTimeZone(timeZone: string): void {
  formatter(timeZone);
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday. */
  weekday: number;
}

/** The wall-clock date and time of an instant in a time zone. */
export function localParts(instant: number, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(new Date(instant));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    year,
    month,
    day,
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** UTC offset in milliseconds of a time zone at an instant (east is positive). */
export function offsetAt(instant: number, timeZone: string): number {
  const floored = Math.floor(instant / 1000) * 1000;
  const p = localParts(floored, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - floored;
}

/** "+06:00", "-04:00", "+05:45". */
export function formatOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? '-' : '+';
  const total = Math.round(Math.abs(offsetMs) / 60000);
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${sign}${h}:${m}`;
}

/**
 * Formats an instant as an ISO 8601 string in a time zone, with its offset:
 * `2026-03-08T03:30:00-04:00`.
 */
export function formatInTimeZone(date: Date | number, timeZone: string = systemTimeZone()): string {
  const instant = typeof date === 'number' ? date : date.getTime();
  const p = localParts(instant, timeZone);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const offset = offsetAt(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${formatOffset(offset)}`;
}

export interface Transition {
  /** The first instant with the new offset. */
  at: number;
  before: number;
  after: number;
}

/** The UTC offset changes of a time zone during a calendar year (UTC). */
export function transitions(timeZone: string, year: number): Transition[] {
  const out: Transition[] = [];
  const end = Date.UTC(year + 1, 0, 1);
  const step = 6 * 3_600_000;
  let t = Date.UTC(year, 0, 1);
  let off = offsetAt(t, timeZone);
  while (t < end) {
    const next = Math.min(t + step, end);
    const nextOff = offsetAt(next, timeZone);
    if (nextOff !== off) {
      let a = t;
      let b = next;
      while (b - a > 1000) {
        const mid = a + Math.max(1, Math.floor((b - a) / 2000)) * 1000;
        if (offsetAt(mid, timeZone) === off) a = mid;
        else b = mid;
      }
      out.push({ at: b, before: off, after: nextOff });
      off = nextOff;
    }
    t = next;
  }
  return out;
}

/**
 * The local hours (0-23) that are skipped or repeated by daylight-saving
 * changes in a year. Empty for zones without changes.
 */
export function shiftedHours(timeZone: string, year: number): number[] {
  const hours = new Set<number>();
  for (const tr of transitions(timeZone, year)) {
    const start = tr.at + Math.min(tr.before, tr.after);
    const end = tr.at + Math.max(tr.before, tr.after);
    for (let t = start; t < end; t += 60_000) hours.add(new Date(t).getUTCHours());
  }
  return [...hours].sort((a, b) => a - b);
}
