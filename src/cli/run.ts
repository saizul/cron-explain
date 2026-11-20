import { parseCrontab } from '../crontab.js';
import { CronError } from '../errors.js';
import { explain } from '../explain/index.js';
import { validate } from '../lint.js';
import { getLocale, localeCodes } from '../locales/index.js';
import type { Locale } from '../locales/types.js';
import { normalize } from '../parse.js';
import { nextRuns, previousRuns } from '../schedule.js';
import { assertTimeZone, formatInTimeZone, localParts, systemTimeZone } from '../timezone.js';
import { VERSION } from '../version.js';

export interface CliIO {
  stdout(text: string): void;
  stderr(text: string): void;
  /** Current time in milliseconds; injectable for tests. */
  now?: () => number;
  /** Reads a file for --file ("-" is standard input); injectable for tests. */
  readFile?: (path: string) => string;
}

const HELP = `Usage: cron-explain <expression> [options]
       cron-explain --file <crontab> [options]

Explain a cron expression in plain language, check it for common mistakes
and list its next run times.

Options:
  -n, --next <N>       show the next N run times (default 5; 0 to hide)
  -p, --prev <N>       show the previous N run times
  -z, --tz <zone>      IANA time zone, e.g. Asia/Dhaka (default: system zone)
  -l, --locale <code>  language of the description: ${'{LOCALES}'} (default en)
  -f, --from <date>    count runs from this ISO date instead of now
      --seconds <mode> optional (default), required or forbidden
      --file <path>    explain every job in a crontab file ("-" for stdin);
                       shows 1 next run per job unless --next is given
      --system         the file has a user column (/etc/crontab, /etc/cron.d)
      --json           print JSON instead of text
      --strict         exit with code 1 when there are warnings
  -h, --help           show this help
  -v, --version        show the version

Examples:
  cron-explain "*/15 9-17 * * 1-5" --next 5 --tz Asia/Dhaka --locale bn
  cron-explain "0 2 * * *" --tz America/New_York --from 2026-03-07
  cron-explain @weekly --json
  crontab -l | cron-explain --file - --tz Asia/Dhaka

Exit codes: 0 valid, 1 invalid expression or crontab line (or warnings with --strict),
2 usage error.
`;

interface Args {
  expression: string;
  next: number;
  prev: number;
  tz?: string;
  locale: string;
  from?: string;
  seconds?: 'optional' | 'required' | 'forbidden';
  json: boolean;
  strict: boolean;
  file?: string;
  system: boolean;
  nextGiven: boolean;
}

class UsageError extends Error {}

/** Replaces control characters from user input so they cannot drive the terminal. */
function clean(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '?');
}

const VALUE_OPTIONS: Record<string, string> = {
  '-n': 'next',
  '--next': 'next',
  '-p': 'prev',
  '--prev': 'prev',
  '-z': 'tz',
  '--tz': 'tz',
  '-l': 'locale',
  '--locale': 'locale',
  '-f': 'from',
  '--from': 'from',
  '--seconds': 'seconds',
  '--file': 'file',
};

function count(name: string, value: string): number {
  if (!/^\d+$/.test(value) || Number(value) > 1000) {
    throw new UsageError(`--${name} expects a whole number from 0 to 1000, got "${value}"`);
  }
  return Number(value);
}

function parseArgs(argv: string[]): Args | 'help' | 'version' {
  const positional: string[] = [];
  const args: Args = {
    expression: '',
    next: 5,
    prev: 0,
    locale: 'en',
    json: false,
    strict: false,
    system: false,
    nextGiven: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') return 'help';
    if (arg === '-v' || arg === '--version') return 'version';
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    if (arg === '--strict') {
      args.strict = true;
      continue;
    }
    if (arg === '--system') {
      args.system = true;
      continue;
    }
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    const eq = arg.indexOf('=');
    const flag = arg.startsWith('--') && eq > 0 ? arg.slice(0, eq) : arg;
    const key = VALUE_OPTIONS[flag];
    if (key) {
      const value = flag !== arg ? arg.slice(eq + 1) : argv[++i];
      if (value === undefined) throw new UsageError(`${flag} needs a value`);
      if (key === 'next') {
        args.next = count('next', value);
        args.nextGiven = true;
      } else if (key === 'file') args.file = value;
      else if (key === 'prev') args.prev = count('prev', value);
      else if (key === 'tz') args.tz = value;
      else if (key === 'locale') args.locale = value;
      else if (key === 'from') args.from = value;
      else if (value === 'optional' || value === 'required' || value === 'forbidden') args.seconds = value;
      else throw new UsageError(`--seconds expects optional, required or forbidden, got "${value}"`);
      continue;
    }
    // A lone "-" or an option-like token that is not a known flag. Cron
    // fields never start with "-", so this is a typo.
    if (arg.startsWith('-')) throw new UsageError(`unknown option "${arg}"`);
    positional.push(arg);
  }
  // Allow `cron-explain 0 9 '*' '*' 1-5` as well as one quoted argument.
  args.expression = positional.join(' ');
  if (args.file !== undefined) {
    if (args.expression.trim() !== '') throw new UsageError('give either an expression or --file, not both');
    if (!args.nextGiven) args.next = 1;
    return args;
  }
  if (args.system) throw new UsageError('--system only applies to --file');
  if (args.expression.trim() === '') throw new UsageError('missing cron expression');
  return args;
}

