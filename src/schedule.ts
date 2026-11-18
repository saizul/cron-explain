import { CronError } from './errors.js';
import { daysInMonth } from './fields.js';
import { toExpression } from './parse.js';
import { assertTimeZone, localParts, offsetAt, systemTimeZone } from './timezone.js';
import type { CronExpression, CronField, ParseOptions } from './types.js';

export interface ScheduleOptions extends ParseOptions {
  /** How many run times to return. Default 5 (1 for `nextRun`/`previousRun`). */
  count?: number;
  /** Start point; runs are strictly after it (or before it, for previous runs). Default: now. */
  from?: Date | number | string;
  /** IANA time zone the expression is read in, e.g. "America/New_York". Default: the system zone. */
  tz?: string;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** How far to search before giving up: 28 years covers every weekday/leap-year combination. */
export const SEARCH_DAYS = 366 * 28;
const MAX_COUNT = 100_000;

function toInstant(from: ScheduleOptions['from']): number {
  if (from === undefined) return Date.now();
  const ms = from instanceof Date ? from.getTime() : typeof from === 'number' ? from : Date.parse(from);
  if (!Number.isFinite(ms))
    throw CronError.of('INVALID_OPTION', `"from" is not a valid date: ${String(from)}`);
  return ms;
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function nearestWeekday(year: number, month: number, day: number): number | undefined {
  const dim = daysInMonth(year, month);
  if (day > dim) return undefined;
  const wd = weekdayOf(year, month, day);
  if (wd === 6) return day === 1 ? 3 : day - 1;
  if (wd === 0) return day === dim ? day - 2 : day + 1;
  return day;
}

function lastWeekday(year: number, month: number): number {
  const dim = daysInMonth(year, month);
  const wd = weekdayOf(year, month, dim);
  return wd === 6 ? dim - 1 : wd === 0 ? dim - 2 : dim;
}

function domMatches(field: CronField, year: number, month: number, day: number): boolean {
  if (field.values.includes(day)) return true;
  for (const part of field.parts) {
    if (part.kind === 'lastDay' && day === daysInMonth(year, month)) return true;
    if (part.kind === 'lastWeekday' && day === lastWeekday(year, month)) return true;
    if (part.kind === 'nearestWeekday' && day === nearestWeekday(year, month, part.day)) return true;
  }
  return false;
}

function dowMatches(field: CronField, year: number, month: number, day: number, weekday: number): boolean {
  if (field.values.includes(weekday)) return true;
  for (const part of field.parts) {
    if (part.kind === 'lastOfMonth' && part.weekday === weekday && day + 7 > daysInMonth(year, month)) {
      return true;
    }
    if (part.kind === 'nth' && part.weekday === weekday && Math.ceil(day / 7) === part.nth) return true;
  }
  return false;
}

/**
 * Day matching with the classic cron rule: when both day-of-month and
 * day-of-week are restricted, a day matches if EITHER matches.
 */
export function dayMatches(expr: CronExpression, year: number, month: number, day: number): boolean {
  if (!expr.month.values.includes(month)) return false;
  const weekday = weekdayOf(year, month, day);
  const dom = expr.dayOfMonth;
  const dow = expr.dayOfWeek;
  if (dom.any && dow.any) return true;
  if (dom.any) return dowMatches(dow, year, month, day, weekday);
  if (dow.any) return domMatches(dom, year, month, day);
  return domMatches(dom, year, month, day) || dowMatches(dow, year, month, day, weekday);
}

interface Compiled {
  expr: CronExpression;
  seconds: number[];
  minutes: number[];
  hours: number[];
}

/**
 * Yields the run instants of one local day, in order. On days with a
 * daylight-saving change, local times that do not exist are moved forward
 * by the length of the gap, and repeated local times run once (twice when
 * the hour field is `*`).
 */
function* instantsOfDay(c: Compiled, dayStart: number, timeZone: string, dir: 1 | -1): Generator<number> {
  const lo = dayStart - 14 * HOUR;
  const hi = dayStart + DAY + 12 * HOUR;
  const offA = offsetAt(lo, timeZone);
  const offB = offsetAt(hi, timeZone);
  const order = (list: number[]) => (dir > 0 ? list : [...list].reverse());
  const hours = order(c.hours);
  const minutes = order(c.minutes);
  const seconds = order(c.seconds);

  if (offA === offB) {
    for (const h of hours) {
      for (const m of minutes) {
        for (const s of seconds) yield dayStart + h * HOUR + m * 60_000 + s * 1000 - offA;
      }
    }
    return;
  }

  // Find the first whole second that uses the new offset.
  let a = lo;
  let b = hi;
  while (b - a > 1000) {
    const mid = a + Math.max(1, Math.floor((b - a) / 2000)) * 1000;
    if (offsetAt(mid, timeZone) === offA) a = mid;
    else b = mid;
  }
  const change = b;
  const list: number[] = [];
  for (const h of c.hours) {
    for (const m of c.minutes) {
      for (const s of c.seconds) {
        const local = dayStart + h * HOUR + m * 60_000 + s * 1000;
        const before = local - offA;
        const after = local - offB;
        const beforeOk = before < change;
        const afterOk = after >= change;
        if (beforeOk && afterOk) {
          if (c.expr.hour.any) list.push(before, after);
          else list.push(Math.min(before, after));
        } else if (beforeOk) {
          list.push(before);
        } else if (afterOk) {
          list.push(after);
        } else {
          // The local time falls in a gap: run when the clock reaches it.
          list.push(before);
        }
      }
    }
  }
  const sorted = [...new Set(list)].sort((x, y) => x - y);
  yield* dir > 0 ? sorted : sorted.reverse();
}

function* runs(expr: CronExpression, from: number, timeZone: string, dir: 1 | -1): Generator<number> {
  const c: Compiled = {
    expr,
    seconds: expr.second.values,
    minutes: expr.minute.values,
    hours: expr.hour.values,
  };
  const start = localParts(from, timeZone);
  let dayStart = Date.UTC(start.year, start.month - 1, start.day) - dir * DAY;
  for (let i = 0; i <= SEARCH_DAYS; i++, dayStart += dir * DAY) {
    const d = new Date(dayStart);
    if (!dayMatches(expr, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())) continue;
    yield* instantsOfDay(c, dayStart, timeZone, dir);
  }
}

function collect(
  input: string | CronExpression,
  options: ScheduleOptions,
  dir: 1 | -1,
  defaultCount: number,
): Date[] {
  const expr = toExpression(input, options);
  if (expr.reboot) {
    throw CronError.of('NO_SCHEDULE', '@reboot runs when the system starts and has no clock schedule');
  }
  const count = options.count ?? defaultCount;
  if (!Number.isInteger(count) || count < 0 || count > MAX_COUNT) {
    throw CronError.of('INVALID_OPTION', `"count" must be a whole number from 0 to ${MAX_COUNT}`);
  }
  const timeZone = options.tz ?? systemTimeZone();
  assertTimeZone(timeZone);
  const from = toInstant(options.from);
  const out: Date[] = [];
  if (count === 0) return out;
  let last = from;
  for (const t of runs(expr, from, timeZone, dir)) {
    if (dir > 0 ? t > last : t < last) {
      out.push(new Date(t));
      last = t;
      if (out.length >= count) break;
    }
  }
  return out;
}

/** The next `count` run times (default 5), strictly after `from`. */
export function nextRuns(input: string | CronExpression, options: ScheduleOptions = {}): Date[] {
  return collect(input, options, 1, 5);
}

/** The previous `count` run times (default 5), strictly before `from`, newest first. */
export function previousRuns(input: string | CronExpression, options: ScheduleOptions = {}): Date[] {
  return collect(input, options, -1, 5);
}

/** The next run time, or null when there is none in the next 28 years. */
export function nextRun(
  input: string | CronExpression,
  options: Omit<ScheduleOptions, 'count'> = {},
): Date | null {
  return collect(input, { ...options, count: 1 }, 1, 1)[0] ?? null;
}

/** The previous run time, or null when there is none in the last 28 years. */
export function previousRun(
  input: string | CronExpression,
  options: Omit<ScheduleOptions, 'count'> = {},
): Date | null {
  return collect(input, { ...options, count: 1 }, -1, 1)[0] ?? null;
}

/** True when the expression matches the date (to the second) in the time zone. */
export function isMatch(
  input: string | CronExpression,
  date: Date | number | string,
  options: { tz?: string } & ParseOptions = {},
): boolean {
  const expr = toExpression(input, options);
  if (expr.reboot) return false;
  const timeZone = options.tz ?? systemTimeZone();
  assertTimeZone(timeZone);
  const p = localParts(toInstant(date), timeZone);
  return (
    dayMatches(expr, p.year, p.month, p.day) &&
    expr.hour.values.includes(p.hour) &&
    expr.minute.values.includes(p.minute) &&
    expr.second.values.includes(p.second)
  );
}
