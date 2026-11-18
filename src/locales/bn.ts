import { type ClockTime, isAny, lastInRange, singleRange, type TimeShape } from '../explain/shape.js';
import type { CronPart } from '../types.js';
import type { Clauses, Locale } from './types.js';

// বাংলা (Bangla / Bengali). Times use the 24-hour clock and Bangla digits.
// Bangla puts the day before the time ("সোমবার থেকে শুক্রবার, ০৯:০০-এ"),
// so `sentence` orders the clauses month, day, time.

const WEEKDAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];
const NTH = ['', 'প্রথম', 'দ্বিতীয়', 'তৃতীয়', 'চতুর্থ', 'পঞ্চম'];
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** W in cron always means Monday to Friday, whatever the local weekend is. */
const WORKDAY = 'কর্মদিবসে (সোম–শুক্র)';

function digits(text: string): string {
  return text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]!);
}

const num = (n: number) => digits(String(n));
const pad = (n: number) => digits(String(n).padStart(2, '0'));

/** "ক", "ক ও খ", "ক, খ ও গ". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ও ${items[items.length - 1]}`;
}

function clock(t: ClockTime): string {
  const base = `${pad(t.hour)}:${pad(t.minute)}`;
  return t.second === undefined ? base : `${base}:${pad(t.second)}`;
}

function item(part: CronPart, name: (n: number) => string): string {
  switch (part.kind) {
    case 'value':
      return name(part.value);
    case 'range':
      if (part.step === 1) return `${name(part.from)} থেকে ${name(part.to)}`;
      return `${name(part.from)} থেকে ${name(part.to)} (প্রতি ${num(part.step)} অন্তর)`;
    default:
      return '';
  }
}

function secondPhrase(parts: CronPart[]): string {
  if (isAny(parts)) return 'প্রতি সেকেন্ডে';
  const range = singleRange(parts);
  if (range?.wildcard) return range.step === 1 ? 'প্রতি সেকেন্ডে' : `প্রতি ${num(range.step)} সেকেন্ড পরপর`;
  if (range && range.step > 1) {
    return `${num(range.from)} থেকে ${num(lastInRange(range))} সেকেন্ডের মধ্যে প্রতি ${num(range.step)} সেকেন্ড পরপর`;
  }
  return `${list(parts.map((p) => item(p, num)))} সেকেন্ডে`;
}

function minutePhrase(parts: CronPart[], hourAny: boolean): string {
  const range = singleRange(parts);
  if (range?.wildcard) return range.step === 1 ? 'প্রতি মিনিটে' : `প্রতি ${num(range.step)} মিনিট পরপর`;
  if (range && range.step > 1) {
    return `${num(range.from)} থেকে ${num(lastInRange(range))} মিনিটের মধ্যে প্রতি ${num(range.step)} মিনিট পরপর`;
  }
  if (range) return `${num(range.from)} থেকে ${num(range.to)} মিনিটের মধ্যে প্রতি মিনিটে`;
  const text = `${list(parts.map((p) => item(p, num)))} মিনিটে`;
  return hourAny ? `প্রতি ঘণ্টার ${text}` : text;
}

function hourPhrase(parts: CronPart[]): string {
  const range = singleRange(parts);
  if (range?.wildcard) return range.step === 1 ? '' : `প্রতি ${num(range.step)} ঘণ্টা অন্তর`;
  if (range && range.step === 1) return `${pad(range.from)}:০০ থেকে ${pad(range.to)}:৫৯-এর মধ্যে`;
  if (parts.length === 1 && parts[0]!.kind === 'value') {
    const h = parts[0]!.value;
    return `${pad(h)}:০০ থেকে ${pad(h)}:৫৯-এর মধ্যে`;
  }
  return `কেবল ${list(parts.map((p) => item(p, num)))} নম্বর ঘণ্টায়`;
}

function time(shape: TimeShape): string {
  if (shape.kind === 'times') return `${list(shape.times.map(clock))}-এ`;
  if (shape.kind === 'hourly') {
    const at = shape.second === undefined ? '' : `, ${num(shape.second)} সেকেন্ডে`;
    const minute = shape.minute === 0 ? '' : `, ${num(shape.minute)} মিনিটে`;
    if (shape.from !== undefined && shape.to !== undefined) {
      const span = `${pad(shape.from)}:${pad(shape.minute)} থেকে ${pad(shape.to)}:${pad(shape.minute)} পর্যন্ত`;
      const every = shape.every === 1 ? 'প্রতি ঘণ্টায়' : `প্রতি ${num(shape.every)} ঘণ্টা পরপর`;
      return `${span} ${every}${at}`;
    }
    if (shape.every === 1) {
      return shape.minute === 0 ? `প্রতি ঘণ্টায়${at}` : `প্রতি ঘণ্টার ${num(shape.minute)} মিনিটে${at}`;
    }
    return `প্রতি ${num(shape.every)} ঘণ্টা পরপর${minute}${at}`;
  }
  // Bangla reads best from the largest unit down: hour, minute, second.
  const segments: string[] = [];
  if (!isAny(shape.hour)) segments.push(hourPhrase(shape.hour));
  if (!isAny(shape.minute)) segments.push(minutePhrase(shape.minute, isAny(shape.hour)));
  else if (!shape.second) segments.push('প্রতি মিনিটে');
  if (shape.second) segments.push(secondPhrase(shape.second));
  return segments.filter(Boolean).join(', ');
}

function dayItem(part: CronPart): string {
  switch (part.kind) {
    case 'lastDay':
      return 'শেষ দিন';
    case 'lastWeekday':
      return 'শেষ কর্মদিবস';
    case 'nearestWeekday':
      return `${num(part.day)} তারিখের নিকটতম কর্মদিবস`;
    case 'value':
      return `${num(part.value)} তারিখ`;
    default:
      return `${item(part, num)} তারিখ`;
  }
}

function dayOfMonth(parts: CronPart[]): string {
  const [first] = parts;
  if (parts.length === 1 && first) {
    switch (first.kind) {
      case 'value':
        return `মাসের ${num(first.value)} তারিখে`;
      case 'range':
        if (first.step === 1) return `মাসের ${num(first.from)} থেকে ${num(first.to)} তারিখে`;
        if (first.wildcard) return `মাসের প্রতি ${num(first.step)} দিন অন্তর`;
        return `মাসের ${num(first.from)} থেকে ${num(lastInRange(first))} তারিখ পর্যন্ত প্রতি ${num(first.step)} দিন অন্তর`;
      case 'lastDay':
        return 'মাসের শেষ দিনে';
      case 'lastWeekday':
        return `মাসের শেষ ${WORKDAY}`;
      case 'nearestWeekday':
        return `মাসের ${num(first.day)} তারিখের নিকটতম ${WORKDAY}`;
      default:
        return '';
    }
  }
  if (parts.every((p) => p.kind === 'value' || p.kind === 'range')) {
    return `মাসের ${list(parts.map((p) => item(p, num)))} তারিখে`;
  }
  // Every item ends in a consonant (তারিখ, দিন, কর্মদিবস), which takes the ে ending.
  return `মাসের ${list(parts.map(dayItem))}ে`;
}

const weekday = (n: number) => WEEKDAYS[n % 7]!;
/** সোমবার → সোমবারে. Every weekday name ends in বার, which takes the ে ending. */
const onWeekday = (text: string) => (text.endsWith('বার') ? `${text}ে` : text);

