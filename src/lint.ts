import { CronError } from './errors.js';
import { FIELD_ORDER, FIELDS } from './fields.js';
import { check, toExpression } from './parse.js';
import { assertTimeZone, shiftedHours } from './timezone.js';
import type { CronExpression, CronIssue, CronWarning, FieldName, ParseOptions } from './types.js';

export interface LintOptions extends ParseOptions {
  /** When given, also warn about runs that daylight-saving changes can shift. */
  tz?: string;
}

const MONTH_LABELS = [
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
const UNITS: Record<FieldName, string> = {
  second: 'seconds',
  minute: 'minutes',
  hour: 'hours',
  dayOfMonth: 'days',
  month: 'months',
  dayOfWeek: 'days',
};
/** Longest length of each month (February in a leap year). */
const MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function stepWarnings(expr: CronExpression, out: CronWarning[]): void {
  const names: FieldName[] = expr.hasSeconds ? FIELD_ORDER : FIELD_ORDER.slice(1);
  for (const name of names) {
    const spec = FIELDS[name];
    const field = expr[name];
    for (const part of field.parts) {
      if (part.kind !== 'range' || part.step === 1) continue;
      const text = part.wildcard ? `*/${part.step}` : `${part.from}-${part.to}/${part.step}`;
      if (part.step > part.to - part.from) {
        out.push({
          code: 'STEP_OVERFLOW',
          severity: 'warning',
          field: name,
          message:
            `"${text}" in ${spec.label} only matches ${part.from}: the step is larger than the range, ` +
            `so it cannot mean "every ${part.step} ${UNITS[name]}". Steps restart at every ${parentOf(name)}.`,
        });
        continue;
      }
      if (part.wildcard && ['second', 'minute', 'hour', 'dayOfMonth'].includes(name)) {
        const span = part.to - part.from + 1;
        if (span % part.step !== 0) {
          const last = part.from + Math.floor((part.to - part.from) / part.step) * part.step;
          const gap = part.from + span - last;
          out.push({
            code: 'UNEVEN_STEP',
            severity: 'info',
            field: name,
            message:
              `"${text}" in ${spec.label} runs at ${part.from}, ${part.from + part.step}, ... ${last} and then ` +
              `${part.from} again, so the gap across each ${parentOf(name)} is ${gap} ${UNITS[name]}, not ${part.step}.`,
          });
        }
      }
    }
  }
}

function parentOf(name: FieldName): string {
  switch (name) {
    case 'second':
      return 'minute';
    case 'minute':
      return 'hour';
    case 'hour':
      return 'day';
    case 'dayOfMonth':
      return 'month';
    default:
      return 'year';
  }
}

function dayWarnings(expr: CronExpression, out: CronWarning[]): void {
  const dom = expr.dayOfMonth;
  const dow = expr.dayOfWeek;
  if (!dom.any && !dow.any) {
    out.push({
      code: 'DOM_DOW_OR',
      severity: 'warning',
      field: 'dayOfWeek',
      message:
        `day-of-month "${dom.source}" and day-of-week "${dow.source}" are both restricted, so the job runs ` +
        'on days that match EITHER of them (OR), not only days that match both.',
    });
    return;
  }
  if (dom.any || !dow.any) return;
  // Only day-of-month is restricted: check that the chosen days exist.
  const days = [...dom.values];
  for (const part of dom.parts) if (part.kind === 'nearestWeekday') days.push(part.day);
  const hasRelative = dom.parts.some((p) => p.kind === 'lastDay' || p.kind === 'lastWeekday');
  if (hasRelative || days.length === 0) return;
  const smallest = Math.min(...days);
  const months = expr.month.values;
  const missing = months.filter((m) => smallest > MAX_DAYS[m - 1]!);
  if (missing.length === months.length) {
    out.push({
      code: 'NEVER_RUNS',
      severity: 'warning',
      field: 'dayOfMonth',
      message: `the job never runs: no selected month has a day ${smallest}.`,
    });
  } else if (missing.length > 0 || (smallest >= 29 && months.includes(2))) {
    const short = months.filter((m) => smallest > (m === 2 ? 28 : MAX_DAYS[m - 1]!));
    out.push({
      code: 'SKIPS_SHORT_MONTHS',
      severity: 'info',
      field: 'dayOfMonth',
      message:
        `day ${smallest} does not exist in every month, so the job is skipped in ` +
        `${short.map((m) => MONTH_LABELS[m - 1]).join(', ')}${months.includes(2) && smallest === 29 ? ' (except in leap years)' : ''}. ` +
        'Use L for "the last day of the month".',
    });
  }
}

/**
 * Returns warnings about expressions that are valid but probably not what
 * was meant. The expression must be valid; use {@link validate} to get
 * errors and warnings together.
 */
export function lint(input: string | CronExpression, options: LintOptions = {}): CronWarning[] {
  const expr = toExpression(input, options);
  const out: CronWarning[] = [];
  if (expr.reboot) return out;
  const allDays = expr.dayOfMonth.any && expr.dayOfWeek.any && expr.month.any;

  if (expr.hasSeconds && expr.second.any && expr.minute.any && expr.hour.any && allDays) {
    out.push({
      code: 'EVERY_SECOND',
      severity: 'warning',
      field: 'second',
      message: 'the job runs every second (86,400 times a day). Is that intended?',
    });
  } else if (expr.minute.any && expr.hour.any && allDays && expr.second.values.length === 1) {
    out.push({
      code: 'EVERY_MINUTE',
      severity: 'warning',
      field: 'minute',
      message: 'the job runs every minute (1,440 times a day). Is that intended?',
    });
  }

  if (expr.minute.any && !expr.hour.any) {
    const h = expr.hour.values[0] ?? 0;
    const hh = String(h).padStart(2, '0');
    out.push({
      code: 'EVERY_MINUTE_IN_HOUR',
      severity: 'warning',
      field: 'minute',
      message:
        `minute is "*", so the job runs every minute of hour "${expr.hour.source}" ` +
        `(${expr.hour.values.length * 60} times a day), e.g. ${hh}:00 to ${hh}:59. ` +
        `To run once at the start of the hour, use 0 instead of * in the minute field.`,
    });
  }

  stepWarnings(expr, out);
  dayWarnings(expr, out);

  if (options.tz !== undefined) {
    assertTimeZone(options.tz);
    const year = new Date().getUTCFullYear();
    const shifted = shiftedHours(options.tz, year);
    const hit = expr.hour.any ? [] : expr.hour.values.filter((h) => shifted.includes(h));
    if (hit.length > 0) {
      const hours = hit.map((h) => `${String(h).padStart(2, '0')}:00-${String(h).padStart(2, '0')}:59`);
      out.push({
        code: 'DST_SENSITIVE',
        severity: 'info',
        field: 'hour',
        message:
          `in ${options.tz}, daylight-saving changes skip or repeat local time ${hours.join(', ')} on one or ` +
          'two days a year. A run in a skipped hour happens right after the gap; a run in a repeated hour ' +
          'happens once.',
      });
    }
  }
  return out;
}

export interface ValidationResult {
  valid: boolean;
  errors: CronIssue[];
  warnings: CronWarning[];
  /** The parsed expression when it is valid. */
  expression?: CronExpression;
}

/** Validates an expression without throwing: every error, plus warnings when it is valid. */
export function validate(expression: string, options: LintOptions = {}): ValidationResult {
  const result = check(expression, options);
  if (Array.isArray(result)) return { valid: false, errors: result, warnings: [] };
  try {
    return { valid: true, errors: [], warnings: lint(result, options), expression: result };
  } catch (err) {
    if (err instanceof CronError) return { valid: false, errors: err.issues, warnings: [] };
    throw err;
  }
}
