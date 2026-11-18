import type { FieldName } from './types.js';

export interface FieldSpec {
  name: FieldName;
  /** Human-readable name used in messages. */
  label: string;
  min: number;
  max: number;
  names?: readonly string[];
  /** Offset of names[0], e.g. 1 for JAN = 1. */
  namesStart?: number;
}

export const MONTH_NAMES = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];
export const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const FIELDS: Record<FieldName, FieldSpec> = {
  second: { name: 'second', label: 'second', min: 0, max: 59 },
  minute: { name: 'minute', label: 'minute', min: 0, max: 59 },
  hour: { name: 'hour', label: 'hour', min: 0, max: 23 },
  dayOfMonth: { name: 'dayOfMonth', label: 'day-of-month', min: 1, max: 31 },
  month: { name: 'month', label: 'month', min: 1, max: 12, names: MONTH_NAMES, namesStart: 1 },
  dayOfWeek: { name: 'dayOfWeek', label: 'day-of-week', min: 0, max: 7, names: WEEKDAY_NAMES, namesStart: 0 },
};

export const FIELD_ORDER: FieldName[] = ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];

/** Expansions of the supported macros. `@reboot` is handled separately. */
export const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