function formatRun(date: Date, timeZone: string, locale: Locale): string {
  const iso = formatInTimeZone(date, timeZone);
  const p = localParts(date.getTime(), timeZone);
  const text = `${iso.slice(0, 10)} ${iso.slice(11, 19)} ${iso.slice(19)}`;
  return `${locale.digits(text)}  ${locale.weekdays[p.weekday]}`;
}

export function run(argv: string[], io: CliIO): number {
  let args: Args | 'help' | 'version';
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    io.stderr(`cron-explain: ${clean(err.message)}\nRun "cron-explain --help" for usage.\n`);
    return 2;
  }
  if (args === 'help') {
    io.stdout(HELP.replace('{LOCALES}', localeCodes().join(', ')));
    return 0;
  }
  if (args === 'version') {
    io.stdout(`${VERSION}\n`);
    return 0;
  }

  let locale: Locale;
  const timeZone = args.tz ?? systemTimeZone();
  try {
    locale = getLocale(args.locale);
    assertTimeZone(timeZone);
  } catch (err) {
    io.stderr(`cron-explain: ${clean((err as Error).message)}\n`);
    return 2;
  }
  const from = args.from ?? (io.now ? io.now() : Date.now());
  if (typeof from === 'string' && !Number.isFinite(Date.parse(from))) {
    io.stderr(`cron-explain: --from is not a valid date: "${clean(from)}"\n`);
    return 2;
  }

  const parseOptions = args.seconds ? { seconds: args.seconds } : {};
  if (args.file !== undefined) return runFile(args, io, { locale, timeZone, from, parseOptions });
  const result = validate(args.expression, { ...parseOptions, tz: timeZone });
  if (!result.valid || !result.expression) {
    if (args.json) {
      io.stdout(
        `${JSON.stringify({ expression: args.expression, valid: false, errors: result.errors }, null, 2)}\n`,
      );
    } else {
      io.stderr(`cron-explain: invalid expression "${clean(args.expression)}"\n`);
      for (const e of result.errors) io.stderr(`  ✖ ${clean(e.message)} [${e.code}]\n`);
    }
    return 1;
  }

  const expr = result.expression;
  const description = explain(expr, { locale });
  const schedule = { tz: timeZone, from };
  let next: Date[] = [];
  let previous: Date[] = [];
  try {
    if (!expr.reboot) {
      next = args.next > 0 ? nextRuns(expr, { ...schedule, count: args.next }) : [];
      previous = args.prev > 0 ? previousRuns(expr, { ...schedule, count: args.prev }) : [];
    }
  } catch (err) {
    if (!(err instanceof CronError)) throw err;
    io.stderr(`cron-explain: ${err.message}\n`);
    return 2;
  }
  const failOnWarnings = args.strict && result.warnings.length > 0;

  if (args.json) {
    const out = {
      expression: expr.source,
      valid: true,
      normalized: normalize(expr),
      description,
      locale: locale.code,
      timeZone,
      next: next.map((d) => formatInTimeZone(d, timeZone)),
      ...(args.prev > 0 ? { previous: previous.map((d) => formatInTimeZone(d, timeZone)) } : {}),
      warnings: result.warnings,
    };
    io.stdout(`${JSON.stringify(out, null, 2)}\n`);
    return failOnWarnings ? 1 : 0;
  }

  const lines: string[] = [expr.source, description];
  if (expr.reboot) {
    lines.push('', locale.labels.reboot);
  } else {
    const section = (title: string, dates: Date[], wanted: number) => {
      if (wanted === 0) return;
      lines.push('', `${title} (${locale.labels.timeZone}: ${timeZone}):`);
      if (dates.length === 0) lines.push(`  ${locale.labels.noRuns}`);
      dates.forEach((d, i) => {
        lines.push(`  ${locale.digits(String(i + 1).padStart(2, ' '))}. ${formatRun(d, timeZone, locale)}`);
      });
    };
    section(locale.labels.next(args.next), next, args.next);
    section(locale.labels.previous(args.prev), previous, args.prev);
  }
  if (result.warnings.length > 0) {
    lines.push('', `${locale.labels.warnings}:`);
    for (const w of result.warnings)
      lines.push(`  ${w.severity === 'warning' ? '!' : 'i'} ${w.message} [${w.code}]`);
  }
  io.stdout(`${lines.join('\n')}\n`);
  return failOnWarnings ? 1 : 0;
}