function weekdayItem(part: CronPart): string {
  switch (part.kind) {
    case 'lastOfMonth':
      return `মাসের শেষ ${weekday(part.weekday)}`;
    case 'nth':
      return `মাসের ${NTH[part.nth]} ${weekday(part.weekday)}`;
    case 'range':
      if (part.wildcard) return `সপ্তাহের প্রতি ${num(part.step)} দিন অন্তর`;
      if (part.step === 1) return `${weekday(part.from)} থেকে ${weekday(part.to)}`;
      return `${weekday(part.from)} থেকে ${weekday(part.to)} পর্যন্ত প্রতি ${num(part.step)} দিন অন্তর`;
    default:
      return item(part, weekday);
  }
}

function dayOfWeek(parts: CronPart[]): string {
  const [first] = parts;
  if (parts.length === 1 && first?.kind === 'range' && first.step === 1) return weekdayItem(first);
  return onWeekday(list(parts.map(weekdayItem)));
}

const monthName = (n: number) => MONTHS[n - 1]!;

function month(parts: CronPart[]): string {
  const [first] = parts;
  if (parts.length === 1 && first?.kind === 'range') {
    if (first.step === 1) return `${monthName(first.from)} থেকে ${monthName(first.to)} মাসে`;
    if (first.wildcard) return `প্রতি ${num(first.step)} মাস অন্তর`;
    return `${monthName(first.from)} থেকে ${monthName(lastInRange(first))} পর্যন্ত প্রতি ${num(first.step)} মাস অন্তর`;
  }
  return `${list(parts.map((p) => item(p, monthName)))} মাসে`;
}

function sentence(c: Clauses): string {
  const parts: string[] = [];
  if (c.month) parts.push(c.month);
  if (c.dayOfMonth && c.dayOfWeek) parts.push(`${c.dayOfMonth} অথবা ${c.dayOfWeek}`);
  else if (c.dayOfMonth) parts.push(c.dayOfMonth);
  else if (c.dayOfWeek) parts.push(c.dayOfWeek);
  parts.push(c.everyDay ? `প্রতিদিন ${c.time}` : c.time);
  return parts.join(', ');
}

export const bn: Locale = {
  code: 'bn',
  name: 'বাংলা',
  digits,
  weekdays: WEEKDAYS,
  months: MONTHS,
  reboot: 'সিস্টেম চালু হওয়ার সময়',
  time,
  dayOfMonth,
  dayOfWeek,
  month,
  sentence,
  labels: {
    next: (n) => `পরবর্তী ${num(n)}টি রান`,
    previous: (n) => `আগের ${num(n)}টি রান`,
    warnings: 'সতর্কতা',
    timeZone: 'টাইম জোন',
    noRuns: 'আগামী ২৮ বছরে কোনো রানের সময় পাওয়া যায়নি।',
    reboot: '@reboot সিস্টেম চালু হওয়ার সময় একবার চলে; এর কোনো নির্দিষ্ট সময় নেই।',
  },
};
