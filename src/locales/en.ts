import { type ClockTime, isAny, lastInRange, singleRange, type TimeShape } from '../explain/shape.js';
import type { CronPart } from '../types.js';
import type { Clauses, Locale } from './types.js';

// English. This file is the reference for new locales: every function gets
// structured input (see src/explain/shape.ts and CronPart in src/types.ts)
// and returns a phrase. Shared logic such as "is this a single range?" lives
// in shape.ts, so a locale only decides on words and word order.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const NTH = ['', 'first', 'second', 'third', 'fourth', 'fifth'];

const pad = (n: number) => String(n).padStart(2, '0');

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function clock(t: ClockTime): string {
  const base = `${pad(t.hour)}:${pad(t.minute)}`;
  return t.second === undefined ? base : `${base}:${pad(t.second)}`;
}

/** Renders one list item with a value formatter: "5", "10 through 20", "every 5th from 0 through 30". */
function item(part: CronPart, name: (n: number) => string): string {
  switch (part.kind) {
    case 'value':
      return name(part.value);
    case 'range':
      if (part.step === 1) return `${name(part.from)} through ${name(part.to)}`;
      return `every ${ordinal(part.step)} from ${name(part.from)} through ${name(part.to)}`;
    default:
      return '';
  }
}

const plain = (n: number) => String(n);

function plural(parts: CronPart[], one: string, many: string): string {
  return parts.length === 1 && parts[0]!.kind === 'value' ? one : many;
}

function secondPhrase(parts: CronPart[]): string {
  if (isAny(parts)) return 'every second';
  const range = singleRange(parts);
  if (range?.wildcard) return range.step === 1 ? 'every second' : `every ${range.step} seconds`;
  if (range && range.step > 1) {
    return `every ${range.step} seconds from second ${range.from} through ${lastInRange(range)}`;
  }
  return `at ${plural(parts, 'second', 'seconds')} ${list(parts.map((p) => item(p, plain)))}`;
}

function minutePhrase(parts: CronPart[], hourAny: boolean): string {
  const range = singleRange(parts);
  if (range?.wildcard) return range.step === 1 ? 'every minute' : `every ${range.step} minutes`;
  if (range && range.step > 1) {
    return `every ${range.step} minutes from minute ${range.from} through ${lastInRange(range)}`;
  }
  if (range) return `every minute from minute ${range.from} through ${range.to}`;
  const text = `at ${plural(parts, 'minute', 'minutes')} ${list(parts.map((p) => item(p, plain)))}`;
  return hourAny ? `${text} of every hour` : text;
}

function hourPhrase(parts: CronPart[]): string {
  const range = singleRange(parts);
  if (range?.wildcard) return range.step === 1 ? '' : `during every ${ordinal(range.step)} hour`;
  if (range && range.step === 1) return `between ${pad(range.from)}:00 and ${pad(range.to)}:59`;
  if (parts.length === 1 && parts[0]!.kind === 'value') {
    const h = parts[0]!.value;
    return `between ${pad(h)}:00 and ${pad(h)}:59`;
  }
  return `during ${plural(parts, 'hour', 'hours')} ${list(parts.map((p) => item(p, plain)))}`;
}

function time(shape: TimeShape): string {
  if (shape.kind === 'times') return `at ${list(shape.times.map(clock))}`;
  if (shape.kind === 'hourly') {
    const at = shape.second === undefined ? '' : `, at second ${shape.second}`;
    const minute = shape.minute === 0 ? '' : `, at minute ${shape.minute}`;
    if (shape.from !== undefined && shape.to !== undefined) {
      const span = `from ${pad(shape.from)}:${pad(shape.minute)} through ${pad(shape.to)}:${pad(shape.minute)}`;
      const every = shape.every === 1 ? 'every hour' : `every ${shape.every} hours`;
      return `${every} ${span}${at}`;
    }
    if (shape.every === 1) {
      return shape.minute === 0 ? `every hour${at}` : `at minute ${shape.minute} of every hour${at}`;
    }
    return `every ${shape.every} hours${minute}${at}`;
  }
  const segments: string[] = [];
  if (shape.second) segments.push(secondPhrase(shape.second));
  if (!isAny(shape.minute)) segments.push(minutePhrase(shape.minute, isAny(shape.hour)));
  else if (!shape.second) segments.push('every minute');
  if (!isAny(shape.hour)) segments.push(hourPhrase(shape.hour));
  return segments.filter(Boolean).join(', ');
}

