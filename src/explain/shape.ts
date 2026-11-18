import type { CronExpression, CronPart } from '../types.js';

/** A clock time to show, e.g. 09:30 or 09:30:15. */
export interface ClockTime {
  hour: number;
  minute: number;
  /** Present only when the expression has a seconds field that matters. */
  second?: number;
}

/**
 * The time-of-day part of an expression, pre-analysed so that locales only
 * have to put words around it.
 *
 * - `times`: a short list of exact clock times ("at 09:00 and 17:30").
 * - `hourly`: a fixed minute in a run of hours ("every 2 hours from 08:00
 *   through 18:00"). `every` is the hour step; `from`/`to` are set when the
 *   hours are a range rather than the whole day.
 * - `generic`: anything else. `second` is null when it does not need to be
 *   mentioned (5-field expressions, or a seconds field of exactly 0).
 */
export type TimeShape =
  | { kind: 'times'; times: ClockTime[] }
  | { kind: 'hourly'; minute: number; second?: number; every: number; from?: number; to?: number }
  | { kind: 'generic'; second: CronPart[] | null; minute: CronPart[]; hour: CronPart[] };

/** Maximum number of exact times listed before falling back to a pattern. */
export const MAX_LISTED_TIMES = 6;

export function isAny(parts: CronPart[]): boolean {
  return parts.length === 1 && parts[0]!.kind === 'any';
}

/** The number when the parts are exactly one plain value. */
export function singleValue(parts: CronPart[]): number | undefined {
  const [first] = parts;
  return parts.length === 1 && first?.kind === 'value' ? first.value : undefined;
}

/** The values when every part is a plain value. */
export function onlyValues(parts: CronPart[]): number[] | undefined {
  const values: number[] = [];
  for (const part of parts) {
    if (part.kind !== 'value') return undefined;
    values.push(part.value);
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

/** The single range part, if that is all there is. */
export function singleRange(parts: CronPart[]): Extract<CronPart, { kind: 'range' }> | undefined {
  const [first] = parts;
  return parts.length === 1 && first?.kind === 'range' ? first : undefined;
}

/** The last value a stepped range actually reaches: 8-18/4 reaches 16. */
export function lastInRange(part: Extract<CronPart, { kind: 'range' }>): number {
  return part.from + Math.floor((part.to - part.from) / part.step) * part.step;
}

export function timeShape(expr: CronExpression): TimeShape {
  const secValues = onlyValues(expr.second.parts);
  const secondMatters = expr.hasSeconds && !(secValues?.length === 1 && secValues[0] === 0);
  const second = secondMatters ? expr.second.parts : null;
  const minutes = onlyValues(expr.minute.parts);
  const hours = onlyValues(expr.hour.parts);

  if (secValues && minutes && hours && secValues.length * minutes.length * hours.length <= MAX_LISTED_TIMES) {
    const times: ClockTime[] = [];
    for (const hour of hours) {
      for (const minute of minutes) {
        for (const s of secValues) times.push(secondMatters ? { hour, minute, second: s } : { hour, minute });
      }
    }
    return { kind: 'times', times };
  }

  const minute = singleValue(expr.minute.parts);
  const fixedSecond = second === null ? undefined : singleValue(second);
  if (minute !== undefined && (second === null || fixedSecond !== undefined)) {
    const base = fixedSecond === undefined ? { minute } : { minute, second: fixedSecond };
    if (isAny(expr.hour.parts)) return { kind: 'hourly', ...base, every: 1 };
    const range = singleRange(expr.hour.parts);
    if (range?.wildcard) return { kind: 'hourly', ...base, every: range.step };
    if (range)
      return { kind: 'hourly', ...base, every: range.step, from: range.from, to: lastInRange(range) };
  }
  return { kind: 'generic', second, minute: expr.minute.parts, hour: expr.hour.parts };
}
