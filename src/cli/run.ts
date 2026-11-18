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
}

const HELP = `Usage: cron-explain <expression> [options]

Explain a cron expression in plain language, check it for common mistakes
and list its next run times.

Options:
  -n, --next <N>       show the next N run times (default 5; 0 to hide)
  -p, --prev <N>       show the previous N run times
  -z, --tz <zone>      IANA time zone, e.g. Asia/Dhaka (default: system zone)
  -l, --locale <code>  language of the description: ${'{LOCALES}'} (default en)
  -f, --from <date>    count runs from this ISO date instead of now
      --seconds <mode> optional (default), required or forbidden
      --json           print JSON instead of text
      --strict         exit with code 1 when there are warnings
  -h, --help           show this help
  -v, --version        show the version

Examples:
  cron-explain "*/15 9-17 * * 1-5" --next 5 --tz Asia/Dhaka --locale bn
  cron-explain "0 2 * * *" --tz America/New_York --from 2026-03-07
  cron-explain @weekly --json

Exit codes: 0 valid, 1 invalid expression (or warnings with --strict), 2 usage error.
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
};

function count(name: string, value: string): number {
  if (!/^\d+$/.test(value) || Number(value) > 1000) {
    throw new UsageError(`--${name} expects a whole number from 0 to 1000, got "${value}"`);
  }
  return Number(value);
}

function parseArgs(argv: string[]): Args | 'help' | 'version' {
  const positional: string[] = [];
  const args: Args = { expression: '', next: 5, prev: 0, locale: 'en', json: false, strict: false };
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
      if (key === 'next') args.next = count('next', value);
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