function dayItem(part: CronPart): string {
  switch (part.kind) {
    case 'lastDay':
      return 'the last day';
    case 'lastWeekday':
      return 'the last weekday';
    case 'nearestWeekday':
      return `the weekday nearest day ${part.day}`;
    case 'value':
      return `day ${part.value}`;
    case 'range':
      return `days ${item(part, plain)}`;
    default:
      return '';
  }
}

function dayOfMonth(parts: CronPart[]): string {
  const [first] = parts;
  if (parts.length === 1 && first) {
    if (first.kind === 'value') return `on day ${first.value} of the month`;
    if (first.kind === 'range' && first.step === 1) {
      return `on days ${first.from} through ${first.to} of the month`;
    }
    if (first.kind === 'range' && first.wildcard) return `on every ${ordinal(first.step)} day of the month`;
    if (first.kind === 'range') {
      return `on every ${ordinal(first.step)} day of the month from day ${first.from} through ${lastInRange(first)}`;
    }
    return `on ${dayItem(first)} of the month`;
  }
  if (parts.every((p) => p.kind === 'value' || p.kind === 'range')) {
    return `on days ${list(parts.map((p) => item(p, plain)))} of the month`;
  }
  return `on ${list(parts.map(dayItem))} of the month`;
}

const weekday = (n: number) => WEEKDAYS[n % 7]!;

function weekdayItem(part: CronPart): string {
  switch (part.kind) {
    case 'lastOfMonth':
      return `the last ${weekday(part.weekday)} of the month`;
    case 'nth':
      return `the ${NTH[part.nth]} ${weekday(part.weekday)} of the month`;
    case 'range':
      if (part.wildcard) return `every ${ordinal(part.step)} day of the week`;
      if (part.step === 1) return `${weekday(part.from)} through ${weekday(part.to)}`;
      return `every ${ordinal(part.step)} day of the week from ${weekday(part.from)} through ${weekday(part.to)}`;
    default:
      return item(part, weekday);
  }
}

function dayOfWeek(parts: CronPart[]): string {
  const [first] = parts;
  if (parts.length === 1 && first?.kind === 'range' && first.step === 1) return weekdayItem(first);
  return `on ${list(parts.map(weekdayItem))}`;
}

const monthName = (n: number) => MONTHS[n - 1]!;

function month(parts: CronPart[]): string {
  const [first] = parts;
  if (parts.length === 1 && first?.kind === 'range') {
    if (first.step === 1) return `${monthName(first.from)} through ${monthName(first.to)}`;
    if (first.wildcard) return `every ${first.step} months`;
    return `every ${first.step} months from ${monthName(first.from)} through ${monthName(lastInRange(first))}`;
  }
  return `in ${list(parts.map((p) => item(p, monthName)))}`;
}

function sentence(c: Clauses): string {
  const parts = [c.time];
  if (c.everyDay) parts.push('every day');
  if (c.dayOfMonth && c.dayOfWeek) parts.push(`${c.dayOfMonth} or ${c.dayOfWeek}`);
  else if (c.dayOfMonth) parts.push(c.dayOfMonth);
  else if (c.dayOfWeek) parts.push(c.dayOfWeek);
  if (c.month) parts.push(c.month);
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const en: Locale = {
  code: 'en',
  name: 'English',
  digits: (text) => text,
  weekdays: WEEKDAYS,
  months: MONTHS,
  reboot: 'At system startup',
  time,
  dayOfMonth,
  dayOfWeek,
  month,
  sentence,
  labels: {
    next: (n) => (n === 1 ? 'Next run' : `Next ${n} runs`),
    previous: (n) => (n === 1 ? 'Previous run' : `Previous ${n} runs`),
    warnings: 'Warnings',
    timeZone: 'Time zone',
    noRuns: 'No run times found in the next 28 years.',
    reboot: '@reboot runs once when the system starts; it has no clock times.',
  },
};
