/** The six fields of a cron expression, in order. */
export type FieldName = 'second' | 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

/**
 * One comma-separated item of a field.
 *
 * - `any`: `*` or `?`
 * - `value`: a single number or name, e.g. `5` or `MON`
 * - `range`: `a-b`, `a-b/n`, `a/n` or `*\/n` (`wildcard` is true for `*\/n`)
 * - `lastDay`: `L` in day-of-month
 * - `lastWeekday`: `LW` in day-of-month
 * - `nearestWeekday`: `15W` in day-of-month
 * - `lastOfMonth`: `5L` in day-of-week (last Friday of the month)
 * - `nth`: `1#2` in day-of-week (second Monday of the month)
 */
export type CronPart =
  | { kind: 'any' }
  | { kind: 'value'; value: number }
  | { kind: 'range'; from: number; to: number; step: number; wildcard: boolean }
  | { kind: 'lastDay' }
  | { kind: 'lastWeekday' }
  | { kind: 'nearestWeekday'; day: number }
  | { kind: 'lastOfMonth'; weekday: number }
  | { kind: 'nth'; weekday: number; nth: number };

export interface CronField {
  name: FieldName;
  /** The text of the field as written. */
  source: string;
  parts: CronPart[];
  /**
   * Every plain value the field matches, sorted and de-duplicated. Special
   * parts (`L`, `W`, `#`) are not included. Day-of-week 7 is stored as 0.
   */
  values: number[];
  /** True when the field is exactly `*` or `?` (unrestricted). */
  any: boolean;
}

export interface CronExpression {
  /** The expression as given, trimmed. */
  source: string;
  /** The macro, such as `@daily`, when one was used. */
  macro?: string;
  /** True for `@reboot`, which has no clock schedule. */
  reboot: boolean;
  /** True when the expression has a leading seconds field. */
  hasSeconds: boolean;
  second: CronField;
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

export interface ParseOptions {
  /**
   * `optional` (default) accepts 5 or 6 fields, `required` accepts only 6
   * and `forbidden` accepts only 5.
   */
  seconds?: 'optional' | 'required' | 'forbidden';
}

export type ErrorCode =
  | 'EMPTY'
  | 'FIELD_COUNT'
  | 'UNKNOWN_MACRO'
  | 'INVALID_TOKEN'
  | 'OUT_OF_RANGE'
  | 'INVALID_RANGE'
  | 'INVALID_STEP'
  | 'UNKNOWN_NAME'
  | 'UNSUPPORTED'
  | 'INVALID_TIMEZONE'
  | 'INVALID_OPTION'
  | 'NO_SCHEDULE';

export interface CronIssue {
  code: ErrorCode;
  message: string;
  field?: FieldName;
  /** The part of the expression the issue is about. */
  token?: string;
}

export type WarningCode =
  | 'EVERY_SECOND'
  | 'EVERY_MINUTE'
  | 'EVERY_MINUTE_IN_HOUR'
  | 'DOM_DOW_OR'
  | 'STEP_OVERFLOW'
  | 'UNEVEN_STEP'
  | 'NEVER_RUNS'
  | 'SKIPS_SHORT_MONTHS'
  | 'DST_SENSITIVE';

export interface CronWarning {
  code: WarningCode;
  severity: 'warning' | 'info';
  message: string;
  field?: FieldName;
}
