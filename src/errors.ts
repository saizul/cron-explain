import type { CronIssue, ErrorCode, FieldName } from './types.js';

/** Thrown for invalid expressions, unsupported syntax and bad options. */
export class CronError extends Error {
  readonly code: ErrorCode;
  readonly field?: FieldName;
  readonly token?: string;
  /** Every problem found, when more than one field is invalid. */
  readonly issues: CronIssue[];

  constructor(issues: CronIssue[]) {
    const first = issues[0] ?? { code: 'INVALID_TOKEN' as const, message: 'invalid cron expression' };
    const extra = issues.length > 1 ? ` (and ${issues.length - 1} more)` : '';
    super(`${first.message}${extra}`);
    this.name = 'CronError';
    this.code = first.code;
    if (first.field !== undefined) this.field = first.field;
    if (first.token !== undefined) this.token = first.token;
    this.issues = issues;
  }

  static of(code: ErrorCode, message: string, extra: { field?: FieldName; token?: string } = {}): CronError {
    return new CronError([{ code, message, ...extra }]);
  }
}
