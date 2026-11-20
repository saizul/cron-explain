/**
 * Reading crontab files: the job lines, their schedules and commands, and the
 * environment assignments between them.
 *
 * Supported layouts:
 * - user crontabs (`crontab -e`): five time fields (or an `@` macro) and a command;
 * - system crontabs (`/etc/crontab`, `/etc/cron.d/*`) with `system: true`: the
 *   time fields, a user name and the command.
 *
 * `CRON_TZ=Zone` (cronie, and Vixie cron derivatives that support it) sets the
 * time zone for the job lines that follow it.
 */

export interface CrontabJob {
  /** 1-based line number in the file. */
  line: number;
  /** The schedule: five fields or an `@` macro such as `@daily`. */
  expression: string;
  /** The user column of a system crontab. */
  user?: string;
  command: string;
  /** Time zone from the nearest `CRON_TZ=` line above, if any. */
  timeZone?: string;
}

export interface CrontabVariable {
  line: number;
  name: string;
  value: string;
}

export interface CrontabProblem {
  line: number;
  message: string;
}

export interface Crontab {
  jobs: CrontabJob[];
  variables: CrontabVariable[];
  problems: CrontabProblem[];
}

export interface CrontabOptions {
  /** System crontab layout with a user column after the schedule. */
  system?: boolean;
}

const VARIABLE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) return v.slice(1, -1);
  return v;
}

/** Splits `count` whitespace-separated tokens off the front of `text` and returns them with the rest. */
function take(text: string, count: number): [string[], string] {
  const tokens: string[] = [];
  let rest = text;
  for (let i = 0; i < count; i++) {
    const match = /^\s*(\S+)/.exec(rest);
    if (!match) break;
    tokens.push(match[1]!);
    rest = rest.slice(match[0].length);
  }
  return [tokens, rest.trim()];
}

/** Parses the text of a crontab file. Never throws: unreadable lines are returned as problems. */
export function parseCrontab(text: string, options: CrontabOptions = {}): Crontab {
  const result: Crontab = { jobs: [], variables: [], problems: [] };
  let timeZone: string | undefined;
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;

    const variable = VARIABLE.exec(trimmed);
    if (variable) {
      const value = unquote(variable[2]!);
      result.variables.push({ line, name: variable[1]!, value });
      if (variable[1] === 'CRON_TZ') timeZone = value === '' ? undefined : value;
      return;
    }

    const fieldCount = trimmed.startsWith('@') ? 1 : 5;
    const [fields, afterFields] = take(trimmed, fieldCount);
    if (fields.length < fieldCount) {
      result.problems.push({ line, message: `expected ${fieldCount} time fields and a command` });
      return;
    }
    let user: string | undefined;
    let command = afterFields;
    if (options.system) {
      const [userToken, rest] = take(afterFields, 1);
      user = userToken[0];
      command = rest;
      if (user === undefined) {
        result.problems.push({ line, message: 'missing user name and command (system crontab layout)' });
        return;
      }
    }
    if (command === '') {
      result.problems.push({ line, message: 'missing command after the schedule' });
      return;
    }
    const job: CrontabJob = { line, expression: fields.join(' '), command };
    if (user !== undefined) job.user = user;
    if (timeZone !== undefined) job.timeZone = timeZone;
    result.jobs.push(job);
  });
  return result;
}