interface FileContext {
  locale: Locale;
  timeZone: string;
  from: number | string;
  parseOptions: { seconds?: 'optional' | 'required' | 'forbidden' };
}

interface JobReport {
  line: number;
  expression: string;
  user?: string;
  command: string;
  timeZone: string;
  valid: boolean;
  description?: string;
  next?: string[];
  warnings: { code: string; severity: string; message: string }[];
  errors: { code: string; message: string }[];
}

/** `--file`: explain, check and schedule every job line of a crontab. */
function runFile(args: Args, io: CliIO, ctx: FileContext): number {
  const path = args.file!;
  let text: string;
  try {
    if (!io.readFile) throw new Error('reading files is not supported here');
    text = io.readFile(path);
  } catch (err) {
    io.stderr(`cron-explain: cannot read ${clean(path)}: ${clean((err as Error).message)}\n`);
    return 2;
  }
  const crontab = parseCrontab(text, { system: args.system });
  const problems = crontab.problems.map((p) => ({ ...p }));
  const jobs: JobReport[] = [];
  for (const job of crontab.jobs) {
    const zone = job.timeZone ?? ctx.timeZone;
    const report: JobReport = {
      line: job.line,
      expression: job.expression,
      ...(job.user !== undefined ? { user: job.user } : {}),
      command: job.command,
      timeZone: zone,
      valid: false,
      warnings: [],
      errors: [],
    };
    jobs.push(report);
    try {
      assertTimeZone(zone);
    } catch (err) {
      report.errors.push({ code: 'INVALID_TIME_ZONE', message: (err as Error).message });
      continue;
    }
    const result = validate(job.expression, { ...ctx.parseOptions, tz: zone });
    if (!result.valid || !result.expression) {
      report.errors = result.errors.map((e) => ({ code: e.code, message: e.message }));
      continue;
    }
    report.valid = true;
    report.description = explain(result.expression, { locale: ctx.locale });
    report.warnings = result.warnings.map((w) => ({
      code: w.code,
      severity: w.severity,
      message: w.message,
    }));
    if (!result.expression.reboot && args.next > 0) {
      try {
        report.next = nextRuns(result.expression, { tz: zone, from: ctx.from, count: args.next }).map((d) =>
          formatInTimeZone(d, zone),
        );
      } catch (err) {
        if (!(err instanceof CronError)) throw err;
        report.next = [];
      }
    }
  }

  const invalid = jobs.filter((j) => !j.valid).length + problems.length;
  const withWarnings = jobs.filter((j) => j.warnings.length > 0).length;
  const code = invalid > 0 || (args.strict && withWarnings > 0) ? 1 : 0;

  if (args.json) {
    const out = { file: path, timeZone: ctx.timeZone, jobs, problems };
    io.stdout(`${JSON.stringify(out, null, 2)}\n`);
    return code;
  }

  const lines: string[] = [];
  const entries = [
    ...jobs.map((j) => ({ line: j.line, job: j })),
    ...problems.map((p) => ({ line: p.line, problem: p })),
  ].sort((a, b) => a.line - b.line);
  for (const entry of entries) {
    if (lines.length > 0) lines.push('');
    if ('problem' in entry && entry.problem) {
      lines.push(`line ${entry.line}: ${clean(entry.problem.message)}`);
      continue;
    }
    const job = (entry as { job: JobReport }).job;
    const user = job.user !== undefined ? `  (${clean(job.user)})` : '';
    lines.push(`line ${job.line}: ${clean(job.expression)}  ${clean(job.command)}${user}`);
    if (!job.valid) {
      for (const e of job.errors) lines.push(`  ✖ ${clean(e.message)} [${e.code}]`);
      continue;
    }
    lines.push(`  ${job.description}`);
    if (job.timeZone !== ctx.timeZone) lines.push(`  ${ctx.locale.labels.timeZone}: ${job.timeZone}`);
    if (job.next !== undefined) {
      const runs = job.next.map((iso) => formatRun(new Date(iso), job.timeZone, ctx.locale));
      if (runs.length === 0) lines.push(`  ${ctx.locale.labels.noRuns}`);
      for (const r of runs) lines.push(`  → ${r}`);
    }
    for (const w of job.warnings)
      lines.push(`  ${w.severity === 'warning' ? '!' : 'i'} ${w.message} [${w.code}]`);
  }
  if (entries.length === 0) lines.push('no jobs found');
  lines.push(
    '',
    `${jobs.length} job(s): ${jobs.length - jobs.filter((j) => !j.valid).length} valid, ` +
      `${invalid} invalid, ${withWarnings} with warnings (time zone: ${ctx.timeZone})`,
  );
  io.stdout(`${lines.join('\n')}\n`);
  return code;
}
